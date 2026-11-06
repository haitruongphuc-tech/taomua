import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser, logout, can, ROLE_LABEL, type Perm } from '@/lib/auth';
import { one } from '@/lib/db';

export const dynamic = 'force-dynamic';

async function doLogout() {
  'use server';
  await logout();
  redirect('/quan-tri/dang-nhap');
}

const MENU: { grp: string; items: [string, string, Perm?][] }[] = [
  { grp: 'Điều hành', items: [['/quan-tri', 'Tổng quan'], ['/quan-tri/duyet', 'Chờ duyệt'], ['/quan-tri/don-hang', 'Đơn hàng']] },
  { grp: 'Hàng hóa', items: [['/quan-tri/san-pham', 'Sản phẩm'], ['/quan-tri/xuong', 'Xưởng'], ['/quan-tri/kenh-ban', 'Kênh bán'], ['/quan-tri/bao-gia', 'Yêu cầu báo giá']] },
  { grp: 'Tài chính', items: [['/quan-tri/von', 'Vốn & dự toán', 'finance.view'], ['/quan-tri/doi-soat', 'Đối soát sao kê', 'reconcile.run'], ['/quan-tri/chi-tien', 'Chi tiền'], ['/quan-tri/kiem-soat-chi', 'Kiểm soát chi']] },
  { grp: 'Hệ thống', items: [['/quan-tri/ai', 'AI tự động'], ['/quan-tri/can-nhap', 'Thông tin cần nhập'], ['/quan-tri/nhat-ky', 'Nhật ký', 'audit.view'], ['/quan-tri/nguoi-dung', 'Người dùng', 'users.manage'], ['/quan-tri/tai-khoan', 'Đổi mật khẩu']] },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const u = await requireUser();
  const pending = await one<{ n: number }>("SELECT count(*)::int AS n FROM wholesale_orders WHERE approval_status='PENDING'");
  const aiPending = await one<{ n: number }>("SELECT count(*)::int AS n FROM agent_actions WHERE status='DE_XUAT'");
  const badge = (href: string) =>
    href === '/quan-tri/duyet' && pending?.n ? ` (${pending.n})` : href === '/quan-tri/ai' && aiPending?.n ? ` (${aiPending.n})` : '';
  return (
    <div className="admin">
      <aside className="side">
        <Link href="/" style={{ fontWeight: 800, color: '#fff' }}>taomua · Quản trị</Link>
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
