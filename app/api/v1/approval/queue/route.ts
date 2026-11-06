import { apiAuth, json, handle } from '@/lib/api';
import { currentUser } from '@/lib/auth';
import { loadQueue, qacCreateExternal, qacStatus } from '@/lib/qac';

// Spec 03_API_SPEC.md #5 — thay Telegram.
// GET: hàng đợi Quick Approve Center (người đăng nhập), hoặc ?id=LOAI:uuid để n8n hỏi trạng thái.
// POST: n8n gửi một việc cần duyệt {product_name, bien, cap, price, total_cost, quantity, tier, method}.
export async function GET(req: Request) {
  const a = await apiAuth(req, 'orders.view');
  if (a instanceof Response) return a;
  return handle(async () => {
    const id = new URL(req.url).searchParams.get('id');
    if (id) {
      const s = await qacStatus(id);
      return s ? json({ approval_id: id, ...s }) : json({ error: 'Không tìm thấy' }, 404);
    }
    const u = await currentUser();
    const items = await loadQueue(u ?? { id: '', email: '', name: 'n8n', role: 'NHAN_VIEN' });
    return json({ items, count: items.length, mine: items.filter((i) => i.can_decide).length, at: new Date().toISOString() });
  });
}

export async function POST(req: Request) {
  const a = await apiAuth(req, 'agents.run');
  if (a instanceof Response) return a;
  return handle(async () => json(await qacCreateExternal(await req.json().catch(() => ({})), a.actor)));
}
