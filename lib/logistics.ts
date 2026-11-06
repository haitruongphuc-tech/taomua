// Logistics (spec RYN-LOGI: "GHN/GHTK/J&T AI chọn rẻ nhất mỗi đơn"). Bảng giá nhập tay cho tới khi có API từng hãng.
export type Zone = 'NOI_TINH' | 'NOI_MIEN' | 'LIEN_MIEN' | 'QUOC_TE';
export const ZONE_TEXT: Record<Zone, string> = { NOI_TINH: 'Nội tỉnh / nội thành', NOI_MIEN: 'Nội miền', LIEN_MIEN: 'Liên miền', QUOC_TE: 'Quốc tế' };
export type Rate = { carrier: string; zone: string; base_fee: number; base_grams: number; step_fee: number; step_grams: number; days?: number | null; active?: boolean };

/** Phí một hãng cho khối lượng (gram): phí cơ bản + mỗi bước vượt. */
export function rateFee(r: Rate, grams: number) {
  const extra = Math.max(0, grams - r.base_grams);
  return Number(r.base_fee) + Math.ceil(extra / r.step_grams) * Number(r.step_fee);
}

/** So phí các hãng trong vùng, rẻ nhất trước (bằng phí thì nhanh hơn trước). */
export function cheapest(rates: Rate[], zone: Zone, grams: number) {
  return rates.filter((r) => r.zone === zone && r.active !== false)
    .map((r) => ({ carrier: r.carrier, fee: rateFee(r, grams), days: r.days ?? null }))
    .sort((a, b) => a.fee - b.fee || (a.days ?? 99) - (b.days ?? 99));
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
const SOUTH = ['ho chi minh', 'hcm', 'tp hcm', 'sai gon', 'binh duong', 'dong nai', 'long an', 'ba ria', 'vung tau', 'tay ninh', 'binh phuoc', 'can tho', 'tien giang', 'ben tre', 'vinh long', 'an giang', 'kien giang', 'ca mau', 'bac lieu', 'soc trang', 'tra vinh', 'dong thap', 'hau giang'];
const NORTH = ['ha noi', 'hai phong', 'quang ninh', 'bac ninh', 'hai duong', 'hung yen', 'nam dinh', 'thai binh', 'ninh binh', 'ha nam', 'vinh phuc', 'phu tho', 'thai nguyen', 'bac giang', 'lang son', 'lao cai', 'yen bai', 'son la', 'hoa binh', 'thanh hoa', 'nghe an', 'ha tinh'];
const CENTRAL = ['da nang', 'hue', 'quang nam', 'quang ngai', 'binh dinh', 'phu yen', 'khanh hoa', 'nha trang', 'ninh thuan', 'binh thuan', 'quang binh', 'quang tri', 'kon tum', 'gia lai', 'dak lak', 'dak nong', 'lam dong', 'da lat'];

/** Vùng giao từ kho / xưởng ở TP.HCM theo địa chỉ khách (đoán theo tên tỉnh). */
export function guessZone(address: string, country = 'VN'): Zone {
  if (country !== 'VN') return 'QUOC_TE';
  const a = fold(address);
  if (['ho chi minh', 'hcm', 'sai gon', 'thu duc', 'quan 1', 'q.1', 'q1', 'q.7', 'binh thanh', 'go vap', 'tan binh'].some((k) => a.includes(k))) return 'NOI_TINH';
  if (SOUTH.some((k) => a.includes(k))) return 'NOI_MIEN';
  if (NORTH.some((k) => a.includes(k)) || CENTRAL.some((k) => a.includes(k))) return 'LIEN_MIEN';
  return 'LIEN_MIEN';
}
