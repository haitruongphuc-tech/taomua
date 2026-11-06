import Link from 'next/link';
import Logo from '@/components/Logo';

export default function NotFound() {
  return (
    <main className="wrap page" style={{ maxWidth: 480, textAlign: 'center' }}>
      <div className="card stack" style={{ alignItems: 'center' }}>
        <Logo size={140} />
        <h1>Không tìm thấy trang</h1>
        <p className="muted">Trang bạn tìm không có hoặc đã đổi địa chỉ. / Page not found.</p>
        <Link className="btn" href="/">Về trang chủ taomua.com</Link>
      </div>
    </main>
  );
}
