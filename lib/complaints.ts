// AI phân loại khiếu nại / báo lỗi (spec module "Khủng hoảng Khiếu nại Kanban" + CSKH 95% AI, 5% CEO).
// Quy tắc thuần, kiểm thử được. Mức CAO (hoàn tiền / bồi thường lớn, khủng hoảng, mất tiền) chuyển thẳng cột "Chờ CEO".
import { fold } from './sourcing';

export type Kind = 'LOI' | 'KHIEU_NAI';
export type Severity = 'THAP' | 'VUA' | 'CAO';
export type Resolution = 'DOI_HANG' | 'HOAN_TIEN' | 'BOI_THUONG' | 'XIN_LOI' | 'SUA_WEB' | 'KHONG';

export const CEO_REFUND_THRESHOLD = 10_000_000; // hoàn tiền > 10 triệu: CEO xử lý (spec CEO_ROLE)

// So khớp nguyên từ / cụm từ (đã bỏ dấu): "hong" không khớp "khong", "tre" không khớp "tren".
const has = (t: string, words: string[]) => words.some((w) => t.includes(` ${w} `));
const DEFECT = ['loi', 'bi loi', 'hong', 'bi hong', 'be', 'vo', 'nut', 'kem chat luong', 'khong dung mo ta', 'sai mau', 'sai hang', 'hang gia', 'defect', 'defective', 'broken', 'damaged'];
const MISSING = ['thieu', 'khong du', 'missing'];
const LATE = ['cham', 'giao cham', 'tre', 'giao tre', 'chua nhan', 'chua giao', 'late', 'not received'];
const MONEY = ['hoan tien', 'tra lai tien', 'boi thuong', 'refund', 'mat tien', 'tru tien 2 lan', 'charged twice'];
const CRISIS = ['lua dao', 'kien', 'khoi kien', 'cong an', 'bao chi', 'luat su', 'boc phot', 'len mang', 'scam', 'lawyer', 'police', 'sue'];
const PAYMENT_BUG = ['thanh toan', 'chuyen khoan', 'payment', 'khong dat duoc', 'loi he thong', 'khong vao duoc'];

export function classifyIssue(i: { kind: Kind; message: string; orderAmount?: number | null }) {
  const t = ` ${fold(i.message).replace(/[^a-z0-9]+/g, ' ').trim()} `;
  const reasons: string[] = [];
  let severity: Severity = i.kind === 'KHIEU_NAI' ? 'VUA' : 'THAP';
  let resolution: Resolution = i.kind === 'LOI' ? 'SUA_WEB' : 'XIN_LOI';

  if (i.kind === 'KHIEU_NAI') {
    if (has(t, DEFECT)) { resolution = 'DOI_HANG'; reasons.push('hàng lỗi / không đúng mô tả: đổi hàng, lỗi > 2% thì hoàn 100% (Trade Assurance)'); }
    if (has(t, MISSING)) { resolution = 'BOI_THUONG'; reasons.push('thiếu hàng: giao bù hoặc bồi thường'); }
    if (has(t, LATE)) { if (resolution === 'XIN_LOI') reasons.push('giao chậm: xin lỗi, báo lại lịch giao'); }
    if (has(t, MONEY)) { resolution = 'HOAN_TIEN'; reasons.push('khách yêu cầu hoàn tiền / bồi thường'); }
  } else if (has(t, PAYMENT_BUG)) {
    severity = 'VUA'; reasons.push('lỗi liên quan thanh toán / đặt hàng: ảnh hưởng doanh thu');
  }
  const big = (i.orderAmount ?? 0) > CEO_REFUND_THRESHOLD;
  if (has(t, CRISIS)) { severity = 'CAO'; reasons.push('nguy cơ khủng hoảng truyền thông / pháp lý'); }
  if ((resolution === 'HOAN_TIEN' || resolution === 'BOI_THUONG') && big) { severity = 'CAO'; reasons.push(`đơn trên ${CEO_REFUND_THRESHOLD.toLocaleString('vi-VN')} đ: CEO quyết định`); }
  if (i.kind === 'LOI' && has(t, ['mat tien', 'tru tien 2 lan', 'charged twice'])) { severity = 'CAO'; reasons.push('khách có thể mất tiền'); }

  return { severity, resolution, status: severity === 'CAO' ? 'CHO_CEO' as const : 'MOI' as const, reason: reasons.join('; ') || 'không có dấu hiệu đặc biệt' };
}

export const SEVERITY_TEXT: Record<Severity, [string, string]> = { THAP: ['Thấp', ''], VUA: ['Vừa', 'warn'], CAO: ['Cao', 'bad'] };
export const RESOLUTION_TEXT: Record<Resolution, string> = {
  DOI_HANG: 'Đổi hàng', HOAN_TIEN: 'Hoàn tiền (Trade Assurance)', BOI_THUONG: 'Bồi thường / giao bù', XIN_LOI: 'Xin lỗi, báo lại', SUA_WEB: 'Sửa website', KHONG: 'Không cần xử lý',
};
export const COLUMNS = [['MOI', 'Mới'], ['DANG_XU_LY', 'Đang xử lý'], ['CHO_CEO', 'Chờ CEO'], ['DA_SUA', 'Hoàn thành']] as const;
