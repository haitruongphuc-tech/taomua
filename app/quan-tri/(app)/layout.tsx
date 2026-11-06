import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser, logout, can, ROLE_LABEL, type Perm } from '@/lib/auth';
import { one } from '@/lib/db';
import Logo from '@/components/Logo';
import { SLOGANS } from '@/lib/slogans';

export const dynamic = 'force-dynamic';

async function doLogout() {
  'use server';
  await logout();
  redirect('/quan-tri/dang-nhap');
}

const MENU: { grp: string; items: [string, string, Perm?][] }[] = [
  { grp: 'Điều hành', items: [['/quan-tri/duyet-nhanh', '⚡ Duyệt nhanh'], ['/quan-tri', 'Tổng quan'], ['/quan-tri/don-hang', 'Đơn hàng']] },
  { grp: 'Hàng hóa', items: [['/quan-tri/san-pham', 'Sản phẩm'], ['/quan-tri/xuong', 'Xưởng'], ['/quan-tri/tim-xuong', 'Tìm xưởng (AI)'], ['/quan-tri/kenh-ban', 'Kênh bán'], ['/quan-tri/giao-dien', 'Giao diện (Canvas)', 'channels.edit'], ['/quan-tri/bao-gia', 'Yêu cầu báo giá']] },
  { grp: 'Kinh doanh', items: [['/quan-tri/marketing', 'Marketing & quảng cáo'], ['/quan-tri/logistics', 'Logistics & vận chuyển']] },
  { grp: 'Tài chính', items: [['/quan-tri/von', 'Vốn & dự toán', 'finance.view'], ['/quan-tri/doi-soat', 'Đối soát sao kê', 'reconcile.run'], ['/quan-tri/chi-tien', 'Chi tiền'], ['/quan-tri/kiem-soat-chi', 'Kiểm soát chi'], ['/quan-tri/ke-toan', 'Kế toán & thuế', 'finance.view']] },
  { grp: 'Hệ thống', items: [['/quan-tri/ai', 'AI tự động'], ['/quan-tri/can-nhap', 'Thông tin cần nhập'], ['/quan-tri/khieu-nai', 'Khiếu nại (Kanban)'], ['/quan-tri/loi', 'Lỗi & đơn thật'], ['/quan-tri/thong-bao', 'Thông báo & kết nối', 'audit.view'], ['/quan-tri/nhat-ky', 'Nhật ký', 'audit.view'], ['/quan-tri/nguoi-dung', 'Người dùng', 'users.manage'], ['/quan-tri/tai-khoan', 'Đổi mật khẩu']] },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const u = await requireUser();
  const pending = await one<{ n: number }>("SELECT count(*)::int AS n FROM wholesale_orders WHERE approval_status='PENDING'");
  const aiPending = await one<{ n: number }>("SELECT count(*)::int AS n FROM agent_actions WHERE status='DE_XUAT'");
  const payPending = await one<{ n: number }>("SELECT count(*)::int AS n FROM payouts WHERE status='DE_XUAT'");
  const qac = (pending?.n ?? 0) + (aiPending?.n ?? 0) + (payPending?.n ?? 0);
  const badge = (href: string) =>
    href === '/quan-tri/duyet-nhanh' && qac ? ` (${qac})` : href === '/quan-tri/ai' && aiPending?.n ? ` (${aiPending.n})` : '';
  return (
    <div className="admin">
      <aside className="side">
        <Link href="/quan-tri" className="side-logo"><Logo size={40} /><span><div className="small" style={{ fontWeight: 500, color: '#c9d4ea' }}>Quản trị CEO</div></span></Link>
        <div className="side-slogan">{SLOGANS.vui}</div>
        {MENU.map((g) => (
          <div key={g.grp}>
            <div className="grp">{g.grp}</div>
            {g.items.filter(([, , p]) => !p || can(u, p)).map(([href, label]) => (
              <Link key={href} href={href}>{label}{badge(href)}</Link>
            ))}
          </div>
        ))}
        <div className="grp">Đang đăng nhập</div>
        <div style={{ padding: '0 10px', fontSize: '.85rem' }}>{u.name} · {ROLE_LABEL[u.role]}</div>
        <form action={doLogout} style={{ padding: '6px 10px' }}><button className="btn secondary sm">Đăng xuất</button></form>
      </aside>
      <div className="main">{children}</div>
    </div>
  );
}
