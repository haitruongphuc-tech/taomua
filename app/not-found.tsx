import Link from 'next/link';
import Logo from '@/components/Logo';
import { SLOGANS } from '@/lib/slogans';

export default function NotFound() {
  return (
    <main className="wrap page" style={{ maxWidth: 480, textAlign: 'center' }}>
      <div className="card stack" style={{ alignItems: 'center' }}>
        <Logo variant="full" size={150} />
        <div className="slogan-inline">{SLOGANS.vui}</div>
        <h1>Không tìm thấy trang</h1>
        <p className="muted">Trang bạn tìm không có hoặc đã đổi địa chỉ. / Page not found.</p>
        <Link className="btn" href="/">Về trang chủ taomua.com</Link>
      </div>
    </main>
  );
}
