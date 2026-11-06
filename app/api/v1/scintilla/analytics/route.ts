import { apiAuth, json, handle } from '@/lib/api';
import { q, one } from '@/lib/db';

// Phân tích bán hàng từ đơn thật trong hệ thống: theo kênh, sản phẩm bán chạy, tỉ lệ duyệt tự động, báo giá.
export async function POST(req: Request) {
  const a = await apiAuth(req, 'finance.view');
  if (a instanceof Response) return a;
  return handle(async () => {
    const b = await req.json().catch(() => ({}));
    const days = Math.min(365, Math.max(1, Math.round(Number(b.days ?? 30))));
    const since = `now() - interval '${days} days'`;
    const live = `o.created_at >= ${since} AND o.status NOT IN ('HUY','TU_CHOI')`;
    const [byChannel, topProducts, approval, rfq] = await Promise.all([
      q(`SELECT ch.code, ch.name, count(o.id)::int AS orders, COALESCE(sum(o.tong_dt),0)::bigint AS revenue, COALESCE(sum(o.ln_rong_sau_thue),0)::bigint AS net
         FROM sales_channels ch LEFT JOIN wholesale_orders o ON o.channel_id=ch.id AND ${live} GROUP BY ch.code, ch.name ORDER BY revenue DESC`),
      q(`SELECT i.product_id, i.product_name, sum(i.quantity)::int AS qty, sum(i.quantity*i.unit_price)::bigint AS revenue
         FROM order_items i JOIN wholesale_orders o ON o.id=i.order_id WHERE ${live} GROUP BY i.product_id, i.product_name ORDER BY revenue DESC LIMIT 10`),
      one(`SELECT count(*)::int AS total, count(*) FILTER (WHERE approved_by_label LIKE 'Tự động%')::int AS auto,
         count(*) FILTER (WHERE approval_status='PENDING')::int AS pending FROM wholesale_orders o WHERE o.created_at >= ${since}`),
      one(`SELECT count(*)::int AS total, count(*) FILTER (WHERE status='DA_BAO_GIA')::int AS quoted FROM rfqs WHERE created_at >= ${since}`),
    ]);
    const auto_rate = approval.total ? Math.round((approval.auto / approval.total) * 1000) / 10 : null;
    return json({ days, by_channel: byChannel, top_products: topProducts, approval: { ...approval, auto_rate_pct: auto_rate }, rfq });
  });
}
