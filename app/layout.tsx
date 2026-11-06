import './globals.css';
import type { Metadata, Viewport } from 'next';
import { BRAND } from '@/lib/brand';

export const metadata: Metadata = {
  title: { default: 'taomua.com — Nguồn hàng sỉ tự động', template: '%s · taomua.com' },
  description: 'Nền tảng mua bán hàng tự động: tìm xưởng, báo giá sỉ 4 bậc, giữ tiền đến khi nhận hàng.',
  // Logo hiện khi chia sẻ link (Zalo, Facebook, email...). Favicon lấy từ app/icon.png.
  openGraph: { siteName: 'taomua.com', images: [{ url: BRAND.logoFull, width: 600, height: 528, alt: BRAND.name }] },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#0d47a1' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
