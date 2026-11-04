import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { q } from '@/lib/db';
import { vnd, pct, dt, label, STATUS_LABEL } from '@/lib/format';

const STATUSES = ['CHO_DUYET', 'CHO_THANH_TOAN', 'DANG_CHUAN_BI', 'DANG_GIAO', 'DA_GIAO', 'HOAN_TAT', 'TU_CHOI', 'HUY'];

export default async function Orders({ searchParams }: { searchParams: { tt?: string; kenh?: string; q?: string } }) {
  await requireUser('orders.view');
  const where: string[] = [];
  const params: unknown[] = [];
  if (searchParams.tt && STATUSES.includes(searchParams.tt)) { params.push(searchParams.tt); where.push(`o.status=$${params.length}`); }
  if (searchParams.kenh) { params.push(searchParams.kenh); where.push(`ch.code=$${params.length}`); }
  if (searchParams.q) { params.push(`%${searchParams.q.slice(0, 50)}%`); where.push(`(o.code ILIKE $${params.length} OR cu.name ILIKE $${params.length} OR cu.phone ILIKE $${params.length} OR o.external_ref ILIKE $${params.length})`); }
  const rows = await q(`SELECT o.*, ch.name AS channel_name, cu.name AS customer_name FROM wholesale_orders o
    JOIN sales_channels ch ON ch.id=o.channel_id JOIN customers cu ON cu.id=o.customer_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY o.created_at DESC LIMIT 200`, params);
  const channels = await q('SELECT code, name FROM sales_channels ORDER BY name');
  return (
    <div className="stack">
      <div className="row spread"><h1 style={{ margin: 0 }}>Đơn hàng</h1><Link className="btn sm" href="/quan-tri/kenh-ban/nhap-don">Nhập đơn từ kênh khác</Link></div>
      <form className="card form-grid">
        <label className="field">Tìm<input name="q" defaultValue={searchParams.q} placeholder="Mã đơn, tên, SĐT, mã đơn kênh" /></label>
        <label className="field">Trạng thái<select name="tt" defaultValue={searchParams.tt ?? ''}><option value="">Tất cả</option>{STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</select></label>
        <label className="field">Kênh<select name="kenh" defaultValue={searchParams.kenh ?? ''}><option value="">Tất cả</option>{channels.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}</select></label>
        <div style={{ alignSelf: 'end' }}><button className="btn blue">Lọc</button></div>
      </form>
      <div className="table-wrap"><table>
        <thead><tr><th>Mã</th><th>Kênh</th><th>Khách</th><th className="num">Giá trị</th><th className="num">Biên/CP</th><th>Cấp</th><th>Trạng thái</th><th>Tiền</th><th>Ngày</th></tr></thead>
        <tbody>{rows.map((o) => (
          <tr key={o.id}>
            <td><Link href={`/quan-tri/don-hang/${o.id}`}>{o.code}</Link>{o.external_ref && <div className="small muted">{o.external_ref}</div>}</td>
            <td>{o.channel_name}</td><td>{o.customer_name}</td>
            <td className="num">{vnd(o.tong_dt)}</td>
            <td className="num">{pct(o.bien_rong_tren_chi_phi)}{Number(o.bien_rong_tren_chi_phi) > 150 && <span className="badge warn"> &gt;150%</span>}</td>
            <td>{o.cap_duyet}</td><td>{label(o.status)}</td><td>{label(o.trade_assurance_status)}</td><td className="small">{dt(o.created_at)}</td>
          </tr>
        ))}</tbody>
      </table></div>
      {rows.length === 0 && <div className="card">Không có đơn phù hợp.</div>}
    </div>
  );
}
