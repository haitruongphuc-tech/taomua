import Link from 'next/link';
import { listProducts, categories } from '@/lib/catalog';
import ProductCard from '@/components/ProductCard';
import AiSearch from '@/components/AiSearch';
import ProfitCalc from '@/components/ProfitCalc';
import { parseQuery } from '@/lib/nlsearch';
import { siteContent } from '@/lib/site';
import { q } from '@/lib/db';
import { vnd } from '@/lib/format';

export const dynamic = 'force-dynamic';

type SP = { q?: string; dm?: string; trust?: string; gia?: string; sort?: string };

export default async function Home({ searchParams }: { searchParams: SP }) {
  const qtext = (searchParams.q ?? '').slice(0, 100);
  const minTrust = Number(searchParams.trust) || undefined;
  const maxPrice = Number(searchParams.gia) || undefined;
  const [items, cats] = await Promise.all([
    listProducts({ q: qtext, category: searchParams.dm, minTrust, maxPrice, sort: searchParams.sort }),
    categories(),
  ]);
  const site = await siteContent();
  const understood = qtext ? parseQuery(qtext, cats).explain : [];
  // So sánh giá đối thủ (spec): chỉ giá đã kiểm tra trong 30 ngày, có link nguồn.
  const comps = await q(`SELECT DISTINCT ON (p.id) p.id, p.name, p.price_taomua_10, p.price_taomua_500, c.platform, c.price, c.qty_basis, c.source_url, c.checked_at
    FROM price_comparisons c JOIN products p ON p.id=c.product_id
    WHERE p.published AND c.checked_at > now() - interval '30 days' ORDER BY p.id, c.price / GREATEST(c.qty_basis,1) DESC LIMIT 6`);
  const link = (patch: Partial<SP>) => {
    const p = new URLSearchParams();
    const merged = { ...searchParams, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, String(v));
    const s = p.toString();
    return s ? `/?${s}` : '/';
  };
  return (
    <div className="stack">
      <section className="hero stack">
        <h1 style={{ margin: 0 }}>{site.hero_title}</h1>
        <p style={{ margin: 0 }}>{site.hero_text}</p>
        <AiSearch initial={qtext} />
        {understood.length > 0 && <div className="small">AI hiểu bạn tìm: {understood.join(' · ')}</div>}
        <div className="row">
          <Link href="/bao-gia" className="btn secondary">{site.hero_cta}</Link>
          <Link href="/shop" className="btn secondary">9mua mua lẻ từ 1 cái</Link>
        </div>
      </section>

      {!qtext && items.length > 0 && (
        <ProfitCalc products={items.slice(0, 8).map((p) => ({ id: p.id, name: p.name, emoji: p.image_emoji, moq: p.moq,
          prices: { 10: Number(p.price_taomua_10), 50: Number(p.price_taomua_50), 100: Number(p.price_taomua_100), 500: Number(p.price_taomua_500) } }))} />
      )}

      {!qtext && comps.length > 0 && (
        <section className="card stack">
          <h2 style={{ margin: 0 }}>So sánh giá với nơi khác <span className="muted small">giá đã kiểm tra trong 30 ngày</span></h2>
          <div className="table-wrap"><table className="small">
            <thead><tr><th>Sản phẩm</th><th>Nơi bán</th><th className="num">Giá nơi khác / cái</th><th className="num">taomua 10+</th><th className="num">taomua 500+</th><th>Chênh lệch</th></tr></thead>
            <tbody>{comps.map((c) => {
              const unit = Number(c.price) / Math.max(1, Number(c.qty_basis));
              const diff = ((unit - Number(c.price_taomua_500)) / unit) * 100;
              return (
                <tr key={c.id}><td><Link href={`/san-pham/${c.id}`}>{c.name}</Link></td>
                  <td><a href={c.source_url} target="_blank" rel="noopener noreferrer nofollow">{c.platform}</a></td>
                  <td className="num">{vnd(unit)}</td><td className="num">{vnd(c.price_taomua_10)}</td><td className="num">{vnd(c.price_taomua_500)}</td>
                  <td>{diff >= 0 ? <span className="badge ok">rẻ hơn đến {diff.toFixed(0)}%</span> : <span className="badge warn">đắt hơn {(-diff).toFixed(0)}%</span>}</td></tr>
              );
            })}</tbody>
          </table></div>
        </section>
      )}

      <section className="card stack">
        <div className="chips" aria-label="Danh mục">
          <Link className={`chip ${!searchParams.dm ? 'on' : ''}`} href={link({ dm: undefined })}>Tất cả</Link>
          {cats.map((c) => <Link key={c} className={`chip ${searchParams.dm === c ? 'on' : ''}`} href={link({ dm: c })}>{c}</Link>)}
        </div>
        <form className="form-grid" action="/">
          {qtext && <input type="hidden" name="q" value={qtext} />}
          {searchParams.dm && <input type="hidden" name="dm" value={searchParams.dm} />}
          <label className="field">TrustScore tối thiểu
            <select name="trust" defaultValue={searchParams.trust ?? ''}>
              <option value="">Bất kỳ</option><option value="70">từ 70</option><option value="80">từ 80</option><option value="90">từ 90</option>
            </select>
          </label>
          <label className="field">Giá bậc 10 tối đa (đ)
            <input name="gia" type="number" min={0} step={1000} defaultValue={searchParams.gia ?? ''} />
          </label>
          <label className="field">Sắp xếp
            <select name="sort" defaultValue={searchParams.sort ?? ''}>
              <option value="">Đang hot</option><option value="gia">Giá thấp trước</option><option value="trust">TrustScore cao trước</option>
            </select>
          </label>
          <div style={{ alignSelf: 'end' }}><button className="btn blue" type="submit">Lọc</button></div>
        </form>
      </section>

      <div className="row spread">
        <h2 style={{ margin: 0 }}>{qtext ? `Kết quả cho “${qtext}”` : 'Sản phẩm'}</h2>
        <span className="muted small">{items.length} sản phẩm</span>
      </div>
      {items.length === 0 ? (
        <div className="card">Không tìm thấy sản phẩm phù hợp. <Link href="/bao-gia">Gửi yêu cầu báo giá</Link> để taomua tìm xưởng cho bạn.</div>
      ) : (
        <div className="grid cols-3">{items.map((p) => <ProductCard key={p.id} p={p} />)}</div>
      )}
    </div>
  );
}
