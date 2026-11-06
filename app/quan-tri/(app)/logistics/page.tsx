import Link from 'next/link';
import { requireUser, actorOf, can } from '@/lib/auth';
import { q } from '@/lib/db';
import { audit } from '@/lib/audit';
import { runAction, UserError } from '@/lib/action';
import { isUuid } from '@/lib/catalog';
import { vnd, label } from '@/lib/format';
import { cheapest, guessZone, rateFee, ZONE_TEXT, type Zone } from '@/lib/logistics';
import Flash from '@/components/Flash';

// Module Logistics WFS (spec): bảng giá GHN / GHTK / J&T..., AI chọn hãng rẻ nhất cho từng đơn, khối lượng sản phẩm.
const BACK = '/quan-tri/logistics';
const ZONES = Object.keys(ZONE_TEXT) as Zone[];

async function act(fd: FormData) {
  'use server';
  const u = await requireUser('logistics.edit');
  await runAction(BACK, async () => {
    const op = String(fd.get('op'));
    if (op === 'rate') {
      const carrier = String(fd.get('carrier') ?? '').trim().slice(0, 60);
      const zone = String(fd.get('zone'));
      const v = (k: string) => Math.round(Number(fd.get(k)));
      if (!carrier || !ZONES.includes(zone as Zone)) throw new UserError('Cần hãng và vùng.');
      if (!(v('base_fee') >= 0) || !(v('base_grams') > 0) || !(v('step_fee') >= 0) || !(v('step_grams') > 0)) throw new UserError('Phí và khối lượng không hợp lệ.');
      await q(`INSERT INTO shipping_rates(carrier, zone, base_fee, base_grams, step_fee, step_grams, days, active, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now())
        ON CONFLICT (carrier, zone) DO UPDATE SET base_fee=EXCLUDED.base_fee, base_grams=EXCLUDED.base_grams, step_fee=EXCLUDED.step_fee, step_grams=EXCLUDED.step_grams,
          days=EXCLUDED.days, active=EXCLUDED.active, is_simulated=false, updated_at=now()`,
        [carrier, zone, v('base_fee'), v('base_grams'), v('step_fee'), v('step_grams'), fd.get('days') ? v('days') : null, fd.get('active') === 'on']);
      await audit(actorOf(u), 'shipping.rate', 'shipping_rate', `${carrier}/${zone}`, { base: v('base_fee') });
      return `Đã lưu giá ${carrier} · ${ZONE_TEXT[zone as Zone]}.`;
    }
    if (op === 'weight') {
      const id = String(fd.get('id'));
      const g = Math.round(Number(fd.get('weight_grams')));
      if (!isUuid(id) || !(g > 0 && g < 1_000_000)) throw new UserError('Khối lượng không hợp lệ.');
      await q('UPDATE products SET weight_grams=$2, updated_at=now() WHERE id=$1', [id, g]);
      return 'Đã lưu khối lượng.';
    }
    throw new UserError('Thao tác không hợp lệ.');
  });
}

export default async function Logistics({ searchParams }: { searchParams: { ok?: string; loi?: string; vung?: string; gram?: string } }) {
  const u = await requireUser('orders.view');
  const edit = can(u, 'logistics.edit');
  const [rates, orders, prods] = await Promise.all([
    q('SELECT * FROM shipping_rates ORDER BY zone, carrier'),
    q(`SELECT o.id, o.code, o.status, o.ship_address, o.ship_country, o.carrier, o.tracking_no, o.wfs_status,
        (SELECT COALESCE(sum(i.quantity * p.weight_grams),0) FROM order_items i JOIN products p ON p.id=i.product_id WHERE i.order_id=o.id)::bigint AS grams
       FROM wholesale_orders o WHERE o.status IN ('DANG_CHUAN_BI','DANG_GIAO') ORDER BY o.status, o.updated_at`),
    q('SELECT id, sku, name, weight_grams FROM products ORDER BY name'),
  ]);
  const calcZone = (ZONES.includes(searchParams.vung as Zone) ? searchParams.vung : 'LIEN_MIEN') as Zone;
  const calcGrams = Math.max(1, Math.round(Number(searchParams.gram) || 1000));
  const calc = cheapest(rates, calcZone, calcGrams);

  return (
    <div className="stack">
      <h1>Logistics & vận chuyển</h1>
      <Flash sp={searchParams} />
      <p className="muted small">RYN-LOGI so phí các hãng theo vùng và khối lượng để chọn hãng rẻ nhất cho mỗi đơn đang chuẩn bị. Chưa nối API GHN / GHTK / J&T: nhập bảng giá theo hợp đồng.
        {rates.some((r) => r.is_simulated) && ' Có giá đang là số giả lập, cần cập nhật.'}</p>

      <h2>Đơn cần gửi / đang giao ({orders.length})</h2>
      <div className="table-wrap"><table className="small">
        <thead><tr><th>Đơn</th><th>Trạng thái</th><th>Vùng</th><th className="num">Khối lượng</th><th>AI chọn</th><th>So sánh</th></tr></thead>
        <tbody>{orders.map((o) => {
          const zone = guessZone(o.ship_address, o.ship_country);
          const list = cheapest(rates, zone, Number(o.grams));
          return (
            <tr key={o.id}>
              <td><Link href={`/quan-tri/don-hang/${o.id}`}>{o.code}</Link></td><td>{label(o.status)}{o.carrier ? ` · ${o.carrier} ${o.tracking_no}` : ''}</td>
              <td>{ZONE_TEXT[zone]}</td><td className="num">{(Number(o.grams) / 1000).toLocaleString('vi-VN')} kg</td>
              <td>{list[0] ? <b>{list[0].carrier} {vnd(list[0].fee)}</b> : <span className="muted">chưa có bảng giá vùng này</span>}</td>
              <td className="muted">{list.slice(1).map((x) => `${x.carrier} ${vnd(x.fee)}`).join(' · ')}</td>
            </tr>
          );
        })}</tbody>
      </table></div>

      <h2>Tính phí nhanh</h2>
      <form className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <select name="vung" defaultValue={calcZone}>{ZONES.map((z) => <option key={z} value={z}>{ZONE_TEXT[z]}</option>)}</select>
        <input name="gram" type="number" min={1} defaultValue={calcGrams} style={{ width: 120 }} /> <span className="small">gram</span>
        <button className="btn secondary sm">Tính</button>
      </form>
      <div className="small">{calc.length ? calc.map((x, i) => <span key={x.carrier} className={`badge ${i === 0 ? 'ok' : ''}`} style={{ marginRight: 6 }}>{x.carrier} {vnd(x.fee)}{x.days ? ` · ${x.days} ngày` : ''}</span>) : 'Chưa có bảng giá cho vùng này.'}</div>

      <h2>Bảng giá hãng vận chuyển</h2>
      <div className="table-wrap"><table className="small">
        <thead><tr><th>Hãng</th><th>Vùng</th><th className="num">Phí cơ bản</th><th className="num">Thêm mỗi bước</th><th className="num">Ví dụ 2 kg</th><th>Ngày</th><th></th></tr></thead>
        <tbody>{rates.map((r) => (
          <tr key={r.id} style={r.active ? undefined : { opacity: 0.5 }}>
            <td>{r.carrier}{r.is_simulated ? <div className="muted">giả lập</div> : null}</td><td>{ZONE_TEXT[r.zone as Zone]}</td>
            <td className="num">{vnd(r.base_fee)} / {r.base_grams} g</td><td className="num">{vnd(r.step_fee)} / {r.step_grams} g</td>
            <td className="num">{vnd(rateFee(r, 2000))}</td><td>{r.days ?? '—'}</td><td>{r.active ? '' : 'tắt'}</td>
          </tr>
        ))}</tbody>
      </table></div>
      {edit && (
        <details className="card"><summary><b>Thêm / sửa giá</b> (cùng hãng + vùng thì ghi đè)</summary>
          <form action={act} className="form-grid" style={{ marginTop: 12 }}><input type="hidden" name="op" value="rate" />
            <label className="field">Hãng<input name="carrier" list="hang" required /></label>
            <datalist id="hang"><option value="GHN" /><option value="GHTK" /><option value="J&T" /><option value="Viettel Post" /><option value="DHL" /></datalist>
            <label className="field">Vùng<select name="zone">{ZONES.map((z) => <option key={z} value={z}>{ZONE_TEXT[z]}</option>)}</select></label>
            <label className="field">Phí cơ bản (đ)<input name="base_fee" type="number" min={0} required /></label>
            <label className="field">Cho tối đa (g)<input name="base_grams" type="number" min={1} defaultValue={500} /></label>
            <label className="field">Thêm mỗi bước (đ)<input name="step_fee" type="number" min={0} defaultValue={5000} /></label>
            <label className="field">Bước (g)<input name="step_grams" type="number" min={1} defaultValue={500} /></label>
            <label className="field">Số ngày giao<input name="days" type="number" min={0} /></label>
            <label className="row"><input type="checkbox" name="active" defaultChecked /> Đang dùng</label>
            <div style={{ alignSelf: 'end' }}><button className="btn">Lưu</button></div>
          </form>
        </details>
      )}

      <h2>Khối lượng sản phẩm</h2>
      <div className="table-wrap"><table className="small">
        <thead><tr><th>Sản phẩm</th><th>Khối lượng mỗi cái (đã đóng gói)</th></tr></thead>
        <tbody>{prods.map((p) => (
          <tr key={p.id}><td>{p.name} <span className="muted">{p.sku}</span></td>
            <td>{edit ? (
              <form action={act} className="row" style={{ gap: 6 }}><input type="hidden" name="op" value="weight" /><input type="hidden" name="id" value={p.id} />
                <input name="weight_grams" type="number" min={1} defaultValue={p.weight_grams} style={{ width: 100 }} /> g <button className="btn secondary sm">Lưu</button></form>
            ) : `${p.weight_grams} g`}</td></tr>
        ))}</tbody>
      </table></div>
    </div>
  );
}
