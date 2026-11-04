import { apiAuth, json, handle } from '@/lib/api';
import { tx } from '@/lib/db';
import { isUuid } from '@/lib/catalog';
import { audit } from '@/lib/audit';

const MODES = ['DROPSHIP', 'WFS_FULFILLMENT', 'SAME_DAY_30MIN'];

// Chọn hình thức giao: giao thẳng từ xưởng, kho taomua, hoặc giao 30 phút nội thành HCM. Chỉ đổi được trước khi gửi hàng.
export async function POST(req: Request) {
  const a = await apiAuth(req, 'orders.fulfil');
  if (a instanceof Response) return a;
  return handle(async () => {
    const b = await req.json().catch(() => ({}));
    if (!isUuid(String(b.order_id ?? '')) || !MODES.includes(b.mode)) return json({ error: 'Cần order_id và mode hợp lệ' }, 400);
    return tx(async (c) => {
      const o = (await c.query('SELECT id, code, status FROM wholesale_orders WHERE id=$1 FOR UPDATE', [b.order_id])).rows[0];
      if (!o) return json({ error: 'Không tìm thấy đơn' }, 404);
      if (['DANG_GIAO', 'DA_GIAO', 'HOAN_TAT', 'HUY', 'TU_CHOI'].includes(o.status)) return json({ error: 'Đơn đã gửi hoặc đã đóng' }, 409);
      await c.query('UPDATE wholesale_orders SET wfs_status=$2, updated_at=now() WHERE id=$1', [o.id, b.mode]);
      await audit(a.actor, 'order.wfs', 'order', o.id, { code: o.code, mode: b.mode }, c);
      return json({ order_id: o.id, wfs_status: b.mode });
    });
  });
}
