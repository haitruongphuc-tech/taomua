'use client';
// AI Shopping Assistant (spec chương 6): gõ hoặc nói câu tự nhiên; tìm bằng giọng nói dùng nhận dạng giọng nói của trình duyệt (vi-VN).
import { useEffect, useRef, useState } from 'react';

const EXAMPLES = ['áo thun hot trend dưới 50k', 'bình giữ nhiệt rẻ nhất', 'đồ chơi xưởng uy tín dưới 40k'];

export default function AiSearch({ initial = '' }: { initial?: string }) {
  const [text, setText] = useState(initial);
  const [listening, setListening] = useState(false);
  const [voiceOk, setVoiceOk] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const rec = useRef<any>(null);

  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    const r = new SR();
    r.lang = 'vi-VN'; r.interimResults = false; r.maxAlternatives = 1;
    r.onresult = (e: any) => { const t = e.results[0][0].transcript; setText(t); setTimeout(() => form.current?.requestSubmit(), 50); };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    rec.current = r;
    setVoiceOk(true);
  }, []);

  return (
    <form ref={form} action="/" className="ai-search">
      <span aria-hidden className="ai-search-icon">🤖</span>
      <input name="q" value={text} onChange={(e) => setText(e.target.value)} placeholder='Hỏi AI: "tìm áo thun hot trend giá dưới 50k"' aria-label="Trợ lý tìm hàng AI" maxLength={100} />
      {voiceOk && (
        <button type="button" className={`btn secondary sm ${listening ? 'on' : ''}`} aria-label="Tìm bằng giọng nói"
          onClick={() => { if (listening) { rec.current?.stop(); return; } setListening(true); rec.current?.start(); }}>{listening ? '● Đang nghe' : '🎤'}</button>
      )}
      <button className="btn">Tìm</button>
      <div className="ai-search-examples small">Thử: {EXAMPLES.map((x) => <button key={x} type="button" className="linkish" onClick={() => { setText(x); setTimeout(() => form.current?.requestSubmit(), 0); }}>{x}</button>)}</div>
    </form>
  );
}
