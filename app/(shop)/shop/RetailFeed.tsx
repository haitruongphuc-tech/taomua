'use client';
// Bảng tin bán lẻ kiểu TikTok: mỗi sản phẩm một khung dọc, cuộn bắt khung; Mua ngay 1 chạm (nhớ thông tin giao hàng).
import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { RetailItem } from '@/lib/retail';

const KEY = 'taomua_buyer_v1';
const vnd = (n: number) => n.toLocaleString('vi-VN') + ' đ';
type Buyer = { name: string; phone: string; email: string; address: string };

export default function RetailFeed({ items }: { items: RetailItem[] }) {
  const [open, setOpen] = useState<RetailItem | null>(null);
  const [qty, setQty] = useState(1);
  const [buyer, setBuyer] = useState<Buyer>({ name: '', phone: '', email: '', address: '' });
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState<{ code: string; total: number; needsApproval: boolean } | null>(null);

  useEffect(() => {
    try { const b = JSON.parse(localStorage.getItem(KEY) || 'null'); if (b?.phone) setBuyer(b); } catch { /* bộ nhớ bị chặn */ }
  }, []);

  async function buy(e: React.FormEvent) {
    e.preventDefault();
    if (!open) return;
    setBusy(true); setErr('');
    try {
      const r = await fetch('/api/shop/orders', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...buyer, lines: [{ id: open.id, qty }] }) });
      const j = await r.json();
      if (!r.ok) { setErr(j.error || 'Không đặt được.'); return; }
      try { if (remember) localStorage.setItem(KEY, JSON.stringify(buyer)); else localStorage.removeItem(KEY); } catch { /* bỏ qua */ }
      setDone(j);
    } catch { setErr('Mất kết nối, thử lại.'); } finally { setBusy(false); }
  }

  return (
    <>
      <div className="retail-feed">
        {items.map((it) => (
          <article key={it.id} className="retail-card">
            <div className="retail-emoji" aria-hidden>{it.image_emoji}</div>
            {it.trend_score >= 80 && <span className="badge orange retail-hot">🔥 Hot {it.trend_score}</span>}
            <div className="retail-info">
              <div className="small" style={{ opacity: 0.85 }}>{it.category}{it.trust_score ? ` · Xưởng TrustScore ${it.trust_score}` : ''}{it.is_simulated ? ' · dữ liệu thử nghiệm' : ''}</div>
              <h2 style={{ margin: '4px 0' }}>{it.name}</h2>
              <p className="small" style={{ margin: 0, opacity: 0.9 }}>{it.description}</p>
              <div className="row" style={{ gap: 10, alignItems: 'baseline', marginTop: 8 }}>
                <b style={{ fontSize: '1.5rem' }}>{vnd(Number(it.price))}</b>
                <span className="small" style={{ opacity: 0.85 }}>Sỉ từ 10 cái: {vnd(Number(it.wholesale_10))}</span>
              </div>
              <div className="row" style={{ gap: 8, marginTop: 10 }}>
                <button className="btn" style={{ flex: 1, padding: '12px 0' }} onClick={() => { setOpen(it); setQty(1); setDone(null); setErr(''); }}>Mua ngay</button>
                <Link className="btn secondary" href={`/san-pham/${it.id}`}>Mua sỉ</Link>
              </div>
            </div>
          </article>
        ))}
      </div>

      {open && (
        <div className="sheet-backdrop" onClick={() => !busy && setOpen(null)}>
          <form className="sheet card stack" onClick={(e) => e.stopPropagation()} onSubmit={buy}>
            {done ? (
              <>
                <h2>Đã nhận đơn {done.code}</h2>
                <p>Tổng: <b>{vnd(done.total)}</b></p>
                <div className="alert info small">{done.needsApproval ? 'Đơn cần xác nhận trước khi thanh toán.' : 'Đơn đã xác nhận.'} Tra cứu đơn để xem hướng dẫn chuyển khoản.</div>
                <Link className="btn" href={`/don-hang?ma=${done.code}`}>Tra cứu đơn</Link>
              </>
            ) : (
              <>
                <h2 style={{ margin: 0 }}>{open.image_emoji} {open.name}</h2>
                <div className="row" style={{ gap: 10, alignItems: 'center' }}>
                  <label className="field" style={{ width: 110 }}>Số lượng<input type="number" min={1} max={9} value={qty} onChange={(e) => setQty(Math.max(1, Math.min(9, Math.floor(Number(e.target.value) || 1))))} /></label>
                  <div>Tạm tính<br /><b className="mono">{vnd(Number(open.price) * qty)}</b></div>
                </div>
                <label className="field">Tên người nhận<input required minLength={2} value={buyer.name} onChange={(e) => setBuyer({ ...buyer, name: e.target.value })} /></label>
                <label className="field">Số điện thoại<input required inputMode="tel" value={buyer.phone} onChange={(e) => setBuyer({ ...buyer, phone: e.target.value })} /></label>
                <label className="field">Địa chỉ giao hàng<textarea required minLength={5} value={buyer.address} onChange={(e) => setBuyer({ ...buyer, address: e.target.value })} /></label>
                <label className="row small"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Nhớ thông tin để lần sau mua 1 chạm</label>
                {err && <div className="alert bad small">{err}</div>}
                <div className="row" style={{ gap: 8 }}>
                  <button className="btn" style={{ flex: 1 }} disabled={busy}>{busy ? 'Đang đặt…' : `Đặt ${vnd(Number(open.price) * qty)}`}</button>
                  <button type="button" className="btn secondary" onClick={() => setOpen(null)}>Đóng</button>
                </div>
                <p className="small muted" style={{ margin: 0 }}>Chưa trả tiền ngay. Thanh toán chuyển khoản sau khi đơn được xác nhận; tiền được giữ đến khi bạn nhận hàng.</p>
              </>
            )}
          </form>
        </div>
      )}
    </>
  );
}
