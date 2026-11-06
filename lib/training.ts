// Bộ dữ liệu huấn luyện thực chiến: xuất JSONL chuẩn chat (OpenAI / Qwen DashScope / Ollama đều nhận) để tinh chỉnh (fine-tune) mô hình khi có AI_API_KEY.
// Nguồn: câu hỏi - đáp CEO / kỹ sư đã dạy, câu trả lời agent được chấm 👍, câu khách hỏi mà AI trả lời đúng bằng bài học.
import { q } from './db';
import { AGENTS, type AgentCode } from './agents';

type Line = { messages: { role: 'system' | 'user' | 'assistant'; content: string }[] };

export function systemPrompt(agent: string, rules: string[]) {
  const info = AGENTS[agent as AgentCode];
  const who = agent === 'RYN-SALES' ? 'trợ lý chăm sóc khách hàng của taomua.com' : `agent ${agent} (${info?.name ?? ''}) của taomua.com`;
  return `Bạn là ${who}. ${info ? `Nhiệm vụ: ${info.job}` : ''}${rules.length ? `\nQuy tắc:\n${rules.map((r) => `- ${r}`).join('\n')}` : ''}`;
}

export async function trainingDataset(): Promise<{ lines: Line[]; stats: Record<string, number> }> {
  const rulesRows = await q<{ agent: string; answer: string }>("SELECT agent, answer FROM agent_lessons WHERE kind='QUY_TAC' AND active ORDER BY created_at");
  const rules = new Map<string, string[]>();
  for (const r of rulesRows) rules.set(r.agent, [...(rules.get(r.agent) ?? []), r.answer]);
  const sys = (a: string) => ({ role: 'system' as const, content: systemPrompt(a, rules.get(a) ?? []) });
  const lines: Line[] = [];

  const qa = await q<{ agent: string; question: string; answer: string }>("SELECT agent, question, answer FROM agent_lessons WHERE kind='HOI_DAP' AND active ORDER BY created_at");
  for (const l of qa) lines.push({ messages: [sys(l.agent), { role: 'user', content: l.question }, { role: 'assistant', content: l.answer }] });

  const good = await q<{ agent: string; qn: string; an: string }>(`SELECT a.agent, p.body AS qn, a.body AS an FROM agent_chat a
    JOIN LATERAL (SELECT body FROM agent_chat h WHERE h.agent=a.agent AND h.sender='NGUOI' AND h.id < a.id ORDER BY h.id DESC LIMIT 1) p ON true
    WHERE a.sender='AGENT' AND a.rating=1 ORDER BY a.id`);
  for (const g of good) lines.push({ messages: [sys(g.agent), { role: 'user', content: g.qn }, { role: 'assistant', content: g.an }] });

  const cust = await q<{ message: string; reply: string }>(`SELECT DISTINCT ON (lower(message)) message, reply FROM chat_logs
    WHERE lesson_id IS NOT NULL ORDER BY lower(message), created_at DESC LIMIT 5000`);
  for (const c of cust) lines.push({ messages: [sys('RYN-SALES'), { role: 'user', content: c.message }, { role: 'assistant', content: c.reply }] });

  return { lines, stats: { hoi_dap: qa.length, cham_tot: good.length, khach_that: cust.length, quy_tac: rulesRows.length } };
}
