import { one } from './db';
import { audit, type Actor } from './audit';
import { analyzeProduct } from './pricing';
import { UserError } from './action';
import { isUuid } from './catalog';

const int = (v: FormDataEntryValue | null, def: number | null = null) => {
  const s = String(v ?? '').trim();
  if (s === '') return def;
  const n = Math.round(Number(s));
  if (!Number.isFinite(n) || n < 0) throw new UserError('Số không hợp lệ.');
  return n;
};

/** Lưu sản phẩm từ form quản trị. Trả về danh sách cảnh báo biên (không chặn lưu). */
export async function saveProduct(fd: FormData, actor: Actor) {
  const id = String(fd.get('id') ?? '');
  const d = {
    sku: String(fd.get('sku') ?? '').trim().slice(0, 40),
    name: String(fd.get('name') ?? '').trim().slice(0, 300),
    category: String(fd.get('category') ?? '').trim().slice(0, 80),
    description: String(fd.get('description') ?? '').slice(0, 5000),
    image_emoji: String(fd.get('image_emoji') ?? '📦').slice(0, 8) || '📦',
    trend_score: Math.min(100, int(fd.get('trend_score'), 0)!),
    supplier_id: isUuid(String(fd.get('supplier_id') ?? '')) ? String(fd.get('supplier_id')) : null,
    cost: int(fd.get('cost'))!, fee: int(fd.get('fee'), 0)!, input_vat: int(fd.get('input_vat'), 0)!,
    price_taomua_10: int(fd.get('price_taomua_10'))!, price_taomua_50: int(fd.get('price_taomua_50'))!,
    price_taomua_100: int(fd.get('price_taomua_100'))!, price_taomua_500: int(fd.get('price_taomua_500'))!,
    moq: Math.max(1, int(fd.get('moq'), 10)!),
    status: String(fd.get('status') ?? 'PRICING'),
    stock_note: String(fd.get('stock_note') ?? '').slice(0, 200) || 'Giao thẳng từ xưởng',
    latr_test_qty: int(fd.get('latr_test_qty')),
    latr_ctr: fd.get('latr_ctr') ? Number(fd.get('latr_ctr')) : null,
    published: fd.get('published') === 'on',
    is_simulated: fd.get('is_simulated') === 'on',
  };
  if (!d.sku || !d.name || !d.category) throw new UserError('Cần mã SKU, tên và danh mục.');
  if (!(d.cost > 0)) throw new UserError('Giá vốn phải lớn hơn 0.');
  if ([d.price_taomua_10, d.price_taomua_50, d.price_taomua_100, d.price_taomua_500].some((x) => !(x > 0))) throw new UserError('Cần đủ 4 bậc giá.');
  if (d.input_vat >= d.cost + d.fee) throw new UserError('VAT đầu vào phải nhỏ hơn tổng chi phí.');
  const a = analyzeProduct(d);
  const cols = Object.keys(d);
  const vals = Object.values(d);
  let row;
  try {
    if (id) {
      if (!isUuid(id)) throw new UserError('Sản phẩm không hợp lệ.');
      row = await one(`UPDATE products SET ${cols.map((c, i) => `${c}=$${i + 2}`).join(', ')}, updated_at=now() WHERE id=$1 RETURNING id`, [id, ...vals]);
    } else {
      row = await one(`INSERT INTO products(${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`, vals);
    }
  } catch (e: any) {
    if (e?.code === '23505') throw new UserError('Mã SKU đã tồn tại.');
    if (e?.code === '23514') throw new UserError('Dữ liệu không hợp lệ (trạng thái hoặc giá trị ngoài giới hạn).');
    throw e;
  }
  if (!row) throw new UserError('Không tìm thấy sản phẩm.');
  await audit(actor, id ? 'product.update' : 'product.create', 'product', row.id, { sku: d.sku, prices: [d.price_taomua_10, d.price_taomua_50, d.price_taomua_100, d.price_taomua_500], cost: d.cost + d.fee, warnings: a.warnings });
  return { id: row.id as string, warnings: a.warnings };
}
