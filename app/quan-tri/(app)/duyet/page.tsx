import Link from 'next/link';
import { requireUser, actorOf } from '@/lib/auth';
import { q } from '@/lib/db';
import { decideApproval } from '@/lib/orders';
import { canApprove, LEVELS, type Level } from '@/lib/approval';
import { vnd, pct, dt } from '@/lib/format';
import { runAction } from '@/lib/action';
import Flash from '@/components/Flash';

async function decide(fd: FormData) {
  'use server';
  const u = await requireUser();
  const decision = fd.get('decision') === 'APPROVED' ? 'APPROVED' : 'REJECTED';
  await runAction('/quan-tri/duyet', async () => {
    await decideApproval(String(fd.get('id')), { id: u.id, role: u.role, label: actorOf(u).label }, decision, String(fd.get('note') ?? ''));
    return decision === 'APPROVED' ? 'Đã duyệt đơn.' : 'Đã từ chối đơn.';
  });
}

export default async function ApprovalQueue({ searchParams }: { searchParams: { ok?: string; loi?: string } }) {
  const u = await requireUser();
  const rows = await q(`SELECT o.*, ch.name AS channel_name, cu.name AS customer_name,
      (SELECT string_agg(product_name || ' × ' || quantity, ', ') FROM order_items WHERE order_id=o.id) AS items
    FROM wholesale_orders o JOIN sales_channels ch ON ch.id=o.channel_id JOIN customers cu ON cu.id=o.customer_id
    WHERE o.approval_status='PENDING' ORDER BY o.approval_deadline ASC`);
  return (
    <div className="stack">
      <h1>Chờ duyệt</h1>
      <Flash sp={searchParams} />
      <div className="table-wrap"><table>
        <thead><tr><th>Cấp</th><th>Hạn</th><th>Người duyệt</th><th>Giá trị</th><th>Biên</th></tr></thead>
        <tbody>{([1, 2, 3, 4, 5] as Level[]).map((l) => (
          <tr key={l}><td>{LEVELS[l].label}</td><td>{LEVELS[l].minutes >= 60 ? `${LEVELS[l].minutes / 60} giờ` : `${LEVELS[l].minutes} phút`}</td><td>{LEVELS[l].approver}</td>
            <td>{['Dưới 5 triệu', '5 đến dưới 20 triệu', '20 đến dưới 50 triệu', '50 đến 200 triệu', 'Trên 200 triệu'][l - 1]}</td>
            <td className="small">{l === 2 ? 'Biên dưới 15% → tối thiểu Cấp 2' : l === 4 ? 'Đơn lỗ → tối thiểu Cấp 4' : ''}</td></tr>
        ))}</tbody>
      </table></div>
      {rows.length === 0 && <div className="card">Không có đơn nào chờ duyệt.</div>}
      {rows.map((o) => {
        const overdue = new Date(o.approval_deadline) < new Date();
        const mine = canApprove(u.role, o.cap_duyet as Level);
        return (
          <section key={o.id} className="card stack">
            <div className="row spread">
              <div className="row">
                <Link href={`/quan-tri/don-hang/${o.id}`}><strong>{o.code}</strong></Link>
                <span className="badge orange">{LEVELS[o.cap_duyet as Level].label}</span>
                <span className="badge">{o.channel_name}</span>
                {overdue ? <span className="badge bad">Quá hạn từ {dt(o.approval_deadline)}</span> : <span className="badge warn">Hạn {dt(o.approval_deadline)}</span>}
              </div>
              <div className="mono">{vnd(o.tong_dt)}</div>
            </div>
            <div className="small">{o.customer_name} · {o.items}</div>
            <div className="grid cols-4 small">
              <div>LN ròng sau thuế<br /><b className="mono">{vnd(o.ln_rong_sau_thue)}</b></div>
              <div>Biên / chi phí<br /><b className="mono">{pct(o.bien_rong_tren_chi_phi)}</b></div>
              <div>Biên / doanh thu<br /><b className="mono">{pct(o.bien_rong_tren_dt)}</b></div>
              <div>Lý do cấp<br /><b>{o.cap_ly_do}</b></div>
            </div>
            {Number(o.bien_rong_tren_chi_phi) > 150 && <div className="alert warn small">Biên trên 150%: kiểm tra lại giá trước khi duyệt.</div>}
            {mine ? (
              <form action={decide} className="row">
                <input type="hidden" name="id" value={o.id} />
                <input name="note" placeholder="Ghi chú (bắt buộc khi từ chối)" style={{ flex: 1, minWidth: 200 }} />
                <button className="btn" name="decision" value="APPROVED">Duyệt</button>
                <button className="btn danger" name="decision" value="REJECTED">Từ chối</button>
              </form>
            ) : <div className="muted small">Cần {LEVELS[o.cap_duyet as Level].approver} duyệt.</div>}
          </section>
        );
      })}
    </div>
  );
}
