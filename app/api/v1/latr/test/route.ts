import { apiAuth, json, handle } from '@/lib/api';
import { isUuid } from '@/lib/catalog';
import { one } from '@/lib/db';
import { audit } from '@/lib/audit';
import { latrDecision } from '@/lib/agents/rules';

// Ghi kết quả bán thử (LATR) 50-100 cái. CTR trên 3% mới khuyến nghị nhập lớn; quyết định nhập vẫn do người duyệt.
export async function POST(req: Request) {
  const a = await apiAuth(req, 'products.edit');
  if (a instanceof Response) return a;
  return handle(async () => {
    const b = await req.json().catch(() => ({}));
    const qty = Math.round(Number(b.test_qty));
    const ctr = Number(b.ctr);
    if (!isUuid(String(b.product_id ?? ''))) return json({ error: 'product_id không hợp lệ' }, 400);
    if (!(qty >= 50 && qty <= 100)) return json({ error: 'test_qty phải từ 50 đến 100' }, 400);
    if (!(ctr >= 0 && ctr <= 100)) return json({ error: 'ctr là phần trăm 0-100' }, 400);
    const p = await one("UPDATE products SET latr_test_qty=$2, latr_ctr=$3, status=CASE WHEN status IN ('PRICING','APPROVED') THEN 'LATR_TEST' ELSE status END, updated_at=now() WHERE id=$1 RETURNING id, name, status", [b.product_id, qty, ctr]);
    if (!p) return json({ error: 'Không tìm thấy sản phẩm' }, 404);
    await audit(a.actor, 'product.latr', 'product', p.id, { qty, ctr });
    const d = latrDecision(ctr);
    return json({ ...p, test_id: p.id, test_qty: qty, ctr, latr_status: d === 'SCALE' ? 'SCALING' : d === 'STOP' ? 'STOPPED' : 'TESTING',
      recommendation: d === 'SCALE' ? 'CTR > 3%: RYN-SALES đề xuất nhập lớn (CEO duyệt).' : d === 'STOP' ? 'CTR < 2%: RYN-SALES tạm dừng để tránh tồn kho.' : 'CTR 2–3%: tiếp tục bán thử.' });
  });
}
