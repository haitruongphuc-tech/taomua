import { apiAuth, json, handle } from '@/lib/api';
import { q, one } from '@/lib/db';
import { isUuid } from '@/lib/catalog';
import { workingCapital } from '@/lib/capital';

// Spec #13 Scintilla. Input {product_id?, period (ngày)} → {sales, roas, ctr, bien_rong, von_luu_dong, vong_quay} + phân tích theo kênh, sản phẩm, duyệt tự động.
export async function POST(req: Request) {
  const a = await apiAuth(req, 'finance.view');
  if (a instanceof Response) return a;
  return handle(async () => {
    const b = await req.json().catch(() => ({}));
    const days = Math.min(365, Math.max(1, Math.round(Number(b.period ?? b.days ?? 30))));
    const pid = b.product_id ? String(b.product_id) : null;
    if (pid && !isUuid(pid)) return json({ error: 'product_id không hợp lệ' }, 400);
    const live = `o.created_at >= now() - make_interval(days => ${days}) AND o.status NOT IN ('HUY','TU_CHOI')`;
    const prodFilter = pid ? 'AND i.product_id = $1' : '';
    const args = pid ? [pid] : [];
    const s = await one(`SELECT COALESCE(sum(i.quantity * i.unit_price),0)::bigint AS revenue, COALESCE(sum(i.quantity),0)::int AS qty, count(DISTINCT o.id)::int AS orders,
        COALESCE(sum(i.quantity * i.unit_cost),0)::bigint AS cost
      FROM order_items i JOIN wholesale_orders o ON o.id=i.order_id WHERE ${live} ${prodFilter}`, args);
    const net = await one(`SELECT COALESCE(sum(o.ln_rong_sau_thue),0)::bigint AS net, COALESCE(sum(o.tong_chi_phi_truoc_thue + o.phi_kenh - o.vat_dau_vao),0)::bigint AS cost
      FROM wholesale_orders o WHERE ${live} ${pid ? 'AND EXISTS (SELECT 1 FROM order_items i WHERE i.order_id=o.id AND i.product_id=$1)' : ''}`, args);
    const ads = await one(`SELECT COALESCE(sum(s.spend),0)::bigint AS spend, COALESCE(sum(s.revenue),0)::bigint AS revenue, COALESCE(sum(s.clicks),0)::bigint AS clicks,
        COALESCE(sum(s.impressions),0)::bigint AS impressions FROM ad_stats s JOIN ad_campaigns c ON c.id=s.campaign_id
      WHERE s.day >= CURRENT_DATE - ${days} ${pid ? 'AND c.product_id=$1' : ''}`, args);
    const revenue = Number(s.revenue);
    const margin = Number(net.cost) > 0 ? Math.round((Number(net.net) / Number(net.cost)) * 10000) / 100 : null;
    const wc = workingCapital(revenue, null, margin ?? 0);
    const [byChannel, topProducts] = pid ? [[], []] : await Promise.all([
      q(`SELECT ch.code, ch.name, count(o.id)::int AS orders, COALESCE(sum(o.tong_dt),0)::bigint AS revenue, COALESCE(sum(o.ln_rong_sau_thue),0)::bigint AS net
         FROM sales_channels ch LEFT JOIN wholesale_orders o ON o.channel_id=ch.id AND ${live} GROUP BY ch.code, ch.name ORDER BY revenue DESC`),
      q(`SELECT i.product_id, i.product_name, sum(i.quantity)::int AS qty, sum(i.quantity*i.unit_price)::bigint AS revenue
         FROM order_items i JOIN wholesale_orders o ON o.id=i.order_id WHERE ${live} GROUP BY i.product_id, i.product_name ORDER BY revenue DESC LIMIT 10`),
    ]);
    const approval = await one(`SELECT count(*)::int AS total, count(*) FILTER (WHERE approved_by_label LIKE 'Tự động%')::int AS auto FROM wholesale_orders o WHERE ${live}`);
    return json({
      period: days, product_id: pid,
      sales: { revenue, quantity: s.qty, orders: s.orders },
      roas: Number(ads.spend) > 0 ? Math.round((Number(ads.revenue) / Number(ads.spend)) * 100) / 100 : null,
      ctr: Number(ads.impressions) > 0 ? Math.round((Number(ads.clicks) / Number(ads.impressions)) * 10000) / 100 : null,
      bien_rong: margin,
      von_luu_dong: wc.vld, du_phong: wc.reserve, tong_von_can: wc.total,
      vong_quay: wc.vld > 0 ? Math.round((revenue / wc.vld) * 100) / 100 : null,
      ai_auto_approval_pct: approval.total ? Math.round((approval.auto / approval.total) * 1000) / 10 : null,
      by_channel: byChannel, top_products: topProducts,
    });
  });
}
