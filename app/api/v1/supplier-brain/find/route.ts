import { apiAuth, json, handle } from '@/lib/api';
import { one, q } from '@/lib/db';
import { isUuid } from '@/lib/catalog';
import { trustScore } from '@/lib/trust';
import { supplierOk } from '@/lib/agents/rules';

// RYN-SUPPLY: xếp hạng các xưởng đã có cho một sản phẩm (chính, dự phòng, còn lại). Tìm xưởng mới trên 1688/Accio chờ API.
export async function POST(req: Request) {
  const a = await apiAuth(req, 'suppliers.edit');
  if (a instanceof Response) return a;
  return handle(async () => {
    const b = await req.json().catch(() => ({}));
    if (!isUuid(String(b.product_id ?? ''))) return json({ error: 'product_id không hợp lệ' }, 400);
    const p = await one('SELECT id, name, supplier_id, supplier_ids_backup FROM products WHERE id=$1', [b.product_id]);
    if (!p) return json({ error: 'Không tìm thấy sản phẩm' }, 404);
    const rows = (await q('SELECT id, name, source, country, defect_rate, on_time_rate, moq, price_1688, price_vn, response_time_sec, verified_cert, inventory_sync, is_simulated FROM suppliers'))
      .map((s) => {
        const trust = trustScore(s).score;
        const role = s.id === p.supplier_id ? 'CHINH' : (p.supplier_ids_backup as string[]).includes(s.id) ? 'DU_PHONG' : 'KHAC';
        return { id: s.id, name: s.name, source: s.source, country: s.country, role, trust_score: trust, defect_rate: Number(s.defect_rate),
          on_time_rate: Number(s.on_time_rate), moq: s.moq, price_1688: s.price_1688, price_vn: s.price_vn, dat_chuan: supplierOk({ ...s, trust_score: trust }), gia_lap: s.is_simulated };
      })
      .sort((x, y) => Number(y.dat_chuan) - Number(x.dat_chuan) || y.trust_score - x.trust_score);
    return json({ product: { id: p.id, name: p.name }, suppliers: rows, external_search: 'chưa kết nối 1688/Accio' });
  });
}
