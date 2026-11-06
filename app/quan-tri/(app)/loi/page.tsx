import Link from 'next/link';
import { requireUser, actorOf, can } from '@/lib/auth';
import { q } from '@/lib/db';
import { audit } from '@/lib/audit';
import { runAction, UserError } from '@/lib/action';
import { dt } from '@/lib/format';
import { isUuid } from '@/lib/catalog';
import Flash from '@/components/Flash';

async function resolveError(fd: FormData) {
  'use server';
  const u = await requireUser('audit.view');
  await runAction('/quan-tri/loi', async () => {
    const id = Number(fd.get('id'));
    if (!Number.isInteger(id)) throw new UserError('Dữ liệu không hợp lệ.');
    await q('UPDATE app_errors SET resolved=true WHERE id=$1', [id]);
    await audit(actorOf(u), 'error.resolve', 'app_error', String(id), {});
    return 'Đã đánh dấu đã xử lý.';
  });
}

export default async function Problems({ searchParams }: { searchParams: { ok?: string; loi?: string } }) {
  const u = await requireUser('orders.view');
  const reports = await q("SELECT * FROM issue_reports ORDER BY CASE status WHEN 'MOI' THEN 0 WHEN 'DANG_XU_LY' THEN 1 ELSE 2 END, created_at DESC LIMIT 200");
  const errors = can(u, 'audit.view') ? await q('SELECT * FROM app_errors ORDER BY resolved, at DESC LIMIT 200') : [];
  const pilot = await q(`SELECT
      count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM order_items i JOIN products p ON p.id=i.product_id WHERE i.order_id=o.id AND p.is_simulated))::int AS that,
      count(*) FILTER (WHERE o.payment_status='DA_NHAN' AND NOT EXISTS (SELECT 1 FROM order_items i JOIN products p ON p.id=i.product_id WHERE i.order_id=o.id AND p.is_simulated))::int AS da_tra,
      count(*) FILTER (WHERE o.ship_country <> 'VN' AND NOT EXISTS (SELECT 1 FROM order_items i JOIN products p ON p.id=i.product_id WHERE i.order_id=o.id AND p.is_simulated))::int AS quoc_te
    FROM wholesale_orders o WHERE o.status NOT IN ('HUY','TU_CHOI')`);
  const p = pilot[0];
  return (
    <div className="stack">
      <h1>Lỗi & phản hồi</h1>
      <Flash sp={searchParams} />
      <div className="grid cols-4">
        <div className="card"><div className="muted small">Đơn thật (không có hàng giả lập)</div><div style={{ fontSize: '1.6rem' }}><b>{p.that}</b> / 100</div></div>
        <div className="card"><div className="muted small">Đơn thật đã thanh toán</div><div style={{ fontSize: '1.6rem' }}><b>{p.da_tra}</b></div></div>
        <div className="card"><div className="muted small">Đơn thật quốc tế</div><div style={{ fontSize: '1.6rem' }}><b>{p.quoc_te}</b></div></div>
        <div className="card"><div className="muted small">Báo lỗi chưa xử lý</div><div style={{ fontSize: '1.6rem' }}><b>{reports.filter((r) => !['DA_SUA', 'KHONG_PHAI_LOI'].includes(r.status)).length}</b></div></div>
      </div>
      <p className="muted small">Khách báo lỗi ở <Link href="/bao-loi">/bao-loi</Link> (có link ở chân trang). Lỗi máy chủ tự ghi vào đây. Mục tiêu chạy thật: 10–100 đơn có thanh toán, trong nước và quốc tế.</p>

      <div className="card">Báo lỗi và khiếu nại của khách được AI phân loại và xử lý trên bảng Kanban: <Link href="/quan-tri/khieu-nai">Khủng hoảng & khiếu nại</Link>.</div>

      {can(u, 'audit.view') && (<>
        <h2>Lỗi hệ thống ({errors.filter((e) => !e.resolved).length} chưa xử lý)</h2>
        <div className="table-wrap"><table className="small">
          <thead><tr><th>Lúc</th><th>Nơi</th><th>Lỗi</th><th></th></tr></thead>
          <tbody>{errors.map((e) => (
            <tr key={e.id} style={e.resolved ? { opacity: 0.5 } : undefined}>
              <td>{dt(e.at)}</td><td className="mono">{e.place}</td>
              <td><div>{e.message}</div><details><summary className="muted">chi tiết</summary><pre className="mono" style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(e.detail, null, 2).slice(0, 3000)}</pre></details></td>
              <td>{!e.resolved && <form action={resolveError}><input type="hidden" name="id" value={e.id} /><button className="btn sm secondary">Đã xử lý</button></form>}</td>
            </tr>
          ))}</tbody>
        </table></div>
      </>)}
    </div>
  );
}
