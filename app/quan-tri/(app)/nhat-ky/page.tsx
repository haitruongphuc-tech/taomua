import { requireUser } from '@/lib/auth';
import { q } from '@/lib/db';
import { dt } from '@/lib/format';

export default async function AuditLog({ searchParams }: { searchParams: { hd?: string } }) {
  await requireUser('audit.view');
  const params: unknown[] = [];
  let where = '';
  if (searchParams.hd) { params.push(`${searchParams.hd.slice(0, 40)}%`); where = 'WHERE action LIKE $1'; }
  const rows = await q(`SELECT * FROM audit_log ${where} ORDER BY at DESC LIMIT 300`, params);
  return (
    <div className="stack">
      <h1>Nhật ký thao tác</h1>
      <form className="row"><input name="hd" placeholder="Lọc theo hành động, vd: order., payout., escrow." defaultValue={searchParams.hd} style={{ maxWidth: 360 }} /><button className="btn sm blue">Lọc</button></form>
      <div className="table-wrap"><table>
        <thead><tr><th>Lúc</th><th>Người</th><th>Hành động</th><th>Đối tượng</th><th>Chi tiết</th></tr></thead>
        <tbody>{rows.map((r) => (
          <tr key={r.id}><td className="small">{dt(r.at)}</td><td className="small">{r.actor}</td><td className="mono small">{r.action}</td><td className="small">{r.entity}</td>
            <td className="small mono" style={{ maxWidth: 420, overflowWrap: 'anywhere' }}>{JSON.stringify(r.detail)}</td></tr>
        ))}</tbody>
      </table></div>
    </div>
  );
}
