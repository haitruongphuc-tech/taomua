'use server';
import { revalidatePath } from 'next/cache';
import { requireUser, actorOf } from '@/lib/auth';
import { talkToAgent, isAgent, type ChatResult } from '@/lib/agent-chat';
import { q } from '@/lib/db';
import { audit } from '@/lib/audit';
import { logError } from '@/lib/errors';

const PATH = '/quan-tri/huan-luyen-agent';

/** Gửi một tin cho agent, trả lời ngay (không tải lại trang). */
export async function sendToAgent(agent: string, message: string): Promise<ChatResult | { error: string }> {
  const u = await requireUser('agents.train');
  if (!isAgent(agent)) return { error: 'Agent không hợp lệ.' };
  try {
    const r = await talkToAgent(agent, String(message ?? ''), u);
    revalidatePath(PATH);
    return r;
  } catch (e: any) {
    if (e?.userFacing) return { error: e.message };
    await logError('huan-luyen-agent', e);
    return { error: 'Agent gặp lỗi, đã ghi vào Lỗi & đơn thật.' };
  }
}

/** Dạy CSKH trả lời câu khách đã hỏi mà AI chưa trả lời được. */
export async function teachFromCustomer(fd: FormData) {
  const u = await requireUser('agents.train');
  const question = String(fd.get('question') ?? '').trim().slice(0, 500);
  const answer = String(fd.get('answer') ?? '').trim().slice(0, 1500);
  if (!question || !answer) return;
  const a = actorOf(u);
  const r = await q("INSERT INTO agent_lessons(agent, kind, question, answer, created_by, created_label) VALUES ('RYN-SALES','HOI_DAP',$1,$2,$3,$4) RETURNING id",
    [question, answer, u.id, a.label]);
  await q("INSERT INTO agent_chat(agent, sender, body, mode) VALUES ('RYN-SALES','AGENT',$1,'LENH')",
    [`Đã học câu khách hỏi #${r[0].id}: "${question.slice(0, 150)}" → "${answer.slice(0, 200)}"`]);
  await audit(a, 'agent.teach', 'agent_lesson', String(r[0].id), { agent: 'RYN-SALES', question });
  revalidatePath(PATH);
}

export async function forgetLesson(fd: FormData) {
  const u = await requireUser('agents.train');
  const id = Number(fd.get('id'));
  if (!Number.isInteger(id)) return;
  await q('UPDATE agent_lessons SET active=false WHERE id=$1', [id]);
  await audit(actorOf(u), 'agent.forget', 'agent_lesson', String(id), {});
  revalidatePath(PATH);
}

/** Chấm câu trả lời của agent: 👍 thành ví dụ mẫu cho AI ngôn ngữ và dữ liệu tinh chỉnh; 👎 thì dạy lại câu đúng. */
export async function rateReply(id: number, rating: 1 | -1) {
  const u = await requireUser('agents.train');
  if (!Number.isInteger(id) || (rating !== 1 && rating !== -1)) return;
  await q("UPDATE agent_chat SET rating=$2 WHERE id=$1 AND sender='AGENT'", [id, rating]);
  await audit(actorOf(u), 'agent.rate', 'agent_chat', String(id), { rating });
}
