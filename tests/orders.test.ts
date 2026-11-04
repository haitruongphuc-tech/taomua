// Kiểm thử luồng đơn trên database thật (taomua_test). Chạy: npm test
import fs from 'node:fs';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { pool, q, one } from '@/lib/db';
import { createOrder, decideApproval, markPaid, shipOrder, releaseEscrow, refundOrder, OrderError } from '@/lib/orders';
import { importChannelOrders, parseOrderCsv } from '@/lib/channels';
import { parseStatement, reconcile } from '@/lib/reconcile';

const sys = { id: null, label: 'test' };
let pid = '';
let ceo: any, lead: any;

beforeAll(async () => {
  await q('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await q(fs.readFileSync('db/schema.sql', 'utf8'));
  ceo = await one("INSERT INTO users(email,name,role,password_hash) VALUES ('c@t','CEO','CEO','x') RETURNING id, role");
  lead = await one("INSERT INTO users(email,name,role,password_hash) VALUES ('l@t','Lead','TRUONG_NHOM','x') RETURNING id, role");
  pid = (await one(`INSERT INTO products(sku,name,category,cost,fee,input_vat,price_taomua_10,price_taomua_50,price_taomua_100,price_taomua_500,moq,published)
    VALUES ('A','Áo','TT',20000,6000,0,49000,45000,42000,38000,10,true) RETURNING id`)).id;
  await q("INSERT INTO sales_channels(code,name,kind,connector,fee_pct) VALUES ('taomua','taomua.com','OWN','NATIVE',0),('9mua','9mua.com','PARTNER_SITE','MANUAL',5)");
  await q("INSERT INTO channel_listings(channel_id, product_id, price, status) SELECT id, $1, 69000, 'DANG_BAN' FROM sales_channels WHERE code='9mua'", [pid]);
});
afterAll(async () => { await pool.end(); });

const cust = (phone: string) => ({ name: 'Shop', phone });

describe('đơn taomua.com', () => {
  it('đơn nhỏ tự duyệt Cấp 1, giá theo bậc', async () => {
    const o = await createOrder({ channelCode: 'taomua', customer: cust('0900000001'), address: 'HCM 12345', items: [{ productId: pid, quantity: 50 }] }, sys);
    expect(o.cap_duyet).toBe(1);
    expect(o.approval_status).toBe('APPROVED');
    expect(o.tong_dt).toBe(50 * 45000);
  });
  it('dưới MOQ bị từ chối', async () => {
    await expect(createOrder({ channelCode: 'taomua', customer: cust('0900000001'), address: 'HCM 12345', items: [{ productId: pid, quantity: 9 }] }, sys)).rejects.toBeInstanceOf(OrderError);
  });
  it('đơn 5-20 triệu: trưởng nhóm duyệt được; 20-50 triệu thì không', async () => {
    const o2 = await createOrder({ channelCode: 'taomua', customer: cust('0900000002'), address: 'HCM 12345', items: [{ productId: pid, quantity: 200 }] }, sys);
    expect(o2.cap_duyet).toBe(2);
    await decideApproval(o2.id, { id: lead.id, role: 'TRUONG_NHOM', label: 'Lead' }, 'APPROVED');
    const o3 = await createOrder({ channelCode: 'taomua', customer: cust('0900000003'), address: 'HCM 12345', items: [{ productId: pid, quantity: 600 }] }, sys);
    expect(o3.cap_duyet).toBe(3);
    await expect(decideApproval(o3.id, { id: lead.id, role: 'TRUONG_NHOM', label: 'Lead' }, 'APPROVED')).rejects.toThrow(/CEO/);
    await expect(decideApproval(o3.id, { id: ceo.id, role: 'CEO', label: 'CEO' }, 'REJECTED', '')).rejects.toThrow(/lý do/);
    await decideApproval(o3.id, { id: ceo.id, role: 'CEO', label: 'CEO' }, 'APPROVED');
    await expect(decideApproval(o3.id, { id: ceo.id, role: 'CEO', label: 'CEO' }, 'APPROVED')).rejects.toThrow(/đã được xử lý/);
  });
  it('giữ tiền: khách chỉ xác nhận sau khi gửi hàng, sai SĐT bị chặn', async () => {
    const o = await createOrder({ channelCode: 'taomua', customer: cust('0900000004'), address: 'HCM 12345', items: [{ productId: pid, quantity: 10 }] }, sys);
    await markPaid(o.id, sys);
    expect((await one('SELECT trade_assurance_status FROM wholesale_orders WHERE id=$1', [o.id])).trade_assurance_status).toBe('HOLD');
    await expect(releaseEscrow(o.id, { kind: 'CUSTOMER', phone: '0900000004' })).rejects.toThrow(/gửi đi/);
    await shipOrder(o.id, sys, 'GHN', 'X1', 'DROPSHIP');
    await expect(releaseEscrow(o.id, { kind: 'CUSTOMER', phone: '0900000999' })).rejects.toThrow(/không khớp/);
    await releaseEscrow(o.id, { kind: 'CUSTOMER', phone: '+84900000004' });
    const r = await one('SELECT status, trade_assurance_status FROM wholesale_orders WHERE id=$1', [o.id]);
    expect(r).toEqual({ status: 'HOAN_TAT', trade_assurance_status: 'RELEASED' });
  });
  it('CEO hoàn tiền đang giữ', async () => {
    const o = await createOrder({ channelCode: 'taomua', customer: cust('0900000005'), address: 'HCM 12345', items: [{ productId: pid, quantity: 10 }] }, sys);
    await markPaid(o.id, sys);
    await refundOrder(o.id, sys, 'hàng lỗi');
    expect((await one('SELECT trade_assurance_status FROM wholesale_orders WHERE id=$1', [o.id])).trade_assurance_status).toBe('REFUND');
  });
  it('AI agent vượt hạn mức bị chặn', async () => {
    await q("INSERT INTO customers(name, phone, kind, agent_limit) VALUES ('Agent','0900000777','AI_AGENT',1000000)");
    await expect(createOrder({ channelCode: 'taomua', customer: cust('0900000777'), address: 'HCM 12345', items: [{ productId: pid, quantity: 50 }] }, sys)).rejects.toThrow(/hạn mức/);
  });
});

describe('kênh ngoài (9mua là một kênh như các kênh khác)', () => {
  it('dùng giá niêm yết của kênh và trừ phí kênh', async () => {
    const o = await createOrder({ channelCode: '9mua', externalRef: '9M-1', customer: cust('0900000010'), address: 'Hà Nội 123', items: [{ productId: pid, quantity: 2 }] }, sys);
    expect(o.tong_dt).toBe(138000);
    expect(o.phi_kenh).toBe(6900);
  });
  it('nhập CSV gộp dòng theo mã đơn và bỏ qua đơn trùng', async () => {
    const { rows, errors } = parseOrderCsv('ma_don_kenh,ten_khach,sdt,dia_chi,sku,so_luong,don_gia\nX1,Anh A,0900000011,"1 Lê Lợi, Q1",A,1,70000\nX1,Anh A,0900000011,"1 Lê Lợi, Q1",A,2,70000\n9M-1,Chị B,0900000012,HN 12345,A,1,70000\nX2,Cô C,0900000013,HN 12345,KHONGCO,1,70000');
    expect(errors).toEqual([]);
    const r = await importChannelOrders("9mua", rows, sys);
    expect(r.created).toHaveLength(1);
    expect(r.errors.join(' ')).toMatch(/trước đó/);
    expect(r.errors.join(' ')).toMatch(/KHONGCO/);
    const o = await one("SELECT tong_dt, ship_address FROM wholesale_orders WHERE external_ref='X1'");
    expect(o.tong_dt).toBe(210000);
    expect(o.ship_address).toBe('1 Lê Lợi, Q1');
  });
});

describe('đối soát', () => {
  it('khớp tiền vào theo mã đơn, ghi nhận đã nhận tiền, báo lệch', async () => {
    const o = await createOrder({ channelCode: 'taomua', customer: cust('0900000020'), address: 'HCM 12345', items: [{ productId: pid, quantity: 10 }] }, sys);
    const today = new Date().toISOString().slice(0, 10);
    const { rows } = parseStatement(`ngay,so_tien,noi_dung,ma_gd\n${today},${o.tong_dt},CK ${o.code.toLowerCase()} thanh toan,FT1\n${today},12345,khong ro,FT2`);
    const r = await reconcile(rows, { id: ceo.id, label: 'CEO' });
    expect(r.matchedOrders).toBe(1);
    expect(r.unmatched).toBe(1);
    expect((await one('SELECT trade_assurance_status FROM wholesale_orders WHERE id=$1', [o.id])).trade_assurance_status).toBe('HOLD');
    const again = await reconcile(rows, { id: ceo.id, label: 'CEO' });
    expect(again.duplicates).toBe(2);
  });
});
