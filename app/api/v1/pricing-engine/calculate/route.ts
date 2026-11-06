import { apiAuth, json, handle } from '@/lib/api';
import { calcMargin, analyzeProduct, tierFor, TIERS } from '@/lib/pricing';
import { approvalLevel } from '@/lib/approval';
import { workingCapital } from '@/lib/capital';
import { suggestTierPrices } from '@/lib/agents/rules';

// Spec #4 (quan trọng nhất). Input {cost, fee, quantity, tier, input_vat?} → {price_10, price_50, price_100, price_500, bien_tren_chi_phi,
// bien_tren_dt, cap_duyet 1-5, von_luu_dong_30, du_phong_15, tong_von_can_45}. Biên ròng sau thuế phí chuẩn kế toán.
// Có prices {10,50,100,500} thì phân tích bảng giá có sẵn; có price thì tính một giá (dùng cho kênh bán).
export async function POST(req: Request) {
  const a = await apiAuth(req, 'products.edit');
  if (a instanceof Response) return a;
  return handle(async () => {
    const b = await req.json().catch(() => ({}));
    const cost = Number(b.cost), fee = Number(b.fee ?? 0), iv = Number(b.input_vat ?? 0);
    if (!(cost > 0) || fee < 0 || iv < 0) return json({ error: 'cost > 0, fee và input_vat ≥ 0' }, 400);

    if (b.price !== undefined) {
      const price = Number(b.price);
      if (!(price > 0)) return json({ error: 'price phải > 0' }, 400);
      const m = calcMargin({ revenue: price, cost: cost + fee, inputVat: iv, channelFeePct: Number(b.channel_fee_pct ?? 0) });
      const value = Number(b.order_value ?? price);
      return json({ ...m, approval: approvalLevel(value, m.marginOnCost, m.net) });
    }

    const prices = b.prices
      ? { 10: +b.prices[10], 50: +b.prices[50], 100: +b.prices[100], 500: +b.prices[500] }
      : suggestTierPrices(cost, fee, iv);
    const analysis = analyzeProduct({ cost, fee, input_vat: iv, price_taomua_10: prices[10], price_taomua_50: prices[50], price_taomua_100: prices[100], price_taomua_500: prices[500] });
    const quantity = Math.max(1, Math.round(Number(b.quantity) || Number(b.tier) || 10));
    const tier = (TIERS as readonly number[]).includes(Number(b.tier)) ? Number(b.tier) as 10 | 50 | 100 | 500 : tierFor(quantity) ?? 10;
    const unit = prices[tier];
    const order = calcMargin({ revenue: unit * quantity, cost: (cost + fee) * quantity, inputVat: iv * quantity });
    const wc = workingCapital(order.revenue, null, order.marginOnCost);
    return json({
      price_10: prices[10], price_50: prices[50], price_100: prices[100], price_500: prices[500],
      de_xuat: !b.prices, tier, quantity, unit_price: unit, tong_dt: order.revenue,
      bien_tren_chi_phi: order.marginOnCost, bien_tren_dt: order.marginOnRevenue, ln_rong_sau_thue: order.net,
      vat_8: order.vatOut, phi_mb_1: order.bankFee, thue_tndn_20: order.cit,
      cap_duyet: approvalLevel(order.revenue, order.marginOnCost, order.net).level,
      von_luu_dong_30: wc.vld, du_phong_15: wc.reserve, tong_von_can_45: wc.total,
      tiers: analysis.rows.map((r) => ({ tier: r.tier, price: r.price, bien_tren_chi_phi: r.marginOnCost, bien_tren_dt: r.marginOnRevenue, ln_rong: r.net })),
      warnings: analysis.warnings,
    });
  });
}
