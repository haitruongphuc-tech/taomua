import { NextResponse } from 'next/server';
import { answer } from '@/lib/cskh';
import { q, one } from '@/lib/db';
import { logError } from '@/lib/errors';

// Khung chat CSKH AI trên cửa hàng. Body: {message, session, phone?}. Ghi nhật ký để đo tỉ lệ AI tự trả lời và thời gian phản hồi.
export async function POST(req: Request) {
  const b = await req.json().catch(() => null);
  const message = String(b?.message ?? '').trim();
  const session = String(b?.session ?? '').replace(/[^a-z0-9-]/gi, '').slice(0, 40) || 'anon';
  if (message.length < 1 || message.length > 1000) return NextResponse.json({ error: 'Tin nhắn từ 1 đến 1000 ký tự.' }, { status: 400 });
  const recent = await one<{ n: number }>("SELECT count(*)::int AS n FROM chat_logs WHERE session=$1 AND created_at > now() - interval '1 minute'", [session]);
  if ((recent?.n ?? 0) >= 15) return NextResponse.json({ error: 'Bạn gửi nhanh quá, chờ một chút nhé.' }, { status: 429 });
  const t0 = Date.now();
  try {
    const r = await answer(message, { phone: b?.phone ? String(b.phone).slice(0, 25) : undefined });
    const ms = Date.now() - t0;
    await q('INSERT INTO chat_logs(session, message, reply, intent, answered_by, ms) VALUES ($1,$2,$3,$4,$5,$6)', [session, message, r.reply, r.intent, r.answeredBy, ms]);
    return NextResponse.json({ ...r, ms });
  } catch (e) {
    await logError('api/cskh', e);
    return NextResponse.json({ reply: 'Hệ thống đang bận, bạn để lại liên hệ ở trang Báo lỗi để nhân viên gọi lại nhé.', intent: 'KHAC', links: [{ label: 'Để lại liên hệ', href: '/bao-loi' }] });
  }
}
