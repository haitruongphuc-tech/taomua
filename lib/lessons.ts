// Bài học CEO / kỹ sư dạy cho agent (bảng agent_lessons) + "trí nhớ" của AI LOCAL.
// Tách riêng để CSKH dùng mà không kéo cả bộ agent.
import { q } from './db';
import { Bm25, NaiveBayes, INTENT_EXAMPLES, contentWords, variantsOf } from './local-ai';

const toks = contentWords;

/** Câu khách hỏi khớp câu hỏi mẫu đã dạy (≥ 75% từ có nghĩa của một cách hỏi, ít nhất 2 từ; bỏ từ hỏi có / không / được). Thuần. */
export function matchLesson<T extends { question: string | null }>(message: string, lessons: T[]): T | null {
  const msg = new Set(toks(message));
  let best: { l: T; s: number } | null = null;
  for (const l of lessons) {
    if (!l.question) continue;
    for (const v of variantsOf(l.question)) {
      const w = toks(v);
      const hits = w.filter((x) => msg.has(x)).length;
      const s = hits / Math.max(1, w.length);
      if (hits >= Math.min(2, w.length) && s >= 0.75 && (!best || s > best.s)) best = { l, s };
    }
  }
  return best?.l ?? null;
}

export type Lesson = { id: number; agent: string; kind: 'QUY_TAC' | 'HOI_DAP'; question: string | null; answer: string };

const loadLessons = (agent: string) => q<Lesson>(
  'SELECT id, agent, kind, question, answer FROM agent_lessons WHERE agent=$1 AND active ORDER BY created_at DESC LIMIT 2000', [agent]);
const used = (id: number) => q('UPDATE agent_lessons SET used = used + 1 WHERE id=$1', [id]);

/** CSKH: câu trả lời CEO / kỹ sư đã dạy cho RYN-SALES (khớp chặt). */
export async function trainedAnswer(message: string): Promise<{ id: number; answer: string } | null> {
  const ls = (await loadLessons('RYN-SALES')).filter((l) => l.kind === 'HOI_DAP');
  const hit = matchLesson(message, ls);
  if (!hit) return null;
  await used(hit.id);
  return { id: hit.id, answer: hit.answer };
}

/** Quy tắc đã dạy, đưa vào lời dặn của AI ngôn ngữ. */
export async function lessonRules(agent: string): Promise<string[]> {
  return (await q<{ answer: string }>("SELECT answer FROM agent_lessons WHERE agent=$1 AND kind='QUY_TAC' AND active ORDER BY created_at LIMIT 50", [agent]))
    .map((r) => r.answer);
}

/** AI LOCAL: tìm bài học liên quan nhất bằng BM25 (cả quy tắc và hỏi - đáp). */
export async function searchLessons(agent: string, query: string, k = 5) {
  const ls = await loadLessons(agent);
  const idx = new Bm25(ls.map((l) => ({ id: l.id, text: l.answer, boost: l.question ?? undefined })));
  const byId = new Map(ls.map((l) => [l.id, l]));
  return idx.search(query, k).map((r) => ({ ...byId.get(Number(r.id))!, score: r.score, coverage: r.coverage, match: r.match }));
}

/** Đủ tin cậy để AI LOCAL tự trả lời: ≥ 75% từ của câu mẫu có trong câu hỏi và ≥ 50% từ của câu hỏi có trong câu mẫu. */
export const confident = (r: { score: number; coverage: number; match: number } | undefined) => !!r && r.match >= 0.75 && r.coverage >= 0.5 && r.score >= 1;

/** CSKH: câu hỏi tự do → câu hỏi - đáp gần nhất (BM25) nếu đủ tin cậy. */
export async function localAnswer(message: string): Promise<{ id: number; answer: string } | null> {
  const top = (await searchLessons('RYN-SALES', message, 3)).filter((l) => l.kind === 'HOI_DAP');
  if (!confident(top[0])) return null;
  await used(top[0].id);
  return { id: top[0].id, answer: top[0].answer };
}

// Mô hình phân loại ý định: học từ câu mẫu + nhật ký chat thật (câu luật đã nhận đúng ý định). Làm mới 10 phút / lần.
let model: { at: number; nb: NaiveBayes; n: number } | null = null;
export function resetLocalAi() { model = null; }
export async function intentModel() {
  if (model && Date.now() - model.at < 10 * 60_000) return model;
  const logs = await q<{ message: string; intent: string }>(
    `SELECT message, intent FROM chat_logs WHERE intent <> 'KHAC' AND intent_by='QUY_TAC' ORDER BY created_at DESC LIMIT 3000`).catch(() => []);
  const nb = new NaiveBayes().train([...INTENT_EXAMPLES, ...logs.map((l) => ({ text: l.message, label: l.intent }))]);
  model = { at: Date.now(), nb, n: INTENT_EXAMPLES.length + logs.length };
  return model;
}
