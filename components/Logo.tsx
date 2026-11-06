// Logo taomua.com (assets/logo_taomua_original.jpg → public/logo-taomua.jpg), dùng ở mọi trang.
// full: cả túi mặt cười + chữ taomua.com. mark: chỉ túi mặt cười (cắt bằng CSS), cho chỗ hẹp.
export default function Logo({ size = 48, variant = 'full', className = '' }: { size?: number; variant?: 'full' | 'mark'; className?: string }) {
  if (variant === 'mark') {
    // Túi nằm khoảng x 32–69%, y 22–60% của ảnh vuông.
    const w = size / 0.4;
    return (
      <span className={`logo-tile ${className}`} style={{ width: size, height: size }}>
        <img src="/logo-taomua.jpg" alt="taomua.com" width={w} height={w}
          style={{ position: 'absolute', width: w, height: w, left: -0.3 * w, top: -0.2 * w, maxWidth: 'none' }} />
      </span>
    );
  }
  return (
    <span className={`logo-tile ${className}`} style={{ width: size, height: size }}>
      <img src="/logo-taomua.jpg" alt="taomua.com" width={size} height={size} style={{ width: size, height: size, transform: 'scale(1.18)' }} />
    </span>
  );
}
