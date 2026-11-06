'use client';
// "Shop to Light" (spec 9mua: AR, học Walmart): mở camera điện thoại, đặt sản phẩm lên khung hình để xem thử kích cỡ / chỗ đặt.
// Bản đơn giản không cần SDK: hình sản phẩm kéo, phóng to / thu nhỏ trên video camera. Chụp lại được.
import { useRef, useState } from 'react';

export default function ArView({ emoji, name }: { emoji: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState('');
  const [pos, setPos] = useState({ x: 50, y: 55, s: 1 });
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);

  async function start() {
    setErr(''); setOpen(true);
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      if (video.current) { video.current.srcObject = stream.current; await video.current.play(); }
    } catch {
      setErr('Không mở được camera (cần cho phép camera và trang chạy https).');
    }
  }
  function stop() { stream.current?.getTracks().forEach((t) => t.stop()); stream.current = null; setOpen(false); }
  function onMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    const box = e.currentTarget.getBoundingClientRect();
    setPos((p) => ({ ...p, x: Math.max(0, Math.min(100, ((e.clientX - box.left) / box.width) * 100)), y: Math.max(0, Math.min(100, ((e.clientY - box.top) / box.height) * 100)) }));
  }

  if (!open) return <button type="button" className="btn secondary" onClick={start}>📷 Xem thử tại chỗ (AR)</button>;
  return (
    <div className="ar-wrap" onPointerMove={onMove} onPointerUp={() => (drag.current = null)} onPointerLeave={() => (drag.current = null)}>
      <video ref={video} playsInline muted className="ar-video" />
      {err && <div className="alert warn small ar-msg">{err}</div>}
      <div className="ar-item" style={{ left: `${pos.x}%`, top: `${pos.y}%`, transform: `translate(-50%,-50%) scale(${pos.s})` }}
        onPointerDown={(e) => { drag.current = { x: e.clientX, y: e.clientY }; (e.target as HTMLElement).setPointerCapture?.(e.pointerId); }}
        title={name} aria-label={`${name} — kéo để di chuyển`}>{emoji}</div>
      <div className="ar-bar row">
        <button type="button" className="btn sm secondary" onClick={() => setPos((p) => ({ ...p, s: Math.max(0.3, p.s - 0.15) }))}>－</button>
        <button type="button" className="btn sm secondary" onClick={() => setPos((p) => ({ ...p, s: Math.min(4, p.s + 0.15) }))}>＋</button>
        <span className="small" style={{ color: '#fff' }}>Kéo sản phẩm để đặt chỗ</span>
        <button type="button" className="btn sm" onClick={stop}>Đóng</button>
      </div>
    </div>
  );
}
