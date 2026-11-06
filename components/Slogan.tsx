'use client';
// Thanh slogan dưới đầu trang cửa hàng, đổi câu theo trang đang xem (lib/slogans.ts).
import { usePathname } from 'next/navigation';
import { sloganFor } from '@/lib/slogans';

export default function SloganBar() {
  const path = usePathname() ?? '/';
  return (
    <div className="slogan-bar" role="note">
      <div className="wrap"><span aria-hidden>🛍️</span> {sloganFor(path)}</div>
    </div>
  );
}
