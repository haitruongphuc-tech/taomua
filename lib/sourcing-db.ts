import type { PoolClient } from 'pg';
import { pool, tx } from './db';
import { UserError } from './action';
import { rankCandidates, recommend, inquiryMessage, textOverlap, fold, type Candidate, type Need } from './sourcing';

type Db = PoolClient | typeof pool;

/** Toàn bộ xưởng và báo giá còn hạn, để AI chấm điểm. */
export async function loadCandidates(c: Db = pool): Promise<Candidate[]> {
  const sups = (await c.query('SELECT id, name, source, categories, trust_score, defect_rate, lead_time_days, ships_international, country, is_simulated FROM suppliers')).rows;
  const offers = (await c.query(`SELECT * FROM supplier_offers WHERE valid_until IS NULL OR valid_until >= CURRENT_DATE`)).rows;
  const byId = new Map(sups.map((s) => [s.id, { ...s, defect_rate: Number(s.defect_rate) }]));
  const out: Candidate[] = [];
  for (const o of offers) {
    const s = byId.get(o.supplier_id);
    if (s) out.push({ supplier: s, offer: { ...o, unit_cost: Number(o.unit_cost) } });
  }
  // Mỗi xưởng thêm một dòng không báo giá; rankCandidates giữ lại nếu cùng ngành mà chưa báo giá món đang tìm.
  for (const s of byId.values()) out.push({ supplier: s, offer: null });
  return out;
}

/** Đoán ngành hàng cho mô tả tự do (RFQ): ngành của báo giá / sản phẩm có mô tả giống nhất. */
export async function guessCategory(text: string, c: Db = pool): Promise<string | null> {
  const rows = (await c.query(`SELECT category, product_text AS t FROM supplier_offers UNION ALL SELECT category, name AS t FROM products`)).rows;
  let best: { cat: string; s: number } | null = null;
  for (const r of rows) {
    const s = Math.max(textOverlap(r.t, text), textOverlap(text, r.t));
    if (s >= 0.5 && (!best || s > best.s)) best = { cat: r.category, s };
  }
  return best?.cat ?? null;
}

export async function createSourcingRequest(c: Db, r: {
  productId?: string | null; rfqId?: string | null; text: string; category: string | null; quantity: number;
  targetUnitPrice?: number | null; country?: string; reason: string; createdBy?: string | null;
}): Promise<{ id: string; created: boolean }> {
  const existing = (await c.query(`SELECT id FROM sourcing_requests WHERE status IN ('MO','DA_DE_XUAT','KHONG_TIM_THAY')
    AND ((product_id IS NOT NULL AND product_id=$1) OR (rfq_id IS NOT NULL AND rfq_id=$2))`, [r.productId ?? null, r.rfqId ?? null])).rows[0];
  if (existing) return { id: existing.id, created: false };
  const seq = (await c.query("SELECT nextval('sourcing_code_seq') AS n")).rows[0].n;
  const row = (await c.query(`INSERT INTO sourcing_requests(code, product_id, rfq_id, product_text, category, quantity, target_unit_price, ship_country, reason, created_by)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
    [`SX${seq}`, r.productId ?? null, r.rfqId ?? null, r.text.slice(0, 500), r.category, r.quantity, r.targetUnitPrice ?? null,
      (r.country || 'VN').toUpperCase().slice(0, 2), r.reason.slice(0, 300), r.createdBy ?? null])).rows[0];
  return { id: row.id, created: true };
}

/** AI xếp hạng xưởng cho một yêu cầu và lưu kết quả. */
export async function evaluateRequest(c: Db, id: string) {
  const r = (await c.query(`SELECT s.*, p.fee AS p_fee, p.cost AS p_cost, p.name_i18n FROM sourcing_requests s LEFT JOIN products p ON p.id=s.product_id WHERE s.id=$1`, [id])).rows[0];
  if (!r) throw new UserError('Không tìm thấy yêu cầu tìm xưởng.');
  const need: Need = { productId: r.product_id, category: r.category, text: r.product_text, quantity: r.quantity,
    targetUnitPrice: r.target_unit_price ? Number(r.target_unit_price) : null, feePerUnit: r.p_fee ? Number(r.p_fee) : 0, country: r.ship_country };
  const ranked = rankCandidates(need, await loadCandidates(c));
  const rec = recommend(need, ranked);
  const result = {
    evaluated_at: new Date().toISOString(),
    ranked: ranked.slice(0, 10).map((x) => ({
      supplier_id: x.supplier.id, supplier: x.supplier.name, country: x.supplier.country, trust: x.supplier.trust_score, defect: x.supplier.defect_rate,
      offer_id: x.offer?.id ?? null, offer_text: x.offer?.product_text ?? null, unit_cost: x.offer?.unit_cost ?? null, moq: x.offer?.moq ?? null,
      lead: x.offer?.lead_time_days ?? x.supplier.lead_time_days ?? null, landed: x.landed, margin: x.margin, score: x.score,
      eligible: x.eligible, moqOk: x.moqOk, reasons: x.reasons, simulated: !!(x.supplier.is_simulated || x.offer?.is_simulated), verified: !!x.offer?.verified,
    })),
    recommendation: rec ? {
      offer_id: rec.primary.offer!.id, supplier_id: rec.primary.supplier.id, supplier: rec.primary.supplier.name, landed: rec.primary.landed,
      unit_price: rec.unitPrice, total: rec.total, margin: rec.margin, test_qty: rec.testQty,
      backups: rec.backups.map((b) => ({ supplier_id: b.supplier.id, supplier: b.supplier.name, offer_id: b.offer?.id, landed: b.landed })),
    } : null,
    inquiry: rec ? null : inquiryMessage({ productVi: r.product_text, productZh: r.name_i18n?.zh, quantity: r.quantity, country: r.ship_country }),
  };
  const status = rec ? 'DA_DE_XUAT' : 'KHONG_TIM_THAY';
  await c.query("UPDATE sourcing_requests SET result=$2, status=$3 WHERE id=$1 AND status IN ('MO','DA_DE_XUAT','KHONG_TIM_THAY')", [id, JSON.stringify(result), status]);
  return { request: r, result, status };
}

/** CEO chọn một báo giá: gán xưởng chính + dự phòng cùng ngành cho sản phẩm (cập nhật giá vốn), hoặc lập báo giá cho RFQ. */
export async function chooseOfferTx(c: PoolClient, requestId: string, offerId: string, userId: string | null) {
  const r = (await c.query('SELECT * FROM sourcing_requests WHERE id=$1 FOR UPDATE', [requestId])).rows[0];
  if (!r) throw new UserError('Không tìm thấy yêu cầu tìm xưởng.');
  if (!['MO', 'DA_DE_XUAT', 'KHONG_TIM_THAY'].includes(r.status)) throw new UserError('Yêu cầu này đã được chọn xưởng hoặc đã đóng.');
  const o = (await c.query('SELECT o.*, s.name AS supplier_name FROM supplier_offers o JOIN suppliers s ON s.id=o.supplier_id WHERE o.id=$1', [offerId])).rows[0];
  if (!o) throw new UserError('Báo giá không còn.');
  const backups: string[] = ((r.result?.ranked ?? []) as any[])
    .filter((x) => x.eligible && x.supplier_id !== o.supplier_id).map((x) => x.supplier_id)
    .filter((v, i, a) => a.indexOf(v) === i).slice(0, 3);
  let msg = `Đã chọn ${o.supplier_name}.`;
  if (r.product_id) {
    const p = (await c.query('SELECT id, cost, fee FROM products WHERE id=$1 FOR UPDATE', [r.product_id])).rows[0];
    if (!p) throw new UserError('Sản phẩm không còn.');
    await c.query(`UPDATE products SET supplier_id=$2, supplier_ids_backup=$3::uuid[], cost=$4,
      input_vat=LEAST(input_vat, $4 + fee), updated_at=now() WHERE id=$1`, [p.id, o.supplier_id, backups, o.unit_cost]);
    await c.query('INSERT INTO product_cost_history(product_id, supplier_id, cost, fee) VALUES ($1,$2,$3,$4)', [p.id, o.supplier_id, o.unit_cost, p.fee]);
    if (!o.product_id) await c.query('UPDATE supplier_offers SET product_id=$2 WHERE id=$1', [o.id, p.id]);
    msg += ` Giá vốn mới ${Number(o.unit_cost).toLocaleString('vi-VN')} đ; RYN-PRICE sẽ kiểm tra lại biên ở lần chạy tới.`;
  }
  if (r.rfq_id) {
    const need: Need = { category: r.category, text: r.product_text, quantity: r.quantity, targetUnitPrice: r.target_unit_price ? Number(r.target_unit_price) : null, country: r.ship_country };
    const ranked = rankCandidates(need, [{ supplier: { id: o.supplier_id, name: o.supplier_name, categories: [o.category], trust_score: 100, defect_rate: 0 }, offer: { ...o, unit_cost: Number(o.unit_cost) } }]);
    const rec = recommend(need, ranked);
    if (rec) {
      await c.query(`UPDATE rfqs SET quote_price=$2, quote_note=$3, status='DA_BAO_GIA' WHERE id=$1 AND status IN ('MOI','DANG_TIM_XUONG')`,
        [r.rfq_id, rec.total, `${r.product_text}: ${rec.unitPrice.toLocaleString('vi-VN')} đ/cái × ${r.quantity}, đã gồm VAT 8%${r.ship_country !== 'VN' ? ', chưa gồm phí vận chuyển quốc tế' : ''}. Thời gian sản xuất ${o.lead_time_days ?? '—'} ngày.`]);
      msg += ` Đã báo giá khách ${rec.total.toLocaleString('vi-VN')} đ.`;
    }
  }
  await c.query(`UPDATE sourcing_requests SET status='DA_CHON', chosen_offer_id=$2, decided_by=$3, decided_at=now() WHERE id=$1`, [requestId, offerId, userId]);
  return msg;
}

export const chooseOffer = (requestId: string, offerId: string, userId: string) => tx((c) => chooseOfferTx(c, requestId, offerId, userId));
