import { NextResponse } from 'next/server';
import { createOrder, OrderError } from '@/lib/orders';
import { notifyApproval } from '@/lib/telegram';
import { quoteCart } from '@/lib/quote';
import { one } from '@/lib/db';
import { phoneKey } from '@/lib/countries';
import { logError } from '@/lib/errors';

// Đặt hàng từ cửa hàng taomua.com (khách không cần tài khoản; tra cứu đơn bằng mã + số điện thoại).
export async function POST(req: Request) {
  const b = await req.json().catch(() => null);
  if (!b || !Array.isArray(b.lines)) return NextResponse.json({ error: 'Dữ liệu không hợp lệ.' }, { status: 400 });
  if (b.website) return NextResponse.json({ error: 'Dữ liệu không hợp lệ.' }, { status: 400 }); // bẫy bot

  // Giới hạn đơn giản: tối đa 5 đơn mỗi số điện thoại trong 10 phút.
  const phone = String(b.phone ?? '');
  const recent = await one<{ n: number }>(
    `SELECT count(*)::int AS n FROM wholesale_orders o JOIN customers c ON c.id=o.customer_id
     WHERE c.phone=$1 AND o.created_at > now() - interval '10 minutes'`, [phoneKey(phone) ?? phone]);
  if ((recent?.n ?? 0) >= 5) return NextResponse.json({ error: 'Bạn đặt quá nhiều đơn trong thời gian ngắn. Hãy thử lại sau.' }, { status: 429 });

  const quote = await quoteCart(b.lines);
  if (!quote.ok) return NextResponse.json({ error: 'Giỏ hàng có dòng chưa hợp lệ.', quote }, { status: 400 });
  try {
    const o = await createOrder({
      channelCode: 'taomua',
      customer: { name: String(b.name ?? ''), phone, email: b.email ? String(b.email).slice(0, 200) : null },
      address: String(b.address ?? ''),
      country: String(b.country ?? 'VN'),
      note: String(b.note ?? ''),
      items: quote.lines.map((l) => ({ productId: l.id, quantity: l.qty })),
    }, { id: null, label: `Khách ${phone}` });
    if (o.approval_status === 'PENDING') await notifyApproval(o).catch(() => null);
    return NextResponse.json({ code: o.code, total: o.tong_dt, needsApproval: o.approval_status === 'PENDING' });
  } catch (e) {
    if (e instanceof OrderError) return NextResponse.json({ error: e.message }, { status: 400 });
    await logError('api/orders', e, { country: b.country, lines: b.lines?.length });
    return NextResponse.json({ error: 'Lỗi hệ thống, hãy thử lại. / System error, please retry.' }, { status: 500 });
  }
}
