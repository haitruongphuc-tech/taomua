import { apiAuth, json, handle } from '@/lib/api';
import { calcMargin, analyzeProduct } from '@/lib/pricing';
import { approvalLevel } from '@/lib/approval';

// Đầu vào: cost, fee, input_vat (mỗi cái) và price (một giá) hoặc prices {10,50,100,500}; order_value để tính cấp duyệt.
export async function POST(req: Request) {
  const a = await apiAuth(req, 'products.edit');
  if (a instanceof Response) return a;
  return handle(async () => {
    const b = await req.json().catch(() => ({}));
    const cost = Number(b.cost), fee = Number(b.fee ?? 0), iv = Number(b.input_vat ?? 0);
    if (!(cost > 0) || fee < 0 || iv < 0) return json({ error: 'cost > 0, fee và input_vat ≥ 0' }, 400);
    if (b.prices) {
      const p = b.prices;
      const r = analyzeProduct({ cost, fee, input_vat: iv, price_taomua_10: +p[10], price_taomua_50: +p[50], price_taomua_100: +p[100], price_taomua_500: +p[500] });
      return json(r);
    }
    const price = Number(b.price);
    if (!(price > 0)) return json({ error: 'Cần price hoặc prices' }, 400);
    const m = calcMargin({ revenue: price, cost: cost + fee, inputVat: iv, channelFeePct: Number(b.channel_fee_pct ?? 0) });
    const value = Number(b.order_value ?? price);
    return json({ ...m, approval: approvalLevel(value, m.marginOnCost, m.net) });
  });
}
