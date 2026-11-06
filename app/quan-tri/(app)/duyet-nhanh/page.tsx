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
      <details className="card small">
        <summary><b>Phân quyền 95% AI tự duyệt</b> (docs/ALGORITHM_COMPARISON_OPTIMIZATION.md mục 4)</summary>
        <div className="table-wrap"><table>
          <thead><tr><th>Cấp</th><th>Giá trị</th><th>AI / người</th><th>Người duyệt</th><th>Thời hạn</th></tr></thead>
          <tbody>
            <tr><td>Cấp 1</td><td>&lt; 5 triệu</td><td>AI 95% tự duyệt (khi nút tổng bật)</td><td>AI</td><td>&lt; 2 phút</td></tr>
            <tr><td>Cấp 2</td><td>5 – 20 triệu, hoặc biên &lt; 15%</td><td>AI 90% đề xuất + người 10%</td><td>Trưởng nhóm (Ms Nhu) hoặc CEO</td><td>&lt; 30 phút</td></tr>
            <tr><td>Cấp 3</td><td>20 – 50 triệu</td><td>AI 80% + CEO 20%</td><td>CEO</td><td>&lt; 5 phút</td></tr>
            <tr><td>Cấp 4</td><td>50 – 200 triệu, hoặc đơn lỗ</td><td>AI 60% + CEO 40% (nhập lại mật khẩu)</td><td>CEO</td><td>&lt; 2 giờ</td></tr>
            <tr><td>Cấp 5</td><td>&gt; 200 triệu</td><td>AI 40% + CEO + nhà đầu tư 60%</td><td>CEO (nhà đầu tư duyệt ngoài hệ thống)</td><td>&lt; 24 giờ</td></tr>
            <tr><td>LATR</td><td>Bán thử 50–100 cái</td><td>AI 85% + CEO 15%: CTR &gt; 3% đề xuất nhập lớn, &lt; 2% tự dừng</td><td>CEO</td><td>&lt; 10 phút</td></tr>
          </tbody>
        </table></div>
        <div className="muted">Nút Tắt/Mở (nút tổng AI, khóa từng loại chi, khóa nhập mới, canh mua giảm giá) ở <a href="/quan-tri/kiem-soat-chi">Kiểm soát chi</a>.</div>
      </details>
    </div>
  );
}
