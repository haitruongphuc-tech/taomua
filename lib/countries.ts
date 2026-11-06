// Nơi giao hàng. Việt Nam giao trong nước; còn lại là đơn quốc tế: phí vận chuyển báo riêng trước khi thanh toán.
export const COUNTRIES = [
  { code: 'VN', vi: 'Việt Nam', en: 'Vietnam', dial: '84' },
  { code: 'US', vi: 'Hoa Kỳ', en: 'United States', dial: '1' },
  { code: 'CA', vi: 'Canada', en: 'Canada', dial: '1' },
  { code: 'CN', vi: 'Trung Quốc', en: 'China', dial: '86' },
  { code: 'HK', vi: 'Hồng Kông', en: 'Hong Kong', dial: '852' },
  { code: 'TW', vi: 'Đài Loan', en: 'Taiwan', dial: '886' },
  { code: 'JP', vi: 'Nhật Bản', en: 'Japan', dial: '81' },
  { code: 'KR', vi: 'Hàn Quốc', en: 'South Korea', dial: '82' },
  { code: 'SG', vi: 'Singapore', en: 'Singapore', dial: '65' },
  { code: 'TH', vi: 'Thái Lan', en: 'Thailand', dial: '66' },
  { code: 'MY', vi: 'Malaysia', en: 'Malaysia', dial: '60' },
  { code: 'ID', vi: 'Indonesia', en: 'Indonesia', dial: '62' },
  { code: 'PH', vi: 'Philippines', en: 'Philippines', dial: '63' },
  { code: 'KH', vi: 'Campuchia', en: 'Cambodia', dial: '855' },
  { code: 'LA', vi: 'Lào', en: 'Laos', dial: '856' },
  { code: 'AU', vi: 'Úc', en: 'Australia', dial: '61' },
  { code: 'GB', vi: 'Anh', en: 'United Kingdom', dial: '44' },
  { code: 'FR', vi: 'Pháp', en: 'France', dial: '33' },
  { code: 'DE', vi: 'Đức', en: 'Germany', dial: '49' },
  { code: 'ES', vi: 'Tây Ban Nha', en: 'Spain', dial: '34' },
  { code: 'IT', vi: 'Ý', en: 'Italy', dial: '39' },
  { code: 'NL', vi: 'Hà Lan', en: 'Netherlands', dial: '31' },
  { code: 'AE', vi: 'UAE', en: 'United Arab Emirates', dial: '971' },
] as const;
export type CountryCode = (typeof COUNTRIES)[number]['code'];
export const isCountry = (c: string): c is CountryCode => COUNTRIES.some((x) => x.code === c);
export const countryName = (c: string) => COUNTRIES.find((x) => x.code === c)?.vi ?? c;

/** Số điện thoại: Việt Nam lưu dạng 0xxxxxxxxx; nước ngoài lưu dạng +<mã nước><số> (8–15 chữ số). Null nếu sai. */
export function phoneKey(p: string): string | null {
  const raw = p.trim().replace(/[\s().-]/g, '');
  const d = raw.replace(/^00/, '+');
  if (/^(\+84|84|0)\d{8,10}$/.test(d)) return d.replace(/^\+?84/, '0');
  if (/^\+[1-9]\d{7,14}$/.test(d)) return d;
  return null;
}

/** Quy đổi tham khảo sang USD cho khách quốc tế; null khi chưa nhập tỷ giá. */
export function usd(vndAmount: number): number | null {
  const r = Number(process.env.USD_VND_RATE);
  return r > 0 ? Math.round((vndAmount / r) * 100) / 100 : null;
}
