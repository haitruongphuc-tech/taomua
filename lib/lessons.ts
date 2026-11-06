// Bài học CEO / kỹ sư dạy cho agent (bảng agent_lessons). Tách riêng để CSKH dùng mà không kéo cả bộ agent.
import { q } from './db';
import { fold } from './sourcing';

const toks = (s: string) => fold(s).split(/[^a-z0-9]+/).filter((x) => x.length >= 2);

/** Câu khách hỏi khớp câu hỏi mẫu đã dạy (≥ 60% từ của câu mẫu, ít nhất 2 từ). Thuần. */
export function matchLesson<T extends { question: string | null }>(message: string, lessons: T[]): T | null {
  const msg = new Set(toks(message));
  let best: { l: T; s: number } | null = null;
  for (const l of lessons) {
    if (!l.question) continue;
    const w = [...new Set(toks(l.question))];
    const hits = w.filter((x) => msg.has(x)).length;
    const s = hits / Math.max(1, w.length);
    if (hits >= Math.min(2, w.length) && s >= 0.6 && (!best || s > best.s)) best = { l, s };
  }
  return best?.l ?? null;
}

/** CSKH: câu trả lời CEO / kỹ sư đã dạy cho RYN-SALES. */
export async function trainedAnswer(message: string): Promise<string | null> {
  const ls = await q<{ id: number; question: string; answer: string }>(
    "SELECT id, question, answer FROM agent_lessons WHERE agent='RYN-SALES' AND kind='HOI_DAP' AND active ORDER BY created_at DESC LIMIT 500");
  const hit = matchLesson(message, ls);
  if (!hit) return null;
  await q('UPDATE agent_lessons SET used = used + 1 WHERE id=$1', [hit.id]);
  return hit.answer;
}

/** Quy tắc đã dạy, đưa vào lời dặn của AI ngôn ngữ. */
export async function lessonRules(agent: string): Promise<string[]> {
  return (await q<{ answer: string }>("SELECT answer FROM agent_lessons WHERE agent=$1 AND kind='QUY_TAC' AND active ORDER BY created_at LIMIT 50", [agent]))
    .map((r) => r.answer);
}
