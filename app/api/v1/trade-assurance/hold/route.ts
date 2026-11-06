import { apiAuth, json, handle } from '@/lib/api';
import { isUuid } from '@/lib/catalog';
import { markPaid, releaseEscrow, refundOrder } from '@/lib/orders';
import { one } from '@/lib/db';
import { can, currentUser } from '@/lib/auth';

// Spec #10 Trade Assurance. Input {order_id, action: HOLD|RELEASED|REFUND, reason?} → {status, amount_hold, refund_amount}.
// HOLD: ghi nhận tiền khách đã vào, giữ đến khi nhận hàng. RELEASED: giải ngân cho xưởng (CEO). REFUND: hoàn khách (CEO, cần lý do).
// Hệ thống chỉ ghi nhận; chuyển khoản thật do kế toán làm trên ngân hàng.
export async function POST(req: Request) {
  const a = await apiAuth(req, 'orders.payment');
  if (a instanceof Response) return a;
  return handle(async () => {
    const b = await req.json().catch(() => ({}));
    if (!isUuid(String(b.order_id ?? ''))) return json({ error: 'order_id không hợp lệ' }, 400);
    const action = String(b.action ?? 'HOLD').toUpperCase();
    if (action === 'HOLD') await markPaid(b.order_id, a.actor);
    else if (action === 'RELEASED' || action === 'REFUND') {
      // Giải ngân / hoàn tiền là quyết định của CEO: không nhận khóa API tự động.
      if (!can(await currentUser(), 'escrow.release')) return json({ error: 'Chỉ CEO đăng nhập mới giải ngân hoặc hoàn tiền' }, 403);
      if (action === 'RELEASED') await releaseEscrow(b.order_id, { kind: 'CEO', actor: a.actor });
      else await refundOrder(b.order_id, a.actor, String(b.reason ?? ''));
    } else return json({ error: 'action phải là HOLD, RELEASED hoặc REFUND' }, 400);
    const o = await one('SELECT id, code, status, trade_assurance_status, tong_dt, ship_fee FROM wholesale_orders WHERE id=$1', [b.order_id]);
    const amount = Number(o.tong_dt) + Number(o.ship_fee);
    return json({ order_id: o.id, code: o.code, status: o.trade_assurance_status, order_status: o.status,
      amount_hold: o.trade_assurance_status === 'HOLD' ? amount : 0, refund_amount: o.trade_assurance_status === 'REFUND' ? amount : 0 });
  });
}
