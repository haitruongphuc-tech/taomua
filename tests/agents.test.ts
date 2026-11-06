// 7 agent trên database thật (taomua_test): phát hiện, tự làm, hàng đợi One-Tap, chống trùng, khóa theo nút Tắt/Mở.
import fs from 'node:fs';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { pool, q, one } from '@/lib/db';
import { runAgents } from '@/lib/agents';
import { decideAgentAction } from '@/lib/agents/decide';
import { createOrder } from '@/lib/orders';
import { calcMargin } from '@/lib/pricing';

const sys = { id: null, label: 'test' };
let ceo: any, lead: any, cheap: any, good: any, bad: any, rfqId = '';

beforeAll(async () => {
  await q('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await q(fs.readFileSync('db/schema.sql', 'utf8'));
  ceo = await one("INSERT INTO users(email,name,role,password_hash) VALUES ('c@t','CEO','CEO','x') RETURNING id, role");
  lead = await one("INSERT INTO users(email,name,role,password_hash) VALUES ('l@t','Lead','TRUONG_NHOM','x') RETURNING id, role");
  bad = await one(`INSERT INTO suppliers(name,source,country,response_time_sec,defect_rate,on_time_rate,verified_cert,inventory_sync,moq,trust_score)
    VALUES ('Xưởng kém','1688','CN',900,0.05,0.8,false,false,500,0) RETURNING id`);
  good = await one(`INSERT INTO suppliers(name,source,country,response_time_sec,defect_rate,on_time_rate,verified_cert,inventory_sync,moq,trust_score)
    VALUES ('Xưởng tốt','VN_FACTORY','VN',60,0.005,0.98,true,true,50,0) RETURNING id`);
  await q("INSERT INTO sales_channels(code,name,kind,connector,fee_pct) VALUES ('taomua','taomua.com','OWN','NATIVE',0)");
  // Biên dưới 15% ở các bậc lớn, xưởng chính kém, có xưởng tốt dự phòng.
  cheap = await one(`INSERT INTO products(sku,name,category,cost,fee,input_vat,price_taomua_10,price_taomua_50,price_taomua_100,price_taomua_500,moq,published,supplier_id,supplier_ids_backup,trend_score)
    VALUES ('THAU','Thau rửa bát inox','Gia dụng',13000,4000,0,24000,22000,21000,19500,10,true,$1,ARRAY[$2]::uuid[],90) RETURNING id`, [bad.id, good.id]);
  rfqId = (await one(`INSERT INTO rfqs(code,contact_name,phone,product_text,quantity) VALUES ('RFQ1','Shop A','0900000009','Cần 100 thau rửa bát inox',100) RETURNING id`)).id;
  await createOrder({ channelCode: 'taomua', customer: { name: 'Shop S', phone: '0900000001' }, address: 'HCM 12345', items: [{ productId: cheap.id, quantity: 20 }] }, sys);
});
afterAll(async () => { await pool.end(); });

describe('7 AI agent', () => {
  it('chạy đủ 7 agent không lỗi, tạo đề xuất và tự làm việc an toàn', async () => {
    const r = await runAgents('TAY', sys);
    for (const s of Object.values(r.summary)) expect(s.loi).toBeUndefined();
    const trust = await one('SELECT trust_score FROM suppliers WHERE id=$1', [good.id]);
    expect(trust.trust_score).toBeGreaterThanOrEqual(85);               // RYN-SUPPLY tự tính lại TrustScore
    const quote = await one('SELECT status, quote_price FROM rfqs WHERE id=$1', [rfqId]);
    expect(quote.status).toBe('DA_BAO_GIA');                            // RYN-SALES tự báo giá Cấp 1 (100 × 21.000 < 5 triệu)
    expect(Number(quote.quote_price)).toBe(100 * 21000);
    const kinds = (await q("SELECT kind FROM agent_actions WHERE status='DE_XUAT'")).map((x) => x.kind).sort();
    expect(kinds).toEqual(['PRICE_CHANGE', 'SWITCH_SUPPLIER']);
    expect(await one("SELECT 1 AS ok FROM agent_actions WHERE agent='RYN-NEGO' AND status='TIN'")).toBeTruthy();
    expect(await one('SELECT 1 AS ok FROM product_cost_history WHERE product_id=$1', [cheap.id])).toBeTruthy();
  });

  it('chạy lại không tạo trùng', async () => {
    const before = (await one('SELECT count(*)::int n FROM agent_actions')).n;
    await runAgents('LICH', sys);
    const after = (await one('SELECT count(*)::int n FROM agent_actions')).n;
    expect(after).toBe(before);
  });

  it('One-Tap: duyệt đổi giá thì giá mới đạt biên ≥ 15% ở mọi bậc', async () => {
    const a = await one("SELECT id FROM agent_actions WHERE kind='PRICE_CHANGE' AND status='DE_XUAT'");
    await decideAgentAction(a.id, { id: lead.id, role: 'TRUONG_NHOM', label: 'Lead' }, 'approve');
    const p = await one('SELECT * FROM products WHERE id=$1', [cheap.id]);
    for (const t of [10, 50, 100, 500]) {
      expect(calcMargin({ revenue: Number(p[`price_taomua_${t}`]), cost: 17000 }).marginOnCost).toBeGreaterThanOrEqual(15);
    }
    expect((await one('SELECT status FROM agent_actions WHERE id=$1', [a.id])).status).toBe('DA_DUYET');
  });

  it('từ chối đổi xưởng thì 7 ngày không đề xuất lại', async () => {
    const a = await one("SELECT id FROM agent_actions WHERE kind='SWITCH_SUPPLIER' AND status='DE_XUAT'");
    await decideAgentAction(a.id, { id: ceo.id, role: 'CEO', label: 'CEO' }, 'reject');
    await runAgents('LICH', sys);
    expect(await one("SELECT 1 AS x FROM agent_actions WHERE kind='SWITCH_SUPPLIER' AND status='DE_XUAT'")).toBeNull();
  });

  it('đề xuất cũ không áp dụng khi giá đã bị người khác đổi', async () => {
    await q('UPDATE products SET price_taomua_10=60000, price_taomua_50=50000, price_taomua_100=40000, price_taomua_500=19500 WHERE id=$1', [cheap.id]);
    await runAgents('LICH', sys);
    const a = await one("SELECT id FROM agent_actions WHERE kind='PRICE_CHANGE' AND status='DE_XUAT'");
    await q('UPDATE products SET price_taomua_500=19000 WHERE id=$1', [cheap.id]);
    const msg = await decideAgentAction(a.id, { id: ceo.id, role: 'CEO', label: 'CEO' }, 'approve');
    expect(msg).toMatch(/Không áp dụng được/);
    expect((await one('SELECT status FROM agent_actions WHERE id=$1', [a.id])).status).toBe('LOI');
  });

  it('tắt nút tổng: báo giá Cấp 1 thành đề xuất chờ người duyệt', async () => {
    await q("INSERT INTO payment_controls(key, enabled) VALUES ('AI_AUTO', false)");
    const id = (await one(`INSERT INTO rfqs(code,contact_name,phone,product_text,quantity) VALUES ('RFQ2','Shop B','0900000010','THAU',50) RETURNING id`)).id;
    await runAgents('LICH', sys, ['RYN-SALES']);
    expect((await one('SELECT status FROM rfqs WHERE id=$1', [id])).status).toBe('MOI');
    expect(await one("SELECT level FROM agent_actions WHERE kind='RFQ_QUOTE' AND status='DE_XUAT' AND entity_id=$1", [id])).toEqual({ level: 1 });
  });

  it('đơn Cấp 1 cũng cần người duyệt khi nút tổng tắt', async () => {
    const o = await createOrder({ channelCode: 'taomua', customer: { name: 'Shop S', phone: '0900000002' }, address: 'HCM 12345', items: [{ productId: cheap.id, quantity: 10 }] }, sys);
    expect(o.approval_status).toBe('PENDING');
    await q("DELETE FROM payment_controls WHERE key='AI_AUTO'");
  });

  it('khóa nhập mới chặn duyệt nhập lớn; nhập lớn cần CEO', async () => {
    await q("UPDATE products SET status='LATR_TEST', latr_ctr=4.5 WHERE id=$1", [cheap.id]);
    await runAgents('LICH', sys, ['RYN-SALES']);
    const a = await one("SELECT id, level FROM agent_actions WHERE kind='PRODUCT_STATUS' AND status='DE_XUAT'");
    expect(a.level).toBe(3);
    await expect(decideAgentAction(a.id, { id: lead.id, role: 'TRUONG_NHOM', label: 'Lead' }, 'approve')).rejects.toThrow(/CEO/);
    await q("INSERT INTO payment_controls(key, enabled) VALUES ('KHOA_NHAP_MOI', true)");
    await expect(decideAgentAction(a.id, { id: ceo.id, role: 'CEO', label: 'CEO' }, 'approve')).rejects.toThrow(/khóa nhập/);
  });
});
