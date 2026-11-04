'use server';
import { findOrderForCustomer, releaseEscrow, OrderError } from '@/lib/orders';
import { q } from '@/lib/db';
import { paymentInfo } from '@/lib/legal';

export type TrackState = { error?: string; message?: string; order?: any; items?: any[]; payment?: ReturnType<typeof paymentInfo>; code?: string; phone?: string };

async function load(code: string, phone: string): Promise<TrackState> {
  const o = await findOrderForCustomer(code, phone);
  if (!o) return { error: 'Không tìm thấy đơn với mã và số điện thoại này.', code, phone };
  const items = await q('SELECT product_name, quantity, tier, unit_price FROM order_items WHERE order_id=$1', [o.id]);
  return { order: o, items, payment: o.status === 'CHO_THANH_TOAN' ? paymentInfo() : null, code, phone };
}

export async function lookup(_: TrackState, fd: FormData): Promise<TrackState> {
  const code = String(fd.get('code') ?? '').slice(0, 30);
  const phone = String(fd.get('phone') ?? '').slice(0, 20);
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
