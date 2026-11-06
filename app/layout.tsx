import './globals.css';
import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: { default: 'taomua.com — Nguồn hàng sỉ tự động', template: '%s · taomua.com' },
  description: 'Nền tảng mua bán hàng tự động: tìm xưởng, báo giá sỉ 4 bậc, giữ tiền đến khi nhận hàng.',
  // Logo hiện khi chia sẻ link (Zalo, Facebook, email...). Favicon lấy từ app/icon.jpg.
  openGraph: { siteName: 'taomua.com', images: [{ url: '/logo-taomua.jpg', width: 1024, height: 1024, alt: 'taomua.com' }] },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#0d47a1' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
