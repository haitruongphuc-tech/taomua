import { json, handle } from '@/lib/api';
import { currentUser, actorOf } from '@/lib/auth';
import { qacDecide, qacStatus } from '@/lib/qac';

// Spec 03_API_SPEC.md #6 — duyệt 1 chạm. Chỉ người đã đăng nhập (không nhận khóa API: quyết định phải là của người).
// Body: {approval_id: "ORDER:uuid" | "PAYOUT:uuid" | "AI:uuid", action: "APPROVED" | "REJECTED", note?, password?}
export async function POST(req: Request) {
  const u = await currentUser();
  if (!u) return json({ error: 'Chưa đăng nhập' }, 401);
  return handle(async () => {
    const b = await req.json().catch(() => ({}));
    const action = b.action === 'APPROVED' ? 'APPROVED' : b.action === 'REJECTED' ? 'REJECTED' : null;
    if (!action) return json({ error: 'action phải là APPROVED hoặc REJECTED' }, 400);
    const id = String(b.approval_id ?? '');
    const message = await qacDecide(id, action, u, actorOf(u), { note: String(b.note ?? ''), password: String(b.password ?? '') });
    return json({ approval_id: id, message, ...(await qacStatus(id)) });
  });
}
