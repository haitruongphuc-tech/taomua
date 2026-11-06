// Chế độ GIẢ LẬP cho dịch vụ ngoài (chủ dự án yêu cầu): cố định, có nhãn, ghi nhật ký; luồng TREND → SUPPLY → CEO chạy trọn.
import fs from 'node:fs';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { pool, q, one, tx } from '@/lib/db';
import { simTrends, sim1688Suppliers, simQc, TREND_SOURCES } from '@/lib/sim';
import { runAgents } from '@/lib/agents';
import { decideAgentAction } from '@/lib/agents/decide';
import { recordQc } from '@/lib/qc';
import { notifyText } from '@/lib/notify';
import { bankTransfer, issueEInvoice, simActionsAllowed, paymentQr } from '@/lib/money-sim';
import { createOrder, markPaid } from '@/lib/orders';
import { LEGAL } from '@/lib/legal';

describe('dữ liệu giả lập cố định, có nhãn', () => {
  it('trend 20 nguồn: cùng ngày ra cùng kết quả, đủ 20 nguồn, gắn gia_lap', () => {
    expect(TREND_SOURCES.length).toBe(20);
    const a = simTrends(['Đồ chơi', 'Gia dụng'], '2026-11-06');
    expect(simTrends(['Đồ chơi', 'Gia dụng'], '2026-11-06')).toEqual(a);
    expect(a.every((t) => t.gia_lap && t.score <= 100 && t.sources.length >= 1)).toBe(true);
  });
  it('xưởng 1688 giả lập có nhãn [GIẢ LẬP], giá quanh giá vốn tham chiếu', () => {
    const s = sim1688Suppliers('Áo thun', 'Thời trang', 20000, 6);
    expect(s).toHaveLength(6);
    expect(s.every((x) => x.name.startsWith('[GIẢ LẬP]') && x.unit_cost > 10000 && x.unit_cost < 30000)).toBe(true);
  });
  it('camera QC giả lập: lỗi 0,4–3,4%, cố định theo ảnh', () => {
    const r = simQc('https://x/lo-hang-1.jpg');
    expect(r).toEqual(simQc('https://x/lo-hang-1.jpg'));
    expect(r.defect_rate).toBeGreaterThanOrEqual(0.004);
    expect(r.defect_rate).toBeLessThanOrEqual(0.034);
  });
  it('pháp nhân TAOMUA Co., LTD, đại diện Lê Thị Huỳnh Như', () => {
    expect(LEGAL.name).toBe('TAOMUA Co., LTD');
    expect(LEGAL.representative).toBe('LÊ THỊ HUỲNH NHƯ');
  });
});

describe('trên database', () => {
  let ceo: any, pid = '';
  beforeAll(async () => {
    await q('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await q(fs.readFileSync('db/schema.sql', 'utf8'));
    ceo = await one("INSERT INTO users(email,name,role,password_hash) VALUES ('c@t','CEO','CEO','x') RETURNING id, role");
    await q("INSERT INTO sales_channels(code,name,kind,connector,fee_pct) VALUES ('taomua','taomua.com','OWN','NATIVE',0)");
    const sup = await one(`INSERT INTO suppliers(name,source,country,response_time_sec,defect_rate,on_time_rate,verified_cert,inventory_sync,trust_score,categories,contact)
      VALUES ('Xưởng A','VN_FACTORY','VN',60,0.01,0.97,true,true,97,'{Đồ chơi}','0909') RETURNING id`);
    pid = (await one(`INSERT INTO products(sku,name,category,cost,fee,price_taomua_10,price_taomua_50,price_taomua_100,price_taomua_500,moq,published,supplier_id)
      VALUES ('CAPY','Đồ chơi Capybara','Đồ chơi',6000,2000,35000,28000,24000,19000,10,true,$1) RETURNING id`, [sup.id])).id;
  });
  afterAll(async () => { await pool.end(); });

  it('luồng tự động: trend ngoài (giả lập) → AI mở tìm xưởng → tìm 1688 (giả lập) → đề xuất → CEO chọn', async () => {
    await runAgents('LICH', { id: null, label: 't' }, ['RYN-TREND', 'RYN-SUPPLY']);
    const reqs = await q("SELECT id, product_text, status, result FROM sourcing_requests WHERE reason LIKE 'RYN-TREND%'");
    expect(reqs.length).toBeGreaterThan(0);
    expect(reqs.length).toBeLessThanOrEqual(3);
    expect(reqs.every((r) => r.result.tim_ngoai?.mode === 'GIA_LAP')).toBe(true);
    expect(await one("SELECT 1 AS x FROM connector_runs WHERE connector='1688' AND mode='GIA_LAP'")).toBeTruthy();
    const a = await one("SELECT id, entity_id FROM agent_actions WHERE kind='SOURCING_CHOICE' AND status='DE_XUAT' LIMIT 1");
    if (a) {
      await decideAgentAction(a.id, { id: ceo.id, role: 'CEO', label: 'CEO' }, 'approve');
      expect((await one('SELECT status FROM sourcing_requests WHERE id=$1', [a.entity_id])).status).toBe('DA_CHON');
    }
    // chạy lại cùng ngày không mở thêm quá 3
    await runAgents('LICH', { id: null, label: 't' }, ['RYN-TREND']);
    expect((await q("SELECT 1 FROM sourcing_requests WHERE reason LIKE 'RYN-TREND%'")).length).toBeLessThanOrEqual(3);
  });

  it('camera QC giả lập ghi tỉ lệ đạt và nhật ký', async () => {
    const r = await recordQc(pid, { imageUrl: 'https://kho/lo-capy.jpg' }, { id: ceo.id, label: 'CEO' });
    expect(r.gia_lap).toBe(true);
    expect(Number((await one('SELECT rynn_brain_pass FROM products WHERE id=$1', [pid])).rynn_brain_pass)).toBe(r.qc_pass);
  });

  it('hộp thư: chưa có Zalo / email thì ghi GIẢ LẬP, không gửi', async () => {
    await notifyText('Thử thông báo');
    const rows = await q("SELECT channel, mode FROM notification_log WHERE body LIKE 'Thử thông báo%'");
    expect(rows.map((r) => `${r.channel}:${r.mode}`).sort()).toEqual(['EMAIL:GIA_LAP', 'ZALO_OA:GIA_LAP']);
  });

  it('QR thanh toán, chuyển khoản, hóa đơn điện tử giả lập (chỉ khi thử nghiệm)', async () => {
    expect(simActionsAllowed()).toBe(true);
    const qr = await paymentQr('TM1001', 500000);
    expect(qr.mode).toBe('GIA_LAP');
    const t = await bankTransfer({ id: '00000000-0000-0000-0000-000000000001', amount: 1000000, payee: 'X', reason: 'Y' });
    expect(t.ref).toMatch(/^GL-CK-/);
    const o = await createOrder({ channelCode: 'taomua', customer: { name: 'Shop', phone: '0900000001' }, address: 'HCM 12345', items: [{ productId: pid, quantity: 20 }] }, { id: null, label: 't' });
    await markPaid(o.id, { id: ceo.id, label: 'CEO' });
    const inv = await tx((c) => issueEInvoice(c, o.id));
    expect(inv.mode).toBe('GIA_LAP');
    expect((await one('SELECT invoice_no, invoice_mode FROM wholesale_orders WHERE id=$1', [o.id]))).toEqual({ invoice_no: inv.invoice_no, invoice_mode: 'GIA_LAP' });
    await expect(tx((c) => issueEInvoice(c, o.id))).rejects.toThrow(/đã có hóa đơn/);
    const saved = process.env.SIM_ACTIONS;
    process.env.SIM_ACTIONS = 'off';
    await expect(bankTransfer({ id: '00000000-0000-0000-0000-000000000002', amount: 1, payee: 'X', reason: 'Y' })).rejects.toThrow(/chuyển khoản tay/);
    process.env.SIM_ACTIONS = saved;
  });
});
