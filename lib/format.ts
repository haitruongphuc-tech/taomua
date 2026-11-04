export const vnd = (x: number | string | null | undefined) =>
  x === null || x === undefined ? '—' : Math.round(Number(x)).toLocaleString('vi-VN') + ' đ';
export const short = (x: number | string) => {
  const n = Number(x);
  if (Math.abs(n) >= 1e9) return (n / 1e9).toLocaleString('vi-VN', { maximumFractionDigits: 2 }) + ' tỷ';
  if (Math.abs(n) >= 1e6) return (n / 1e6).toLocaleString('vi-VN', { maximumFractionDigits: 1 }) + ' tr';
  if (Math.abs(n) >= 1e3) return Math.round(n / 1e3).toLocaleString('vi-VN') + 'k';
  return n.toLocaleString('vi-VN');
};
export const pct = (x: number | string) => Number(x).toLocaleString('vi-VN', { maximumFractionDigits: 1 }) + '%';
export const dt = (d: Date | string | null) => (d ? new Date(d).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false }) : '—');

export const STATUS_LABEL: Record<string, string> = {
  CHO_DUYET: 'Chờ duyệt', CHO_THANH_TOAN: 'Chờ thanh toán', DANG_CHUAN_BI: 'Đang chuẩn bị', DANG_GIAO: 'Đang giao',
  DA_GIAO: 'Đã giao', HOAN_TAT: 'Hoàn tất', TU_CHOI: 'Bị từ chối', HUY: 'Đã hủy',
  NONE: 'Chưa giữ tiền', HOLD: 'Đang giữ tiền', RELEASED: 'Đã giải ngân', REFUND: 'Đã hoàn tiền',
  CHUA_THANH_TOAN: 'Chưa thanh toán', DA_NHAN: 'Đã nhận tiền',
  DROPSHIP: 'Giao thẳng từ xưởng', WFS_FULFILLMENT: 'Kho taomua', SAME_DAY_30MIN: 'Giao 30 phút (HCM)',
  PENDING: 'Chờ', APPROVED: 'Đã duyệt', REJECTED: 'Từ chối',
};
export const label = (s: string) => STATUS_LABEL[s] ?? s;
