import { apiAuth, json, handle } from '@/lib/api';
import { isUuid } from '@/lib/catalog';
import { markPaid } from '@/lib/orders';
import { one } from '@/lib/db';

// Ghi nhận đã nhận tiền của đơn và chuyển sang giữ tiền. Tiền chỉ giải ngân khi khách hoặc CEO xác nhận.
export async function POST(req: Request) {
  const a = await apiAuth(req, 'orders.payment');
  if (a instanceof Response) return a;
  return handle(async () => {
    const b = await req.json().catch(() => ({}));
    if (!isUuid(String(b.order_id ?? ''))) return json({ error: 'order_id không hợp lệ' }, 400);
    await markPaid(b.order_id, a.actor);
    return json(await one('SELECT id, code, status, trade_assurance_status FROM wholesale_orders WHERE id=$1', [b.order_id]));
  });
}
