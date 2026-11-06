'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { readCart, writeCart, type CartLine } from '@/components/cart';
import { COUNTRIES } from '@/lib/countries';

type Quote = { lines: { id: string; name: string; emoji: string; qty: number; tier: number | null; unit: number; total: number; error?: string; moq: number }[]; total: number; ok: boolean };
const fmt = (n: number) => n.toLocaleString('vi-VN') + ' đ';

export default function CartPage() {
  const [lines, setLines] = useState<CartLine[] | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [form, setForm] = useState({ name: '', phone: '', email: '', address: '', note: '', website: '', country: 'VN' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [placed, setPlaced] = useState<{ code: string; total: number; needsApproval: boolean } | null>(null);

  useEffect(() => { setLines(readCart()); }, []);
  useEffect(() => {
    if (!lines) return;
    if (!lines.length) { setQuote({ lines: [], total: 0, ok: false }); return; }
    const ctl = new AbortController();
    fetch('/api/cart/quote', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ lines }), signal: ctl.signal })
      .then((r) => r.json()).then(setQuote).catch(() => {});
    return () => ctl.abort();
  }, [lines]);

  const update = (id: string, qty: number) => { const next = (lines ?? []).map((l) => (l.id === id ? { ...l, qty } : l)); setLines(next); writeCart(next); };
  const remove = (id: string) => { const next = (lines ?? []).filter((l) => l.id !== id); setLines(next); writeCart(next); };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      const r = await fetch('/api/orders', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...form, lines }) });
      const j = await r.json();
      if (!r.ok) { setErr(j.error || 'Không đặt được đơn.'); return; }
      writeCart([]); setLines([]); setPlaced(j);
    } catch { setErr('Mất kết nối, hãy thử lại.'); } finally { setBusy(false); }
  }

  if (placed) {
    return (
      <div className="card stack" style={{ maxWidth: 640 }}>
        <h1>Đã nhận đơn {placed.code}</h1>
        <p>Tổng tiền: <strong className="mono">{fmt(placed.total)}</strong></p>
        {placed.needsApproval
          ? <div className="alert info">Đơn cần được xác nhận trước khi thanh toán (đơn quốc tế: kèm báo phí vận chuyển qua email). / We confirm your order before payment. Bạn sẽ thấy hướng dẫn chuyển khoản khi tra cứu đơn sau khi đơn được xác nhận.</div>
          : <div className="alert ok">Đơn đã được xác nhận. Hãy tra cứu đơn để xem hướng dẫn thanh toán.</div>}
        <p className="muted">Lưu lại mã đơn. Bạn tra cứu bằng mã đơn và số điện thoại đã đặt.</p>
        <Link className="btn" href={`/don-hang?ma=${placed.code}`}>Tra cứu đơn</Link>
      </div>
    );
  }
  if (!lines || !quote) return <p>Đang tải giỏ hàng…</p>;
  if (!lines.length) return <div className="card">Giỏ hàng trống. <Link href="/">Xem sản phẩm</Link></div>;

  return (
    <div className="grid cols-2" style={{ alignItems: 'start' }}>
      <section className="card stack">
        <h1>Giỏ hàng</h1>
        {quote.lines.map((l) => (
          <div key={l.id} className="row" style={{ borderBottom: '1px solid var(--line)', paddingBottom: 10 }}>
            <span style={{ fontSize: '2rem' }} aria-hidden>{l.emoji}</span>
            <div style={{ flex: 1, minWidth: 160 }}>
              <div><strong>{l.name}</strong></div>
              <div className="muted small">{l.tier ? `Giá bậc ${l.tier}: ${fmt(l.unit)}/cái` : ''}</div>
              {l.error && <div className="badge bad">{l.error}</div>}
            </div>
            <input aria-label={`Số lượng ${l.name}`} type="number" min={l.moq || 10} style={{ width: 90 }} value={l.qty}
              onChange={(e) => update(l.id, Math.floor(Number(e.target.value) || 0))} />
            <div className="mono" style={{ width: 120, textAlign: 'right' }}>{fmt(l.total)}</div>
            <button className="btn secondary sm" onClick={() => remove(l.id)}>Xóa</button>
          </div>
        ))}
        <div className="row spread"><strong>Tổng (đã gồm VAT)</strong><strong className="mono">{fmt(quote.total)}</strong></div>
        <p className="muted small">Giá giảm tự động khi số lượng đạt 50, 100, 500 cái.</p>
      </section>

      <form className="card stack" onSubmit={submit}>
        <h2>Thông tin đặt hàng <span className="muted small">/ Order details</span></h2>
        <div className="form-grid">
          <label className="field">Tên shop / người nhận · Name<input required minLength={2} maxLength={120} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          <label className="field">Số điện thoại · Phone{form.country !== 'VN' ? ' (+mã nước / +country code)' : ''}<input required inputMode="tel" placeholder={form.country === 'VN' ? '09xx xxx xxx' : '+1 415 555 0100'} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
          <label className="field">Email{form.country === 'VN' ? ' (không bắt buộc)' : ' (bắt buộc / required)'}<input type="email" required={form.country !== 'VN'} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
          <label className="field">Giao tới · Ship to<select value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })}>
            {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.vi} / {c.en}</option>)}</select></label>
        </div>
        {form.country !== 'VN' && <div className="alert info small">Đơn quốc tế: taomua báo phí vận chuyển qua email trước khi bạn thanh toán. Giá chưa gồm thuế nhập khẩu tại nước nhận. / International order: we email the shipping quote before payment. Prices exclude import duties.</div>}
        <label className="field">Địa chỉ giao hàng · Address<textarea required minLength={5} maxLength={500} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></label>
        <label className="field">Ghi chú · Note<textarea maxLength={1000} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></label>
        <input tabIndex={-1} autoComplete="off" aria-hidden style={{ position: 'absolute', left: -9999 }} value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
        {err && <div className="alert bad">{err}</div>}
        <button className="btn" disabled={busy || !quote.ok}>{busy ? 'Đang gửi… / Sending…' : 'Đặt hàng / Place order'}</button>
        <p className="muted small">Bạn chưa phải trả tiền ngay. Tiền chuyển vào được giữ đến khi bạn xác nhận đã nhận hàng.</p>
      </form>
    </div>
  );
}
