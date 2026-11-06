'use client';
import { useState } from 'react';
import { addToCart } from './cart';

type Prices = { 10: number; 50: number; 100: number; 500: number };
const tierFor = (q: number) => (q >= 500 ? 500 : q >= 100 ? 100 : q >= 50 ? 50 : q >= 10 ? 10 : null);

export default function AddToCart({ id, moq, prices }: { id: string; moq: number; prices: Prices }) {
  const min = Math.max(10, moq);
  const [qty, setQty] = useState(min);
  const [done, setDone] = useState(false);
  const tier = tierFor(qty);
  const ok = tier !== null && qty >= min;
  const unit = tier ? prices[tier] : 0;
  return (
    <div className="stack">
      <div className="tiers" aria-label="Giá theo bậc số lượng">
        {([10, 50, 100, 500] as const).map((t) => (
          <div key={t} className={tier === t ? 'on' : ''}>
            từ {t} cái<b>{prices[t].toLocaleString('vi-VN')}đ</b>
          </div>
        ))}
      </div>
      <div className="row">
        <label className="field" style={{ width: 140 }}>
          Số lượng
          <input type="number" min={min} step={1} value={qty} onChange={(e) => { setQty(Math.floor(Number(e.target.value) || 0)); setDone(false); }} />
        </label>
        <label className="field" style={{ flex: 1, minWidth: 160 }}>Kéo nhanh 10 → 500
          <input type="range" min={min} max={Math.max(500, min)} step={10} value={Math.min(Math.max(qty, min), Math.max(500, min))} onChange={(e) => { setQty(Number(e.target.value)); setDone(false); }} />
        </label>
        <div>
          <div className="muted small">Thành tiền (đã gồm VAT)</div>
          <div className="mono" style={{ fontSize: '1.2rem', fontWeight: 700 }}>{ok ? (unit * qty).toLocaleString('vi-VN') + ' đ' : '—'}</div>
          {ok && tier !== 10 && <div className="small" style={{ color: 'var(--ok)' }}>Tiết kiệm {((prices[10] - unit) * qty).toLocaleString('vi-VN')} đ so với giá 10+</div>}
        </div>
      </div>
      {!ok && <div className="alert warn small">Đặt tối thiểu {min} cái.</div>}
      <div className="row">
        <button className="btn" disabled={!ok} onClick={() => { addToCart(id, qty); setDone(true); }}>Thêm vào giỏ</button>
        {done && <a className="btn secondary" href="/gio-hang">Xem giỏ hàng →</a>}
      </div>
    </div>
  );
}
