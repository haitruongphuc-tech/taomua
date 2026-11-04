import Link from 'next/link';
import { requireUser, actorOf, can } from '@/lib/auth';
import { q } from '@/lib/db';
import { audit } from '@/lib/audit';
import { runAction, UserError } from '@/lib/action';
import { listingMargin, CONNECTORS } from '@/lib/channels';
import { isUuid } from '@/lib/catalog';
import { vnd, pct, dt } from '@/lib/format';
import Flash from '@/components/Flash';

const KIND: Record<string, string> = { OWN: 'Kênh riêng', MARKETPLACE: 'Sàn TMĐT', SOCIAL: 'Mạng xã hội', PARTNER_SITE: 'Website bên ngoài' };
const API: Record<string, string> = { KHONG_CAN: 'Không cần', CHUA_KET_NOI: 'Chưa kết nối API', DANG_KET_NOI: 'Đã kết nối', LOI: 'Lỗi kết nối' };
const LST: Record<string, string> = { NHAP: 'Nháp', DANG_BAN: 'Đang bán', TAM_DUNG: 'Tạm dừng' };

async function saveChannel(fd: FormData) {
  'use server';
  const u = await requireUser('channels.edit');
  await runAction('/quan-tri/kenh-ban', async () => {
    const id = String(fd.get('id') ?? '');
    const fee = Number(fd.get('fee_pct'));
    if (!(fee >= 0 && fee < 100)) throw new UserError('Phí kênh phải từ 0 đến dưới 100%.');
    const name = String(fd.get('name') ?? '').trim().slice(0, 80);
    const notes = String(fd.get('notes') ?? '').slice(0, 500);
    const active = fd.get('active') === 'on';
    if (id) {
      if (!isUuid(id)) throw new UserError('Kênh không hợp lệ.');
      await q("UPDATE sales_channels SET name=$2, fee_pct=$3, notes=$4, active=$5 OR kind='OWN' WHERE id=$1", [id, name, fee, notes, active]);
    } else {
      const code = String(fd.get('code') ?? '').trim().toLowerCase();
      const kind = String(fd.get('kind'));
      if (!/^[a-z0-9-]{2,30}$/.test(code)) throw new UserError('Mã kênh chỉ gồm chữ thường, số, gạch ngang.');
      if (!KIND[kind] || kind === 'OWN') throw new UserError('Loại kênh không hợp lệ.');
      await q("INSERT INTO sales_channels(code, name, kind, connector, fee_pct, notes, active) VALUES ($1,$2,$3,'MANUAL',$4,$5,$6)", [code, name, kind, fee, notes, active])
        .catch((e) => { if (e?.code === '23505') throw new UserError('Mã kênh đã tồn tại.'); throw e; });
    }
    await audit(actorOf(u), id ? 'channel.update' : 'channel.create', 'channel', id || null, { name, fee });
    return 'Đã lưu kênh bán.';
  });
}

async function saveListing(fd: FormData) {
  'use server';
  const u = await requireUser('listings.edit');
  await runAction('/quan-tri/kenh-ban', async () => {
    const channel = String(fd.get('channel_id'));
    const product = String(fd.get('product_id'));
    const price = Math.round(Number(fd.get('price')));
    const status = String(fd.get('status') ?? 'NHAP');
    if (!isUuid(channel) || !isUuid(product)) throw new UserError('Chọn kênh và sản phẩm.');
    if (!(price > 0)) throw new UserError('Giá phải lớn hơn 0.');
    if (!LST[status]) throw new UserError('Trạng thái không hợp lệ.');
    await q(`INSERT INTO channel_listings(channel_id, product_id, price, status, external_sku, external_url) VALUES ($1,$2,$3,$4,$5,$6)
      ON CONFLICT (channel_id, product_id) DO UPDATE SET price=EXCLUDED.price, status=EXCLUDED.status,
        external_sku=COALESCE(EXCLUDED.external_sku, channel_listings.external_sku), external_url=COALESCE(EXCLUDED.external_url, channel_listings.external_url), updated_at=now()`,
      [channel, product, price, status, String(fd.get('external_sku') ?? '').trim() || null, String(fd.get('external_url') ?? '').trim() || null]);
    await audit(actorOf(u), 'listing.save', 'listing', null, { channel, product, price, status });
    return 'Đã lưu giá trên kênh. Nhớ cập nhật giá trên nền tảng (chưa có kết nối API).';
  });
}

export default async function Channels({ searchParams }: { searchParams: { ok?: string; loi?: string } }) {
  const u = await requireUser('orders.view');
  const channels = await q(`SELECT ch.*, (SELECT count(*)::int FROM channel_listings l WHERE l.channel_id=ch.id AND l.status='DANG_BAN') AS n_listed,
    (SELECT count(*)::int FROM wholesale_orders o WHERE o.channel_id=ch.id) AS n_orders FROM sales_channels ch ORDER BY ch.kind='OWN' DESC, ch.name`);
  const listings = await q(`SELECT l.*, p.name, p.sku, p.cost + p.fee AS unit_cost, p.input_vat, ch.name AS channel_name, ch.fee_pct, ch.code AS channel_code
    FROM channel_listings l JOIN products p ON p.id=l.product_id JOIN sales_channels ch ON ch.id=l.channel_id ORDER BY ch.name, p.name`);
  const products = await q('SELECT id, name, sku FROM products ORDER BY name');
  const external = channels.filter((c) => c.kind !== 'OWN');
  return (
    <div className="stack">
      <div className="row spread"><h1 style={{ margin: 0 }}>Kênh bán</h1><Link className="btn sm" href="/quan-tri/kenh-ban/nhap-don">Nhập đơn từ kênh</Link></div>
      <Flash sp={searchParams} />
      <p className="muted">taomua bán trên bất kỳ nền tảng nào. 9mua, Shopee, TikTok Shop… đều là kênh ngoài như nhau. Đơn từ mọi kênh đi qua cùng quy tắc duyệt 5 cấp và giữ tiền.</p>
      <div className="table-wrap"><table>
        <thead><tr><th>Kênh</th><th>Loại</th><th>Kết nối</th><th className="num">Phí kênh</th><th className="num">Đang bán</th><th className="num">Đơn</th><th>Ghi chú</th></tr></thead>
        <tbody>{channels.map((c) => (
          <tr key={c.id}>
            <td><b>{c.name}</b> <span className="small muted">{c.code}</span>{!c.active && <span className="badge bad"> tắt</span>}</td>
            <td>{KIND[c.kind]}</td>
            <td>{c.kind === 'OWN' ? 'Sẵn có' : CONNECTORS[c.code] ? 'API' : <span className="badge warn">{API[c.api_status]} · nhập tay/CSV</span>}</td>
            <td className="num">{pct(c.fee_pct)}</td><td className="num">{c.n_listed}</td><td className="num">{c.n_orders}</td><td className="small">{c.notes}</td>
          </tr>
        ))}</tbody>
      </table></div>

      <section className="stack">
        <h2>Giá trên từng kênh</h2>
        <div className="table-wrap"><table>
          <thead><tr><th>Kênh</th><th>Sản phẩm</th><th className="num">Giá kênh</th><th className="num">Phí kênh</th><th className="num">LN ròng/cái</th><th className="num">Biên/CP</th><th>Trạng thái</th><th>CSV</th></tr></thead>
          <tbody>{listings.map((l) => {
            const m = listingMargin(l.price, l.unit_cost, l.input_vat, l.fee_pct);
            return (
              <tr key={l.id}>
                <td>{l.channel_name}</td><td>{l.name} <span className="small muted">{l.sku}</span></td>
                <td className="num">{vnd(l.price)}</td><td className="num">{vnd(m.channelFee)}</td><td className="num">{vnd(m.net)}</td>
                <td className="num"><span className={`badge ${m.net <= 0 ? 'bad' : m.marginOnCost < 15 ? 'warn' : 'ok'}`}>{pct(m.marginOnCost)}</span></td>
                <td>{LST[l.status]}<div className="small muted">{l.synced_at ? `đồng bộ ${dt(l.synced_at)}` : 'chưa đồng bộ API'}</div></td>
                <td><a className="small" href={`/api/kenh-ban/${l.channel_code}/san-pham.csv`}>Tải</a></td>
              </tr>
            );
          })}</tbody>
        </table></div>
        {can(u, 'listings.edit') && (
          <form action={saveListing} className="card form-grid">
            <label className="field">Kênh<select name="channel_id" required>{external.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
            <label className="field">Sản phẩm<select name="product_id" required>{products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}</select></label>
            <label className="field">Giá trên kênh (đ, gồm VAT)<input name="price" type="number" min={1} required /></label>
            <label className="field">Trạng thái<select name="status">{Object.entries(LST).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            <label className="field">Mã SP trên kênh<input name="external_sku" /></label>
            <label className="field">Link trên kênh<input name="external_url" type="url" /></label>
            <div style={{ alignSelf: 'end' }}><button className="btn sm">Lưu giá kênh</button></div>
          </form>
        )}
      </section>

      {can(u, 'channels.edit') && (
        <section className="stack">
          <h2>Cài đặt kênh</h2>
          {channels.map((c) => (
            <details key={c.id} className="card"><summary>{c.name}</summary>
              <form action={saveChannel} className="form-grid" style={{ marginTop: 12 }}>
                <input type="hidden" name="id" value={c.id} />
                <label className="field">Tên<input name="name" defaultValue={c.name} required /></label>
                <label className="field">Phí kênh (% doanh thu)<input name="fee_pct" type="number" step="0.1" min={0} max={99} defaultValue={c.fee_pct} /></label>
                <label className="field">Ghi chú<input name="notes" defaultValue={c.notes} /></label>
                <label className="row"><input type="checkbox" name="active" defaultChecked={c.active} /> Đang hoạt động</label>
                <div style={{ alignSelf: 'end' }}><button className="btn sm">Lưu</button></div>
              </form>
            </details>
          ))}
          <details className="card"><summary><b>Thêm kênh mới</b></summary>
            <form action={saveChannel} className="form-grid" style={{ marginTop: 12 }}>
              <label className="field">Mã (vd: tiki)<input name="code" required pattern="[a-z0-9-]{2,30}" /></label>
              <label className="field">Tên<input name="name" required /></label>
              <label className="field">Loại<select name="kind">{Object.entries(KIND).filter(([k]) => k !== 'OWN').map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
              <label className="field">Phí kênh (%)<input name="fee_pct" type="number" step="0.1" min={0} max={99} defaultValue={0} /></label>
              <label className="field">Ghi chú<input name="notes" /></label>
              <label className="row"><input type="checkbox" name="active" defaultChecked /> Hoạt động</label>
              <div style={{ alignSelf: 'end' }}><button className="btn sm">Thêm</button></div>
            </form>
          </details>
        </section>
      )}
    </div>
  );
}
