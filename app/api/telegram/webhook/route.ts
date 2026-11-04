import crypto from 'node:crypto';
import { one } from '@/lib/db';
import { decideApproval, OrderError } from '@/lib/orders';
import { isUuid } from '@/lib/catalog';
import { ROLE_LABEL, type Role } from '@/lib/auth';

// Telegram gọi về khi người duyệt bấm nút Duyệt / Từ chối. Đăng ký webhook kèm secret_token = TELEGRAM_WEBHOOK_SECRET.
export async function POST(req: Request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const got = req.headers.get('x-telegram-bot-api-secret-token') ?? '';
  if (!secret || got.length !== secret.length || !crypto.timingSafeEqual(Buffer.from(got), Buffer.from(secret))) {
    return new Response('forbidden', { status: 403 });
  }
  const upd = await req.json().catch(() => null);
  const cb = upd?.callback_query;
  if (!cb) return Response.json({ ok: true });
  const [op, orderId] = String(cb.data ?? '').split(':');
  let text = 'Không hiểu yêu cầu.';
  const user = await one('SELECT id, name, role FROM users WHERE active AND telegram_chat_id=$1', [String(cb.from?.id ?? '')]);
  if (!user) text = 'Tài khoản Telegram này chưa được gắn với người dùng nào.';
  else if (isUuid(orderId) && (op === 'A' || op === 'R')) {
    try {
      await decideApproval(orderId, { id: user.id, role: user.role, label: `${user.name} (${ROLE_LABEL[user.role as Role]})` },
        op === 'A' ? 'APPROVED' : 'REJECTED', op === 'R' ? 'Từ chối qua Telegram' : '', 'TELEGRAM');
      text = op === 'A' ? 'Đã duyệt.' : 'Đã từ chối.';
    } catch (e) {
      text = e instanceof OrderError ? e.message : 'Lỗi hệ thống.';
      if (!(e instanceof OrderError)) console.error(e);
    }
  }
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (token) {
    await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ callback_query_id: cb.id, text }),
    }).catch(() => null);
  }
  return Response.json({ ok: true });
}
