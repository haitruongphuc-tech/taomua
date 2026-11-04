import { apiAuth, json, handle } from '@/lib/api';
import { trustScore } from '@/lib/trust';
import { one, q } from '@/lib/db';
import { isUuid } from '@/lib/catalog';
import { audit } from '@/lib/audit';

// Tính TrustScore (5 yếu tố tạm thời). Có supplier_id thì tính từ dữ liệu xưởng và lưu lại.
export async function POST(req: Request) {
  const a = await apiAuth(req, 'suppliers.edit');
  if (a instanceof Response) return a;
  return handle(async () => {
    const b = await req.json().catch(() => ({}));
    if (b.supplier_id) {
      if (!isUuid(String(b.supplier_id))) return json({ error: 'supplier_id không hợp lệ' }, 400);
      const s = await one('SELECT * FROM suppliers WHERE id=$1', [b.supplier_id]);
      if (!s) return json({ error: 'Không tìm thấy xưởng' }, 404);
      const t = trustScore(s);
      await q('UPDATE suppliers SET trust_score=$2 WHERE id=$1', [s.id, t.score]);
      await audit(a.actor, 'supplier.trust', 'supplier', s.id, { score: t.score });
      return json({ supplier_id: s.id, ...t });
    }
    const t = trustScore({
      response_time_sec: Number(b.response_time_sec ?? 3600), verified_cert: !!b.verified_cert,
      defect_rate: Number(b.defect_rate ?? 0.02), on_time_rate: Number(b.on_time_rate ?? 0.9), inventory_sync: !!b.inventory_sync,
    });
    return json(t);
  });
}
