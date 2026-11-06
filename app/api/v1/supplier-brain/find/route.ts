import { apiAuth, json, handle } from '@/lib/api';
import { one } from '@/lib/db';
import { isUuid } from '@/lib/catalog';
import { loadCandidates, guessCategory } from '@/lib/sourcing-db';
import { rankCandidates, recommend } from '@/lib/sourcing';
import { externalSourceStatus } from '@/lib/connectors';

// Spec #2. Input {product_name, category} (hoặc product_id, quantity) → {suppliers: [{name, source, trust_score, price, moq, defect_rate}]}, tối đa 50 xưởng + 3 dự phòng.
// RYN-SUPPLY xếp hạng xưởng và báo giá có trong hệ thống; tìm mới trên 1688 / Accio khi có khóa API.
export async function POST(req: Request) {
  const a = await apiAuth(req, 'suppliers.edit');
  if (a instanceof Response) return a;
  return handle(async () => {
    const b = await req.json().catch(() => ({}));
    let name = String(b.product_name ?? '').trim();
    let category: string | null = String(b.category ?? '').trim() || null;
    let productId: string | null = null;
    let fee = 0;
    if (b.product_id) {
      if (!isUuid(String(b.product_id))) return json({ error: 'product_id không hợp lệ' }, 400);
      const p = await one('SELECT id, name, category, fee FROM products WHERE id=$1', [b.product_id]);
      if (!p) return json({ error: 'Không tìm thấy sản phẩm' }, 404);
      productId = p.id; name ||= p.name; category ||= p.category; fee = Number(p.fee);
    }
    if (name.length < 2) return json({ error: 'Cần product_name hoặc product_id' }, 400);
    category ??= await guessCategory(name);
    const need = { productId, category, text: name, quantity: Math.max(1, Math.round(Number(b.quantity) || 100)), feePerUnit: fee, country: String(b.country ?? 'VN') };
    const ranked = rankCandidates(need, await loadCandidates());
    const rec = recommend(need, ranked);
    const row = (x: (typeof ranked)[number]) => ({
      supplier_id: x.supplier.id, name: x.supplier.name, source: (x.supplier as any).source ?? null, country: x.supplier.country ?? null,
      trust_score: x.supplier.trust_score, price: x.offer?.unit_cost ?? null, moq: x.offer?.moq ?? null, defect_rate: Number(x.supplier.defect_rate),
      lead_time_days: x.offer?.lead_time_days ?? x.supplier.lead_time_days ?? null, dat_chuan: x.eligible, score: x.score, ghi_chu: x.reasons,
    });
    return json({
      product_name: name, category, suppliers: ranked.slice(0, 50).map(row),
      recommended: rec ? row(rec.primary) : null, backup: rec ? rec.backups.map(row) : [],
      external_search: externalSourceStatus('1688'),
    });
  });
}
