import { requireUser } from '@/lib/auth';
import { channels } from '@/lib/notify';
import QacClient from './QacClient';

export const metadata = { title: 'Duyệt nhanh · taomua' };

export default async function QuickApprove() {
  await requireUser();
  const ch = channels();
  return (
    <div className="stack" style={{ maxWidth: 720 }}>
      <h1>Duyệt nhanh <span className="muted small">TAOMUA One-Tap Approve · Quick Approve Center</span></h1>
      <p className="muted small">
        Mọi việc cần người duyệt ở một chỗ: đơn hàng Cấp 2–5, khoản chi, đề xuất của 7 AI agent và việc n8n gửi vào. Cấp 1 AI tự duyệt.
        Mở trang này trên điện thoại, bấm DUYỆT là xong. Kênh báo phụ: Zalo OA {ch.zalo ? 'đã bật' : 'chưa cấu hình'},
        email {ch.email ? 'đã bật' : 'chưa cấu hình'}, Telegram {ch.telegram ? 'đã bật' : 'không dùng'}.
      </p>
      <QacClient />
    </div>
  );
}
