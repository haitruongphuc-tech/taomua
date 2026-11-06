import { requireUser } from '@/lib/auth';
import { q } from '@/lib/db';
import { dt } from '@/lib/format';
import { channels } from '@/lib/notify';
import { CONNECTORS, connectorEnabled } from '@/lib/connectors';

// Hộp thư thông báo + nhật ký kết nối ngoài: xem hệ thống đã gửi / sẽ gửi gì, chạy thật hay giả lập.
export default async function Outbox() {
  await requireUser('audit.view');
  const [msgs, runs] = await Promise.all([
    q('SELECT * FROM notification_log ORDER BY created_at DESC LIMIT 100'),
    q('SELECT * FROM connector_runs ORDER BY created_at DESC LIMIT 60'),
  ]);
  const ch = channels();
  return (
    <div className="stack">
      <h1>Thông báo & kết nối ngoài</h1>
      <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
        <span className={`badge ${ch.zalo ? 'ok' : 'warn'}`}>Zalo OA: {ch.zalo ? 'THẬT' : 'GIẢ LẬP'}</span>
        <span className={`badge ${ch.email ? 'ok' : 'warn'}`}>Email: {ch.email ? 'THẬT' : 'GIẢ LẬP'}</span>
        <span className={`badge ${ch.telegram ? 'ok' : ''}`}>Telegram: {ch.telegram ? 'THẬT' : 'không dùng'}</span>
        {CONNECTORS.map((c) => <span key={c.key} className={`badge ${connectorEnabled(c.key) ? 'ok' : 'warn'}`}>{c.key}: {connectorEnabled(c.key) ? 'THẬT' : 'GIẢ LẬP'}</span>)}
      </div>
      <p className="muted small">GIẢ LẬP = chưa có khóa trong .env: tin không gửi ra ngoài, dữ liệu dịch vụ ngoài là số mẫu cố định để dễ hiểu luồng. Nhập khóa ở .env là tự chuyển sang THẬT.</p>

      <h2>Hộp thư ({msgs.length})</h2>
      <div className="table-wrap"><table className="small">
        <thead><tr><th>Lúc</th><th>Kênh</th><th>Gửi tới</th><th>Nội dung</th><th>Chế độ</th></tr></thead>
        <tbody>{msgs.map((m) => (
          <tr key={m.id}><td>{dt(m.created_at)}</td><td>{m.channel}</td><td>{m.recipient}</td>
            <td style={{ whiteSpace: 'pre-wrap', maxWidth: 480 }}>{m.subject ? <b>{m.subject}<br /></b> : null}{m.body}</td>
            <td><span className={`badge ${m.mode === 'THAT' ? (m.ok ? 'ok' : 'bad') : 'warn'}`}>{m.mode === 'THAT' ? (m.ok ? 'Đã gửi' : 'Lỗi') : 'GIẢ LẬP'}</span>{m.error && <div className="muted">{m.error}</div>}</td></tr>
        ))}</tbody>
      </table></div>

      <h2>Lần gọi dịch vụ ngoài ({runs.length})</h2>
      <div className="table-wrap"><table className="small">
        <thead><tr><th>Lúc</th><th>Dịch vụ</th><th>Chế độ</th><th>Đầu vào</th><th>Kết quả</th></tr></thead>
        <tbody>{runs.map((r) => (
          <tr key={r.id}><td>{dt(r.created_at)}</td><td>{r.connector}</td>
            <td><span className={`badge ${r.mode === 'THAT' ? 'ok' : 'warn'}`}>{r.mode === 'THAT' ? 'THẬT' : 'GIẢ LẬP'}</span></td>
            <td className="mono">{JSON.stringify(r.input).slice(0, 160)}</td><td className="mono">{JSON.stringify(r.output).slice(0, 220)}</td></tr>
        ))}</tbody>
      </table></div>
    </div>
  );
}
