import { apiAuth, json, handle } from '@/lib/api';
import { tx } from '@/lib/db';
import { isUuid } from '@/lib/catalog';
import { audit } from '@/lib/audit';

// Spec #9. Input {order_id, type: DROPSHIP|WFS|SAME_DAY_30MIN} → {tracking_id, status, wfs_type}.
// Giao thẳng từ xưởng, kho taomua (WFS), hoặc giao 30 phút nội thành HCM. Chỉ đổi được trước khi gửi hàng.
const MAP: Record<string, string> = { DROPSHIP: 'DROPSHIP', WFS: 'WFS_FULFILLMENT', WFS_FULFILLMENT: 'WFS_FULFILLMENT', SAME_DAY_30MIN: 'SAME_DAY_30MIN' };

export async function POST(req: Request) {
  const a = await apiAuth(req, 'orders.fulfil');
  if (a instanceof Response) return a;
  return handle(async () => {
    const b = await req.json().catch(() => ({}));
    const mode = MAP[String(b.type ?? b.mode ?? '').toUpperCase()];
    if (!isUuid(String(b.order_id ?? '')) || !mode) return json({ error: 'Cần order_id và type DROPSHIP | WFS | SAME_DAY_30MIN' }, 400);
    return tx(async (c) => {
      const o = (await c.query('SELECT id, code, status, tracking_no FROM wholesale_orders WHERE id=$1 FOR UPDATE', [b.order_id])).rows[0];
      if (!o) return json({ error: 'Không tìm thấy đơn' }, 404);
      if (['DANG_GIAO', 'DA_GIAO', 'HOAN_TAT', 'HUY', 'TU_CHOI'].includes(o.status)) return json({ error: 'Đơn đã gửi hoặc đã đóng' }, 409);
      await c.query('UPDATE wholesale_orders SET wfs_status=$2, updated_at=now() WHERE id=$1', [o.id, mode]);
      await audit(a.actor, 'order.wfs', 'order', o.id, { code: o.code, mode }, c);
      return json({ order_id: o.id, code: o.code, tracking_id: o.tracking_no ?? null, status: o.status, wfs_type: mode, wfs_status: mode });
    });
  });
}
