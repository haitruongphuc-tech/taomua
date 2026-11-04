import { q, one } from '@/lib/db';
import { audit } from '@/lib/audit';
import { normalizePhone } from '@/lib/orders';
import { redirect } from 'next/navigation';

export const metadata = { title: 'Yêu cầu báo giá' };

async function submitRfq(fd: FormData) {
  'use server';
  if (fd.get('website')) redirect('/bao-gia?ok=1');
  const name = String(fd.get('name') ?? '').trim().slice(0, 120);
  const product = String(fd.get('product') ?? '').trim().slice(0, 2000);
  const qty = Math.floor(Number(fd.get('qty')));
  const target = Number(fd.get('target')) || null;
  let phone: string;
  try { phone = normalizePhone(String(fd.get('phone') ?? '')); } catch { redirect('/bao-gia?loi=sdt'); }
  if (name.length < 2 || product.length < 3 || !(qty > 0)) redirect('/bao-gia?loi=thieu');
  const recent = await one<{ n: number }>("SELECT count(*)::int AS n FROM rfqs WHERE phone=$1 AND created_at > now() - interval '1 hour'", [phone]);
  if ((recent?.n ?? 0) >= 5) redirect('/bao-gia?loi=nhieu');
  const seq = await one<{ n: number }>('SELECT count(*)::int + 801 AS n FROM rfqs');
  const code = `RFQ-${seq!.n}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
  const r = await q('INSERT INTO rfqs(code, contact_name, phone, email, product_text, quantity, target_price) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
    [code, name, phone, String(fd.get('email') ?? '').slice(0, 200) || null, product, qty, target]);
  await audit({ label: `Khách ${phone}` }, 'rfq.create', 'rfq', r[0].id, { code });
  redirect(`/bao-gia?ok=${code}`);
}

const ERR: Record<string, string> = { sdt: 'Số điện thoại không hợp lệ.', thieu: 'Hãy điền đủ tên, mô tả sản phẩm và số lượng.', nhieu: 'Bạn gửi quá nhiều yêu cầu, hãy thử lại sau.' };

export default function RfqPage({ searchParams }: { searchParams: { ok?: string; loi?: string } }) {
  return (
    <div className="stack" style={{ maxWidth: 720 }}>
      <h1>Yêu cầu báo giá (RFQ)</h1>
      <p className="muted">Mô tả sản phẩm bạn cần. taomua tìm xưởng phù hợp và gửi báo giá theo số lượng.</p>
      {searchParams.ok && <div className="alert ok">Đã nhận yêu cầu {searchParams.ok !== '1' ? searchParams.ok : ''}. taomua sẽ liên hệ qua số điện thoại bạn để lại.</div>}
      {searchParams.loi && <div className="alert bad">{ERR[searchParams.loi] ?? 'Có lỗi, hãy thử lại.'}</div>}
      <form action={submitRfq} className="card stack">
        <div className="form-grid">
          <label className="field">Tên shop / người liên hệ<input name="name" required minLength={2} maxLength={120} /></label>
          <label className="field">Số điện thoại<input name="phone" required inputMode="tel" /></label>
          <label className="field">Email (không bắt buộc)<input name="email" type="email" /></label>
        </div>
        <label className="field">Sản phẩm cần tìm<textarea name="product" required placeholder="Ví dụ: áo thun cotton in logo, 3 màu, size M-XL" /></label>
        <div className="form-grid">
          <label className="field">Số lượng<input name="qty" type="number" min={1} required /></label>
          <label className="field">Giá mong muốn mỗi cái (đ, không bắt buộc)<input name="target" type="number" min={0} step={500} /></label>
        </div>
        <input name="website" tabIndex={-1} autoComplete="off" aria-hidden style={{ position: 'absolute', left: -9999 }} />
        <div><button className="btn">Gửi yêu cầu</button></div>
      </form>
    </div>
  );
}
