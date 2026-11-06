'use client';
// Nút chat CSKH AI nổi góc phải mọi trang cửa hàng.
import { useEffect, useRef, useState } from 'react';
import { BRAND } from '@/lib/brand';

type Msg = { from: 'ai' | 'me'; text: string; links?: { label: string; href: string }[] };
const HELLO: Msg = { from: 'ai', text: 'Xin chào! Mình là trợ lý AI taomua. Hỏi mình giá sỉ, tình trạng đơn (mã TM + số điện thoại), vận chuyển, thanh toán, hóa đơn hoặc khiếu nại nhé.' };
const QUICK = ['Giá sỉ áo thun?', 'Tra cứu đơn của tôi', 'Thanh toán thế nào?', 'Xuất hóa đơn VAT'];

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([HELLO]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const session = useRef('');
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try { session.current = sessionStorage.getItem('tm_chat') || crypto.randomUUID(); sessionStorage.setItem('tm_chat', session.current); }
    catch { session.current = Math.random().toString(36).slice(2); }
  }, []);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [msgs, open]);

  async function send(t: string) {
    const m = t.trim();
    if (!m || busy) return;
    setMsgs((x) => [...x, { from: 'me', text: m }]);
    setText(''); setBusy(true);
    try {
      const r = await fetch('/api/cskh', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: m, session: session.current }) });
      const j = await r.json();
      setMsgs((x) => [...x, { from: 'ai', text: j.reply ?? j.error ?? 'Xin lỗi, thử lại nhé.', links: j.links }]);
    } catch { setMsgs((x) => [...x, { from: 'ai', text: 'Mất kết nối, thử lại nhé.' }]); } finally { setBusy(false); }
  }

  return (
    <>
      {open && (
        <div className="chat-box card" role="dialog" aria-label="Trợ lý AI taomua">
          <div className="chat-head"><img src={BRAND.logoMark} alt="" width={28} height={28} /><b>Trợ lý AI taomua</b><span className="small" style={{ opacity: 0.8 }}>· trả lời ngay</span>
            <button className="chat-x" onClick={() => setOpen(false)} aria-label="Đóng">×</button></div>
          <div className="chat-body">
            {msgs.map((m, i) => (
              <div key={i} className={`chat-msg ${m.from}`}>
                <div>{m.text}</div>
                {m.links?.length ? <div className="row" style={{ gap: 6, marginTop: 6, flexWrap: 'wrap' }}>{m.links.map((l) => <a key={l.href} className="badge" href={l.href}>{l.label}</a>)}</div> : null}
              </div>
            ))}
            {busy && <div className="chat-msg ai muted">AI đang trả lời…</div>}
            {msgs.length === 1 && <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>{QUICK.map((qk) => <button key={qk} className="btn secondary sm" onClick={() => send(qk)}>{qk}</button>)}</div>}
            <div ref={end} />
          </div>
          <form className="chat-input" onSubmit={(e) => { e.preventDefault(); send(text); }}>
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Nhập câu hỏi…" maxLength={1000} aria-label="Câu hỏi" />
            <button className="btn sm" disabled={busy || !text.trim()}>Gửi</button>
          </form>
        </div>
      )}
      <button className="chat-fab" onClick={() => setOpen((o) => !o)} aria-label="Chat với trợ lý AI taomua">
        <img src={BRAND.logoMark} alt="" width={34} height={34} /> <span>Hỏi AI</span>
      </button>
    </>
  );
}
