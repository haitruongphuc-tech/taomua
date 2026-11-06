'use client';
// Video giới thiệu sản phẩm 7 ngôn ngữ (spec RYN-SALES: HeyGen + CapCut). Chưa có khóa HeyGen: GIẢ LẬP bằng trình chiếu
// + giọng đọc có sẵn của trình duyệt (Web Speech) theo từng ngôn ngữ.
import { useEffect, useRef, useState } from 'react';

const LANGS = [['vi', 'Tiếng Việt', 'vi-VN'], ['en', 'English', 'en-US'], ['zh', '中文', 'zh-CN'], ['fr', 'Français', 'fr-FR'], ['es', 'Español', 'es-ES'], ['ja', '日本語', 'ja-JP'], ['ko', '한국어', 'ko-KR']] as const;

export default function ProductVideo({ emoji, name, scripts, live }: { emoji: string; name: string; scripts: Record<string, string>; live: boolean }) {
  const [lang, setLang] = useState<string>('vi');
  const [playing, setPlaying] = useState(false);
  const [step, setStep] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const text = scripts[lang] ?? scripts.vi;
  const sentences = text.split(/(?<=[.!?。！？])\s*/).filter(Boolean);

  useEffect(() => () => { if (timer.current) clearInterval(timer.current); window.speechSynthesis?.cancel(); }, []);

  function play() {
    window.speechSynthesis?.cancel();
    if (timer.current) clearInterval(timer.current);
    setPlaying(true); setStep(0);
    const voiceLang = LANGS.find((l) => l[0] === lang)?.[2] ?? 'vi-VN';
    if ('speechSynthesis' in window) {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = voiceLang; u.rate = 1;
      u.onend = () => { setPlaying(false); if (timer.current) clearInterval(timer.current); };
      window.speechSynthesis.speak(u);
    }
    let i = 0;
    timer.current = setInterval(() => { i++; if (i >= sentences.length) { if (!('speechSynthesis' in window)) setPlaying(false); return; } setStep(i); }, 3500);
  }

  return (
    <section className="card stack">
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
        <h2 style={{ margin: 0 }}>Video giới thiệu 7 ngôn ngữ</h2>
        {!live && <span className="badge warn">GIẢ LẬP · trình chiếu + giọng đọc trình duyệt, chờ khóa HeyGen</span>}
      </div>
      <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
        {LANGS.map(([k, label]) => <button key={k} type="button" className={`btn sm ${lang === k ? '' : 'secondary'}`} onClick={() => { setLang(k); setPlaying(false); setStep(0); window.speechSynthesis?.cancel(); }}>{label}</button>)}
      </div>
      <div className="video-stage" lang={lang}>
        <div className={`video-emoji ${playing ? 'pulse' : ''}`} aria-hidden>{emoji}</div>
        <div className="video-title">{name}</div>
        <div className="video-caption">{sentences[Math.min(step, sentences.length - 1)]}</div>
        <button type="button" className="btn video-play" onClick={() => (playing ? (window.speechSynthesis?.cancel(), setPlaying(false)) : play())}>{playing ? '■ Dừng' : '▶ Phát'}</button>
      </div>
      <details className="small"><summary>Lời thoại</summary><p lang={lang}>{text}</p></details>
    </section>
  );
}
