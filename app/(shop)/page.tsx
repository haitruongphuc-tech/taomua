import Link from 'next/link';
import { listProducts, categories } from '@/lib/catalog';
import ProductCard from '@/components/ProductCard';

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
  const link = (patch: Partial<SP>) => {
    const p = new URLSearchParams();
    const merged = { ...searchParams, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, String(v));
    const s = p.toString();
    return s ? `/?${s}` : '/';
  };
  return (
    <div className="stack">
      <section className="hero">
        <h1>Nguồn hàng sỉ từ xưởng, giá theo số lượng</h1>
        <p>Mỗi sản phẩm có xưởng chính và xưởng dự phòng, chấm điểm TrustScore. Giá giảm theo 4 bậc 10, 50, 100, 500 cái. Tiền được giữ đến khi bạn nhận hàng.</p>
        <div className="row">
          <Link href="/bao-gia" className="btn">Chưa thấy hàng cần? Gửi yêu cầu báo giá</Link>
        </div>
      </section>

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
