// THƯƠNG HIỆU taomua.com — một chỗ duy nhất để đổi logo / slogan.
// Muốn sửa logo: thay file ảnh trong public/brand/ (giữ nguyên tên file), hoặc đổi đường dẫn bên dưới. Không cần sửa trang nào khác.
//   logo-goc.jpg   ảnh gốc 1024×1024 (lưu lại để cắt lần sau)
//   logo-full.png  logo đầy đủ: túi mặt cười + chữ taomua.com  → chân trang, trang đăng nhập, trang 404, ảnh chia sẻ link
//   logo-mark.png  chỉ túi mặt cười (vuông)                      → đầu trang, thanh bên quản trị, chỗ hẹp
//   logo-chu.png   chỉ chữ taomua.com nằm ngang                  → đầu trang, cạnh biểu tượng
//   icon-180.png   biểu tượng tab trình duyệt / màn hình điện thoại (bản sao ở app/icon.png, app/apple-icon.png)
export const BRAND = {
  name: 'taomua.com',
  logoFull: '/brand/logo-full.png',
  logoMark: '/brand/logo-mark.png',
  logoWordmark: '/brand/logo-chu.png',
  logoFullRatio: 600 / 528,   // rộng / cao của logo-full.png
  wordmarkRatio: 800 / 205,   // rộng / cao của logo-chu.png
  colors: { orange: '#FF6F00', purple: '#3B1E9A', blue: '#0D47A1' },
} as const;
