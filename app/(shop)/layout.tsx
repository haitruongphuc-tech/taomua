import Link from 'next/link';
import CartBadge from '@/components/CartBadge';
import { LEGAL } from '@/lib/legal';

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="topbar">
        <div className="wrap">
          <Link href="/" className="brand">
            <span className="logo">tm</span>
            <span>taomua.com<small>NGUỒN HÀNG SỈ TỰ ĐỘNG</small></span>
          </Link>
          <form className="search" action="/" role="search">
            <input name="q" placeholder="Tìm sản phẩm, ví dụ: áo thun, tai nghe…" aria-label="Tìm sản phẩm" />
            <button className="btn" type="submit">Tìm</button>
          </form>
          <nav className="nav">
            <Link href="/bao-gia">Yêu cầu báo giá</Link>
            <Link href="/don-hang">Tra cứu đơn</Link>
            <CartBadge />
          </nav>
        </div>
      </header>
      <main className="wrap page">{children}</main>
      <footer className="site">
        <div className="wrap stack">
          <div><strong>{LEGAL.name}</strong> · MST {LEGAL.taxCode}</div>
          <div>Giá đã gồm VAT. Tiền của bạn được giữ đến khi bạn xác nhận đã nhận hàng.</div>
          <div>Bản thử nghiệm: sản phẩm và xưởng đang là dữ liệu giả lập.</div>
        </div>
      </footer>
    </>
  );
}
