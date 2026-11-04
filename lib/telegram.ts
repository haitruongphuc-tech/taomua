import { q } from './db';
import { LEVELS, type Level } from './approval';
import { vnd, pct } from './format';

/** Gửi yêu cầu duyệt tới những người có quyền duyệt cấp này và đã khai báo Telegram chat id.
 *  Chưa cấu hình bot thì chỉ trả về lý do, không báo lỗi. */
export async function notifyApproval(o: { id: string; code: string; tong_dt: number; bien_rong_tren_chi_phi: number; cap_duyet: number }) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { sent: 0, note: 'Chưa cấu hình TELEGRAM_BOT_TOKEN' };
  const level = o.cap_duyet as Level;
  const roles = LEVELS[level].roles as readonly string[];
  const people = await q<{ telegram_chat_id: string }>(
    'SELECT telegram_chat_id FROM users WHERE active AND telegram_chat_id IS NOT NULL AND role = ANY($1)', [roles]);
  const text = `Đơn ${o.code} cần duyệt ${LEVELS[level].label} (hạn ${LEVELS[level].minutes} phút)\n` +
    `Giá trị: ${vnd(o.tong_dt)}\nBiên ròng/chi phí: ${pct(o.bien_rong_tren_chi_phi)}`;
  let sent = 0;
  for (const p of people) {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: p.telegram_chat_id,
        text,
        reply_markup: { inline_keyboard: [[
          { text: 'Duyệt', callback_data: `A:${o.id}` },
          { text: 'Từ chối', callback_data: `R:${o.id}` },
        ]] },
      }),
    }).catch(() => null);
    if (r?.ok) sent++;
  }
  return { sent, note: people.length ? '' : 'Chưa có người duyệt nào khai báo Telegram' };
}

export async function telegramReply(chatId: string | number, text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, text }),
  }).catch(() => null);
}
