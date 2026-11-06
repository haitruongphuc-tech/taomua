import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getProduct, priceComparisons } from '@/lib/catalog';
import AddToCart from '@/components/AddToCart';
import TraceQr from '@/components/TraceQr';
import PriceHistory from '@/components/PriceHistory';
import ProductVideo from '@/components/ProductVideo';
import ArView from '@/components/ArView';
import { simVideoScript } from '@/lib/sim';
import { connectorEnabled } from '@/lib/connectors';
import { one } from '@/lib/db';
import { Trust } from '@/components/ProductCard';
import { vnd, dt } from '@/lib/format';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: { id: string } }) {
  const p = await getProduct(params.id);
  return { title: p?.name ?? 'Sản phẩm' };
}

export default async function ProductPage({ params }: { params: { id: string } }) {
  const p = await getProduct(params.id);
  if (!p) notFound();
  const comps = await priceComparisons(p.id);
  const i18n = (await one('SELECT name_i18n FROM products WHERE id=$1', [p.id]))?.name_i18n ?? {};
  const scripts = simVideoScript({ name: p.name, price10: Number(p.price_taomua_10), price500: Number(p.price_taomua_500) }, i18n);
  const ours = p.price_taomua_10;
  return (
    <div className="stack">
      <div className="small"><Link href="/">Sản phẩm</Link> › <Link href={`/?dm=${encodeURIComponent(p.category)}`}>{p.category}</Link></div>
      <div className="grid cols-2">
        <div className="card pcard">
          <div className="emoji" style={{ fontSize: '5rem' }} aria-hidden>{p.image_emoji}</div>
          {p.is_simulated && <div className="alert warn small">Sản phẩm giả lập để chạy thử, chưa nhận đơn thật.</div>}
        </div>
        <div className="card stack">
          <h1>{p.name}</h1>
          <div className="muted">Mã {p.sku} · {p.stock_note}</div>
          <p>{p.description}</p>
          <ArView emoji={p.image_emoji} name={p.name} />
          <AddToCart id={p.id} moq={p.moq} prices={{ 10: p.price_taomua_10, 50: p.price_taomua_50, 100: p.price_taomua_100, 500: p.price_taomua_500 }} />
        </div>
      </div>

      <div className="grid cols-2">
        <section className="card stack">
          <h2>Xưởng sản xuất</h2>
          <div><strong>{p.supplier_name}</strong> · {p.supplier_country} · {p.supplier_years} năm hoạt động</div>
          <Trust score={p.trust_score} verified={p.verified_cert} />
          <TraceQr sku={p.sku} />
          <p className="muted small">TrustScore tính từ tốc độ phản hồi, chứng nhận, tỷ lệ lỗi, tỷ lệ giao đúng hạn và đồng bộ tồn kho. Mỗi sản phẩm có xưởng dự phòng nếu xưởng chính gặp sự cố.</p>
        </section>
        <section className="card stack">
          <h2>Thanh toán an toàn</h2>
          <p>Bạn chuyển khoản sau khi đơn được xác nhận. taomua giữ tiền và chỉ chuyển cho xưởng khi bạn xác nhận đã nhận và kiểm tra hàng.</p>
          <p className="muted small">Hàng lỗi được hoàn tiền từ khoản đang giữ.</p>
        </section>
      </div>

      <ProductVideo emoji={p.image_emoji} name={p.name} scripts={scripts} live={connectorEnabled('HEYGEN')} />

      <PriceHistory productId={p.id} />

      <section className="card stack">
        <h2>So sánh giá</h2>
        {comps.length === 0 ? (
          <p className="muted">Chưa có giá đối chiếu được kiểm tra trong 30 ngày qua.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Nơi bán</th><th className="num">Giá mỗi cái</th><th className="num">taomua (bậc 10)</th><th>Chênh lệch</th><th>Kiểm tra lúc</th></tr></thead>
              <tbody>
                {comps.map((c, i) => {
                  const unit = c.price / c.qty_basis;
                  const diff = ((unit - ours) / unit) * 100;
                  return (
                    <tr key={i}>
                      <td><a href={c.source_url} target="_blank" rel="noopener noreferrer nofollow">{c.platform}</a></td>
                      <td className="num">{vnd(unit)}</td>
                      <td className="num">{vnd(ours)}</td>
                      <td>{diff >= 0
                        ? <span className="badge ok">taomua rẻ hơn {diff.toFixed(1)}%</span>
                        : <span className="badge warn">taomua đắt hơn {(-diff).toFixed(1)}%</span>}</td>
                      <td className="small muted">{dt(c.checked_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="muted small">Giá nơi khác do nhân viên taomua kiểm tra kèm đường dẫn nguồn, có thể đã thay đổi. Giá không được kiểm tra lại trong 30 ngày sẽ tự ẩn.</p>
      </section>
    </div>
  );
}
