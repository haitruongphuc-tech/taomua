import type { PoolClient } from 'pg';
import { tx, one } from './db';
import { audit, type Actor } from './audit';
import { calcMargin, tierFor, priceForTier, type Tier } from './pricing';
import { approvalLevel, canApprove, deadlineFor, LEVELS, type Level } from './approval';

export class OrderError extends Error {}

export type NewOrder = {
  channelCode: string;
  customer: { name: string; phone: string; email?: string | null };
  address: string;
  note?: string;
  externalRef?: string | null;
  items: { productId: string; quantity: number; unitPrice?: number }[];
};

const SYSTEM: Actor = { id: null, label: 'Hệ thống' };

export function normalizePhone(p: string) {
  const d = p.replace(/[^\d+]/g, '');
  if (!/^(\+?84|0)\d{8,10}$/.test(d)) throw new OrderError('Số điện thoại không hợp lệ.');
  return d.replace(/^\+?84/, '0');
}

/** Tạo đơn từ bất kỳ kênh nào. Kênh taomua.com dùng giá 4 bậc; kênh khác dùng giá niêm yết trên kênh
 *  (hoặc giá thực bán do nhân viên nhập khi nhập đơn từ kênh). Mọi đơn đều qua cùng quy tắc duyệt. */
export async function createOrder(input: NewOrder, actor: Actor = SYSTEM) {
  if (!input.items.length) throw new OrderError('Đơn chưa có sản phẩm.');
  if (input.items.length > 50) throw new OrderError('Một đơn tối đa 50 dòng.');
  const name = input.customer.name.trim();
  const address = input.address.trim();
  if (name.length < 2 || name.length > 120) throw new OrderError('Tên khách không hợp lệ.');
  if (address.length < 5 || address.length > 500) throw new OrderError('Địa chỉ giao hàng không hợp lệ.');
  const phone = normalizePhone(input.customer.phone);

  return tx(async (c) => {
    const ch = (await c.query('SELECT * FROM sales_channels WHERE code=$1 AND active', [input.channelCode])).rows[0];
    if (!ch) throw new OrderError('Kênh bán không tồn tại hoặc đang tắt.');
    const own = ch.kind === 'OWN';

    const lines: { product: any; quantity: number; tier: Tier | 0; unitPrice: number }[] = [];
    for (const it of input.items) {
      const qty = Math.floor(Number(it.quantity));
      if (!(qty > 0) || qty > 1_000_000) throw new OrderError('Số lượng không hợp lệ.');
      const p = (await c.query('SELECT * FROM products WHERE id=$1 FOR SHARE', [it.productId])).rows[0];
      if (!p) throw new OrderError('Sản phẩm không tồn tại.');
      if (own) {
        if (!p.published) throw new OrderError(`${p.name} hiện không bán.`);
        const tier = tierFor(qty);
        if (!tier || qty < p.moq) throw new OrderError(`${p.name}: tối thiểu ${Math.max(10, p.moq)} cái.`);
        lines.push({ product: p, quantity: qty, tier, unitPrice: priceForTier(p, tier) });
      } else {
        let price = it.unitPrice;
        if (price === undefined) {
          const l = (await c.query('SELECT price FROM channel_listings WHERE channel_id=$1 AND product_id=$2', [ch.id, p.id])).rows[0];
          if (!l) throw new OrderError(`${p.name} chưa có giá trên kênh ${ch.name}.`);
          price = Number(l.price);
        }
        if (!(price > 0)) throw new OrderError('Giá bán không hợp lệ.');
        lines.push({ product: p, quantity: qty, tier: 0, unitPrice: Math.round(price) });
      }
    }

    const revenue = lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
    const cost = lines.reduce((s, l) => s + (Number(l.product.cost) + Number(l.product.fee)) * l.quantity, 0);
    const inputVat = lines.reduce((s, l) => s + Number(l.product.input_vat) * l.quantity, 0);
    const m = calcMargin({ revenue, cost, inputVat, channelFeePct: Number(ch.fee_pct) });
    const { level, reason } = approvalLevel(m.revenue, m.marginOnCost, m.net);
    const auto = level === 1;

    const cust = (await c.query(
      `INSERT INTO customers(name, phone, email, kind) VALUES ($1,$2,$3,$4)
       ON CONFLICT (phone) DO UPDATE SET name=EXCLUDED.name, email=COALESCE(EXCLUDED.email, customers.email)
       RETURNING id`, [name, phone, input.customer.email || null, own ? 'SI' : 'LE'])).rows[0];

    const seq = (await c.query("SELECT nextval('order_code_seq') AS n")).rows[0].n;
    const code = `TM${seq}`;
    const o = (await c.query(
      `INSERT INTO wholesale_orders(code, channel_id, external_ref, customer_id, ship_address, note, status,
         tong_dt, tong_chi_phi_truoc_thue, vat_dau_vao, phi_kenh, vat_8, phi_mb_1, ln_truoc_tndn, thue_tndn_20, ln_rong_sau_thue,
         bien_rong_tren_chi_phi, bien_rong_tren_dt, cap_duyet, cap_ly_do, approval_status, approval_deadline,
         approved_by_label, approved_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24) RETURNING *`,
      [code, ch.id, input.externalRef || null, cust.id, address, (input.note ?? '').slice(0, 1000),
        auto ? 'CHO_THANH_TOAN' : 'CHO_DUYET',
        m.revenue, m.cost, m.inputVat, m.channelFee, m.vatOut, m.bankFee, m.preTax, m.cit, m.net,
        m.marginOnCost, m.marginOnRevenue, level, reason,
        auto ? 'APPROVED' : 'PENDING', auto ? null : deadlineFor(level),
        auto ? 'Tự động (Cấp 1)' : null, auto ? new Date() : null])).rows[0];

    for (const l of lines) {
      await c.query(
        `INSERT INTO order_items(order_id, product_id, product_name, quantity, tier, unit_price, unit_cost, unit_input_vat)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [o.id, l.product.id, l.product.name, l.quantity, l.tier, l.unitPrice,
          Number(l.product.cost) + Number(l.product.fee), Number(l.product.input_vat)]);
    }
    if (auto) {
      await c.query(`INSERT INTO approvals(order_id, level, decision, decided_by_label, via) VALUES ($1,1,'APPROVED','Tự động','AUTO')`, [o.id]);
    }
    await audit(actor, 'order.create', 'order', o.id, { code, channel: ch.code, revenue: m.revenue, level }, c);
    return o;
  }).catch((e) => {
    if (e?.code === '23505' && String(e?.constraint).includes('external_ref')) throw new OrderError('Đơn này của kênh đã được nhập trước đó.');
    throw e;
  });
}

async function lockOrder(c: PoolClient, id: string) {
  const o = (await c.query('SELECT * FROM wholesale_orders WHERE id=$1 FOR UPDATE', [id])).rows[0];
  if (!o) throw new OrderError('Không tìm thấy đơn.');
  return o;
}

export async function decideApproval(
  orderId: string, user: { id: string; role: string; label: string }, decision: 'APPROVED' | 'REJECTED', note = '', via: 'WEB' | 'TELEGRAM' = 'WEB',
) {
  return tx(async (c) => {
    const o = await lockOrder(c, orderId);
    if (o.approval_status !== 'PENDING') throw new OrderError('Đơn đã được xử lý.');
    if (!canApprove(user.role, o.cap_duyet as Level)) throw new OrderError(`${LEVELS[o.cap_duyet as Level].label} cần ${LEVELS[o.cap_duyet as Level].approver} duyệt.`);
    if (decision === 'REJECTED' && !note.trim()) throw new OrderError('Từ chối cần ghi lý do.');
    await c.query(
      `UPDATE wholesale_orders SET approval_status=$2, approved_by=$3, approved_by_label=$4, approved_at=now(),
         status=CASE WHEN $2='APPROVED' THEN 'CHO_THANH_TOAN' ELSE 'TU_CHOI' END, updated_at=now() WHERE id=$1`,
      [orderId, decision, user.id, user.label]);
    await c.query('INSERT INTO approvals(order_id, level, decision, decided_by, decided_by_label, via, note) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [orderId, o.cap_duyet, decision, user.id, user.label, via, note]);
    await audit({ id: user.id, label: user.label }, decision === 'APPROVED' ? 'order.approve' : 'order.reject', 'order', orderId, { code: o.code, level: o.cap_duyet, via, note }, c);
  });
}

/** Ghi nhận đã nhận tiền: tiền chuyển sang trạng thái giữ (Trade Assurance) cho tới khi khách hoặc CEO xác nhận. */
export async function markPaid(orderId: string, actor: Actor, c0?: PoolClient) {
  const run = async (c: PoolClient) => {
    const o = await lockOrder(c, orderId);
    if (o.approval_status !== 'APPROVED') throw new OrderError('Đơn chưa được duyệt.');
    if (o.payment_status === 'DA_NHAN') throw new OrderError('Đơn đã ghi nhận tiền.');
    if (!['CHO_THANH_TOAN'].includes(o.status)) throw new OrderError('Trạng thái đơn không cho phép ghi nhận tiền.');
    await c.query(`UPDATE wholesale_orders SET payment_status='DA_NHAN', paid_at=now(), trade_assurance_status='HOLD',
      status='DANG_CHUAN_BI', updated_at=now() WHERE id=$1`, [orderId]);
    await audit(actor, 'order.paid', 'order', orderId, { code: o.code, amount: o.tong_dt }, c);
  };
  return c0 ? run(c0) : tx(run);
}

export async function shipOrder(orderId: string, actor: Actor, carrier: string, trackingNo: string, wfs: string) {
  return tx(async (c) => {
    const o = await lockOrder(c, orderId);
    if (o.status !== 'DANG_CHUAN_BI') throw new OrderError('Chỉ giao đơn đã nhận tiền và đang chuẩn bị.');
    if (!carrier.trim() || !trackingNo.trim()) throw new OrderError('Cần hãng vận chuyển và mã vận đơn.');
    if (!['DROPSHIP', 'WFS_FULFILLMENT', 'SAME_DAY_30MIN'].includes(wfs)) throw new OrderError('Hình thức giao không hợp lệ.');
    await c.query(`UPDATE wholesale_orders SET status='DANG_GIAO', carrier=$2, tracking_no=$3, wfs_status=$4, updated_at=now() WHERE id=$1`,
      [orderId, carrier.trim(), trackingNo.trim(), wfs]);
    await audit(actor, 'order.ship', 'order', orderId, { code: o.code, carrier, trackingNo, wfs }, c);
  });
}

export async function markDelivered(orderId: string, actor: Actor) {
  return tx(async (c) => {
    const o = await lockOrder(c, orderId);
    if (o.status !== 'DANG_GIAO') throw new OrderError('Đơn chưa ở trạng thái đang giao.');
    await c.query(`UPDATE wholesale_orders SET status='DA_GIAO', updated_at=now() WHERE id=$1`, [orderId]);
    await audit(actor, 'order.delivered', 'order', orderId, { code: o.code }, c);
  });
}

/** Giải ngân tiền đang giữ. Khách chỉ xác nhận được khi hàng đang giao hoặc đã giao; CEO xác nhận được bất kỳ lúc nào sau khi nhận tiền. */
export async function releaseEscrow(orderId: string, by: { kind: 'CUSTOMER'; phone: string } | { kind: 'CEO'; actor: Actor }) {
  return tx(async (c) => {
    const o = await lockOrder(c, orderId);
    if (o.trade_assurance_status !== 'HOLD') throw new OrderError('Đơn không có tiền đang giữ.');
    let label: string;
    let actor: Actor;
    if (by.kind === 'CUSTOMER') {
      const cust = (await c.query('SELECT phone FROM customers WHERE id=$1', [o.customer_id])).rows[0];
      if (!cust || cust.phone !== normalizePhone(by.phone)) throw new OrderError('Số điện thoại không khớp với đơn.');
      if (!['DANG_GIAO', 'DA_GIAO'].includes(o.status)) throw new OrderError('Chỉ xác nhận khi hàng đã được gửi đi.');
      label = 'Khách xác nhận đã nhận hàng';
      actor = { id: null, label: `Khách ${cust.phone}` };
    } else {
      label = `CEO xác nhận: ${by.actor.label}`;
      actor = by.actor;
    }
    await c.query(`UPDATE wholesale_orders SET trade_assurance_status='RELEASED', released_by_label=$2, released_at=now(),
      status='HOAN_TAT', updated_at=now() WHERE id=$1`, [orderId, label]);
    await audit(actor, 'escrow.release', 'order', orderId, { code: o.code, amount: o.tong_dt }, c);
  });
}

export async function refundOrder(orderId: string, actor: Actor, reason: string) {
  if (!reason.trim()) throw new OrderError('Hoàn tiền cần ghi lý do.');
  return tx(async (c) => {
    const o = await lockOrder(c, orderId);
    if (o.trade_assurance_status !== 'HOLD') throw new OrderError('Chỉ hoàn được tiền đang giữ.');
    await c.query(`UPDATE wholesale_orders SET trade_assurance_status='REFUND', status='HUY', released_by_label=$2, released_at=now(), updated_at=now() WHERE id=$1`,
      [orderId, `Hoàn tiền: ${reason}`]);
    await audit(actor, 'escrow.refund', 'order', orderId, { code: o.code, amount: o.tong_dt, reason }, c);
  });
}

export async function cancelOrder(orderId: string, actor: Actor, reason: string) {
  return tx(async (c) => {
    const o = await lockOrder(c, orderId);
    if (o.payment_status === 'DA_NHAN') throw new OrderError('Đơn đã nhận tiền: dùng hoàn tiền thay vì hủy.');
    if (['HUY', 'TU_CHOI', 'HOAN_TAT'].includes(o.status)) throw new OrderError('Đơn đã đóng.');
    await c.query(`UPDATE wholesale_orders SET status='HUY', updated_at=now() WHERE id=$1`, [orderId]);
    await audit(actor, 'order.cancel', 'order', orderId, { code: o.code, reason }, c);
  });
}

export async function findOrderForCustomer(code: string, phone: string) {
  let p: string;
  try { p = normalizePhone(phone); } catch { return null; }
  return one(
    `SELECT o.id, o.code, o.status, o.tong_dt, o.payment_status, o.trade_assurance_status, o.wfs_status, o.carrier, o.tracking_no,
            o.created_at, o.approval_status, o.released_by_label, ch.name AS channel_name
     FROM wholesale_orders o JOIN customers cu ON cu.id=o.customer_id JOIN sales_channels ch ON ch.id=o.channel_id
     WHERE upper(o.code)=upper($1) AND cu.phone=$2`, [code.trim(), p]);
}
