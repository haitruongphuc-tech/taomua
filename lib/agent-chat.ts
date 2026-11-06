// Khung chat CEO / Kỹ sư AI ↔ 7 agent: hỏi việc, ra lệnh chạy, và HUẤN LUYỆN (dạy quy tắc, dạy câu hỏi - câu trả lời).
// Bài học lưu ở agent_lessons; CSKH (RYN-SALES) dùng câu hỏi - đáp đã dạy để trả lời khách, AI ngôn ngữ đọc quy tắc khi có khóa.
// Chưa có AI_API_KEY: AI LOCAL (BM25 trên bài học + việc thật) trả lời câu tự do. Có khóa: AI ngôn ngữ + trí nhớ bài học + câu được chấm 👍.
import { q, one } from './db';
import { fold } from './sourcing';
import { matchLesson, lessonRules, searchLessons } from './lessons';
import { Bm25 } from './local-ai';
export { matchLesson, trainedAnswer, lessonRules } from './lessons';
import { chat, aiEnabled } from './ai';
import { AGENTS, runAgents, type AgentCode } from './agents';
import { can, actorOf, type User } from './auth';

export const AGENT_CODES = Object.keys(AGENTS) as AgentCode[];
export const isAgent = (s: string): s is AgentCode => s in AGENTS;

export type Command =
  | { cmd: 'DAY'; text: string }
  | { cmd: 'HOI_DAP'; question: string; answer: string }
  | { cmd: 'QUEN'; id: number }
  | { cmd: 'DA_HOC' }
  | { cmd: 'CHAY' }
  | { cmd: 'BAO_CAO' }
  | { cmd: 'NHIEM_VU' }
  | { cmd: 'TU_DO'; text: string };

/** Đọc câu CEO gõ thành lệnh (thuần, kiểm thử được). */
export function parseCommand(input: string): Command {
  const raw = input.trim();
  const f = fold(raw).trim();
  const after = (re: RegExp) => raw.replace(re, '').trim();
  const qa = raw.match(/^(?:h[oỏ]i|q)\s*[:：]\s*([\s\S]+?)\s*(?:=>|→|\|\s*(?:đáp|dap|a)\s*[:：]|(?:đáp|dap)\s*[:：])\s*([\s\S]+)$/i);
  if (qa && qa[1].trim() && qa[2].trim()) return { cmd: 'HOI_DAP', question: qa[1].trim(), answer: qa[2].trim() };
  if (/^(day|quy tac|ghi nho|nho|rule)\s*[:：]/.test(f)) {
    const text = after(/^[^:：]+[:：]/);
    if (text) return { cmd: 'DAY', text };
  }
  const forget = f.match(/^(quen|xoa bai|forget)\s*#?\s*(\d+)/);
  if (forget) return { cmd: 'QUEN', id: Number(forget[2]) };
  if (/^(da hoc|bai hoc|hoc gi|lessons?)\b/.test(f) || /da hoc (duoc )?gi/.test(f)) return { cmd: 'DA_HOC' };
  if (/^(chay|run|lam viec|chay ngay)\b/.test(f)) return { cmd: 'CHAY' };
  if (/^(bao cao|tinh hinh|report|viec gi|co gi moi|status)\b/.test(f)) return { cmd: 'BAO_CAO' };
  if (/(nhiem vu|ban lam gi|lam nhung gi|vai tro|job)/.test(f)) return { cmd: 'NHIEM_VU' };
  return { cmd: 'TU_DO', text: raw };
}

const STATUS_VI: Record<string, string> = { DE_XUAT: 'chờ duyệt', TU_DONG: 'đã tự làm', DA_DUYET: 'đã duyệt', TU_CHOI: 'bị từ chối', TIN: 'tin', DA_XEM: 'đã xem', LOI: 'lỗi' };

async function recentWork(agent: AgentCode, n = 6) {
  return q<{ title: string; status: string; created_at: Date }>(
    'SELECT title, status, created_at FROM agent_actions WHERE agent=$1 ORDER BY created_at DESC LIMIT $2', [agent, n]);
}

export type ChatResult = { reply: string; mode: 'LENH' | 'AI_LOCAL' | 'AI_NGON_NGU' | 'GIA_LAP'; id?: number };

/** Agent trả lời một tin của CEO / kỹ sư. Ghi cả hai tin vào agent_chat. */
export async function talkToAgent(agent: AgentCode, message: string, u: User): Promise<ChatResult> {
  const msg = message.trim().slice(0, 2000);
  if (!msg) throw Object.assign(new Error('Tin nhắn trống.'), { userFacing: true });
  const a = actorOf(u);
  await q("INSERT INTO agent_chat(agent, sender, user_id, user_label, body) VALUES ($1,'NGUOI',$2,$3,$4)", [agent, u.id, a.label, msg]);
  const r = await reply(agent, msg, u);
  const row = await one<{ id: number }>("INSERT INTO agent_chat(agent, sender, body, mode) VALUES ($1,'AGENT',$2,$3) RETURNING id", [agent, r.reply, r.mode]);
  return { ...r, id: Number(row!.id) };
}

async function reply(agent: AgentCode, msg: string, u: User): Promise<ChatResult> {
  const info = AGENTS[agent];
  const c = parseCommand(msg);
  const lenh = (reply: string): ChatResult => ({ reply, mode: 'LENH' });
  const label = actorOf(u).label;

  switch (c.cmd) {
    case 'DAY': {
      const r = await one<{ id: number }>("INSERT INTO agent_lessons(agent, kind, answer, created_by, created_label) VALUES ($1,'QUY_TAC',$2,$3,$4) RETURNING id",
        [agent, c.text.slice(0, 1000), u.id, label]);
      return lenh(`Đã ghi nhớ quy tắc #${r!.id}: "${c.text.slice(0, 200)}". ${aiEnabled() ? 'Từ giờ AI ngôn ngữ đọc quy tắc này mỗi khi trả lời.' : 'Khi có AI_API_KEY, AI ngôn ngữ sẽ đọc quy tắc này mỗi khi trả lời.'}`);
    }
    case 'HOI_DAP': {
      const r = await one<{ id: number }>("INSERT INTO agent_lessons(agent, kind, question, answer, created_by, created_label) VALUES ($1,'HOI_DAP',$2,$3,$4,$5) RETURNING id",
        [agent, c.question.slice(0, 500), c.answer.slice(0, 1500), u.id, label]);
      return lenh(`Đã học câu hỏi - đáp #${r!.id}.${agent === 'RYN-SALES' ? ' Khách hỏi câu tương tự ở khung chat cửa hàng, CSKH AI trả lời đúng câu này.' : ''}`);
    }
    case 'QUEN': {
      const r = await q('UPDATE agent_lessons SET active=false WHERE id=$1 AND agent=$2 AND active RETURNING id', [c.id, agent]);
      return lenh(r.length ? `Đã bỏ bài học #${c.id}.` : `Không có bài học #${c.id} đang dùng của ${agent}.`);
    }
    case 'DA_HOC': {
      const ls = await q<{ id: number; kind: string; question: string | null; answer: string; used: number }>(
        'SELECT id, kind, question, answer, used FROM agent_lessons WHERE agent=$1 AND active ORDER BY created_at DESC LIMIT 20', [agent]);
      if (!ls.length) return lenh('Chưa được dạy gì. Gõ "dạy: …" để dạy quy tắc, hoặc "hỏi: … => …" để dạy câu trả lời.');
      return lenh(`Đã học ${ls.length} bài:\n${ls.map((l) => l.kind === 'HOI_DAP' ? `#${l.id} Hỏi "${l.question}" → "${l.answer}" (dùng ${l.used} lần)` : `#${l.id} Quy tắc: ${l.answer}`).join('\n')}`);
    }
    case 'CHAY': {
      if (!can(u, 'agents.run')) return lenh('Bạn không có quyền ra lệnh chạy agent.');
      const r = await runAgents('TAY', actorOf(u), [agent]);
      const s = r.summary[agent];
      const top = (await recentWork(agent, 5)).map((x) => `• ${x.title} (${STATUS_VI[x.status] ?? x.status})`).join('\n');
      return lenh(`Đã chạy xong: ${s.moi} mục mới, tự làm ${s.tu_dong}, chờ duyệt ${s.de_xuat}.${s.loi ? ` Lỗi: ${s.loi}` : ''}\n${top}`);
    }
    case 'BAO_CAO': {
      const w = await recentWork(agent, 8);
      const pend = await one<{ n: number }>("SELECT count(*)::int AS n FROM agent_actions WHERE agent=$1 AND status='DE_XUAT'", [agent]);
      if (!w.length) return lenh('Chưa có việc nào. Gõ "chạy" để tôi làm việc ngay.');
      return lenh(`${pend?.n ?? 0} việc đang chờ CEO duyệt (ở Duyệt nhanh). Việc gần nhất:\n${w.map((x) => `• ${x.title} (${STATUS_VI[x.status] ?? x.status})`).join('\n')}`);
    }
    case 'NHIEM_VU': {
      const n = await one<{ n: number }>('SELECT count(*)::int AS n FROM agent_lessons WHERE agent=$1 AND active', [agent]);
      return lenh(`Tôi là ${agent} (${info.name}). Nhiệm vụ: ${info.job}\nĐã được dạy ${n?.n ?? 0} bài.`);
    }
  }

  // Câu tự do: (1) câu hỏi - đáp đã dạy khớp chặt → (2) AI ngôn ngữ có "trí nhớ" (RAG: bài học + việc gần đây) → (3) AI LOCAL (BM25).
  const ls = await q<{ id: number; question: string; answer: string }>(
    "SELECT id, question, answer FROM agent_lessons WHERE agent=$1 AND kind='HOI_DAP' AND active", [agent]);
  const hit = matchLesson(msg, ls);
  if (hit) {
    await q('UPDATE agent_lessons SET used = used + 1 WHERE id=$1', [hit.id]);
    return lenh(`${hit.answer}\n(theo bài học #${hit.id})`);
  }
  const memory = await searchLessons(agent, msg, 5);
  const works = await q<{ id: string; title: string; status: string }>(
    'SELECT id, title, status FROM agent_actions WHERE agent=$1 ORDER BY created_at DESC LIMIT 300', [agent]);
  if (aiEnabled()) {
    const rules = await lessonRules(agent);
    const work = works.slice(0, 10).map((x) => `- ${x.title} (${STATUS_VI[x.status] ?? x.status})`).join('\n');
    const good = await q<{ qn: string; an: string }>(`SELECT p.body AS qn, a.body AS an FROM agent_chat a
      JOIN LATERAL (SELECT body FROM agent_chat h WHERE h.agent=a.agent AND h.sender='NGUOI' AND h.id < a.id ORDER BY h.id DESC LIMIT 1) p ON true
      WHERE a.agent=$1 AND a.sender='AGENT' AND a.rating=1 ORDER BY a.id DESC LIMIT 3`, [agent]);
    const hist = (await q<{ sender: string; body: string }>('SELECT sender, body FROM agent_chat WHERE agent=$1 ORDER BY created_at DESC LIMIT 8', [agent])).reverse();
    const out = await chat([
      { role: 'system', content: `Bạn là agent ${agent} (${info.name}) của taomua.com, đang báo cáo và được CEO / kỹ sư huấn luyện. Nhiệm vụ: ${info.job}
Trả lời tiếng Việt, ngắn, cụ thể, chỉ dựa vào dữ liệu dưới đây; không bịa số. Không tự chuyển tiền, không tự quyết thay CEO.
Quy tắc CEO đã dạy (bắt buộc tuân theo):\n${rules.map((r) => `- ${r}`).join('\n') || '- (chưa có)'}
Kiến thức liên quan đã dạy:\n${memory.map((m) => m.question ? `- Hỏi: ${m.question} → Đáp: ${m.answer}` : `- ${m.answer}`).join('\n') || '- (chưa có)'}
Việc gần đây:\n${work || '- (chưa có)'}` },
      ...good.flatMap((g) => [{ role: 'user' as const, content: g.qn }, { role: 'assistant' as const, content: g.an }]),
      ...hist.slice(0, -1).map((h) => ({ role: h.sender === 'NGUOI' ? 'user' as const : 'assistant' as const, content: h.body })),
      { role: 'user', content: msg },
    ]).catch(() => null);
    if (out) return { reply: out.slice(0, 3000), mode: 'AI_NGON_NGU' };
  }
  // AI LOCAL: không cần khóa. Trả lời bằng bài học gần nhất + việc liên quan tìm được trong dữ liệu thật.
  const best = memory[0];
  const workIdx = new Bm25(works.map((w) => ({ id: w.id, text: w.title })));
  const byId = new Map(works.map((w) => [w.id, w]));
  const related = workIdx.search(msg, 3).filter((r) => r.coverage >= 0.5).map((r) => byId.get(String(r.id))!);
  const parts: string[] = [];
  if (best && best.coverage >= 0.5) parts.push(best.question ? `${best.answer} (theo bài học #${best.id})` : `Quy tắc #${best.id}: ${best.answer}`);
  if (related.length) parts.push(`Việc liên quan:\n${related.map((x) => `• ${x.title} (${STATUS_VI[x.status] ?? x.status})`).join('\n')}`);
  if (parts.length) return { mode: 'AI_LOCAL', reply: `[AI LOCAL] ${parts.join('\n')}` };
  return {
    mode: 'AI_LOCAL',
    reply: `[AI LOCAL] ${agent} chưa được dạy về: "${msg.slice(0, 200)}". Dạy tôi bằng "hỏi: ${msg.slice(0, 80)} => <câu trả lời>" hoặc "dạy: <quy tắc>". Lệnh hiểu ngay: "chạy", "báo cáo", "nhiệm vụ", "đã học gì", "quên #<số>".`,
  };
}
