// Logo taomua.com dùng ở mọi trang. Ảnh lấy từ lib/brand.ts (public/brand/), thay file là đổi toàn trang.
//   variant="ngang": túi + chữ taomua.com trên nền trắng (đầu trang, thanh bên)
//   variant="mark":  chỉ túi mặt cười (chỗ hẹp)
//   variant="full":  logo đầy đủ (chân trang, đăng nhập, 404)
import { BRAND } from '@/lib/brand';

type Props = { size?: number; variant?: 'ngang' | 'mark' | 'full'; className?: string };

export default function Logo({ size = 48, variant = 'ngang', className = '' }: Props) {
  if (variant === 'mark') {
    return (
      <span className={`logo-tile ${className}`} style={{ width: size, height: size, padding: size * 0.06 }}>
        <img src={BRAND.logoMark} alt={BRAND.name} width={size} height={size} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
      </span>
    );
  }
  if (variant === 'full') {
    const w = Math.round(size * BRAND.logoFullRatio);
    return (
      <span className={`logo-tile ${className}`} style={{ width: w, height: size }}>
        <img src={BRAND.logoFull} alt={BRAND.name} width={w} height={size} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
      </span>
    );
  }
  const h = size;
  const wordH = Math.round(h * 0.62);
  return (
    <span className={`logo-tile logo-ngang ${className}`} style={{ height: h, padding: `0 ${Math.round(h * 0.18)}px 0 ${Math.round(h * 0.08)}px` }}>
      <img src={BRAND.logoMark} alt="" aria-hidden width={h} height={h} style={{ width: h * 0.86, height: h * 0.86, objectFit: 'contain' }} />
      <img src={BRAND.logoWordmark} alt={BRAND.name} height={wordH} width={Math.round(wordH * BRAND.wordmarkRatio)}
        style={{ height: wordH, width: Math.round(wordH * BRAND.wordmarkRatio) }} />
    </span>
  );
}
