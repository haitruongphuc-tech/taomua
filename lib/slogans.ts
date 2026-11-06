// Slogan taomua.com (chủ dự án chọn). Mỗi trang dùng một câu hợp với việc khách đang làm.
export const SLOGANS = {
  gia: 'Mua càng nhiều giá càng thấp',
  chietkhau: 'Mua càng nhiều chiết khấu càng cao',
  thuong: 'Mua càng nhiều thưởng càng lớn',
  vui: 'taomua cùng vui với bạn',
} as const;

/** Trang chủ / tìm hàng → giá càng thấp (bảng giá 4 bậc); sản phẩm, yêu cầu báo giá → chiết khấu càng cao;
 *  giỏ hàng → thưởng càng lớn; tra cứu đơn, báo lỗi, truy xuất, trang khác → taomua cùng vui với bạn. */
export function sloganFor(path: string): string {
  if (path === '/' || path.startsWith('/?')) return SLOGANS.gia;
  if (path.startsWith('/san-pham') || path.startsWith('/bao-gia')) return SLOGANS.chietkhau;
  if (path.startsWith('/gio-hang') || path.startsWith('/shop')) return SLOGANS.thuong;
  return SLOGANS.vui;
}
