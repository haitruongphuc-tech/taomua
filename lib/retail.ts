// /shop — 9mua.com bán lẻ (spec 04_FRONTEND_PAGES.md trang 3): khách lẻ mua từ 1 cái theo giá niêm yết trên kênh 9mua.
// 9mua là một kênh bán của taomua: đơn đi qua cùng quy trình (duyệt theo cấp, giữ tiền, đối soát), phí kênh tính vào biên.
import { q } from './db';
import { isUuid } from './catalog';

export const RETAIL_CHANNEL = '9mua';
export const RETAIL_MAX_QTY = 9; // lẻ: tối đa 9 cái mỗi sản phẩm; từ 10 cái mời mua sỉ ở taomua.com

export type RetailItem = {
  id: string; sku: string; name: string; category: string; description: string; image_emoji: string; trend_score: number;
  price: number; wholesale_10: number; is_simulated: boolean; trust_score: number | null; latr_ctr: number | null;
};

/** Sản phẩm đang bán trên kênh 9mua (chỉ cột khách được xem), hot trước. */
export async function listRetail(): Promise<RetailItem[]> {
  return q<RetailItem>(`SELECT p.id, p.sku, p.name, p.category, p.description, p.image_emoji, p.trend_score, l.price::bigint AS price,
      p.price_taomua_10 AS wholesale_10, p.is_simulated, s.trust_score, p.latr_ctr
    FROM channel_listings l JOIN sales_channels ch ON ch.id=l.channel_id JOIN products p ON p.id=l.product_id
    LEFT JOIN suppliers s ON s.id=p.supplier_id
    WHERE ch.code=$1 AND ch.active AND l.status='DANG_BAN' AND p.published AND p.status <> 'PAUSED'
    ORDER BY p.trend_score DESC, p.name`, [RETAIL_CHANNEL]);
}

/** Kiểm tra giỏ lẻ ở máy chủ: chỉ sản phẩm đang bán trên 9mua, 1–9 cái; giá lấy từ máy chủ. */
export async function quoteRetail(lines: { id: string; qty: number }[]) {
  const ids = lines.map((l) => l.id).filter(isUuid).slice(0, 20);
  const items = ids.length ? (await listRetail()).filter((i) => ids.includes(i.id)) : [];
  const out = lines.slice(0, 20).map((l) => {
    const it = items.find((i) => i.id === l.id);
    const qty = Math.floor(Number(l.qty)) || 0;
    if (!it) return { id: l.id, name: 'Sản phẩm không còn bán lẻ', qty, unit: 0, total: 0, error: 'Không còn bán' };
    const error = qty < 1 ? 'Số lượng từ 1' : qty > RETAIL_MAX_QTY ? `Lẻ tối đa ${RETAIL_MAX_QTY} cái; từ 10 cái mua sỉ rẻ hơn ở taomua.com` : undefined;
    return { id: it.id, name: it.name, qty, unit: Number(it.price), total: error ? 0 : Number(it.price) * qty, error };
  });
  return { lines: out, total: out.reduce((s, l) => s + l.total, 0), ok: out.length > 0 && out.every((l) => !l.error) };
}
