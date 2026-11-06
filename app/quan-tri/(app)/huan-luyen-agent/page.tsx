import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { q, one } from '@/lib/db';
import { dt } from '@/lib/format';
import { aiEnabled } from '@/lib/ai';
import { AGENTS, type AgentCode } from '@/lib/agents';
import { AGENT_CODES, isAgent } from '@/lib/agent-chat';
import AgentChat, { type Line } from './AgentChat';
import { teachFromCustomer, forgetLesson } from './actions';

export const dynamic = 'force-dynamic';

export default async function AgentTraining({ searchParams }: { searchParams: { agent?: string } }) {
  await requireUser('agents.train');
  const agent: AgentCode = searchParams.agent && isAgent(searchParams.agent) ? searchParams.agent : 'RYN-SALES';
  const counts = Object.fromEntries((await q<{ agent: string; n: number }>(
    'SELECT agent, count(*)::int AS n FROM agent_lessons WHERE active GROUP BY agent')).map((r) => [r.agent, r.n]));
  const hist = (await q('SELECT id, sender, body, user_label, mode, created_at FROM agent_chat WHERE agent=$1 ORDER BY created_at DESC LIMIT 60', [agent])).reverse();
  const initial: Line[] = hist.map((h) => ({ id: h.id, sender: h.sender, body: h.body, who: h.user_label, mode: h.mode, at: dt(h.created_at) }));
  const lessons = await q('SELECT id, kind, question, answer, used, created_label, created_at FROM agent_lessons WHERE agent=$1 AND active ORDER BY created_at DESC LIMIT 100', [agent]);
  const sales = agent === 'RYN-SALES';
  const unanswered = sales ? await q(`SELECT c.message, max(c.created_at) AS at FROM chat_logs c
    WHERE c.answered_by='CHUYEN_NGUOI' AND c.created_at > now() - interval '30 days'
    AND NOT EXISTS (SELECT 1 FROM agent_lessons l WHERE l.agent='RYN-SALES' AND l.kind='HOI_DAP' AND l.active AND lower(l.question)=lower(c.message))
    GROUP BY c.message ORDER BY at DESC LIMIT 20`) : [];
  const rate = sales ? await one<{ total: number; ai: number }>(`SELECT count(*)::int AS total, count(*) FILTER (WHERE answered_by <> 'CHUYEN_NGUOI')::int AS ai
    FROM chat_logs WHERE created_at > now() - interval '30 days'`) : null;

  return (
    <div className="stack">
      <h1>Chat & huấn luyện 7 agent</h1>
      <div className="alert" style={{ borderColor: 'var(--orange)', background: 'var(--orange-50)' }}>
        🏷️ <b>TRANG ĐÁNH DẤU — CHỜ CEO CHỈNH:</b> tên và chia việc 7 agent đang theo bộ RYN (đã gộp đủ chức năng bộ file 01). CEO kiểm tra trên web rồi đặt tên, chia việc lại.
      </div>
      <p className="muted">
        Khung chat riêng của CEO, Trưởng nhóm và Kỹ sư AI với từng agent. Lệnh hiểu ngay: <b>chạy</b>, <b>báo cáo</b>, <b>nhiệm vụ</b>, <b>đã học gì</b>,
        {' '}<b>dạy: &lt;quy tắc&gt;</b>, <b>hỏi: &lt;câu hỏi&gt; =&gt; &lt;câu trả lời&gt;</b>, <b>quên #&lt;số&gt;</b>.
        {' '}Câu hỏi - đáp dạy cho <b>RYN-SALES</b> được CSKH AI dùng trả lời khách ở khung chat cửa hàng.
        {' '}<span className={`badge ${aiEnabled() ? 'ok' : 'warn'}`}>{aiEnabled() ? 'AI ngôn ngữ: bật' : 'Câu tự do: GIẢ LẬP (chưa có AI_API_KEY)'}</span>
      </p>
      <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
        {AGENT_CODES.map((c) => (
          <Link key={c} href={`/quan-tri/huan-luyen-agent?agent=${c}`} className={`btn sm ${c === agent ? '' : 'secondary'}`}>
            {c} · {AGENTS[c].name}{counts[c] ? ` (${counts[c]})` : ''}
          </Link>
        ))}
      </div>
      <div className="grid cols-2" style={{ alignItems: 'start' }}>
        <AgentChat key={agent} agent={agent} name={AGENTS[agent].name} initial={initial} />
        <div className="stack">
          <div className="card small"><b>Nhiệm vụ {agent}:</b> {AGENTS[agent].job}</div>
          {sales && (
            <div className="card">
              <h3 style={{ marginTop: 0 }}>Khách hỏi, AI chưa trả lời được</h3>
              <p className="small muted">
                30 ngày: {rate?.total ?? 0} câu khách hỏi, AI tự trả lời {rate?.total ? Math.round((100 * rate.ai) / rate.total) : 0}%. Dạy câu trả lời chuẩn để lần sau AI tự trả lời.
              </p>
              {unanswered.length === 0 && <div className="small muted">Không có câu nào cần dạy.</div>}
              {unanswered.map((r) => (
                <form key={r.message} action={teachFromCustomer} className="stack" style={{ gap: 4, borderTop: '1px solid var(--line)', paddingTop: 8, marginTop: 8 }}>
                  <div className="small"><b>Khách:</b> {r.message} <span className="muted">· {dt(r.at)}</span></div>
                  <input type="hidden" name="question" value={r.message} />
                  <div className="row" style={{ gap: 6 }}>
                    <input name="answer" placeholder="Câu trả lời chuẩn cho khách" required style={{ flex: 1 }} />
                    <button className="btn sm">Dạy</button>
                  </div>
                </form>
              ))}
            </div>
          )}
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Bài đã dạy {agent} ({lessons.length})</h3>
            {lessons.length === 0 && <div className="small muted">Chưa có. Gõ &quot;dạy: …&quot; hoặc &quot;hỏi: … =&gt; …&quot; trong khung chat.</div>}
            <div className="table-wrap"><table className="small"><tbody>
              {lessons.map((l) => (
                <tr key={l.id}>
                  <td className="mono">#{l.id}</td>
                  <td>{l.kind === 'HOI_DAP' ? <><b>Hỏi:</b> {l.question}<br /><b>Đáp:</b> {l.answer}</> : <><b>Quy tắc:</b> {l.answer}</>}
                    <div className="muted">{l.created_label} · {dt(l.created_at)}{l.kind === 'HOI_DAP' ? ` · dùng ${l.used} lần` : ''}</div></td>
                  <td><form action={forgetLesson}><input type="hidden" name="id" value={l.id} /><button className="btn secondary sm">Quên</button></form></td>
                </tr>
              ))}
            </tbody></table></div>
          </div>
        </div>
      </div>
    </div>
  );
}
