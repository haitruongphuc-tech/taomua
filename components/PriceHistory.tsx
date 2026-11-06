// Lịch sử giá sỉ 365 ngày (spec: Price history 365 days, học Amazon) — giá bậc 10+ và 500+, vẽ SVG phía máy chủ.
import { q } from '@/lib/db';

export default async function PriceHistory({ productId }: { productId: string }) {
  const rows = await q<{ price_10: number; price_500: number; recorded_at: string }>(
    `SELECT price_10, price_500, recorded_at FROM product_price_history WHERE product_id=$1 AND recorded_at > now() - interval '365 days' ORDER BY recorded_at`, [productId]);
  if (!rows.length) return null;
  const pts = [...rows, { ...rows[rows.length - 1], recorded_at: new Date().toISOString() }];
  const t0 = new Date(pts[0].recorded_at).getTime(), t1 = Math.max(t0 + 1, Date.now());
  const vals = pts.flatMap((r) => [Number(r.price_10), Number(r.price_500)]);
  const lo = Math.min(...vals) * 0.95, hi = Math.max(...vals) * 1.05;
  const W = 560, H = 120;
  const x = (t: string) => ((new Date(t).getTime() - t0) / (t1 - t0)) * W;
  const y = (v: number) => H - ((Number(v) - lo) / (hi - lo || 1)) * H;
  // Giá giữ nguyên tới lần đổi sau: vẽ dạng bậc thang.
  const path = (k: 'price_10' | 'price_500') => pts.map((r, i) => `${i ? `H${x(r.recorded_at).toFixed(1)}V` : 'M0,'}${y(r[k]).toFixed(1)}`).join(' ');
  const min10 = Math.min(...rows.map((r) => Number(r.price_10)));
  const now10 = Number(rows[rows.length - 1].price_10);
  return (
    <section className="card stack">
      <h2 style={{ margin: 0 }}>Lịch sử giá 365 ngày</h2>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="Biểu đồ lịch sử giá sỉ">
        <path d={path('price_10')} fill="none" stroke="var(--blue)" strokeWidth={2} />
        <path d={path('price_500')} fill="none" stroke="var(--orange)" strokeWidth={2} />
      </svg>
      <div className="small"><span style={{ color: 'var(--blue)' }}>■</span> giá 10+ · <span style={{ color: 'var(--orange)' }}>■</span> giá 500+ · {rows.length} lần đổi giá.
        {now10 <= min10 ? ' Giá 10+ hiện đang thấp nhất 365 ngày.' : ` Thấp nhất 365 ngày: ${min10.toLocaleString('vi-VN')} đ.`}</div>
    </section>
  );
}
