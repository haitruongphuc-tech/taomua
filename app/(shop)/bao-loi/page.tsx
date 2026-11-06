import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { q, one } from '@/lib/db';
import { notifyText } from '@/lib/notify';

export const metadata = { title: 'Báo lỗi / Report a problem' };

async function send(fd: FormData) {
  'use server';
  if (fd.get('website')) redirect('/bao-loi?da=1'); // bẫy bot
  const contact = String(fd.get('contact') ?? '').trim().slice(0, 200);
  const message = String(fd.get('message') ?? '').trim().slice(0, 3000);
  const orderCode = String(fd.get('order_code') ?? '').trim().toUpperCase().slice(0, 30) || null;
  const page = String(fd.get('page') ?? '').trim().slice(0, 300) || headers().get('referer')?.slice(0, 300) || null;
  if (contact.length < 5 || message.length < 5) redirect('/bao-loi?loi=1');
  const recent = await one<{ n: number }>("SELECT count(*)::int AS n FROM issue_reports WHERE contact=$1 AND created_at > now() - interval '10 minutes'", [contact]);
  if ((recent?.n ?? 0) >= 5) redirect('/bao-loi?loi=2');
  await q('INSERT INTO issue_reports(order_code, contact, page, message) VALUES ($1,$2,$3,$4)', [orderCode, contact, page, message]);
  await notifyText(`Khách báo lỗi${orderCode ? ` (đơn ${orderCode})` : ''}: ${message.slice(0, 300)}`).catch(() => {});
  redirect('/bao-loi?da=1');
}

export default function ReportPage({ searchParams }: { searchParams: { da?: string; loi?: string; ma?: string } }) {
  return (
    <div className="stack" style={{ maxWidth: 640 }}>
      <h1>Báo lỗi <span className="muted small">/ Report a problem</span></h1>
      <p className="muted">taomua đang chạy thật với khách thật. Bạn gặp lỗi khi đặt hàng, thanh toán, giao hàng hoặc thấy sai giá, hãy báo để chúng tôi sửa ngay.
        <br />We are in live testing. Tell us anything that went wrong with ordering, payment, delivery or prices.</p>
      {searchParams.da && <div className="alert ok">Đã nhận. Cảm ơn bạn! / Received, thank you!</div>}
      {searchParams.loi === '1' && <div className="alert bad">Cần thông tin liên hệ và mô tả lỗi. / Please add contact and description.</div>}
      {searchParams.loi === '2' && <div className="alert bad">Bạn gửi quá nhiều lần, hãy thử lại sau. / Too many reports, try later.</div>}
      <form action={send} className="card stack">
        <label className="field">Email hoặc số điện thoại · Email or phone<input name="contact" required minLength={5} maxLength={200} /></label>
        <label className="field">Mã đơn (nếu có) · Order code<input name="order_code" defaultValue={(searchParams.ma ?? '').slice(0, 30)} /></label>
        <label className="field">Trang gặp lỗi · Page<input name="page" placeholder="Ví dụ: giỏ hàng, thanh toán…" /></label>
        <label className="field">Mô tả lỗi · What happened<textarea name="message" required minLength={5} maxLength={3000} rows={5} /></label>
        <input name="website" tabIndex={-1} autoComplete="off" aria-hidden style={{ position: 'absolute', left: -9999 }} />
        <button className="btn">Gửi / Send</button>
      </form>
    </div>
  );
}
