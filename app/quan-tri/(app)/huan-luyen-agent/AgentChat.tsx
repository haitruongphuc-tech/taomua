'use client';
// Khung chat CEO / Kỹ sư AI với một agent. Trả lời ngay, không tải lại trang.
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { sendToAgent } from './actions';

export type Line = { id: string | number; sender: 'NGUOI' | 'AGENT'; body: string; who?: string; mode?: string | null; at?: string };
const MODE: Record<string, string> = { LENH: 'lệnh', AI_NGON_NGU: 'AI ngôn ngữ', GIA_LAP: 'GIẢ LẬP' };
const QUICK = ['Báo cáo', 'Chạy ngay', 'Nhiệm vụ của bạn', 'Đã học gì'];

export default function AgentChat({ agent, name, initial }: { agent: string; name: string; initial: Line[] }) {
  const [lines, setLines] = useState<Line[]>(initial);
  const [text, setText] = useState('');
  const [busy, start] = useTransition();
  const router = useRouter();
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { setLines(initial); }, [agent]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }); }, [lines]);

  function send(t: string) {
    const m = t.trim();
    if (!m || busy) return;
    setLines((x) => [...x, { id: `me${Date.now()}`, sender: 'NGUOI', body: m, who: 'Bạn' }]);
    setText('');
    start(async () => {
      const r = await sendToAgent(agent, m);
      setLines((x) => [...x, 'error' in r
        ? { id: `e${Date.now()}`, sender: 'AGENT', body: r.error, mode: 'LOI' }
        : { id: `a${Date.now()}`, sender: 'AGENT', body: r.reply, mode: r.mode }]);
      router.refresh();
    });
  }

  return (
    <div className="card" style={{ padding: 0, display: 'flex', flexDirection: 'column', height: 560 }}>
      <div className="chat-head" style={{ borderRadius: 'var(--radius) var(--radius) 0 0' }}><b>💬 {agent}</b><span className="small" style={{ opacity: 0.85 }}>· {name}</span></div>
      <div className="chat-body">
        {lines.length === 0 && <div className="muted small">Chưa có tin. Hỏi agent, ra lệnh &quot;chạy&quot;, hoặc dạy: &quot;dạy: …&quot;, &quot;hỏi: … =&gt; …&quot;.</div>}
        {lines.map((l) => (
          <div key={l.id} className={`chat-msg ${l.sender === 'NGUOI' ? 'me' : 'ai'}`}>
            <div>{l.body}</div>
            <div className="small" style={{ opacity: 0.7, marginTop: 4 }}>
              {l.sender === 'NGUOI' ? l.who : agent}{l.mode ? ` · ${MODE[l.mode] ?? l.mode}` : ''}{l.at ? ` · ${l.at}` : ''}
            </div>
          </div>
        ))}
        {busy && <div className="chat-msg ai muted">{agent} đang trả lời…</div>}
        <div ref={end} />
      </div>
      <div className="row" style={{ gap: 6, flexWrap: 'wrap', padding: '6px 10px' }}>
        {QUICK.map((k) => <button key={k} type="button" className="btn secondary sm" disabled={busy} onClick={() => send(k)}>{k}</button>)}
      </div>
      <form className="chat-input" onSubmit={(e) => { e.preventDefault(); send(text); }}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={`Nhắn ${agent}… (dạy: … · hỏi: … => …)`} maxLength={2000} aria-label="Tin nhắn cho agent" />
        <button className="btn sm" disabled={busy || !text.trim()}>Gửi</button>
      </form>
    </div>
  );
}
