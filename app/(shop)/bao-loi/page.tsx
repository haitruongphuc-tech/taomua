import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { q, one } from '@/lib/db';
import { notifyText } from '@/lib/notify';
import { classifyIssue, type Kind } from '@/lib/complaints';

export const metadata = { title: 'Báo lỗi / Khiếu nại · Report a problem' };

async function send(fd: FormData) {
  'use server';
  if (fd.get('website')) redirect('/bao-loi?da=1'); // bẫy bot
  const contact = String(fd.get('contact') ?? '').trim().slice(0, 200);
  const message = String(fd.get('message') ?? '').trim().slice(0, 3000);
  const kind: Kind = fd.get('kind') === 'KHIEU_NAI' ? 'KHIEU_NAI' : 'LOI';
  const orderCode = String(fd.get('order_code') ?? '').trim().toUpperCase().slice(0, 30) || null;
  const page = String(fd.get('page') ?? '').trim().slice(0, 300) || headers().get('referer')?.slice(0, 300) || null;
  if (contact.length < 5 || message.length < 5) redirect('/bao-loi?loi=1');
  const recent = await one<{ n: number }>("SELECT count(*)::int AS n FROM issue_reports WHERE contact=$1 AND created_at > now() - interval '10 minutes'", [contact]);
  if ((recent?.n ?? 0) >= 5) redirect('/bao-loi?loi=2');
  const order = orderCode ? await one('SELECT tong_dt FROM wholesale_orders WHERE upper(code)=$1', [orderCode]) : null;
  const c = classifyIssue({ kind, message, orderAmount: order ? Number(order.tong_dt) : null });
  await q('INSERT INTO issue_reports(order_code, contact, page, message, kind, severity, resolution, status, ai_reason) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
    [orderCode, contact, page, message, kind, c.severity, c.resolution, c.status, c.reason]);
  await notifyText(`${c.severity === 'CAO' ? '[CẦN CEO] ' : ''}${kind === 'KHIEU_NAI' ? 'Khiếu nại' : 'Báo lỗi'}${orderCode ? ` đơn ${orderCode}` : ''}: ${message.slice(0, 300)}`,
    `${process.env.SITE_URL ?? ''}/quan-tri/khieu-nai`).catch(() => {});
  redirect('/bao-loi?da=1');
}

export default function ReportPage({ searchParams }: { searchParams: { da?: string; loi?: string; ma?: string } }) {
  return (
    <div className="stack" style={{ maxWidth: 640 }}>
      <h1>Báo lỗi / Khiếu nại <span className="muted small">/ Report a problem</span></h1>
      <p className="muted">Gặp lỗi khi đặt hàng, thanh toán, hoặc hàng nhận được có vấn đề, hãy báo để taomua xử lý ngay. Tiền của bạn được giữ đến khi bạn xác nhận đã nhận hàng đúng.
        <br />Tell us about any website problem or an issue with your order. Your payment is held until you confirm delivery.</p>
      {searchParams.da && <div className="alert ok">Đã nhận. taomua sẽ liên hệ lại sớm. / Received, we will contact you soon.</div>}
      {searchParams.loi === '1' && <div className="alert bad">Cần thông tin liên hệ và mô tả. / Please add contact and description.</div>}
      {searchParams.loi === '2' && <div className="alert bad">Bạn gửi quá nhiều lần, hãy thử lại sau. / Too many reports, try later.</div>}
      <form action={send} className="card stack">
        <label className="field">Loại · Type<select name="kind" defaultValue={searchParams.ma ? 'KHIEU_NAI' : 'LOI'}>
          <option value="KHIEU_NAI">Khiếu nại đơn hàng (hàng lỗi, thiếu, giao chậm, hoàn tiền) · Order complaint</option>
          <option value="LOI">Lỗi website / thanh toán · Website or payment problem</option>
        </select></label>
        <label className="field">Email hoặc số điện thoại · Email or phone<input name="contact" required minLength={5} maxLength={200} /></label>
        <label className="field">Mã đơn (nếu có) · Order code<input name="order_code" defaultValue={(searchParams.ma ?? '').slice(0, 30)} /></label>
        <label className="field">Trang gặp lỗi · Page<input name="page" placeholder="Ví dụ: giỏ hàng, thanh toán…" /></label>
        <label className="field">Mô tả · What happened<textarea name="message" required minLength={5} maxLength={3000} rows={5} /></label>
        <input name="website" tabIndex={-1} autoComplete="off" aria-hidden style={{ position: 'absolute', left: -9999 }} />
        <button className="btn">Gửi / Send</button>
      </form>
    </div>
  );
}
