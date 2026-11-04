import { apiAuth, json, handle } from '@/lib/api';
import { one } from '@/lib/db';
import { isUuid } from '@/lib/catalog';
import { notifyApproval } from '@/lib/telegram';

// Gửi (lại) yêu cầu duyệt một đơn qua Telegram tới người có quyền duyệt cấp đó.
export async function POST(req: Request) {
  const a = await apiAuth(req, 'orders.view');
  if (a instanceof Response) return a;
  return handle(async () => {
    const b = await req.json().catch(() => ({}));
    if (!isUuid(String(b.order_id ?? ''))) return json({ error: 'order_id không hợp lệ' }, 400);
    const o = await one("SELECT id, code, tong_dt, bien_rong_tren_chi_phi, cap_duyet, approval_status FROM wholesale_orders WHERE id=$1", [b.order_id]);
    if (!o) return json({ error: 'Không tìm thấy đơn' }, 404);
    if (o.approval_status !== 'PENDING') return json({ error: 'Đơn không còn chờ duyệt' }, 409);
    return json(await notifyApproval(o));
  });
}
