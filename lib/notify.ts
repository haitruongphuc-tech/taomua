// Báo CEO theo spec 06_APPROVAL_SYSTEM.md: One-Tap trong trang quản trị là chính (QAC tự hiện popup),
// Zalo OA và email là kênh phụ mang link mở thẳng Quick Approve Center. Telegram giữ lại nếu đã cấu hình.
// Mọi tin đều ghi vào hộp thư (notification_log): kênh đã cấu hình thì gửi thật (THAT), chưa cấu hình thì chỉ ghi GIA_LAP để xem hệ thống sẽ gửi gì.
import nodemailer from 'nodemailer';
import { q } from './db';
import { telegramReply, notifyApproval } from './telegram';
import { LEVELS, type Level } from './approval';
import { vnd, pct } from './format';

export const qacLink = () => `${process.env.SITE_URL ?? ''}/quan-tri/duyet-nhanh`;

export type ChannelStatus = { telegram: boolean; zalo: boolean; email: boolean };
export const channels = (): ChannelStatus => ({
  telegram: !!process.env.TELEGRAM_BOT_TOKEN,
  zalo: !!(process.env.ZALO_OA_ACCESS_TOKEN && process.env.ZALO_CEO_USER_ID),
  email: !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && process.env.APPROVAL_EMAIL_TO),
});

async function log(channel: string, recipient: string, subject: string, body: string, mode: 'THAT' | 'GIA_LAP', ok = true, error?: string) {
  await q('INSERT INTO notification_log(channel, recipient, subject, body, mode, ok, error) VALUES ($1,$2,$3,$4,$5,$6,$7)',
    [channel, recipient.slice(0, 200), subject.slice(0, 300), body.slice(0, 4000), mode, ok, error?.slice(0, 500) ?? null]).catch(() => {});
}

async function zalo(text: string) {
  const token = process.env.ZALO_OA_ACCESS_TOKEN;
  const userId = process.env.ZALO_CEO_USER_ID;
  if (!token || !userId) return log('ZALO_OA', 'CEO', '', text, 'GIA_LAP');
  const r = await fetch('https://openapi.zalo.me/v3.0/oa/message/cs', {
    method: 'POST', headers: { 'content-type': 'application/json', access_token: token },
    body: JSON.stringify({ recipient: { user_id: userId }, message: { text: text.slice(0, 2000) } }),
  }).catch((e) => ({ ok: false, statusText: String(e) }) as Response);
  await log('ZALO_OA', userId, '', text, 'THAT', r.ok, r.ok ? undefined : r.statusText);
}

let mailer: nodemailer.Transporter | null = null;
async function email(subject: string, text: string, to = process.env.APPROVAL_EMAIL_TO) {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS || !to) return log('EMAIL', to ?? 'CEO', subject, text, 'GIA_LAP');
  mailer ??= nodemailer.createTransport({ host: SMTP_HOST, port: Number(SMTP_PORT || 465), secure: Number(SMTP_PORT || 465) === 465, auth: { user: SMTP_USER, pass: SMTP_PASS } });
  try {
    await mailer.sendMail({ from: SMTP_USER, to, subject: subject.slice(0, 200), text });
    await log('EMAIL', to, subject, text, 'THAT');
  } catch (e: any) {
    await log('EMAIL', to, subject, text, 'THAT', false, String(e?.message ?? e));
  }
}

/** Gửi cảnh báo / yêu cầu duyệt tới CEO qua mọi kênh (thật hoặc ghi giả lập). */
export async function notifyText(text: string, link = qacLink()) {
  const body = link ? `${text}\nDuyệt 1 chạm: ${link}` : text;
  const jobs: Promise<unknown>[] = [zalo(body), email(`[TAOMUA] ${text.split('\n')[0]}`, body)];
  if (process.env.TELEGRAM_BOT_TOKEN) {
    const ceos = await q<{ telegram_chat_id: string }>("SELECT telegram_chat_id FROM users WHERE role='CEO' AND active AND telegram_chat_id IS NOT NULL");
    for (const c of ceos) jobs.push(telegramReply(c.telegram_chat_id, body).then(() => log('TELEGRAM', c.telegram_chat_id, '', body, 'THAT')));
  }
  await Promise.allSettled(jobs);
}

/** Báo khách qua email (báo giá vận chuyển quốc tế, xác nhận đơn...). Chưa có SMTP thì ghi giả lập. */
export async function notifyCustomer(to: string | null | undefined, subject: string, text: string) {
  if (!to) return;
  await email(subject, text, to);
}

/** Đơn mới cần duyệt (Cấp 2-5): Telegram có nút duyệt (nếu có bot) + Zalo OA + email có link QAC. */
export async function notifyOrderPending(o: { id: string; code: string; tong_dt: number; bien_rong_tren_chi_phi: number; cap_duyet: number }) {
  const level = o.cap_duyet as Level;
  const text = `[TAOMUA ${LEVELS[level].label}] Duyệt đơn ${o.code}: ${vnd(o.tong_dt)}, biên ${pct(o.bien_rong_tren_chi_phi)}`;
  const body = `${text}\nDuyệt 1 chạm: ${qacLink()}`;
  await Promise.allSettled([notifyApproval(o), zalo(body), email(text, body)]);
}
