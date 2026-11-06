// Quy tắc thuần của 7 agent (không chạm database) để kiểm thử được. Nguồn: docs/MULTILINGUAL_7_AI_SPEC.md.
import { calcMargin, MARGIN_FLOOR, WHOLESALE_MARGIN_WARN, TIERS, type Tier } from '../pricing';

export const TRUST_MIN = 85;          // chỉ dùng xưởng TrustScore ≥ 85
export const DEFECT_MAX = 0.02;       // tỉ lệ lỗi ≤ 2%
export const LATR_SCALE_CTR = 3;      // CTR > 3% mới nhập lớn
export const LATR_STOP_CTR = 2;       // CTR < 2% dừng
export const COMPETITOR_CUT = 0.02;   // đối thủ rẻ hơn → giảm 2%, vẫn giữ biên ≥ 15%
export const COST_JUMP = 0.10;        // xưởng tăng giá ≥ 10% → cảnh báo, gợi ý đổi xưởng
export const SAFETY_WARN = 25;        // biên an toàn < 25%: cảnh báo vàng
export const SAFETY_LOCK = 20;        // < 20%: khóa nhập mới

const up500 = (x: number) => Math.ceil(x / 500) * 500;
const down500 = (x: number) => Math.floor(x / 500) * 500;

/** Giá thấp nhất (làm tròn lên 500 đ) đạt biên ròng trên chi phí ≥ target%. */
export function priceForMargin(unitCost: number, inputVat: number, target = MARGIN_FLOOR): number {
  let lo = unitCost, hi = unitCost * 10;
  while (calcMargin({ revenue: hi, cost: unitCost, inputVat }).marginOnCost < target) hi *= 2;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (calcMargin({ revenue: mid, cost: unitCost, inputVat }).marginOnCost >= target) hi = mid; else lo = mid;
  }
  let p = up500(hi);
  while (calcMargin({ revenue: p, cost: unitCost, inputVat }).marginOnCost < target) p += 500;
  return p;
}

export type Prices = Record<Tier, number>;
export type PriceProduct = { cost: number; fee: number; input_vat: number; prices: Prices };

const monotone = (p: Prices): Prices => {
  // Mua nhiều giá phải bằng hoặc rẻ hơn: bậc sau không cao hơn bậc trước.
  const out = { ...p };
  for (let i = TIERS.length - 2; i >= 0; i--) out[TIERS[i]] = Math.max(out[TIERS[i]], out[TIERS[i + 1]]);
  return out;
};

export const marginOf = (p: PriceProduct, tier: Tier) =>
  calcMargin({ revenue: p.prices[tier], cost: p.cost + p.fee, inputVat: p.input_vat }).marginOnCost;

/** Bậc nào biên dưới sàn 15% thì nâng lên vừa đủ 15%. Null nếu không cần đổi. */
export function raiseToFloor(p: PriceProduct): Prices | null {
  const floor = priceForMargin(p.cost + p.fee, p.input_vat);
  const next = { ...p.prices };
  let changed = false;
  for (const t of TIERS) if (next[t] < floor) { next[t] = floor; changed = true; }
  return changed ? monotone(next) : null;
}

/** Đối thủ bán rẻ hơn giá bậc tương ứng → giảm cả 4 bậc 2%, không bậc nào xuống dưới biên 15%. */
export function competitorCut(p: PriceProduct, competitorUnit: number, tier: Tier): Prices | null {
  if (!(competitorUnit > 0) || competitorUnit >= p.prices[tier]) return null;
  const floor = priceForMargin(p.cost + p.fee, p.input_vat);
  const next = {} as Prices;
  for (const t of TIERS) next[t] = Math.max(floor, down500(p.prices[t] * (1 - COMPETITOR_CUT)));
  const m = monotone(next);
  return TIERS.some((t) => m[t] < p.prices[t]) ? m : null;
}

/** Pricing Engine (spec API #4): từ giá vốn + phí, đề xuất 4 bậc giá sỉ — mua càng nhiều giá càng thấp, biên giảm dần
 *  nhưng mọi bậc vẫn ≥ 15% sau thuế phí. Biên mục tiêu theo bậc: 10+ 45%, 50+ 35%, 100+ 28%, 500+ 20%. */
export const TIER_TARGETS: Record<Tier, number> = { 10: 45, 50: 35, 100: 28, 500: 20 };
export function suggestTierPrices(cost: number, fee: number, inputVat = 0, targets: Record<Tier, number> = TIER_TARGETS): Prices {
  const out = {} as Prices;
  for (const t of TIERS) out[t] = priceForMargin(cost + fee, inputVat, Math.max(MARGIN_FLOOR, targets[t]));
  return monotone(out);
}

export const marginTooHigh =(p: PriceProduct) => TIERS.filter((t) => marginOf(p, t) > WHOLESALE_MARGIN_WARN);

/** Mức thay đổi giá lớn nhất giữa hai bảng giá (tỉ lệ, dương = tăng). */
export const maxChange = (a: Prices, b: Prices) =>
  TIERS.reduce((m, t) => (Math.abs(b[t] / a[t] - 1) > Math.abs(m) ? b[t] / a[t] - 1 : m), 0);

export type SupplierLite = { id: string; name: string; trust_score: number; defect_rate: number; price_vn?: number | null; price_1688?: number | null };
export const supplierOk = (s: SupplierLite) => s.trust_score >= TRUST_MIN && Number(s.defect_rate) <= DEFECT_MAX;

/** Xưởng chính không đạt (Trust < 85 hoặc lỗi > 2%) → chọn xưởng dự phòng tốt nhất. */
export function pickBackup(primary: SupplierLite, backups: SupplierLite[]): SupplierLite | null {
  if (supplierOk(primary)) return null;
  const ok = backups.filter(supplierOk).sort((a, b) => b.trust_score - a.trust_score || Number(a.defect_rate) - Number(b.defect_rate));
  return ok[0] ?? null;
}

export function latrDecision(ctr: number | null | undefined): 'SCALE' | 'STOP' | null {
  if (ctr === null || ctr === undefined || Number.isNaN(Number(ctr))) return null;
  if (Number(ctr) > LATR_SCALE_CTR) return 'SCALE';
  if (Number(ctr) < LATR_STOP_CTR) return 'STOP';
  return null;
}

export function capitalDecision(safetyMarginPct: number): 'SAFE' | 'WARN' | 'LOCK' {
  if (safetyMarginPct < SAFETY_LOCK) return 'LOCK';
  if (safetyMarginPct < SAFETY_WARN) return 'WARN';
  return 'SAFE';
}

export const costJumped = (prev: number, now: number) => prev > 0 && now / prev - 1 >= COST_JUMP;

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();

/** Tìm sản phẩm khớp yêu cầu báo giá: theo SKU, hoặc mọi từ có nghĩa trong tên đều có trong yêu cầu. */
export function matchProduct<T extends { sku: string; name: string }>(text: string, products: T[]): T | null {
  const t = ` ${fold(text).replace(/[^a-z0-9]+/g, ' ')} `;
  const bySku = products.find((p) => t.includes(` ${fold(p.sku).replace(/[^a-z0-9]+/g, ' ')} `));
  if (bySku) return bySku;
  let best: { p: T; score: number } | null = null;
  for (const p of products) {
    const words = fold(p.name).split(/[^a-z0-9]+/).filter((w) => w.length >= 3);
    if (!words.length) continue;
    const hit = words.filter((w) => t.includes(` ${w} `)).length / words.length;
    if (hit >= 0.6 && (!best || hit > best.score)) best = { p, score: hit };
  }
  return best?.p ?? null;
}

/** 4 kịch bản đàm phán tiếng Trung (spec RYN-NEGO), điền số theo sản phẩm. Giá tính bằng tệ. */
export function negotiationScripts(i: { productVi: string; priceCny: number; targetCny: number; moq: number; testQty: number }) {
  const f = (x: number) => (Math.round(x * 10) / 10).toString();
  return [
    { ten: 'Giá', zh: `老板，这个${i.productVi}的价格${f(i.priceCny)}块太高了，我们在1688上看到别家更便宜，你能给${f(i.targetCny)}块吗？我们第一次合作，可以先订${i.moq}个测试，如果卖得好，下次订${i.moq * 4}个。`,
      vi: `Ông chủ, giá ${f(i.priceCny)} tệ cho ${i.productVi} cao quá, trên 1688 chỗ khác rẻ hơn, ông cho ${f(i.targetCny)} tệ được không? Lần đầu hợp tác đặt ${i.moq} cái test, bán tốt lần sau đặt ${i.moq * 4} cái.` },
    { ten: 'MOQ', zh: `MOQ ${i.moq}太多了，我们想先试${i.testQty}个，可以吗？价格稍微高一点也没关系。`,
      vi: `MOQ ${i.moq} nhiều quá, chúng tôi muốn thử ${i.testQty} cái trước được không? Giá cao hơn một chút cũng được.` },
    { ten: 'Chất lượng', zh: '我们要求质检合格率98%，如果不良率超过2%，要全额退款，可以写进合同吗？',
      vi: 'Chúng tôi yêu cầu QC đạt 98%, nếu lỗi vượt 2% phải hoàn tiền 100%, ghi vào hợp đồng được không?' },
    { ten: 'Thanh toán', zh: '我们先付30%定金，验货后付70%，走Trade Assurance，可以吗？',
      vi: 'Chúng tôi đặt cọc 30%, kiểm hàng xong trả 70%, qua Trade Assurance, được không?' },
  ];
}
