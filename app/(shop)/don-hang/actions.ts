'use server';
import { findOrderForCustomer, releaseEscrow, OrderError } from '@/lib/orders';
import { q } from '@/lib/db';
import { paymentInfo } from '@/lib/legal';
import { usd } from '@/lib/countries';
import { paymentQr, simActionsAllowed } from '@/lib/money-sim';
import { markPaid } from '@/lib/orders';
import { connectorEnabled } from '@/lib/connectors';
import { logConnector } from '@/lib/sim';

export type TrackState = { error?: string; message?: string; order?: any; items?: any[]; payment?: ReturnType<typeof paymentInfo>; code?: string; phone?: string; usd?: number | null; qr?: Awaited<ReturnType<typeof paymentQr>> | null; simPay?: boolean };

async function load(code: string, phone: string): Promise<TrackState> {
  const o = await findOrderForCustomer(code, phone);
  if (!o) return { error: 'Không tìm thấy đơn với mã và số điện thoại này.', code, phone };
  const items = await q('SELECT product_name, quantity, tier, unit_price FROM order_items WHERE order_id=$1', [o.id]);
  const waiting = o.status === 'CHO_THANH_TOAN';
  const qr = waiting ? await paymentQr(o.code, Number(o.amount_due)) : null;
  return { order: o, items, payment: waiting ? paymentInfo() : null, code, phone, usd: o.ship_country !== 'VN' ? usd(Number(o.amount_due)) : null,
    qr, simPay: waiting && !connectorEnabled('PAYMENT_GATEWAY') && simActionsAllowed() };
}

export async function lookup(_: TrackState, fd: FormData): Promise<TrackState> {
  const code = String(fd.get('code') ?? '').slice(0, 30);
  const phone = String(fd.get('phone') ?? '').slice(0, 25);
  if (!code || !phone) return { error: 'Nhập mã đơn và số điện thoại.', code, phone };
  return load(code, phone);
}

export async function confirmReceived(_: TrackState, fd: FormData): Promise<TrackState> {
  const code = String(fd.get('code') ?? '');
  const phone = String(fd.get('phone') ?? '');
  const o = await findOrderForCustomer(code, phone);
  if (!o) return { error: 'Không tìm thấy đơn.', code, phone };
  try {
    await releaseEscrow(o.id, { kind: 'CUSTOMER', phone });
  } catch (e) {
    if (e instanceof OrderError) return { ...(await load(code, phone)), error: e.message };
    throw e;
  }
  return { ...(await load(code, phone)), message: 'Cảm ơn bạn đã xác nhận. Tiền đã được chuyển cho xưởng.' };
}

/** Cổng thanh toán (9PAY / VNPay / Momo / Alipay) GIẢ LẬP: chỉ khi thử nghiệm (SIM_ACTIONS). Ghi nhận tiền như khi cổng thật báo về. */
export async function simGatewayPay(_: TrackState, fd: FormData): Promise<TrackState> {
  const code = String(fd.get('code') ?? '');
  const phone = String(fd.get('phone') ?? '');
  const method = String(fd.get('method') ?? '9PAY').slice(0, 20);
  if (!simActionsAllowed()) return { ...(await load(code, phone)), error: 'Cổng thanh toán giả lập đã tắt khi chạy thật.' };
  const o = await findOrderForCustomer(code, phone);
  if (!o) return { error: 'Không tìm thấy đơn.', code, phone };
  try {
    await markPaid(o.id, { id: null, label: `Cổng ${method} (GIẢ LẬP)` });
    await logConnector('PAYMENT_GATEWAY', 'GIA_LAP', { order: o.code, method, amount: Number(o.amount_due) }, { ok: true });
  } catch (e) {
    if (e instanceof OrderError) return { ...(await load(code, phone)), error: e.message };
    throw e;
  }
  return { ...(await load(code, phone)), message: `Đã thanh toán qua ${method} (GIẢ LẬP). Tiền được giữ đến khi bạn xác nhận nhận hàng.` };
}
