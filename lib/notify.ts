import { q } from './db';
import { telegramReply } from './telegram';

/** Gửi cảnh báo cho CEO qua Telegram (nếu đã cấu hình). */
export async function notifyText(text: string) {
  if (!process.env.TELEGRAM_BOT_TOKEN) return;
  const ceos = await q<{ telegram_chat_id: string }>("SELECT telegram_chat_id FROM users WHERE role='CEO' AND active AND telegram_chat_id IS NOT NULL");
  for (const c of ceos) await telegramReply(c.telegram_chat_id, text);
}
