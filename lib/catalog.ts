import { q, one } from './db';
import { parseQuery, matchesWords } from './nlsearch';

// Chỉ các cột khách được xem. Không bao giờ trả giá vốn, phí, VAT đầu vào hay biên.
const PUBLIC_COLS = `p.id, p.sku, p.name, p.category, p.description, p.image_emoji, p.trend_score, p.moq, p.stock_note,
  p.price_taomua_10, p.price_taomua_50, p.price_taomua_100, p.price_taomua_500, p.is_simulated,
  s.name AS supplier_name, s.country AS supplier_country, s.years_active AS supplier_years, s.trust_score, s.verified_cert`;

export type PublicProduct = {
  id: string; sku: string; name: string; category: string; description: string; image_emoji: string; trend_score: number; moq: number;
  stock_note: string; price_taomua_10: number; price_taomua_50: number; price_taomua_100: number; price_taomua_500: number;
  is_simulated: boolean; supplier_name: string | null; supplier_country: string | null; supplier_years: number | null;
  trust_score: number | null; verified_cert: boolean | null;
};

/** Danh mục công khai. q là câu tìm kiếm tự nhiên (lib/nlsearch.ts): hiểu "dưới 50k", "hot", "rẻ nhất", ngành hàng, chữ không dấu. */
export async function listProducts(opts: { q?: string; category?: string; minTrust?: number; maxPrice?: number; sort?: string }): Promise<PublicProduct[]> {
  if (opts.q) {
    const cats = await categories();
    const pq = parseQuery(opts.q, cats);
    const rows: PublicProduct[] = await listProducts({ category: opts.category || pq.category, minTrust: opts.minTrust || pq.minTrust,
      maxPrice: opts.maxPrice || pq.maxPrice, sort: opts.sort || (pq.sort === 'hot' ? undefined : pq.sort) });
    return rows.filter((p) => matchesWords(p, pq.words));
  }
  const where = ['p.published'];
  const params: unknown[] = [];
  if (opts.category) { params.push(opts.category); where.push(`p.category = $${params.length}`); }
  if (opts.minTrust) { params.push(opts.minTrust); where.push(`s.trust_score >= $${params.length}`); }
  if (opts.maxPrice) { params.push(opts.maxPrice); where.push(`p.price_taomua_10 <= $${params.length}`); }
  const order = opts.sort === 'gia' ? 'p.price_taomua_10 ASC' : opts.sort === 'trust' ? 's.trust_score DESC NULLS LAST' : 'p.trend_score DESC';
  return q<PublicProduct>(`SELECT ${PUBLIC_COLS} FROM products p LEFT JOIN suppliers s ON s.id=p.supplier_id
    WHERE ${where.join(' AND ')} ORDER BY ${order}, p.name LIMIT 200`, params);
}

export async function categories() {
  return (await q<{ category: string }>('SELECT DISTINCT category FROM products WHERE published ORDER BY 1')).map((r) => r.category);
}

export const isUuid = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

export async function getProduct(id: string) {
  if (!isUuid(id)) return null;
  return one<PublicProduct>(`SELECT ${PUBLIC_COLS} FROM products p LEFT JOIN suppliers s ON s.id=p.supplier_id WHERE p.id=$1 AND p.published`, [id]);
}

/** Giá trên nền tảng khác — chỉ hiện giá đã kiểm tra trong 30 ngày. */
export async function priceComparisons(productId: string) {
  return q<{ platform: string; price: number; qty_basis: number; source_url: string; checked_at: string }>(
    `SELECT platform, price, qty_basis, source_url, checked_at FROM price_comparisons
     WHERE product_id=$1 AND checked_at > now() - interval '30 days' ORDER BY price`, [productId]);
}
