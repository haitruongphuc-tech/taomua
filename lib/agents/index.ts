// 7 AI agent của taomua (docs/MULTILINGUAL_7_AI_SPEC.md). Mỗi lần chạy: đọc dữ liệu thật trong database,
// áp quy tắc trong rules.ts, rồi (1) tự làm việc an toàn, (2) đưa việc cần người vào hàng đợi One-Tap, (3) ghi cảnh báo.
// Quyền của từng agent đúng spec: TREND chỉ đọc; không agent nào chuyển tiền; đổi xưởng, nhập lớn, khóa nhập cần người duyệt
// trừ khi đủ điều kiện tự duyệt Cấp 1 và nút tổng "tự động" đang bật.
import { q, tx } from '../db';
import { levelByValue, LEVELS, type Level } from '../approval';
import { TIERS, tierFor, priceForTier, type Tier } from '../pricing';
import { trustScore } from '../trust';
import { loadControls } from '../controls';
import type { Controls } from '../payouts';
import { aiEnabled, translate7, classify } from '../ai';
import { createSourcingRequest, evaluateRequest, guessCategory } from '../sourcing-db';
import { fold } from '../sourcing';
import { notifyText } from '../notify';
import { audit, type Actor } from '../audit';
import { applyAction } from './apply';
import {
  raiseToFloor, competitorCut, marginTooHigh, maxChange, pickBackup, latrDecision, capitalDecision, costJumped,
  matchProduct, negotiationScripts, supplierOk, type Prices, type PriceProduct, SAFETY_LOCK, SAFETY_WARN,
} from './rules';

export const AGENTS = {
  'RYN-TREND': { name: 'Trend Hunter', job: 'Xếp hạng hàng hot từ điểm trend, doanh số 7 ngày và CTR bán thử. Chỉ đọc.' },
  'RYN-SUPPLY': { name: 'Supplier Brain', job: 'Tính lại TrustScore; tìm xưởng cùng ngành hàng, so giá theo số lượng và MOQ, biên, Trust, lỗi, thời gian giao; đề xuất xưởng chính + 3 dự phòng để CEO chọn.' },
  'RYN-NEGO': { name: 'Negotiation', job: 'Soạn 4 kịch bản đàm phán tiếng Trung kèm bản dịch cho xưởng 1688, mục tiêu giảm 10%.' },
  'RYN-PRICE': { name: 'Pricing Brain', job: 'Giữ biên ròng ≥ 15%, giảm 2% khi đối thủ rẻ hơn, cảnh báo biên > 150%.' },
  'RYN-TRACE': { name: 'Traceability', job: 'Lưu lịch sử giá vốn, cảnh báo xưởng tăng giá ≥ 10%, kiểm QC < 98%.' },
  'RYN-SALES': { name: 'Sales Brain', job: 'Tự báo giá yêu cầu sỉ, quyết định bán thử (CTR > 3% nhập lớn, < 2% dừng), dịch tên 7 ngôn ngữ.' },
  'RYN-LOGI': { name: 'Logistics & Finance', job: 'Theo dõi biên an toàn vốn (< 25% cảnh báo, < 20% khóa nhập mới), đơn quá hạn duyệt, chờ thanh toán, chờ giải ngân.' },
} as const;
export type AgentCode = keyof typeof AGENTS;

export type Finding = {
  agent: AgentCode;
  kind: 'PRICE_CHANGE' | 'SWITCH_SUPPLIER' | 'SOURCING_CHOICE' | 'PRODUCT_STATUS' | 'CONTROL_SET' | 'RFQ_QUOTE' | 'SUPPLIER_TRUST' | 'TRANSLATE' | 'NOTE';
  severity?: 'INFO' | 'WARN' | 'DANGER';
  title: string;
  detail?: Record<string, unknown>;
  entity?: string;
  entityId?: string;
  dedupe: string;
  level?: Level;      // cấp duyệt nếu cần người
  auto?: boolean;     // đủ điều kiện tự làm khi nút tổng bật
  safe?: boolean;     // việc phân tích/dữ liệu không đụng tiền: luôn tự làm
};

type Ctx = { ctl: Controls; now: Date };
const day = (d: Date) => d.toISOString().slice(0, 10);
const week = (d: Date) => { const t = new Date(Date.UTC(d.getFullYear(), 0, 1)); return `${d.getFullYear()}-W${Math.ceil(((+d - +t) / 864e5 + t.getUTCDay() + 1) / 7)}`; };
const prices = (p: any): Prices => Object.fromEntries(TIERS.map((t) => [t, Number(p[`price_taomua_${t}`])])) as Prices;
const pp = (p: any): PriceProduct => ({ cost: Number(p.cost), fee: Number(p.fee), input_vat: Number(p.input_vat), prices: prices(p) });
const fmt = (x: number) => Math.round(x).toLocaleString('vi-VN');

async function trend(ctx: Ctx): Promise<Finding[]> {
  const rows = await q(`SELECT p.id, p.sku, p.name, p.trend_score, p.latr_ctr, p.latr_test_qty, p.status, p.is_simulated,
      COALESCE(s.qty,0)::int AS qty7
    FROM products p LEFT JOIN (
      SELECT i.product_id, sum(i.quantity) AS qty FROM order_items i JOIN wholesale_orders o ON o.id=i.order_id
      WHERE o.created_at >= now() - interval '7 days' AND o.status NOT IN ('HUY','TU_CHOI') GROUP BY i.product_id) s ON s.product_id=p.id
    WHERE p.status <> 'PAUSED'`);
  const maxQty = Math.max(1, ...rows.map((r) => r.qty7));
  const ranked = rows.map((r) => ({
    ...r, score: Math.round(0.5 * r.trend_score + 30 * (r.qty7 / maxQty) + 20 * Math.min(1, Number(r.latr_ctr ?? 0) / 6)),
  })).sort((a, b) => b.score - a.score);
  const out: Finding[] = [{
    agent: 'RYN-TREND', kind: 'NOTE', title: `Bảng xếp hạng hàng hot ${day(ctx.now)}`, dedupe: `trend:${day(ctx.now)}`,
    detail: { top: ranked.slice(0, 10).map((r) => ({ sku: r.sku, name: r.name, score: r.score, trend: r.trend_score, ban_7_ngay: r.qty7, ctr: r.latr_ctr })),
      nguon: 'Dữ liệu trong hệ thống. Nguồn ngoài (TikTok, 1688, Amazon, Google Trends) chờ API.', gia_lap: rows.some((r) => r.is_simulated) },
  }];
  for (const r of ranked) {
    if (r.trend_score >= 85 && r.latr_test_qty == null && r.latr_ctr == null) {
      out.push({ agent: 'RYN-TREND', kind: 'NOTE', severity: 'INFO', title: `Nên bán thử 50–100 cái: ${r.name} (trend ${r.trend_score})`,
        entity: 'product', entityId: r.id, dedupe: `latr-suggest:${r.id}`, detail: { sku: r.sku } });
    }
  }
  return out;
}

async function supply(): Promise<Finding[]> {
  const out: Finding[] = [];
  const sups = await q('SELECT * FROM suppliers');
  const byId = new Map(sups.map((s) => [s.id, s]));
  for (const s of sups) {
    const t = trustScore(s).score;
    if (t !== s.trust_score) {
      out.push({ agent: 'RYN-SUPPLY', kind: 'SUPPLIER_TRUST', title: `TrustScore ${s.name}: ${s.trust_score} → ${t}`, safe: true,
        entity: 'supplier', entityId: s.id, dedupe: `trust:${s.id}:${t}`, detail: { supplier_id: s.id, from: s.trust_score, to: t } });
      s.trust_score = t;
      await q("UPDATE suppliers SET trust_score=$2 WHERE id=$1", [s.id, t]); // cập nhật ngay để chấm điểm xưởng bên dưới dùng số mới
    }
  }
  const prods = await q("SELECT id, sku, name, category, moq, price_taomua_100, supplier_id, supplier_ids_backup FROM products WHERE status <> 'PAUSED'");
  for (const p of prods) {
    const primary = p.supplier_id ? byId.get(p.supplier_id) : null;
    // Chỉ tính xưởng dự phòng cùng ngành hàng với sản phẩm.
    const sameCat = (s: any) => (s.categories as string[]).some((c) => fold(c) === fold(p.category));
    const backups = (p.supplier_ids_backup as string[]).map((id) => byId.get(id)).filter((s) => s && sameCat(s));
    const reason = !primary ? 'chưa có xưởng chính' : !supplierOk(primary)
      ? `xưởng ${primary.name} không đạt (Trust ${primary.trust_score}, lỗi ${(Number(primary.defect_rate) * 100).toFixed(1)}%)` : null;
    if (reason) {
      // AI tự mở yêu cầu tìm xưởng: chấm điểm mọi xưởng cùng ngành theo giá, số lượng, Trust, lỗi, thời gian giao.
      await tx((c) => createSourcingRequest(c, { productId: p.id, text: p.name, category: p.category, quantity: Math.max(100, p.moq),
        targetUnitPrice: null, reason: `${p.name}: ${reason}. Giá bán hiện ${Number(p.price_taomua_100).toLocaleString("vi-VN")} đ (bậc 100); RYN-PRICE chỉnh giá sau khi đổi xưởng.` }));
    } else if (backups.length < 3) {
      out.push({ agent: 'RYN-SUPPLY', kind: 'NOTE', title: `${p.name}: mới có ${backups.length}/3 xưởng dự phòng cùng ngành ${p.category}`,
        entity: 'product', entityId: p.id, dedupe: `fewbackup:${p.id}:${backups.length}` });
    }
  }
  // Chấm điểm mọi yêu cầu tìm xưởng đang mở (từ sản phẩm, từ RFQ, hoặc người tạo trên trang Tìm xưởng).
  const open = await q("SELECT id FROM sourcing_requests WHERE status IN ('MO','DA_DE_XUAT','KHONG_TIM_THAY') ORDER BY created_at LIMIT 100");
  for (const { id } of open) {
    const ev = await tx((c) => evaluateRequest(c, id));
    const r = ev.request;
    const rec = ev.result.recommendation;
    if (rec) {
      const sim = ev.result.ranked.find((x) => x.offer_id === rec.offer_id)?.simulated;
      out.push({ agent: 'RYN-SUPPLY', kind: 'SOURCING_CHOICE', severity: 'INFO', level: 3, entity: 'sourcing', entityId: id,
        dedupe: `sourcing:${id}:${rec.offer_id}`,
        title: `${r.code} ${r.product_text} × ${r.quantity}: AI đề xuất ${rec.supplier} — giá xưởng+phí ${fmt(rec.landed ?? 0)} đ`
          + (r.product_id
            ? ` (hiện ${fmt(Number(r.p_cost) + Number(r.p_fee))} đ); chọn thì đổi xưởng chính và giá vốn`
            : `, báo khách ${fmt(rec.unit_price)} đ/cái, biên ${rec.margin}%`)
          + `${rec.test_qty ? `, bán thử ${rec.test_qty} cái trước (MOQ cao)` : ''}${sim ? ' (báo giá giả lập)' : ''}`,
        detail: { request_id: id, offer_id: rec.offer_id, code: r.code, reason: r.reason, recommendation: rec, ranked: ev.result.ranked.slice(0, 5) } });
    } else {
      out.push({ agent: 'RYN-SUPPLY', kind: 'NOTE', severity: 'WARN', entity: 'sourcing', entityId: id, dedupe: `sourcing-none:${id}`,
        title: `${r.code} ${r.product_text} × ${r.quantity}: chưa có xưởng đạt chuẩn. Gửi tin hỏi giá cho xưởng cùng ngành rồi nhập báo giá.`,
        detail: { inquiry: ev.result.inquiry, ranked: ev.result.ranked.slice(0, 5) } });
    }
  }
  return out;
}

async function nego(ctx: Ctx): Promise<Finding[]> {
  const rateEnv = Number(process.env.CNY_VND_RATE);
  const rate = rateEnv > 0 ? rateEnv : 3500;
  const rows = await q(`SELECT p.id, p.sku, p.name, p.cost, s.name AS sup, s.moq FROM products p JOIN suppliers s ON s.id=p.supplier_id
    WHERE s.source='1688' AND p.status <> 'PAUSED'`);
  if (!rows.length) return [];
  const items = rows.map((r) => {
    const priceCny = Number(r.cost) / rate;
    return { sku: r.sku, name: r.name, xuong: r.sup, gia_hien_tai_cny: Math.round(priceCny * 10) / 10, muc_tieu_cny: Math.round(priceCny * 0.9 * 10) / 10,
      kich_ban: negotiationScripts({ productVi: r.name, priceCny, targetCny: priceCny * 0.9, moq: Math.max(Number(r.moq), 100), testQty: 50 }) };
  });
  return [{ agent: 'RYN-NEGO', kind: 'NOTE', title: `Kịch bản đàm phán tiếng Trung tuần ${week(ctx.now)}: ${rows.length} sản phẩm`, dedupe: `nego:${week(ctx.now)}`,
    detail: { ty_gia: rate, ty_gia_tam: !(rateEnv > 0), san_pham: items, luu_y: 'AI soạn sẵn. Người phụ trách gửi cho xưởng và quyết định; đặt cọc > 20 triệu cần CEO.' } }];
}

async function price(): Promise<Finding[]> {
  const out: Finding[] = [];
  const prods = await q("SELECT * FROM products WHERE status <> 'PAUSED'");
  const comps = await q(`SELECT DISTINCT ON (product_id, platform) product_id, platform, price, qty_basis, checked_at FROM price_comparisons
    WHERE checked_at >= now() - interval '30 days' ORDER BY product_id, platform, checked_at DESC`);
  for (const p of prods) {
    const cur = pp(p);
    const raised = raiseToFloor(cur);
    if (raised) {
      out.push({ agent: 'RYN-PRICE', kind: 'PRICE_CHANGE', severity: 'WARN', level: 2,
        title: `${p.name}: nâng giá để biên ròng đạt 15% (${TIERS.filter((t) => raised[t] !== cur.prices[t]).map((t) => `bậc ${t}+: ${fmt(cur.prices[t])} → ${fmt(raised[t])}`).join(', ')})`,
        entity: 'product', entityId: p.id, dedupe: `price:${p.id}`, detail: { product_id: p.id, from: cur.prices, to: raised, ly_do: 'Biên dưới sàn 15%' } });
      continue;
    }
    const mine = comps.filter((c) => c.product_id === p.id).map((c) => ({ ...c, unit: Number(c.price) / Math.max(1, Number(c.qty_basis)) }));
    const cheapest = mine.sort((a, b) => a.unit - b.unit)[0];
    if (cheapest) {
      const tier: Tier = tierFor(Number(cheapest.qty_basis)) ?? 10;
      const cut = competitorCut(cur, cheapest.unit, tier);
      if (cut) {
        const small = Math.abs(maxChange(cur.prices, cut)) <= 0.025;
        out.push({ agent: 'RYN-PRICE', kind: 'PRICE_CHANGE', level: small ? 1 : 2, auto: small,
          title: `${p.name}: ${cheapest.platform} bán ${fmt(cheapest.unit)} đ, giảm giá 2% (vẫn giữ biên ≥ 15%)`,
          entity: 'product', entityId: p.id, dedupe: `price:${p.id}`,
          detail: { product_id: p.id, from: cur.prices, to: cut, ly_do: `Đối thủ ${cheapest.platform} rẻ hơn bậc ${tier}` } });
      }
    }
    const high = marginTooHigh(cur);
    if (high.length) {
      out.push({ agent: 'RYN-PRICE', kind: 'NOTE', severity: 'WARN', title: `${p.name}: biên > 150% ở bậc ${high.join(', ')}. Kiểm tra giá nhập.`,
        entity: 'product', entityId: p.id, dedupe: `highmargin:${p.id}` });
    }
  }
  return out;
}

async function trace(): Promise<Finding[]> {
  const out: Finding[] = [];
  const prods = await q(`SELECT p.id, p.name, p.cost, p.fee, p.supplier_id, p.rynn_brain_pass, h.cost AS prev_cost, h.fee AS prev_fee
    FROM products p LEFT JOIN LATERAL (SELECT cost, fee FROM product_cost_history WHERE product_id=p.id ORDER BY recorded_at DESC LIMIT 1) h ON true`);
  for (const p of prods) {
    const now = Number(p.cost) + Number(p.fee);
    if (p.prev_cost == null || Number(p.prev_cost) !== Number(p.cost) || Number(p.prev_fee) !== Number(p.fee)) {
      await q('INSERT INTO product_cost_history(product_id, supplier_id, cost, fee) VALUES ($1,$2,$3,$4)', [p.id, p.supplier_id, p.cost, p.fee]);
    }
    if (p.prev_cost != null && costJumped(Number(p.prev_cost) + Number(p.prev_fee), now)) {
      const prev = Number(p.prev_cost) + Number(p.prev_fee);
      out.push({ agent: 'RYN-TRACE', kind: 'NOTE', severity: 'DANGER', title: `${p.name}: giá vốn tăng ${Math.round((now / prev - 1) * 100)}% (${fmt(prev)} → ${fmt(now)} đ). Cân nhắc đổi xưởng dự phòng.`,
        entity: 'product', entityId: p.id, dedupe: `costjump:${p.id}:${now}` });
    }
  }
  const lowQc = prods.filter((p) => p.rynn_brain_pass != null && Number(p.rynn_brain_pass) < 98);
  if (lowQc.length) {
    out.push({ agent: 'RYN-TRACE', kind: 'NOTE', severity: 'WARN', title: `${lowQc.length} sản phẩm có QC dưới 98%`,
      dedupe: `qc:${lowQc.map((p) => `${p.id}=${p.rynn_brain_pass}`).sort().join(',')}`,
      detail: { san_pham: lowQc.map((p) => ({ name: p.name, qc: Number(p.rynn_brain_pass) })) } });
  }
  return out;
}

async function sales(): Promise<Finding[]> {
  const out: Finding[] = [];
  const prods = await q("SELECT * FROM products WHERE published AND status <> 'PAUSED'");
  const rfqs = await q("SELECT * FROM rfqs WHERE status='MOI' ORDER BY created_at LIMIT 50");
  for (const r of rfqs) {
    const p = matchProduct(r.product_text, prods);
    const tier = tierFor(r.quantity);
    if (!p) {
      // Hàng chưa có trong danh mục: AI mở yêu cầu tìm xưởng; RYN-SUPPLY chấm điểm xưởng và đề xuất CEO chọn.
      let category = await guessCategory(r.product_text);
      if (!category && aiEnabled()) {
        const cats = (await q('SELECT DISTINCT unnest(categories) AS c FROM suppliers')).map((x) => x.c);
        category = await classify(r.product_text, cats).catch(() => null);
      }
      const created = await tx(async (c) => {
        const s = await createSourcingRequest(c, { rfqId: r.id, text: r.product_text, category, quantity: r.quantity,
          targetUnitPrice: r.target_price ? Number(r.target_price) : null, reason: `Yêu cầu báo giá ${r.code} của ${r.contact_name}` });
        await c.query("UPDATE rfqs SET status='DANG_TIM_XUONG' WHERE id=$1 AND status='MOI'", [r.id]);
        return s;
      });
      out.push({ agent: 'RYN-SALES', kind: 'NOTE', entity: 'rfq', entityId: r.id, dedupe: `rfq-sourcing:${r.id}`,
        title: `Báo giá ${r.code}: "${r.product_text}" chưa có trong danh mục. AI đã mở yêu cầu tìm xưởng${category ? ` ngành ${category}` : ' (chưa rõ ngành)'}.`,
        detail: { sourcing_request_id: created.id } });
      continue;
    }
    if (!tier || r.quantity < Math.max(10, p.moq)) {
      out.push({ agent: 'RYN-SALES', kind: 'NOTE', severity: 'INFO', entity: 'rfq', entityId: r.id, dedupe: `rfq-manual:${r.id}`,
        title: `Báo giá ${r.code} cần người làm: dưới số lượng tối thiểu ${Math.max(10, p.moq)}` });
      continue;
    }
    const unit = priceForTier(p, tier);
    const total = unit * r.quantity;
    const level = levelByValue(total);
    out.push({ agent: 'RYN-SALES', kind: 'RFQ_QUOTE', level, auto: level === 1, entity: 'rfq', entityId: r.id, dedupe: `rfq:${r.id}`,
      title: `Báo giá ${r.code}: ${r.quantity} × ${p.name} = ${fmt(total)} đ (giá bậc ${tier}+)`,
      detail: { rfq_id: r.id, product_id: p.id, unit, total, note: `${p.name} (${p.sku}) bậc ${tier}+: ${fmt(unit)} đ/cái, đã gồm VAT 8%. Tổng ${fmt(total)} đ. Báo giá do AI lập theo bảng giá.` } });
  }
  const all = await q("SELECT id, name, status, latr_ctr FROM products WHERE status IN ('LATR_TEST','DROPSHIP_SI','MASS_IMPORT')");
  for (const p of all) {
    const d = latrDecision(p.latr_ctr);
    if (d === 'SCALE' && p.status === 'LATR_TEST') {
      out.push({ agent: 'RYN-SALES', kind: 'PRODUCT_STATUS', level: 3, entity: 'product', entityId: p.id, dedupe: `latr:${p.id}`,
        title: `${p.name}: bán thử CTR ${p.latr_ctr}% > 3%, đề xuất nhập lớn`, detail: { product_id: p.id, from: p.status, to: 'MASS_IMPORT' } });
    }
    if (d === 'STOP' && p.status !== 'PAUSED') {
      out.push({ agent: 'RYN-SALES', kind: 'PRODUCT_STATUS', severity: 'WARN', level: 2, auto: true, entity: 'product', entityId: p.id, dedupe: `latr:${p.id}`,
        title: `${p.name}: CTR ${p.latr_ctr}% < 2%, tạm dừng để tránh tồn kho`, detail: { product_id: p.id, from: p.status, to: 'PAUSED' } });
    }
  }
  if (aiEnabled()) {
    const need = await q(`SELECT id, name FROM products WHERE published AND (name_i18n = '{}'::jsonb OR NOT name_i18n ? 'zh') LIMIT 5`);
    for (const p of need) {
      const names = await translate7(p.name).catch(() => null);
      if (names) out.push({ agent: 'RYN-SALES', kind: 'TRANSLATE', safe: true, entity: 'product', entityId: p.id, dedupe: `i18n:${p.id}`,
        title: `${p.name}: đã dịch tên 7 ngôn ngữ`, detail: { product_id: p.id, names } });
    }
  }
  return out;
}

async function logi(ctx: Ctx): Promise<Finding[]> {
  const out: Finding[] = [];
  const month = ctx.now.getMonth() + 1;
  const wc = (await q('SELECT * FROM working_capital WHERE month=$1', [month]))[0];
  if (wc) {
    const safety = Number(wc.bien_an_toan);
    const d = capitalDecision(safety);
    const sim = wc.is_simulated;
    if (d === 'LOCK' && !ctx.ctl.KHOA_NHAP_MOI) {
      out.push({ agent: 'RYN-LOGI', kind: 'CONTROL_SET', severity: 'DANGER', level: 3, auto: !sim, dedupe: `lock:${month}`,
        title: `Biên an toàn tháng ${month} là ${safety}% < ${SAFETY_LOCK}%: khóa nhập hàng mới${sim ? ' (số dự toán giả lập, cần người xác nhận)' : ''}`,
        detail: { key: 'KHOA_NHAP_MOI', enabled: true, bien_an_toan: safety, gia_lap: sim } });
    } else if (d === 'WARN') {
      out.push({ agent: 'RYN-LOGI', kind: 'NOTE', severity: 'WARN', dedupe: `capwarn:${month}`,
        title: `Biên an toàn tháng ${month} là ${safety}%, dưới ${SAFETY_WARN}%${sim ? ' (dự toán giả lập)' : ''}` });
    }
    if (wc.mb_bank_balance == null) {
      out.push({ agent: 'RYN-LOGI', kind: 'NOTE', dedupe: `nobalance:${month}`, title: `Chưa nhập số dư ngân hàng tháng ${month}: chưa so được vốn thực với vốn cần 45%.` });
    }
  }
  const overdue = await q(`SELECT id, code, cap_duyet, tong_dt FROM wholesale_orders WHERE approval_status='PENDING' AND approval_deadline < now()`);
  for (const o of overdue) {
    out.push({ agent: 'RYN-LOGI', kind: 'NOTE', severity: 'WARN', entity: 'order', entityId: o.id, dedupe: `overdue:${o.id}`,
      title: `Đơn ${o.code} quá hạn duyệt ${LEVELS[o.cap_duyet as Level].label} (${fmt(o.tong_dt)} đ)` });
  }
  const unpaid = await q(`SELECT id, code FROM wholesale_orders WHERE status='CHO_THANH_TOAN' AND approved_at < now() - interval '3 days'`);
  for (const o of unpaid) out.push({ agent: 'RYN-LOGI', kind: 'NOTE', entity: 'order', entityId: o.id, dedupe: `unpaid:${o.id}`, title: `Đơn ${o.code}: đã duyệt hơn 3 ngày chưa thanh toán, cần nhắc khách.` });
  const held = await q(`SELECT id, code FROM wholesale_orders WHERE status='DA_GIAO' AND trade_assurance_status='HOLD' AND updated_at < now() - interval '7 days'`);
  for (const o of held) out.push({ agent: 'RYN-LOGI', kind: 'NOTE', entity: 'order', entityId: o.id, dedupe: `held:${o.id}`, title: `Đơn ${o.code}: giao hơn 7 ngày, khách chưa xác nhận. CEO xem xét giải ngân.` });
  const payouts = await q(`SELECT id, amount, payee FROM payouts WHERE status='DE_XUAT' AND created_at < now() - interval '24 hours'`);
  for (const p of payouts) out.push({ agent: 'RYN-LOGI', kind: 'NOTE', severity: 'WARN', entity: 'payout', entityId: p.id, dedupe: `payout-wait:${p.id}`, title: `Khoản chi ${fmt(p.amount)} đ cho ${p.payee} chờ duyệt hơn 24 giờ.` });
  return out;
}

// SALES chạy trước SUPPLY để yêu cầu tìm xưởng mới từ RFQ được chấm điểm ngay trong cùng lần chạy.
const RUN_ORDER: AgentCode[] = ['RYN-TREND', 'RYN-TRACE', 'RYN-SALES', 'RYN-SUPPLY', 'RYN-NEGO', 'RYN-PRICE', 'RYN-LOGI'];
const RUNNERS: Record<AgentCode, (ctx: Ctx) => Promise<Finding[]>> = {
  'RYN-TREND': trend, 'RYN-SUPPLY': supply, 'RYN-NEGO': nego, 'RYN-PRICE': price, 'RYN-TRACE': trace, 'RYN-SALES': sales, 'RYN-LOGI': logi,
};

/** Ghi một phát hiện: tự làm, đưa vào hàng đợi, hoặc ghi tin. Trả trạng thái, hoặc null nếu đã có bản đang mở. */
async function record(runId: string, f: Finding, ctl: Controls, actor: Actor): Promise<string | null> {
  return tx(async (c) => {
    const doNow = f.kind !== 'NOTE' && (f.safe || (f.auto && ctl.AI_AUTO));
    const status = f.kind === 'NOTE' ? 'TIN' : doNow ? 'TU_DONG' : 'DE_XUAT';
    // Người đã từ chối hoặc đã xem trong 7 ngày thì không nhắc lại.
    const recent = await c.query(`SELECT 1 FROM agent_actions WHERE dedupe_key=$1 AND status IN ('TU_CHOI','DA_XEM','LOI')
      AND decided_at > now() - interval '7 days' LIMIT 1`, [f.dedupe]);
    if (recent.rowCount) return null;
    const ins = await c.query(
      `INSERT INTO agent_actions(run_id, agent, kind, severity, title, detail, entity, entity_id, level, status, dedupe_key, decided_label, decided_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT (dedupe_key) WHERE status IN ('DE_XUAT','TIN') DO NOTHING RETURNING id`,
      [runId, f.agent, f.kind, f.severity ?? 'INFO', f.title.slice(0, 500), JSON.stringify(f.detail ?? {}), f.entity ?? null, f.entityId ?? null,
        status === 'DE_XUAT' ? f.level ?? 2 : f.level ?? null, status, f.dedupe,
        doNow ? `${f.agent} (tự động)` : null, doNow ? new Date() : null]);
    if (!ins.rowCount) return null;
    if (doNow) {
      await applyAction(c, { id: ins.rows[0].id, kind: f.kind, detail: f.detail });
      await audit(actor, `agent.${f.kind.toLowerCase()}`, f.entity ?? 'agent', f.entityId ?? null, { agent: f.agent, title: f.title }, c);
    }
    return status;
  });
}

export async function runAgents(trigger: 'TAY' | 'LICH' | 'API', actor: Actor, only?: AgentCode[]) {
  const run = (await q("INSERT INTO agent_runs(trigger) VALUES ($1) RETURNING id", [trigger]))[0];
  const ctl = await loadControls();
  const ctx: Ctx = { ctl, now: new Date() };
  const summary: Record<string, { moi: number; tu_dong: number; de_xuat: number; loi?: string }> = {};
  const alerts: string[] = [];
  for (const code of (only ?? RUN_ORDER)) {
    const s = (summary[code] = { moi: 0, tu_dong: 0, de_xuat: 0 } as any);
    try {
      const findings = await RUNNERS[code](ctx);
      for (const f of findings) {
        try {
          const st = await record(run.id, f, ctl, actor);
          if (!st) continue;
          s.moi++;
          if (st === 'TU_DONG') s.tu_dong++;
          if (st === 'DE_XUAT') s.de_xuat++;
          if (f.severity === 'DANGER' || (st === 'DE_XUAT' && (f.level ?? 2) >= 3)) alerts.push(`[${f.agent}] ${f.title}`);
        } catch (e: any) {
          await q(`INSERT INTO agent_actions(run_id, agent, kind, severity, title, detail, status) VALUES ($1,$2,$3,'DANGER',$4,$5,'LOI')`,
            [run.id, f.agent, f.kind, `Không thực hiện được: ${f.title}`.slice(0, 500), JSON.stringify({ error: String(e?.message ?? e) })]);
        }
      }
    } catch (e: any) {
      s.loi = String(e?.message ?? e).slice(0, 300);
    }
  }
  const failed = Object.values(summary).some((s) => s.loi);
  await q("UPDATE agent_runs SET finished_at=now(), status=$2, summary=$3, error=$4 WHERE id=$1",
    [run.id, failed ? 'LOI' : 'XONG', JSON.stringify(summary), failed ? 'Một số agent lỗi, xem summary' : null]);
  await audit(actor, 'agent.run', 'agent_run', run.id, { trigger, summary });
  if (alerts.length) await notifyText(`taomua AI: ${alerts.length} việc cần CEO\n${alerts.slice(0, 10).join('\n')}`).catch(() => {});
  return { run_id: run.id, summary };
}
