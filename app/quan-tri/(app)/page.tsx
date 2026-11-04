import Link from 'next/link';
import { requireUser, can } from '@/lib/auth';
import { one, q } from '@/lib/db';
import { short, pct, vnd } from '@/lib/format';
import { workingCapital } from '@/lib/capital';
import Flash from '@/components/Flash';

export default async function Overview({ searchParams }: { searchParams: { ok?: string; loi?: string } }) {
  const u = await requireUser();
  const fin = can(u, 'finance.view');
  const m = await one(`SELECT
      COALESCE(sum(tong_dt) FILTER (WHERE payment_status='DA_NHAN'),0) AS dt_da_thu,
      COALESCE(sum(ln_rong_sau_thue) FILTER (WHERE payment_status='DA_NHAN'),0) AS ln,
      COALESCE(sum(tong_chi_phi_truoc_thue + phi_kenh - vat_dau_vao) FILTER (WHERE payment_status='DA_NHAN'),0) AS cp,
      COALESCE(sum(tong_dt) FILTER (WHERE trade_assurance_status='HOLD'),0) AS dang_giu,
      count(*) FILTER (WHERE approval_status='PENDING') AS cho_duyet,
      count(*) FILTER (WHERE approval_status='PENDING' AND approval_deadline < now()) AS qua_han,
      count(*) FILTER (WHERE status='CHO_THANH_TOAN') AS cho_tt,
      count(*) FILTER (WHERE status='DANG_CHUAN_BI') AS chuan_bi,
      count(*) AS tong
    FROM wholesale_orders WHERE created_at >= date_trunc('month', now()) AND status NOT IN ('HUY','TU_CHOI')`);
  const byChannel = await q(`SELECT ch.name, count(o.id)::int AS n, COALESCE(sum(o.tong_dt),0) AS dt FROM sales_channels ch
    LEFT JOIN wholesale_orders o ON o.channel_id=ch.id AND o.created_at >= date_trunc('month', now()) AND o.status NOT IN ('HUY','TU_CHOI')
    GROUP BY ch.name ORDER BY dt DESC`);
  const lastRecon = fin ? await one('SELECT * FROM reconciliation_runs ORDER BY created_at DESC LIMIT 1') : null;
  const margin = m.cp > 0 ? (m.ln / m.cp) * 100 : 0;
  const wc = workingCapital(Number(m.dt_da_thu), null, margin);

  const alerts: { tone: string; text: React.ReactNode }[] = [];
  if (m.qua_han > 0) alerts.push({ tone: 'bad', text: <><b>{m.qua_han}</b> đơn quá hạn duyệt. <Link href="/quan-tri/duyet">Xem</Link></> });
  if (lastRecon?.status === 'LECH') alerts.push({ tone: 'bad', text: <>Đối soát gần nhất lệch {pct(lastRecon.diff_pct)}. <Link href="/quan-tri/doi-soat">Xem</Link></> });
  if (fin && m.cp > 0 && margin < 20) alerts.push({ tone: 'warn', text: <>Biên ròng tháng {pct(margin)} dưới mức an toàn 20%.</> });
  if (!process.env.TELEGRAM_BOT_TOKEN) alerts.push({ tone: 'warn', text: 'Chưa cấu hình bot Telegram: yêu cầu duyệt chỉ hiện trên web.' });

  return (
    <div className="stack">
      <h1>Tổng quan tháng này</h1>
      <Flash sp={searchParams} />
      {alerts.map((a, i) => <div key={i} className={`alert ${a.tone}`}>{a.text}</div>)}
      <div className="grid cols-4">
        <div className="card kpi"><span className="l">Chờ duyệt</span><span className="v">{m.cho_duyet}</span><Link className="small" href="/quan-tri/duyet">Mở hàng chờ →</Link></div>
        <div className="card kpi"><span className="l">Chờ thanh toán</span><span className="v">{m.cho_tt}</span></div>
        <div className="card kpi"><span className="l">Cần chuẩn bị giao</span><span className="v">{m.chuan_bi}</span></div>
        <div className="card kpi"><span className="l">Tổng đơn</span><span className="v">{m.tong}</span></div>
      </div>
      {fin && (
        <div className="grid cols-4">
          <div className="card kpi"><span className="l">Doanh thu đã thu</span><span className="v">{short(m.dt_da_thu)}</span></div>
          <div className="card kpi"><span className="l">LN ròng sau thuế</span><span className="v">{short(m.ln)}</span><span className="small muted">Biên {pct(margin)} trên chi phí</span></div>
          <div className="card kpi"><span className="l">Tiền đang giữ cho khách</span><span className="v">{short(m.dang_giu)}</span><span className="small muted">Chưa phải tiền của công ty</span></div>
          <div className="card kpi"><span className="l">Vốn cần (45% DT)</span><span className="v">{short(wc.total)}</span><span className="small muted">30% lưu động {short(wc.vld)} + 15% dự phòng {short(wc.reserve)}</span></div>
        </div>
      )}
      <section className="stack">
        <h2>Theo kênh bán</h2>
        <div className="table-wrap"><table>
          <thead><tr><th>Kênh</th><th className="num">Số đơn</th><th className="num">Doanh thu</th></tr></thead>
          <tbody>{byChannel.map((c) => <tr key={c.name}><td>{c.name}</td><td className="num">{c.n}</td><td className="num">{vnd(c.dt)}</td></tr>)}</tbody>
        </table></div>
      </section>
      <p className="muted small">Số liệu tính từ đơn thật trong hệ thống. Dự toán 12 tháng (số giả lập) ở mục Vốn &amp; dự toán.</p>
    </div>
  );
}
