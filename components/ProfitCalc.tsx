'use client';
// Máy tính lời siêu tốc (docs/ALGORITHM_COMPARISON_OPTIMIZATION.md mục 7): kéo 10 → 500 cái, giá sỉ 4 bậc tự đổi;
// nhập giá bán lại để thấy shop của bạn lời bao nhiêu. Mua càng nhiều giá càng thấp, lời càng nhiều.
import { useState } from 'react';

type P = { id: string; name: string; emoji: string; moq: number; prices: { 10: number; 50: number; 100: number; 500: number } };
const vnd = (n: number) => Math.round(n).toLocaleString('vi-VN') + ' đ';
const tierFor = (q: number) => (q >= 500 ? 500 : q >= 100 ? 100 : q >= 50 ? 50 : 10) as 10 | 50 | 100 | 500;

export default function ProfitCalc({ products }: { products: P[] }) {
  const [idx, setIdx] = useState(0);
  const [qty, setQty] = useState(100);
  const p = products[idx];
  const [resale, setResale] = useState<number>(Math.round((p?.prices[10] ?? 0) * 1.5 / 1000) * 1000);
  if (!p) return null;
  const q = Math.max(qty, Math.max(10, p.moq));
  const tier = tierFor(q);
  const unit = p.prices[tier];
  const total = unit * q;
  const saved = (p.prices[10] - unit) * q;
  const profit = (resale - unit) * q;
  return (
    <section className="card stack">
      <h2 style={{ margin: 0 }}>Máy tính lời siêu tốc <span className="muted small">mua càng nhiều giá càng thấp</span></h2>
      <div className="form-grid">
        <label className="field">Sản phẩm<select value={idx} onChange={(e) => { const i = Number(e.target.value); setIdx(i); setResale(Math.round(products[i].prices[10] * 1.5 / 1000) * 1000); }}>
          {products.map((x, i) => <option key={x.id} value={i}>{x.emoji} {x.name}</option>)}</select></label>
        <label className="field">Giá bạn bán lại / cái<input type="number" min={0} step={1000} value={resale} onChange={(e) => setResale(Math.max(0, Number(e.target.value) || 0))} /></label>
      </div>
      <label className="field">Số lượng: <b>{q} cái</b> (bậc {tier}+)
        <input type="range" min={10} max={500} step={10} value={qty} onChange={(e) => setQty(Number(e.target.value))} aria-label="Số lượng" />
      </label>
      <div className="tiers">{([10, 50, 100, 500] as const).map((t) => <div key={t} className={tier === t ? 'on' : ''}>từ {t} cái<b>{vnd(p.prices[t])}</b></div>)}</div>
      <div className="grid cols-4 small">
        <div>Giá mỗi cái<br /><b className="mono">{vnd(unit)}</b></div>
        <div>Tiền hàng<br /><b className="mono">{vnd(total)}</b></div>
        <div>Tiết kiệm so với giá 10+<br /><b className="mono" style={{ color: 'var(--ok)' }}>{vnd(saved)}</b></div>
        <div>Shop bạn lời (trước chi phí bán)<br /><b className="mono" style={{ color: profit >= 0 ? 'var(--ok)' : 'var(--bad)' }}>{vnd(profit)}</b></div>
      </div>
      <a className="btn" href={`/gio-hang?add=${p.id}:${q}`}>Thêm {q} cái vào giỏ</a>
    </section>
  );
}
