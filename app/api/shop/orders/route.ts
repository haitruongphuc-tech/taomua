import { NextResponse } from 'next/server';
import { createOrder, OrderError } from '@/lib/orders';
import { notifyOrderPending } from '@/lib/notify';
import { quoteRetail, RETAIL_CHANNEL } from '@/lib/retail';
import { one } from '@/lib/db';
import { phoneKey } from '@/lib/countries';
import { logError } from '@/lib/errors';

// Mua ngay 1 chạm ở /shop (9mua bán lẻ). Giá lấy từ niêm yết kênh 9mua ở máy chủ, không tin giá từ trình duyệt.
export async function POST(req: Request) {
  const b = await req.json().catch(() => null);
  if (!b || !Array.isArray(b.lines)) return NextResponse.json({ error: 'Dữ liệu không hợp lệ.' }, { status: 400 });
  if (b.website) return NextResponse.json({ error: 'Dữ liệu không hợp lệ.' }, { status: 400 }); // bẫy bot
  const phone = String(b.phone ?? '');
  const recent = await one<{ n: number }>(`SELECT count(*)::int AS n FROM wholesale_orders o JOIN customers c ON c.id=o.customer_id
    WHERE c.phone=$1 AND o.created_at > now() - interval '10 minutes'`, [phoneKey(phone) ?? phone]);
  if ((recent?.n ?? 0) >= 5) return NextResponse.json({ error: 'Bạn đặt quá nhiều đơn trong thời gian ngắn. Hãy thử lại sau.' }, { status: 429 });
  const quote = await quoteRetail(b.lines);
  if (!quote.ok) return NextResponse.json({ error: quote.lines.find((l) => l.error)?.error ?? 'Giỏ hàng chưa hợp lệ.', quote }, { status: 400 });
  try {
    const o = await createOrder({
      channelCode: RETAIL_CHANNEL,
      customer: { name: String(b.name ?? ''), phone, email: b.email ? String(b.email).slice(0, 200) : null },
      address: String(b.address ?? ''), country: String(b.country ?? 'VN'), note: String(b.note ?? '').slice(0, 500),
      items: quote.lines.map((l) => ({ productId: l.id, quantity: l.qty })),
    }, { id: null, label: `Khách lẻ ${phone}` });
    if (o.approval_status === 'PENDING') await notifyOrderPending(o).catch(() => null);
    return NextResponse.json({ code: o.code, total: Number(o.tong_dt), needsApproval: o.approval_status === 'PENDING' });
  } catch (e) {
    if (e instanceof OrderError) return NextResponse.json({ error: e.message }, { status: 400 });
    await logError('api/shop/orders', e, { lines: b.lines?.length });
    return NextResponse.json({ error: 'Lỗi hệ thống, hãy thử lại. / System error, please retry.' }, { status: 500 });
  }
}
