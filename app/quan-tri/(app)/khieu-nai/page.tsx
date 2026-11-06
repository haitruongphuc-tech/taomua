import Link from 'next/link';
import { requireUser, actorOf, can } from '@/lib/auth';
import { q } from '@/lib/db';
import { audit } from '@/lib/audit';
import { runAction, UserError } from '@/lib/action';
import { isUuid } from '@/lib/catalog';
import { dt, vnd } from '@/lib/format';
import { COLUMNS, SEVERITY_TEXT, RESOLUTION_TEXT, type Severity, type Resolution } from '@/lib/complaints';
import Flash from '@/components/Flash';

// Module "Khủng hoảng & Khiếu nại Kanban": Mới → Đang xử lý → Chờ CEO → Hoàn thành. AI phân loại mức độ và gợi ý cách xử lý;
// mức Cao (hoàn tiền / bồi thường > 10 triệu, nguy cơ khủng hoảng) vào thẳng cột Chờ CEO.
const NEXT: Record<string, string[]> = { MOI: ['DANG_XU_LY', 'CHO_CEO'], DANG_XU_LY: ['CHO_CEO', 'DA_SUA', 'KHONG_PHAI_LOI'], CHO_CEO: ['DANG_XU_LY', 'DA_SUA'], DA_SUA: ['DANG_XU_LY'], KHONG_PHAI_LOI: ['MOI'] };
const LABEL: Record<string, string> = { MOI: 'Mới', DANG_XU_LY: 'Đang xử lý', CHO_CEO: 'Chờ CEO', DA_SUA: 'Hoàn thành', KHONG_PHAI_LOI: 'Không phải lỗi' };

async function move(fd: FormData) {
  'use server';
  const u = await requireUser('orders.view');
  await runAction('/quan-tri/khieu-nai', async () => {
    const id = String(fd.get('id'));
    const to = String(fd.get('to'));
    const resolution = String(fd.get('resolution') ?? '') || null;
    if (!isUuid(id) || !LABEL[to]) throw new UserError('Dữ liệu không hợp lệ.');
    if (resolution && !(resolution in RESOLUTION_TEXT)) throw new UserError('Cách xử lý không hợp lệ.');
    const cur = (await q('SELECT status, severity FROM issue_reports WHERE id=$1', [id]))[0];
    if (!cur) throw new UserError('Không tìm thấy.');
    if (!NEXT[cur.status]?.includes(to)) throw new UserError(`Không chuyển được từ ${LABEL[cur.status]} sang ${LABEL[to]}.`);
    if (cur.status === 'CHO_CEO' && u.role !== 'CEO') throw new UserError('Việc ở cột Chờ CEO chỉ CEO chuyển tiếp.');
    if (to === 'DA_SUA' && cur.severity === 'CAO' && u.role !== 'CEO') throw new UserError('Mức Cao chỉ CEO đóng.');
    await q('UPDATE issue_reports SET status=$2, resolution=COALESCE($3, resolution), note=CASE WHEN $4 <> \'\' THEN $4 ELSE note END, updated_at=now() WHERE id=$1',
      [id, to, resolution, String(fd.get('note') ?? '').slice(0, 1000)]);
    await audit(actorOf(u), 'issue.move', 'issue_report', id, { from: cur.status, to, resolution });
    return `Đã chuyển sang ${LABEL[to]}.`;
  });
}

export default async function Complaints({ searchParams }: { searchParams: { ok?: string; loi?: string } }) {
  const u = await requireUser('orders.view');
  const rows = await q(`SELECT r.*, o.id AS order_id, o.tong_dt, o.trade_assurance_status FROM issue_reports r
    LEFT JOIN wholesale_orders o ON upper(o.code)=upper(r.order_code)
    WHERE r.status <> 'KHONG_PHAI_LOI' OR r.updated_at > now() - interval '7 days'
    ORDER BY CASE r.severity WHEN 'CAO' THEN 0 WHEN 'VUA' THEN 1 ELSE 2 END, r.created_at DESC LIMIT 300`);
  const stat = await q(`SELECT count(*) FILTER (WHERE status NOT IN ('DA_SUA','KHONG_PHAI_LOI'))::int AS mo,
      count(*) FILTER (WHERE severity='CAO' AND status NOT IN ('DA_SUA','KHONG_PHAI_LOI'))::int AS cao,
      round(avg(extract(epoch FROM updated_at - created_at)/3600) FILTER (WHERE status='DA_SUA')::numeric, 1) AS gio_xu_ly FROM issue_reports`);
  const s = stat[0];
  const chat = (await q(`SELECT count(*)::int AS n, count(*) FILTER (WHERE answered_by <> 'CHUYEN_NGUOI')::int AS ai, round(avg(ms))::int AS ms,
      (SELECT string_agg(intent || ' ' || n, ', ') FROM (SELECT intent, count(*) AS n FROM chat_logs WHERE created_at > now() - interval '7 days' GROUP BY intent ORDER BY n DESC LIMIT 5) x) AS top
    FROM chat_logs WHERE created_at > now() - interval '7 days'`))[0];
  return (
    <div className="stack">
      <h1>Khủng hoảng & khiếu nại</h1>
      <Flash sp={searchParams} />
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <span className="badge warn">Đang mở: {s.mo}</span><span className="badge bad">Mức cao: {s.cao}</span>
        <span className="badge">Thời gian xử lý TB: {s.gio_xu_ly ?? '—'} giờ (mục tiêu &lt; 2 giờ)</span>
        <Link className="small" href="/quan-tri/loi">Lỗi hệ thống & số đơn thật</Link>
      </div>
      <div className="card small">CSKH AI 7 ngày: <b>{chat.n}</b> câu hỏi, AI tự trả lời <b>{chat.n ? Math.round((chat.ai / chat.n) * 100) : 0}%</b> (mục tiêu 95%),
        phản hồi trung bình <b>{chat.ms ?? 0} ms</b> (mục tiêu &lt; 90 giây). Hỏi nhiều nhất: {chat.top ?? '—'}.</div>
      <p className="muted small">AI phân loại khi khách gửi ở /bao-loi. Hoàn tiền dùng nút Hoàn tiền trên trang đơn (tiền đang giữ, Trade Assurance).</p>
      <div className="grid cols-4" style={{ alignItems: 'start' }}>
        {COLUMNS.map(([col, title]) => {
          const list = rows.filter((r) => r.status === col);
          return (
            <div key={col} className="stack">
              <h2 style={{ margin: 0 }}>{title} <span className="muted small">({list.length})</span></h2>
              {list.map((r) => (
                <div key={r.id} className="card small stack" style={{ borderLeft: `5px solid var(--${r.severity === 'CAO' ? 'bad' : r.severity === 'VUA' ? 'warn' : 'line'})` }}>
                  <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                    <span className={`badge ${SEVERITY_TEXT[r.severity as Severity][1]}`}>{SEVERITY_TEXT[r.severity as Severity][0]}</span>
                    <span className="badge">{r.kind === 'KHIEU_NAI' ? 'Khiếu nại' : 'Lỗi web'}</span>
                    {r.order_code && (r.order_id ? <Link href={`/quan-tri/don-hang/${r.order_id}`}>{r.order_code}</Link> : <span className="mono">{r.order_code}</span>)}
                    {r.tong_dt && <span className="muted">{vnd(r.tong_dt)}</span>}
                  </div>
                  <div style={{ whiteSpace: 'pre-wrap' }}>{r.message}</div>
                  <div className="muted">{r.contact} · {dt(r.created_at)}</div>
                  <div className="muted">AI: {r.ai_reason}{r.resolution ? ` → ${RESOLUTION_TEXT[r.resolution as Resolution]}` : ''}</div>
                  {r.note && <div>Ghi chú: {r.note}</div>}
                  {can(u, 'orders.view') && (
                    <form action={move} className="stack" style={{ gap: 4 }}>
                      <input type="hidden" name="id" value={r.id} />
                      <select name="resolution" defaultValue={r.resolution ?? ''}><option value="">Cách xử lý…</option>
                        {Object.entries(RESOLUTION_TEXT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                      <input name="note" placeholder="Ghi chú" />
                      <div className="row" style={{ gap: 4, flexWrap: 'wrap' }}>
                        {NEXT[r.status].map((to) => <button key={to} className="btn secondary sm" name="to" value={to}>{LABEL[to]}</button>)}
                      </div>
                    </form>
                  )}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
