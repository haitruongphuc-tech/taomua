import { requireUser, actorOf, can } from '@/lib/auth';
import { q, tx } from '@/lib/db';
import { audit } from '@/lib/audit';
import { runAction, UserError } from '@/lib/action';
import { isUuid } from '@/lib/catalog';
import { vnd, dt, pct } from '@/lib/format';
import { aiEnabled, extractOffer } from '@/lib/ai';
import { createSourcingRequest, evaluateRequest, chooseOffer } from '@/lib/sourcing-db';
import { COUNTRIES } from '@/lib/countries';
import Flash from '@/components/Flash';

const BACK = '/quan-tri/tim-xuong';
const ST: Record<string, [string, string]> = {
  MO: ['Mới', 'warn'], DA_DE_XUAT: ['AI đã đề xuất, chờ CEO', 'orange'], KHONG_TIM_THAY: ['Chưa có xưởng đạt, cần báo giá', 'bad'], DA_CHON: ['CEO đã chọn', 'ok'], DONG: ['Đóng', ''],
};
const rate = (cur: string) => {
  const env = Number(cur === 'CNY' ? process.env.CNY_VND_RATE : cur === 'USD' ? process.env.USD_VND_RATE : 1);
  return env > 0 ? { r: env, tam: false } : { r: cur === 'CNY' ? 3500 : cur === 'USD' ? 25500 : 1, tam: cur !== 'VND' };
};

async function newRequest(fd: FormData) {
  'use server';
  const u = await requireUser('suppliers.edit');
  await runAction(BACK, async () => {
    const productId = String(fd.get('product_id') ?? '');
    const qty = Math.round(Number(fd.get('quantity')));
    const target = Number(fd.get('target_unit_price')) || null;
    const country = String(fd.get('country') ?? 'VN');
    let text = String(fd.get('text') ?? '').trim();
    let category = String(fd.get('category') ?? '').trim() || null;
    if (productId) {
      if (!isUuid(productId)) throw new UserError('Sản phẩm không hợp lệ.');
      const p = (await q('SELECT name, category FROM products WHERE id=$1', [productId]))[0];
      if (!p) throw new UserError('Không tìm thấy sản phẩm.');
      text ||= p.name; category ||= p.category;
    }
    if (text.length < 3 || !(qty > 0)) throw new UserError('Cần mô tả hàng và số lượng.');
    if (!COUNTRIES.some((c) => c.code === country)) throw new UserError('Quốc gia giao không hợp lệ.');
    const r = await tx(async (c) => {
      const s = await createSourcingRequest(c, { productId: productId || null, text, category, quantity: qty, targetUnitPrice: target, country,
        reason: `Tạo bởi ${u.name}`, createdBy: u.id });
      await evaluateRequest(c, s.id);
      return s;
    });
    await audit(actorOf(u), 'sourcing.create', 'sourcing', r.id, { text, qty, category });
    return r.created ? 'Đã tạo yêu cầu. AI đã chấm điểm xưởng bên dưới.' : 'Sản phẩm này đã có yêu cầu tìm xưởng đang mở; AI đã chấm lại.';
  });
}

async function act(fd: FormData) {
  'use server';
  const u = await requireUser();
  await runAction(BACK, async () => {
    const id = String(fd.get('id'));
    if (!isUuid(id)) throw new UserError('Yêu cầu không hợp lệ.');
    const op = String(fd.get('op'));
    if (op === 'eval') {
      if (!can(u, 'suppliers.edit')) throw new UserError('Bạn không có quyền.');
      const ev = await tx((c) => evaluateRequest(c, id));
      return ev.result.recommendation ? `AI đề xuất ${ev.result.recommendation.supplier}.` : 'Chưa có xưởng đạt chuẩn. Gửi tin hỏi giá rồi nhập báo giá.';
    }
    if (op === 'choose') {
      if (!can(u, 'sourcing.choose')) throw new UserError('Chỉ CEO chọn xưởng.');
      const offer = String(fd.get('offer_id'));
      if (!isUuid(offer)) throw new UserError('Báo giá không hợp lệ.');
      const msg = await chooseOffer(id, offer, u.id);
      // Đề xuất cùng yêu cầu trong hàng đợi AI không còn cần duyệt.
      await q("UPDATE agent_actions SET status='DA_DUYET', decided_by=$2, decided_label=$3, decided_at=now() WHERE status='DE_XUAT' AND kind='SOURCING_CHOICE' AND entity_id=$1 AND detail->>'offer_id'=$4",
        [id, u.id, actorOf(u).label, offer]);
      await q("UPDATE agent_actions SET status='TU_CHOI', decided_by=$2, decided_label=$3, decided_at=now() WHERE status='DE_XUAT' AND kind='SOURCING_CHOICE' AND entity_id=$1",
        [id, u.id, `${actorOf(u).label} (chọn xưởng khác)`]);
      await audit(actorOf(u), 'sourcing.choose', 'sourcing', id, { offer });
      return msg;
    }
    if (op === 'close') {
      if (!can(u, 'sourcing.choose')) throw new UserError('Chỉ CEO đóng yêu cầu.');
      await q("UPDATE sourcing_requests SET status='DONG', decided_by=$2, decided_at=now() WHERE id=$1 AND status <> 'DA_CHON'", [id, u.id]);
      await q("UPDATE agent_actions SET status='TU_CHOI', decided_by=$2, decided_at=now(), decided_label='Đóng yêu cầu' WHERE status IN ('DE_XUAT','TIN') AND entity='sourcing' AND entity_id=$1", [id, u.id]);
      return 'Đã đóng yêu cầu.';
    }
    throw new UserError('Thao tác không hợp lệ.');
  });
}

async function saveOffer(fd: FormData) {
  'use server';
  const u = await requireUser('suppliers.edit');
  await runAction(BACK, async () => {
    const supplier = String(fd.get('supplier_id'));
    if (!isUuid(supplier)) throw new UserError('Chọn xưởng.');
    const raw = String(fd.get('raw_text') ?? '').trim();
    let productText = String(fd.get('product_text') ?? '').trim();
    let price = Number(fd.get('price')) || 0;
    let currency = String(fd.get('currency') ?? 'VND');
    let moq = Math.round(Number(fd.get('moq')) || 0);
    let lead = fd.get('lead_time_days') ? Math.round(Number(fd.get('lead_time_days'))) : null;
    let source = 'NHAP_TAY';
    if (raw && (!price || !productText)) {
      if (!aiEnabled()) throw new UserError('Chưa có AI_API_KEY: nhập giá và mô tả bằng tay, hoặc cấu hình AI để AI đọc tin nhắn xưởng.');
      const x = await extractOffer(raw);
      if (!x?.price) throw new UserError('AI không thấy đơn giá trong văn bản. Hãy nhập tay.');
      productText ||= x.product_text ?? ''; price ||= x.price; currency = x.currency ?? currency; moq ||= x.moq ?? 0; lead ??= x.lead_time_days ?? null;
      source = 'AI_TRICH';
    }
    const category = String(fd.get('category') ?? '').trim();
    if (!productText || !category || !(price > 0)) throw new UserError('Cần mô tả hàng, ngành hàng và đơn giá.');
    if (!['VND', 'CNY', 'USD'].includes(currency)) throw new UserError('Tiền tệ không hợp lệ.');
    const { r, tam } = rate(currency);
    const unit = Math.round(price * r);
    const productId = String(fd.get('product_id') ?? '');
    await q(`INSERT INTO supplier_offers(supplier_id, product_id, product_text, category, unit_cost, currency, price_original, moq, lead_time_days, source, source_url, raw_text, verified, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [supplier, isUuid(productId) ? productId : null, productText.slice(0, 300), category.slice(0, 100), unit, currency, price, Math.max(1, moq || 1), lead, source,
        String(fd.get('source_url') ?? '').slice(0, 500) || null, raw.slice(0, 6000) || null, fd.get('verified') === 'on', u.id]);
    await audit(actorOf(u), 'offer.create', 'supplier', supplier, { productText, unit, currency, source });
    return `Đã lưu báo giá ${vnd(unit)}/cái${tam ? ` (tỷ giá tạm ${r}, nhập ${currency}_VND_RATE trong .env)` : ''}${source === 'AI_TRICH' ? '. AI đã đọc từ tin nhắn: hãy kiểm tra lại.' : ''}.`;
  });
}

async function verifyOffer(fd: FormData) {
  'use server';
  const u = await requireUser('suppliers.edit');
  await runAction(BACK, async () => {
    const id = String(fd.get('id'));
    if (!isUuid(id)) throw new UserError('Báo giá không hợp lệ.');
    await q('UPDATE supplier_offers SET verified=NOT verified WHERE id=$1', [id]);
    await audit(actorOf(u), 'offer.verify', 'supplier_offer', id, {});
    return 'Đã cập nhật.';
  });
}

export default async function Sourcing({ searchParams }: { searchParams: { ok?: string; loi?: string } }) {
  const u = await requireUser('orders.view');
  const [reqs, offers, sups, prods, cats] = await Promise.all([
    q(`SELECT s.*, o.product_text AS chosen_text, sp.name AS chosen_supplier FROM sourcing_requests s
       LEFT JOIN supplier_offers o ON o.id=s.chosen_offer_id LEFT JOIN suppliers sp ON sp.id=o.supplier_id
       ORDER BY CASE s.status WHEN 'DA_DE_XUAT' THEN 0 WHEN 'KHONG_TIM_THAY' THEN 1 WHEN 'MO' THEN 2 ELSE 3 END, s.created_at DESC LIMIT 60`),
    q(`SELECT o.*, s.name AS supplier_name FROM supplier_offers o JOIN suppliers s ON s.id=o.supplier_id ORDER BY o.created_at DESC LIMIT 100`),
    q('SELECT id, name, categories FROM suppliers ORDER BY name'),
    q('SELECT id, sku, name FROM products ORDER BY name'),
    q('SELECT DISTINCT category AS c FROM products UNION SELECT DISTINCT unnest(categories) FROM suppliers ORDER BY 1'),
  ]);
  const edit = can(u, 'suppliers.edit');
  const ceo = can(u, 'sourcing.choose');

  return (
    <div className="stack">
      <h1>Tìm xưởng</h1>
      <Flash sp={searchParams} />
      <p className="muted">
        RYN-SUPPLY chấm điểm mọi xưởng cùng ngành hàng theo giá xưởng + phí, số lượng và MOQ, biên ròng ở giá bán dự kiến, TrustScore ≥ 85, lỗi ≤ 2%,
        thời gian sản xuất và khả năng giao quốc tế; đề xuất 1 xưởng chính + 3 dự phòng. <b>CEO quyết định.</b> AI không tự bịa xưởng: chỉ xếp hạng
        xưởng và báo giá có trong hệ thống. Thiếu báo giá thì AI soạn sẵn tin hỏi giá tiếng Trung / tiếng Việt.
      </p>
      <datalist id="nganh2">{cats.map((c) => <option key={c.c} value={c.c} />)}</datalist>

      {edit && (
        <details className="card"><summary><b>Tạo nhu cầu tìm xưởng</b></summary>
          <form action={newRequest} className="form-grid" style={{ marginTop: 12 }}>
            <label className="field">Sản phẩm có sẵn (không bắt buộc)<select name="product_id" defaultValue=""><option value="">— hàng mới —</option>{prods.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}</select></label>
            <label className="field">Mô tả hàng<input name="text" placeholder="Ví dụ: ly giữ nhiệt inox 900ml in logo" /></label>
            <label className="field">Ngành hàng<input name="category" list="nganh2" /></label>
            <label className="field">Số lượng<input name="quantity" type="number" min={1} required defaultValue={100} /></label>
            <label className="field">Giá bán dự kiến / cái (đ)<input name="target_unit_price" type="number" min={0} /></label>
            <label className="field">Giao tới<select name="country" defaultValue="VN">{COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.vi}</option>)}</select></label>
            <div style={{ alignSelf: 'end' }}><button className="btn">AI tìm xưởng</button></div>
          </form>
        </details>
      )}

      <h2>Nhu cầu tìm xưởng</h2>
      {reqs.length === 0 && <p className="muted">Chưa có. AI tự tạo khi xưởng chính không đạt chuẩn hoặc khách hỏi giá hàng chưa có trong danh mục.</p>}
      {reqs.map((r) => {
        const res = r.result ?? {};
        const rec = res.recommendation;
        const open = ['MO', 'DA_DE_XUAT', 'KHONG_TIM_THAY'].includes(r.status);
        return (
          <section key={r.id} className="card stack">
            <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <div><b>{r.code}</b> · {r.product_text} × {r.quantity.toLocaleString('vi-VN')} · ngành {r.category ?? <i>chưa rõ</i>} · giao {r.ship_country}
                {r.target_unit_price ? <> · giá bán dự kiến {vnd(r.target_unit_price)}</> : null}
                <div className="small muted">{r.reason} · {dt(r.created_at)}{res.evaluated_at ? ` · AI chấm lúc ${dt(res.evaluated_at)}` : ''}</div></div>
              <span className={`badge ${ST[r.status][1]}`}>{ST[r.status][0]}</span>
            </div>
            {r.status === 'DA_CHON' && <div className="alert ok small">Đã chọn {r.chosen_supplier}: {r.chosen_text}</div>}
            {rec && open && (
              <div className="alert info small">
                AI đề xuất <b>{rec.supplier}</b>: giá xưởng + phí {vnd(rec.landed)}/cái
                {r.product_id
                  ? <>. Chọn thì đổi xưởng chính và giá vốn của sản phẩm; RYN-PRICE kiểm tra lại giá bán</>
                  : <>, báo khách {vnd(rec.unit_price)}/cái, biên {pct(rec.margin)}, tổng {vnd(rec.total)}</>}
                {rec.test_qty ? <>. MOQ cao: bán thử {rec.test_qty} cái trước.</> : '.'}
                {rec.backups?.length ? <> Dự phòng: {rec.backups.map((b: any) => b.supplier).join(', ')}.</> : null}
              </div>
            )}
            {res.inquiry && open && (
              <details><summary className="small">Tin nhắn hỏi giá soạn sẵn (gửi xưởng qua 1688 / WeChat / Zalo)</summary>
                <p lang="zh" className="small">{res.inquiry.zh}</p><p className="small muted">{res.inquiry.vi}</p></details>
            )}
            {(res.ranked ?? []).length > 0 && (
              <div className="table-wrap"><table className="small">
                <thead><tr><th>Xưởng</th><th>Báo giá</th><th className="num">Giá xưởng</th><th className="num">MOQ</th><th className="num">+ phí</th><th className="num">Biên</th><th className="num">Trust</th><th className="num">Lỗi</th><th className="num">Ngày SX</th><th className="num">Điểm</th><th>Ghi chú</th><th></th></tr></thead>
                <tbody>{res.ranked.map((x: any, i: number) => (
                  <tr key={i} style={x.eligible ? undefined : { opacity: 0.6 }}>
                    <td>{x.supplier}{x.simulated ? <div className="muted">giả lập</div> : null}</td>
                    <td>{x.offer_text ?? '—'}{x.offer_id && !x.verified ? <div className="muted">chưa xác nhận</div> : null}</td>
                    <td className="num">{x.unit_cost ? vnd(x.unit_cost) : '—'}</td><td className="num">{x.moq ?? '—'}</td>
                    <td className="num">{x.landed ? vnd(x.landed) : '—'}</td><td className="num">{x.margin != null ? pct(x.margin) : '—'}</td>
                    <td className="num">{x.trust}</td><td className="num">{(Number(x.defect) * 100).toFixed(1)}%</td><td className="num">{x.lead ?? '—'}</td>
                    <td className="num"><b>{x.score}</b></td>
                    <td>{x.eligible ? <span className="badge ok">đạt</span> : null} {x.reasons.join('; ')}</td>
                    <td>{ceo && open && x.offer_id && (
                      <form action={act}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="offer_id" value={x.offer_id} />
                        <button className={`btn sm ${rec?.offer_id === x.offer_id ? '' : 'secondary'}`} name="op" value="choose">Chọn</button></form>
                    )}</td>
                  </tr>
                ))}</tbody>
              </table></div>
            )}
            {open && (
              <div className="row" style={{ gap: 8 }}>
                {edit && <form action={act}><input type="hidden" name="id" value={r.id} /><button className="btn secondary sm" name="op" value="eval">AI chấm lại</button></form>}
                {ceo && <form action={act}><input type="hidden" name="id" value={r.id} /><button className="btn danger sm" name="op" value="close">Đóng</button></form>}
              </div>
            )}
          </section>
        );
      })}

      <h2>Báo giá xưởng</h2>
      {edit && (
        <details className="card"><summary><b>Nhập báo giá xưởng</b> (tay, hoặc dán tin nhắn để AI đọc{aiEnabled() ? '' : ' — cần AI_API_KEY'})</summary>
          <form action={saveOffer} className="form-grid" style={{ marginTop: 12 }}>
            <label className="field">Xưởng<select name="supplier_id" required defaultValue="">{[<option key="" value="" disabled>— chọn —</option>, ...sups.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)]}</select></label>
            <label className="field">Ngành hàng<input name="category" list="nganh2" required /></label>
            <label className="field">Sản phẩm có sẵn (không bắt buộc)<select name="product_id" defaultValue=""><option value="">—</option>{prods.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
            <label className="field">Mô tả hàng<input name="product_text" /></label>
            <label className="field">Đơn giá<input name="price" type="number" step="0.01" min={0} /></label>
            <label className="field">Tiền tệ<select name="currency" defaultValue="VND"><option>VND</option><option>CNY</option><option>USD</option></select></label>
            <label className="field">MOQ<input name="moq" type="number" min={1} /></label>
            <label className="field">Ngày sản xuất<input name="lead_time_days" type="number" min={0} /></label>
            <label className="field">Link nguồn<input name="source_url" type="url" /></label>
            <label className="field" style={{ gridColumn: '1 / -1' }}>Tin nhắn / nội dung báo giá của xưởng (AI đọc khi thiếu giá hoặc mô tả)<textarea name="raw_text" rows={3} /></label>
            <label className="row"><input type="checkbox" name="verified" /> Đã xác nhận lại với xưởng</label>
            <div style={{ alignSelf: 'end' }}><button className="btn">Lưu báo giá</button></div>
          </form>
        </details>
      )}
      <div className="table-wrap"><table className="small">
        <thead><tr><th>Xưởng</th><th>Hàng</th><th>Ngành</th><th className="num">Giá (VND)</th><th className="num">Giá gốc</th><th className="num">MOQ</th><th className="num">Ngày SX</th><th>Nguồn</th><th>Xác nhận</th></tr></thead>
        <tbody>{offers.map((o) => (
          <tr key={o.id}>
            <td>{o.supplier_name}</td><td>{o.product_text}{o.is_simulated ? <div className="muted">giả lập</div> : null}</td><td>{o.category}</td>
            <td className="num">{vnd(o.unit_cost)}</td><td className="num">{o.currency !== 'VND' ? `${Number(o.price_original)} ${o.currency}` : '—'}</td>
            <td className="num">{o.moq}</td><td className="num">{o.lead_time_days ?? '—'}</td>
            <td>{o.source === 'AI_TRICH' ? 'AI đọc tin nhắn' : o.source === 'NHAP_TAY' ? 'Nhập tay' : o.source}{o.source_url ? <> · <a href={o.source_url} target="_blank" rel="noreferrer">link</a></> : null}</td>
            <td>{edit ? <form action={verifyOffer}><input type="hidden" name="id" value={o.id} /><button className={`btn sm ${o.verified ? '' : 'secondary'}`}>{o.verified ? 'Đã xác nhận' : 'Chưa'}</button></form> : (o.verified ? 'Đã xác nhận' : 'Chưa')}</td>
          </tr>
        ))}</tbody>
      </table></div>
    </div>
  );
}
