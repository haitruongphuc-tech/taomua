// Thanh toán / chuyển khoản / hóa đơn điện tử: THẬT khi có khóa + bộ chuyển đổi; chưa có thì GIẢ LẬP.
// AN TOÀN: giả lập có ghi vào sổ (đơn "đã nhận tiền", khoản chi "đã chi", số hóa đơn) nên chỉ chạy khi thử nghiệm:
// mặc định bật ở máy dev, tắt khi chạy production; ép bằng SIM_ACTIONS=on / off.
import QRCode from 'qrcode';
import type { PoolClient } from 'pg';
import { connectorEnabled } from './connectors';
import { paymentInfo, LEGAL } from './legal';
import { simInvoiceNo, simTransferRef, logConnector } from './sim';
import { UserError } from './action';

export const simActionsAllowed = () =>
  process.env.SIM_ACTIONS === 'on' || (process.env.SIM_ACTIONS !== 'off' && process.env.NODE_ENV !== 'production');

/** QR chuyển khoản cho khách: VietQR thật (có sẵn số tiền + nội dung = mã đơn) khi có tài khoản + mã BIN; chưa có thì QR GIẢ LẬP. */
export async function paymentQr(code: string, amount: number) {
  const pay = paymentInfo();
  if (pay?.bin) {
    const url = `https://img.vietqr.io/image/${encodeURIComponent(pay.bin)}-${encodeURIComponent(pay.no)}-compact2.png?amount=${Math.round(amount)}&addInfo=${encodeURIComponent(code)}&accountName=${encodeURIComponent(pay.name)}`;
    return { mode: 'THAT' as const, img: url, bank: pay.bank, no: pay.no, name: pay.name };
  }
  const text = `GIA LAP - KHONG CHUYEN TIEN THAT | ${LEGAL.name} | ${amount} VND | ND: ${code}`;
  return { mode: 'GIA_LAP' as const, svg: await QRCode.toString(text, { type: 'svg', margin: 1, width: 180 }), bank: 'Ngân hàng (GIẢ LẬP)', no: '0000 0000 0000', name: LEGAL.name };
}

/** Chuyển khoản một khoản chi đã duyệt qua API ngân hàng. Trả mã giao dịch. */
export async function bankTransfer(p: { id: string; amount: number; payee: string; reason: string }) {
  if (connectorEnabled('BANK')) {
    const r = await fetch(`${process.env.BANK_API_URL!.replace(/\/$/, '')}/transfers`, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.BANK_API_KEY}` },
      body: JSON.stringify({ amount: p.amount, beneficiary: p.payee, description: `TAOMUA ${p.id.slice(0, 8)} ${p.reason}`.slice(0, 140), idempotency_key: p.id }),
    });
    if (!r.ok) throw new UserError(`Ngân hàng trả lỗi ${r.status}: chưa chuyển.`);
    const v = await r.json();
    const ref = String(v.reference ?? v.ref ?? v.id ?? '');
    if (!ref) throw new UserError('Ngân hàng không trả mã giao dịch.');
    await logConnector('BANK', 'THAT', { payout: p.id, amount: p.amount }, v);
    return { ref, mode: 'THAT' as const };
  }
  if (!simActionsAllowed()) throw new UserError('Chưa kết nối API ngân hàng: kế toán chuyển khoản tay rồi nhập mã giao dịch.');
  const ref = simTransferRef(p.id);
  await logConnector('BANK', 'GIA_LAP', { payout: p.id, amount: p.amount, payee: p.payee }, { ref });
  return { ref, mode: 'GIA_LAP' as const };
}

/** Xuất hóa đơn điện tử cho đơn đã nhận tiền. Trả số hóa đơn. */
export async function issueEInvoice(c: PoolClient, orderId: string) {
  const o = (await c.query(`SELECT o.*, cu.name AS customer, cu.tax_code FROM wholesale_orders o JOIN customers cu ON cu.id=o.customer_id WHERE o.id=$1 FOR UPDATE OF o`, [orderId])).rows[0];
  if (!o) throw new UserError('Không tìm thấy đơn.');
  if (o.payment_status !== 'DA_NHAN') throw new UserError('Chỉ xuất hóa đơn cho đơn đã nhận tiền.');
  if (o.invoice_no) throw new UserError(`Đơn đã có hóa đơn ${o.invoice_no}.`);
  let no: string, mode: 'THAT' | 'GIA_LAP';
  if (connectorEnabled('INVOICE')) {
    const items = (await c.query('SELECT product_name, quantity, unit_price FROM order_items WHERE order_id=$1', [orderId])).rows;
    const r = await fetch(`${process.env.EINVOICE_API_URL!.replace(/\/$/, '')}/invoices`, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.EINVOICE_API_KEY}` },
      body: JSON.stringify({ seller: { name: LEGAL.nameVi, tax_code: LEGAL.taxCode, address: LEGAL.address }, buyer: { name: o.customer, tax_code: o.tax_code },
        vat_rate: 8, total: Number(o.tong_dt), items: items.map((i: any) => ({ name: i.product_name, quantity: i.quantity, unit_price: Number(i.unit_price) })), reference: o.code }),
    });
    if (!r.ok) throw new UserError(`Nhà cung cấp hóa đơn trả lỗi ${r.status}.`);
    const v = await r.json();
    no = String(v.invoice_no ?? v.number ?? ''); mode = 'THAT';
    if (!no) throw new UserError('Nhà cung cấp hóa đơn không trả số hóa đơn.');
    await logConnector('INVOICE', 'THAT', { order: o.code }, v);
  } else {
    if (!simActionsAllowed()) throw new UserError('Chưa kết nối hóa đơn điện tử: xuất trên VNPT / Viettel rồi ghi số hóa đơn tay.');
    no = simInvoiceNo(o.code); mode = 'GIA_LAP';
    await logConnector('INVOICE', 'GIA_LAP', { order: o.code, total: Number(o.tong_dt) }, { invoice_no: no });
  }
  await c.query('UPDATE wholesale_orders SET invoice_no=$2, invoice_at=now(), invoice_mode=$3 WHERE id=$1', [orderId, no, mode]);
  return { invoice_no: no, mode };
}
