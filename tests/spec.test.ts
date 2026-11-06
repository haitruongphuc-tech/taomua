// Kiểm thử các mục bổ sung khi đối soát toàn bộ thuyết minh (03_API_SPEC, 04_FRONTEND, ALGORITHM mục 4 & 7, 01 chương 3 & 6).
import fs from 'node:fs';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { pool, q, one } from '@/lib/db';
import { parseQuery, matchesWords } from '@/lib/nlsearch';
import { suggestTierPrices, priceForMargin } from '@/lib/agents/rules';
import { calcMargin } from '@/lib/pricing';
import { runAgents } from '@/lib/agents';
import { createOrder, markPaid } from '@/lib/orders';
import { listProducts } from '@/lib/catalog';

describe('AI Shopping Assistant: hiểu câu tìm kiếm', () => {
  it('giá, hot, rẻ nhất, uy tín, ngành, không dấu', () => {
    const a = parseQuery('tìm áo thun hot trend giá dưới 50k', ['Thời trang']);
    expect(a.maxPrice).toBe(50000);
    expect(a.sort).toBe('hot');
    expect(a.words).toEqual(['ao', 'thun']);
    expect(parseQuery('binh giu nhiet re nhat').sort).toBe('gia');
    expect(parseQuery('đồ chơi xưởng uy tín dưới 1 triệu', ['Đồ chơi'])).toMatchObject({ category: 'Đồ chơi', minTrust: 85, maxPrice: 1_000_000 });
    expect(parseQuery('tai nghe dưới 200.000').maxPrice).toBe(200000);
    expect(matchesWords({ name: 'Áo thun in 3D form rộng', category: 'Thời trang' }, ['ao', 'thun'])).toBe(true);
    expect(matchesWords({ name: 'Thau rửa bát', category: 'Gia dụng' }, ['ao'])).toBe(false);
  });
});

describe('Pricing Engine đề xuất 4 bậc giá (spec API #4)', () => {
  it('mua nhiều giá thấp hơn, mọi bậc biên ≥ 15% sau thuế phí', () => {
    const p = suggestTierPrices(20000, 8000);
    expect(p[10] >= p[50] && p[50] >= p[100] && p[100] >= p[500]).toBe(true);
    for (const t of [10, 50, 100, 500] as const) expect(calcMargin({ revenue: p[t], cost: 28000 }).marginOnCost).toBeGreaterThanOrEqual(15);
    expect(p[10]).toBe(priceForMargin(28000, 0, 45));
  });
});

describe('trên database', () => {
  let pid = '', good: any, ceo: any;
  beforeAll(async () => {
    await q('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await q(fs.readFileSync('db/schema.sql', 'utf8'));
    ceo = await one("INSERT INTO users(email,name,role,password_hash) VALUES ('c@t','CEO','CEO','x') RETURNING id");
    await q("INSERT INTO sales_channels(code,name,kind,connector,fee_pct) VALUES ('taomua','taomua.com','OWN','NATIVE',0),('9mua','9mua.com','PARTNER_SITE','MANUAL',10)");
    const cur = await one(`INSERT INTO suppliers(name,source,country,response_time_sec,defect_rate,on_time_rate,verified_cert,inventory_sync,trust_score,categories)
      VALUES ('Xưởng hiện tại','VN_FACTORY','VN',60,0.01,0.97,true,true,90,'{Thời trang}') RETURNING id`);
    good = await one(`INSERT INTO suppliers(name,source,country,response_time_sec,defect_rate,on_time_rate,verified_cert,inventory_sync,trust_score,categories,contact)
      VALUES ('Xưởng rẻ','VN_FACTORY','VN',60,0.01,0.97,true,true,95,'{Thời trang}','0909') RETURNING id`);
    pid = (await one(`INSERT INTO products(sku,name,category,cost,fee,price_taomua_10,price_taomua_50,price_taomua_100,price_taomua_500,moq,published,supplier_id)
      VALUES ('AO','Áo thun in 3D','Thời trang',20000,6000,49000,45000,42000,38000,10,true,$1) RETURNING id`, [cur.id])).id;
  });
  afterAll(async () => { await pool.end(); });

  it('lịch sử giá 365 ngày tự ghi khi giá đổi', async () => {
    await q('UPDATE products SET price_taomua_10=47000 WHERE id=$1', [pid]);
    await q("UPDATE products SET name='Áo thun in 3D form rộng' WHERE id=$1", [pid]); // không đổi giá → không ghi
    const h = await q('SELECT price_10 FROM product_price_history WHERE product_id=$1 ORDER BY id', [pid]);
    expect(h.map((r) => Number(r.price_10))).toEqual([49000, 47000]);
  });

  it('tìm kiếm câu tự nhiên trên danh mục thật', async () => {
    expect((await listProducts({ q: 'ao thun duoi 50k' })).length).toBe(1);
    expect((await listProducts({ q: 'ao thun duoi 40k' })).length).toBe(0);
  });

  it('canh mua giảm giá: xưởng đạt chuẩn rẻ hơn ≥ 10% → AI mở yêu cầu tìm xưởng; tắt nút thì không', async () => {
    await q("INSERT INTO supplier_offers(supplier_id, product_id, product_text, category, unit_cost, moq, verified) VALUES ($1,$2,'Áo thun in 3D','Thời trang',17000,50,true)", [good.id, pid]);
    await q("INSERT INTO payment_controls(key, enabled) VALUES ('CANH_GIAM_GIA', false)");
    await runAgents('LICH', { id: null, label: 't' }, ['RYN-SUPPLY']);
    expect(await one('SELECT 1 AS x FROM sourcing_requests WHERE product_id=$1', [pid])).toBeNull();
    await q("DELETE FROM payment_controls WHERE key='CANH_GIAM_GIA'");
    await runAgents('LICH', { id: null, label: 't' }, ['RYN-SUPPLY']);
    const r = await one('SELECT reason, status FROM sourcing_requests WHERE product_id=$1', [pid]);
    expect(r.reason).toMatch(/Canh giảm giá/);
    expect(r.status).toBe('DA_DE_XUAT');
  });

  it('Compliance: xưởng chưa chứng nhận, đơn ≥ 10 triệu chưa hóa đơn quá 3 ngày', async () => {
    const o = await createOrder({ channelCode: 'taomua', customer: { name: 'Shop X', phone: '0900000123' }, address: 'HCM 12345', items: [{ productId: pid, quantity: 500 }] }, { id: null, label: 't' });
    await q("UPDATE wholesale_orders SET approval_status='APPROVED', status='CHO_THANH_TOAN' WHERE id=$1", [o.id]);
    await markPaid(o.id, { id: ceo.id, label: 'CEO' });
    await q("UPDATE wholesale_orders SET paid_at = now() - interval '4 days' WHERE id=$1", [o.id]);
    await runAgents('LICH', { id: null, label: 't' }, ['RYN-TRACE']);
    const notes = (await q("SELECT title FROM agent_actions WHERE agent='RYN-TRACE' AND status='TIN'")).map((r) => r.title).join('\n');
    expect(notes).toMatch(/Xưởng hiện tại/);
    expect(notes).toMatch(new RegExp(`${o.code}.*hóa đơn`));
  });

  it('khách mua 500 cái → kịch bản đàm phán lại giảm 5–10%', async () => {
    await runAgents('LICH', { id: null, label: 't' }, ['RYN-NEGO']);
    expect(await one("SELECT 1 AS x FROM agent_actions WHERE agent='RYN-NEGO' AND title LIKE 'Khách vừa mua 500+%'")).toBeTruthy();
  });

  it('giá lẻ 9mua: biên sau phí kênh < 15% thì cảnh báo', async () => {
    await q("INSERT INTO channel_listings(channel_id, product_id, price, status) SELECT id, $1, 30000, 'DANG_BAN' FROM sales_channels WHERE code='9mua'", [pid]);
    await runAgents('LICH', { id: null, label: 't' }, ['RYN-PRICE']);
    expect(await one("SELECT 1 AS x FROM agent_actions WHERE agent='RYN-PRICE' AND title LIKE '%9mua.com%biên sau phí kênh%'")).toBeTruthy();
  });

  it('Agent Profiles: hạn mức theo tháng (cộng dồn các đơn)', async () => {
    await q("INSERT INTO customers(name, phone, kind, agent_limit) VALUES ('Agent','0900000888','AI_AGENT',1000000)");
    const base = { channelCode: 'taomua', customer: { name: 'Agent', phone: '0900000888' }, address: 'HCM 12345' };
    await createOrder({ ...base, items: [{ productId: pid, quantity: 15 }] }, { id: null, label: 't' }); // 15 × 47.000 = 705.000
    await expect(createOrder({ ...base, items: [{ productId: pid, quantity: 10 }] }, { id: null, label: 't' })).rejects.toThrow(/tháng/);
  });
});
