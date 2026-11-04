// Dữ liệu giả lập để chạy thử. Mọi sản phẩm, xưởng, số dự toán đều đánh dấu is_simulated.
// Dùng: npm run db:seed  (chỉ chạy trên database trống)
import crypto from 'node:crypto';
// @ts-expect-error: module .mjs không có khai báo kiểu
import { loadEnv } from './env.mjs';
loadEnv();

async function main() {
  const { pool, q, one } = await import('../lib/db');
  const { hashPassword } = await import('../lib/password');
  const { trustScore } = await import('../lib/trust');
  const { createOrder, markPaid } = await import('../lib/orders');

  const existing = await one<{ n: number }>('SELECT count(*)::int AS n FROM users');
  if ((existing?.n ?? 0) > 0) {
    console.log('Database đã có dữ liệu, bỏ qua seed.');
    await pool.end();
    return;
  }

  const gen = () => crypto.randomBytes(9).toString('base64url');
  const ceoPw = process.env.SEED_CEO_PASSWORD || gen();
  const staffPw = process.env.SEED_STAFF_PASSWORD || gen();
  const users = [
    ['ceo@taomua.local', 'CEO', 'CEO', ceoPw],
    ['truongnhom@taomua.local', 'Trưởng nhóm', 'TRUONG_NHOM', staffPw],
    ['ketoan@taomua.local', 'Kế toán', 'KE_TOAN', staffPw],
    ['nhanvien@taomua.local', 'Nhân viên', 'NHAN_VIEN', staffPw],
  ];
  for (const [email, name, role, pw] of users) {
    await q('INSERT INTO users(email, name, role, password_hash) VALUES ($1,$2,$3,$4)', [email, name, role, hashPassword(pw)]);
  }

  const suppliers = [
    { name: 'Yiwu Trend Factory', source: '1688', country: 'CN', years: 2, rt: 600, defect: 0.04, onTime: 0.85, cert: false, inv: true },
    { name: 'Shenzhen AudioTech', source: '1688', country: 'CN', years: 9, rt: 75, defect: 0.015, onTime: 0.95, cert: true, inv: true },
    { name: 'Xưởng Dệt Hội An', source: 'VN_FACTORY', country: 'VN', years: 6, rt: 80, defect: 0.01, onTime: 0.96, cert: true, inv: false },
    { name: 'Xưởng May An Phước', source: 'VN_FACTORY', country: 'VN', years: 4, rt: 60, defect: 0.008, onTime: 0.97, cert: true, inv: true },
    { name: 'Xưởng Kim Gia - Foshan', source: '1688', country: 'CN', years: 7, rt: 120, defect: 0.02, onTime: 0.93, cert: true, inv: false },
  ];
  const sid: Record<string, string> = {};
  for (const s of suppliers) {
    const t = trustScore({ response_time_sec: s.rt, verified_cert: s.cert, defect_rate: s.defect, on_time_rate: s.onTime, inventory_sync: s.inv });
    const r = await one(`INSERT INTO suppliers(name, source, country, years_active, trust_score, response_time_sec, defect_rate, on_time_rate,
      verified_cert, inventory_sync, is_simulated) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true) RETURNING id`,
      [s.name, s.source, s.country, s.years, t.score, s.rt, s.defect, s.onTime, s.cert, s.inv]);
    sid[s.name] = r.id;
  }

  // [sku, tên, danh mục, emoji, xưởng, giá vốn, phí, VAT đầu vào, 4 bậc giá, moq, trend, mô tả]
  const products: [string, string, string, string, string, number, number, number, number[], number, number, string][] = [
    ['CAPY-01', 'Đồ chơi Capybara bóp nổi', 'Đồ chơi', '🧸', 'Yiwu Trend Factory', 6000, 2000, 0, [35000, 28000, 24000, 19000], 100, 95, 'Squishy hình capybara, đang thịnh trên TikTok. Hàng đang bán thử 50 cái.'],
    ['TWS-PRO', 'Tai nghe Bluetooth TWS chống ồn', 'Điện tử', '🎧', 'Shenzhen AudioTech', 70000, 15000, 5000, [195000, 168000, 155000, 142000], 50, 82, 'Tai nghe không dây, chống ồn chủ động, pin 30 giờ kèm hộp sạc.'],
    ['TOTE-LUA', 'Túi tote canvas in lụa theo yêu cầu', 'Thời trang', '👜', 'Xưởng Dệt Hội An', 14000, 4000, 1000, [32000, 27000, 25000, 22000], 10, 70, 'Canvas 12oz, in lụa 1-2 màu, nhận in logo shop.'],
    ['AO-3D', 'Áo thun in 3D form rộng', 'Thời trang', '👕', 'Xưởng May An Phước', 20000, 6000, 1500, [49000, 45000, 42000, 38000], 10, 88, 'Cotton 2 chiều, in 3D không bong tróc, size M-XXL.'],
    ['THAU-304', 'Thau rửa bát inox 304', 'Gia dụng', '🥣', 'Xưởng Kim Gia - Foshan', 13000, 4000, 0, [24000, 22000, 21000, 19500], 10, 55, 'Inox 304 dày 0,6 mm, đường kính 30 cm.'],
    ['BINH-500', 'Bình giữ nhiệt 500 ml', 'Gia dụng', '🥤', 'Xưởng Kim Gia - Foshan', 38000, 9000, 2500, [89000, 82000, 78000, 72000], 20, 64, 'Giữ nóng 12 giờ, giữ lạnh 24 giờ, khắc logo theo yêu cầu.'],
    ['LED-5M', 'Đèn LED dây 5 m đổi màu', 'Điện tử', '💡', 'Shenzhen AudioTech', 30000, 8000, 2000, [72000, 66000, 62000, 57000], 20, 77, 'Điều khiển qua app, nháy theo nhạc, dán được tường.'],
  ];
  const pid: Record<string, string> = {};
  for (const [sku, name, cat, emoji, sup, cost, fee, iv, pr, moq, trend, desc] of products) {
    const r = await one(`INSERT INTO products(sku, name, category, description, image_emoji, trend_score, supplier_id, cost, fee, input_vat,
      price_taomua_10, price_taomua_50, price_taomua_100, price_taomua_500, moq, status, published, is_simulated,
      latr_test_qty, latr_ctr, rynn_brain_pass, vong_quay_von)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'DROPSHIP_SI',true,true,$16,$17,$18,$19) RETURNING id`,
      [sku, name, cat, desc, emoji, trend, sid[sup], cost, fee, iv, ...pr, moq,
        sku === 'CAPY-01' ? 50 : null, sku === 'CAPY-01' ? 6.5 : sku === 'AO-3D' ? 4.2 : null, 97.5, 3.33]);
    pid[sku] = r.id;
  }
  // Xưởng dự phòng (spec: 3 xưởng mỗi sản phẩm) — tạm gán các xưởng khác cùng nguồn.
  await q(`UPDATE products p SET supplier_ids_backup = ARRAY(SELECT s.id FROM suppliers s WHERE s.id <> p.supplier_id ORDER BY s.trust_score DESC LIMIT 3)`);

  const ceo = await one('SELECT id FROM users WHERE role=$1', ['CEO']);
  await q(`INSERT INTO price_comparisons(product_id, platform, price, qty_basis, source_url, checked_by) VALUES
    ($1,'Sàn A (ví dụ giả lập)',59000,1,'https://example.com/gia-lap',$3),
    ($1,'Sàn B (ví dụ giả lập)',65000,1,'https://example.com/gia-lap',$3),
    ($2,'Sàn A (ví dụ giả lập)',259000,1,'https://example.com/gia-lap',$3)`, [pid['AO-3D'], pid['TWS-PRO'], ceo.id]);

  // Kênh bán: taomua.com là kênh riêng; các nền tảng khác (kể cả 9mua) là kênh ngoài ngang nhau.
  const channels = [
    ['taomua', 'taomua.com', 'OWN', 'NATIVE', 'KHONG_CAN', 0, 'Cửa hàng sỉ của taomua.'],
    ['9mua', '9mua.com', 'PARTNER_SITE', 'MANUAL', 'CHUA_KET_NOI', 0, 'Nền tảng bên ngoài. Phí sàn cần cập nhật theo hợp đồng.'],
    ['shopee', 'Shopee', 'MARKETPLACE', 'CSV', 'CHUA_KET_NOI', 10, 'Phí sàn là số giả lập, cần cập nhật.'],
    ['tiktok-shop', 'TikTok Shop', 'SOCIAL', 'CSV', 'CHUA_KET_NOI', 8, 'Phí sàn là số giả lập, cần cập nhật.'],
    ['lazada', 'Lazada', 'MARKETPLACE', 'MANUAL', 'CHUA_KET_NOI', 9, 'Phí sàn là số giả lập, cần cập nhật.'],
  ];
  const cid: Record<string, string> = {};
  for (const [code, name, kind, conn, api, fee, notes] of channels) {
    const r = await one(`INSERT INTO sales_channels(code, name, kind, connector, api_status, fee_pct, notes) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [code, name, kind, conn, api, fee, notes]);
    cid[code as string] = r.id;
  }
  const listings: [string, string, number, string][] = [
    ['9mua', 'AO-3D', 69000, 'DANG_BAN'], ['9mua', 'CAPY-01', 49000, 'DANG_BAN'], ['9mua', 'BINH-500', 129000, 'NHAP'],
    ['shopee', 'AO-3D', 75000, 'DANG_BAN'], ['shopee', 'LED-5M', 109000, 'DANG_BAN'],
    ['tiktok-shop', 'CAPY-01', 45000, 'DANG_BAN'],
  ];
  for (const [ch, sku, price, st] of listings) {
    await q('INSERT INTO channel_listings(channel_id, product_id, price, status) VALUES ($1,$2,$3,$4)', [cid[ch], pid[sku], price, st]);
  }

  // Dự toán 12 tháng từ file xlsx (đơn vị triệu đồng) — số giả lập.
  const plan: [number, number, number][] = [
    [500, 80, 22.5], [900, 163.2, 26.5], [1300, 254.4, 29.4], [1950, 401.6, 31.6], [3412, 742.66, 34.1], [6825, 1565.6, 36.8],
    [10237, 2388.26, 37.7], [12000, 2816, 38.1], [13000, 3064, 38.3], [15000, 3600, 39.3], [16000, 3848, 39.5], [17000, 4096, 39.6],
  ];
  for (let i = 0; i < 12; i++) {
    const [dt, ln, bien] = plan[i];
    const rev = dt * 1e6;
    await q(`INSERT INTO working_capital(month, tong_dt, von_luu_dong_30, du_phong_15, tong_von_can_45, ln_rong, vong_quay_von, bien_an_toan, status, is_simulated)
      VALUES ($1,$2,$3,$4,$5,$6,3.33,$7,$8,true)`,
      [i + 1, rev, Math.round(rev * 0.3), Math.round(rev * 0.15), Math.round(rev * 0.45), Math.round(ln * 1e6), bien, bien >= 20 ? 'SAFE' : 'WARNING']);
  }

  // Vài đơn mẫu để có dữ liệu xem thử.
  const sys = { id: null, label: 'Seed' };
  const o1 = await createOrder({ channelCode: 'taomua', customer: { name: 'Shop Mẫu A', phone: '0900000001' }, address: 'Q.1, TP.HCM (giả lập)',
    items: [{ productId: pid['AO-3D'], quantity: 50 }] }, sys);
  await createOrder({ channelCode: 'taomua', customer: { name: 'Shop Mẫu B', phone: '0900000002' }, address: 'Q.7, TP.HCM (giả lập)',
    items: [{ productId: pid['TWS-PRO'], quantity: 100 }] }, sys);
  await createOrder({ channelCode: 'taomua', customer: { name: 'Shop Mẫu C', phone: '0900000003' }, address: 'Thủ Đức, TP.HCM (giả lập)',
    items: [{ productId: pid['THAU-304'], quantity: 500 }] }, sys);
  await createOrder({ channelCode: '9mua', externalRef: '9M-0001', customer: { name: 'Khách lẻ 9mua', phone: '0900000004' }, address: 'Hà Nội (giả lập)',
    items: [{ productId: pid['AO-3D'], quantity: 2 }] }, sys);
  await markPaid(o1.id, sys);

  console.log('Đã tạo dữ liệu giả lập.');
  console.log('Tài khoản CEO: ceo@taomua.local / ' + (process.env.SEED_CEO_PASSWORD ? '(mật khẩu trong SEED_CEO_PASSWORD)' : ceoPw));
  console.log('Tài khoản truongnhom@, ketoan@, nhanvien@taomua.local / ' + (process.env.SEED_STAFF_PASSWORD ? '(mật khẩu trong SEED_STAFF_PASSWORD)' : staffPw));
  console.log('Hãy đổi mật khẩu sau lần đăng nhập đầu.');
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
