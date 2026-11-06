// RYN-SUPPLY tìm xưởng: chấm điểm xưởng cho một nhu cầu (ngành hàng, mô tả, số lượng, giá bán dự kiến, nơi giao).
// Hàm thuần, không chạm database. AI xếp hạng và đề xuất; CEO chọn. AI không bao giờ tự bịa xưởng: chỉ xếp hạng xưởng và
// báo giá đã có trong hệ thống (nhập tay, AI trích từ tin nhắn xưởng, CSV, hoặc API khi có).
import { calcMargin, MARGIN_FLOOR } from './pricing';
import { TRUST_MIN, DEFECT_MAX, priceForMargin } from './agents/rules';

export const SOURCING_TARGET_MARGIN = 30; // % biên ròng trên chi phí khi AI tự lập giá báo cho khách (trong khoảng 15-150% của spec)

export const fold = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().trim();
const words = (s: string) => fold(s).split(/[^a-z0-9]+/).filter((w) => w.length >= 3);

/** Tỉ lệ từ có nghĩa của a xuất hiện trong b (0..1). */
export function textOverlap(a: string, b: string) {
  const wa = [...new Set(words(a))];
  if (!wa.length) return 0;
  const wb = new Set(words(b));
  return wa.filter((w) => wb.has(w)).length / wa.length;
}

export type Need = { productId?: string | null; category: string | null; text: string; quantity: number; targetUnitPrice?: number | null; feePerUnit?: number; country?: string };
export type Candidate = {
  supplier: { id: string; name: string; categories: string[]; trust_score: number; defect_rate: number; lead_time_days?: number | null; ships_international?: boolean; country?: string; is_simulated?: boolean };
  offer: { id: string; product_id?: string | null; product_text: string; category: string; unit_cost: number; moq: number; lead_time_days?: number | null; verified?: boolean; is_simulated?: boolean } | null;
};
export type Ranked = Candidate & {
  score: number;
  eligible: boolean;           // đủ chuẩn để đề xuất (Trust, lỗi, ngành, có giá)
  moqOk: boolean;
  landed: number | null;       // giá xưởng + phí mỗi cái
  margin: number | null;       // biên ròng trên chi phí nếu bán đúng giá dự kiến
  reasons: string[];
};

const catMatch = (need: string | null, cats: string[]) => !!need && cats.some((c) => fold(c) === fold(need));

export function rankCandidates(need: Need, cands: Candidate[]): Ranked[] {
  const fee = need.feePerUnit ?? 0;
  const intl = !!need.country && need.country !== 'VN';
  // Báo giá chỉ tính khi đúng sản phẩm đó, hoặc mô tả hàng giống ≥ 60% (và cùng ngành nếu đã biết ngành).
  // Giá của món khác cùng ngành (thau ≠ bình giữ nhiệt) không dùng để so.
  const offerFits = (o: NonNullable<Candidate['offer']>) =>
    (!!need.productId && o.product_id === need.productId) ||
    (textOverlap(need.text, o.product_text) >= 0.6 && (!need.category || fold(o.category) === fold(need.category)));
  const withOffer = cands.filter((c) => c.offer && offerFits(c.offer));
  const quoted = new Set(withOffer.map((c) => c.supplier.id));
  // Xưởng cùng ngành chưa báo giá món này: liệt kê để biết cần hỏi giá ai.
  const askFor = new Map<string, Candidate>();
  for (const c of cands) {
    if (!quoted.has(c.supplier.id) && catMatch(need.category, c.supplier.categories)) askFor.set(c.supplier.id, { supplier: c.supplier, offer: null });
  }
  const relevant = [...withOffer, ...askFor.values()];
  const prices = relevant.filter((c) => c.offer).map((c) => c.offer!.unit_cost + fee);
  const cheapest = prices.length ? Math.min(...prices) : null;

  const out = relevant.map((c): Ranked => {
    const s = c.supplier;
    const o = c.offer;
    const reasons: string[] = [];
    const trustOk = s.trust_score >= TRUST_MIN;
    const defectOk = Number(s.defect_rate) <= DEFECT_MAX;
    if (!trustOk) reasons.push(`TrustScore ${s.trust_score} < ${TRUST_MIN}`);
    if (!defectOk) reasons.push(`lỗi ${(Number(s.defect_rate) * 100).toFixed(1)}% > 2%`);
    const landed = o ? o.unit_cost + fee : null;
    const moq = o?.moq ?? 1;
    const moqOk = moq <= need.quantity;
    if (!o) reasons.push('chưa có báo giá: cần hỏi giá');
    if (o && !moqOk) reasons.push(`MOQ ${moq} > ${need.quantity}: đề xuất bán thử với xưởng MOQ thấp trước`);
    let margin: number | null = null;
    if (landed && need.targetUnitPrice) {
      margin = calcMargin({ revenue: need.targetUnitPrice, cost: landed }).marginOnCost;
      if (margin < MARGIN_FLOOR) reasons.push(`biên ${margin}% < 15% ở giá ${need.targetUnitPrice.toLocaleString('vi-VN')} đ`);
    }
    const lead = o?.lead_time_days ?? s.lead_time_days ?? null;
    if (intl && !s.ships_international) reasons.push('chưa xác nhận giao quốc tế');
    if (o && !o.verified) reasons.push('báo giá chưa xác nhận lại với xưởng');

    const priceScore = landed && cheapest ? cheapest / landed : 0;
    const leadScore = lead == null ? 0.5 : Math.max(0, Math.min(1, (30 - lead) / 23));
    const score = Math.round(
      40 * priceScore + 25 * (s.trust_score / 100) + 15 * Math.max(0, 1 - Number(s.defect_rate) / 0.05) +
      10 * (moqOk ? 1 : 0) + 10 * leadScore - (intl && !s.ships_international ? 10 : 0),
    );
    const eligible = trustOk && defectOk && !!o && (margin === null || margin >= MARGIN_FLOOR);
    return { ...c, score, eligible, moqOk, landed, margin, reasons };
  });
  return out.sort((a, b) => Number(b.eligible) - Number(a.eligible) || Number(b.moqOk) - Number(a.moqOk) || b.score - a.score);
}

/** Đề xuất cuối: xưởng chính (đủ chuẩn, đủ MOQ nếu có), tối đa 3 xưởng dự phòng khác nhau, và giá báo khách nếu cần. */
export function recommend(need: Need, ranked: Ranked[]) {
  const ok = ranked.filter((r) => r.eligible);
  const primary = ok.find((r) => r.moqOk) ?? ok[0] ?? null;
  if (!primary) return null;
  const seen = new Set([primary.supplier.id]);
  const backups: Ranked[] = [];
  for (const r of ok) {
    if (seen.has(r.supplier.id)) continue;
    seen.add(r.supplier.id);
    backups.push(r);
    if (backups.length === 3) break;
  }
  const landed = primary.landed!;
  // Giá báo khách: giá khách muốn nếu đạt biên ≥ 15%, nếu không thì giá đạt biên mục tiêu 30%.
  const unitPrice = need.targetUnitPrice && calcMargin({ revenue: need.targetUnitPrice, cost: landed }).marginOnCost >= MARGIN_FLOOR
    ? need.targetUnitPrice : priceForMargin(landed, 0, SOURCING_TARGET_MARGIN);
  const m = calcMargin({ revenue: unitPrice, cost: landed });
  const testQty = primary.moqOk ? null : Math.min(100, Math.max(50, need.quantity));
  return { primary, backups, unitPrice, total: unitPrice * need.quantity, margin: m.marginOnCost, testQty };
}

/** Tin nhắn hỏi giá gửi xưởng (Trung + Việt) khi chưa có báo giá đủ chuẩn. */
export function inquiryMessage(i: { productVi: string; productZh?: string | null; quantity: number; country: string }) {
  const zhName = i.productZh || i.productVi;
  return {
    zh: `您好，我们是越南批发平台taomua。请报价：${zhName}，数量${i.quantity}个。请告知单价、MOQ、交货期、是否可以${i.country === 'VN' ? '发货到越南' : '国际发货'}，以及是否接受质检合格率98%和30%定金、验货后付70%。谢谢！`,
    vi: `Chào anh/chị, chúng tôi là taomua (sàn sỉ Việt Nam). Xin báo giá: ${i.productVi}, số lượng ${i.quantity} cái. Vui lòng cho biết đơn giá, MOQ, thời gian giao, có ${i.country === 'VN' ? 'giao về Việt Nam' : 'giao quốc tế'} không, và có chấp nhận QC đạt 98%, cọc 30%, kiểm hàng xong trả 70% không. Cảm ơn!`,
  };
}
