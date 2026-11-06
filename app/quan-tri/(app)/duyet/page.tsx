import { redirect } from 'next/navigation';

// Trang "Chờ duyệt" cũ (chỉ đơn hàng) đã gộp vào Quick Approve Center (spec 06: một chỗ duyệt duy nhất).
export default function OldApprovalPage() {
  redirect('/quan-tri/duyet-nhanh');
}
