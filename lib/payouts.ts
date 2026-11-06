// Quy tắc chi tiền và nút Tắt/Mở (docs/PAYMENT_MANAGEMENT_AI_CEO_200D.md). Chỉ hàm thuần, không chạm database.
import { levelByValue, LEVELS, type Level } from './approval';

export const PAYOUT_CATEGORIES = {
  NAP_AI: 'Nạp tiền dịch vụ AI',
  NAP_ADS: 'Nạp quảng cáo',
  TAM_UNG_SHIP: 'Tạm ứng phí ship',
  MUA_MAU_LATR: 'Mua mẫu bán thử',
  DAT_COC_XUONG: 'Đặt cọc / thanh toán xưởng',
  NOP_THUE: 'Nộp thuế',
  KHAC: 'Khác',
} as const;
export type PayoutCategory = keyof typeof PAYOUT_CATEGORIES;

export type ControlKey =
  | 'AI_AUTO' | 'NAP_AI' | 'NAP_ADS' | 'TAM_UNG_SHIP' | 'MUA_MAU_LATR' | 'DAT_COC_XUONG' | 'NOP_THUE' | 'KHOA_NHAP_MOI' | 'CANH_GIAM_GIA';
export type Controls = Record<ControlKey, boolean>;

/** 9 nút bật/tắt được + 1 nút cố định (Trade Assurance), theo spec PAYMENT_MANAGEMENT và ALGORITHM mục 7 (nút canh mua giảm giá). */
export const CONTROLS: { key: ControlKey; label: string; on: string; off: string; when: string; default: boolean }[] = [
  { key: 'AI_AUTO', label: 'Nút tổng: tự động duyệt Cấp 1', default: true,
    on: 'Đơn hàng và khoản chi dưới 5 triệu được duyệt tự động.',
    off: 'Mọi đơn và khoản chi đều cần người duyệt (Trưởng nhóm hoặc CEO).',
    when: 'Tắt khi có khủng hoảng: đứt vốn, đứt chuỗi, xưởng lỗi, trend giảm.' },
  { key: 'NAP_AI', label: 'Chi nạp tiền dịch vụ AI', default: true, on: 'Được đề xuất và chi.', off: 'Khóa chi loại này.', when: 'Tắt khi vốn an toàn dưới 20%.' },
  { key: 'NAP_ADS', label: 'Chi quảng cáo', default: true, on: 'Được đề xuất và chi.', off: 'Khóa chi loại này.', when: 'Tắt khi ROAS < 2 hoặc CTR < 2%.' },
  { key: 'TAM_UNG_SHIP', label: 'Chi tạm ứng phí ship', default: true, on: 'Được đề xuất và chi.', off: 'Khóa chi loại này.', when: 'Tắt khi tỉ lệ giao lỗi > 5%.' },
  { key: 'MUA_MAU_LATR', label: 'Chi mua mẫu bán thử', default: true, on: 'Được đề xuất và chi.', off: 'Khóa chi loại này.', when: 'Tắt khi tồn kho > 50%.' },
  { key: 'DAT_COC_XUONG', label: 'Chi đặt cọc / thanh toán xưởng', default: true, on: 'Được đề xuất và chi.', off: 'Khóa chi loại này.', when: 'Tắt khi điểm tin cậy xưởng < 85 hoặc lỗi > 2%.' },
  { key: 'NOP_THUE', label: 'Chi nộp thuế', default: true, on: 'Được đề xuất và chi.', off: 'Khóa chi loại này.', when: 'Tắt khi thiếu tiền; nhớ hạn nộp.' },
  { key: 'KHOA_NHAP_MOI', label: 'Khóa nhập hàng mới', default: false,
    on: 'Khóa đặt cọc xưởng và mua mẫu, chỉ thu hồi công nợ.', off: 'Nhập hàng bình thường.',
    when: 'Bật khi biên an toàn dưới 20%.' },
  { key: 'CANH_GIAM_GIA', label: 'Canh mua giảm giá', default: true,
    on: 'AI canh báo giá xưởng thấp hơn ≥ 10% giá vốn (mở yêu cầu đổi xưởng), đối thủ giảm giá (giảm 2%, giữ biên ≥ 15%), khách mua 500 cái (đàm phán lại giảm 5–10%).',
    off: 'AI không canh giảm giá.', when: 'Tắt khi muốn giữ nguyên giá và xưởng.' },
];
export const TRADE_ASSURANCE_NOTE = 'Luôn bật: tiền khách được giữ đến khi khách xác nhận nhận hàng. Không có nút tắt để bảo vệ khách sỉ.';

export const DEFAULT_CONTROLS = Object.fromEntries(CONTROLS.map((c) => [c.key, c.default])) as Controls;
export const isControlKey = (k: string): k is ControlKey => CONTROLS.some((c) => c.key === k);

/** Chi từ mức này trở lên, người duyệt phải nhập lại mật khẩu. */
export const REAUTH_THRESHOLD = 10_000_000;

export const payoutLevel = (amount: number): Level => levelByValue(amount);

/** Lý do khoản chi đang bị khóa, hoặc null nếu được chi. */
export function payoutBlock(category: PayoutCategory, ctl: Controls): string | null {
  if (category !== 'KHAC' && !ctl[category]) return `Đang khóa: ${PAYOUT_CATEGORIES[category]}. CEO mở lại ở Kiểm soát chi.`;
  if (ctl.KHOA_NHAP_MOI && (category === 'DAT_COC_XUONG' || category === 'MUA_MAU_LATR')) {
    return 'Đang khóa nhập hàng mới: không đặt cọc xưởng, không mua mẫu.';
  }
  return null;
}

/** Cấp 1 được tự duyệt khi nút tổng bật. Loại "Khác" luôn cần người duyệt. */
export function autoApprovePayout(amount: number, category: PayoutCategory, ctl: Controls): boolean {
  return ctl.AI_AUTO && category !== 'KHAC' && payoutLevel(amount) === 1 && payoutBlock(category, ctl) === null;
}

/** Ai được duyệt khoản chi: Cấp 1–2 Trưởng nhóm hoặc CEO, Cấp 3 trở lên chỉ CEO. Trưởng nhóm không tự duyệt khoản mình đề xuất. */
export function payoutApproveError(user: { id: string; role: string }, p: { amount: number; proposed_by: string }): string | null {
  const level = payoutLevel(p.amount);
  if (user.role === 'CEO') return null;
  if (user.role !== 'TRUONG_NHOM') return 'Bạn không có quyền duyệt chi.';
  if (level > 2) return `${LEVELS[level].label} (từ 20 triệu) chỉ CEO duyệt.`;
  if (p.proposed_by === user.id) return 'Không tự duyệt khoản chi mình đề xuất.';
  return null;
}

export const needsReauth = (amount: number) => amount >= REAUTH_THRESHOLD;
