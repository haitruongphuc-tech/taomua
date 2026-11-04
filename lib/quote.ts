import { q } from './db';
import { tierFor, priceForTier } from './pricing';
import { isUuid } from './catalog';

export type QuoteLine = { id: string; name: string; emoji: string; qty: number; tier: number | null; unit: number; total: number; error?: string; moq: number };

/** Tính giá giỏ hàng kênh taomua.com ở máy chủ (không tin giá từ trình duyệt). */
export async function quoteCart(lines: { id: string; qty: number }[]) {
  const ids = lines.map((l) => l.id).filter(isUuid).slice(0, 50);
  const rows = ids.length ? await q(
    `SELECT id, name, image_emoji, moq, price_taomua_10, price_taomua_50, price_taomua_100, price_taomua_500
     FROM products WHERE published AND id = ANY($1)`, [ids]) : [];
  const out: QuoteLine[] = [];
  for (const l of lines.slice(0, 50)) {
    const p = rows.find((r: any) => r.id === l.id);
    const qty = Math.floor(Number(l.qty)) || 0;
    if (!p) { out.push({ id: l.id, name: 'Sản phẩm không còn bán', emoji: '❔', qty, tier: null, unit: 0, total: 0, moq: 0, error: 'Không còn bán' }); continue; }
    const tier = tierFor(qty);
    const min = Math.max(10, p.moq);
    const error = !tier || qty < min ? `Tối thiểu ${min} cái` : undefined;
    const unit = tier ? priceForTier(p, tier) : 0;
    out.push({ id: p.id, name: p.name, emoji: p.image_emoji, qty, tier, unit, total: error ? 0 : unit * qty, moq: min, error });
  }
  return { lines: out, total: out.reduce((s, l) => s + l.total, 0), ok: out.length > 0 && out.every((l) => !l.error) };
}
