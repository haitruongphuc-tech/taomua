// Danh sách thông tin còn thiếu / đang giả lập, tính trực tiếp từ cấu hình và database mỗi lần mở trang.
// THIEU: chưa có, cần nhập sau. GIA_LAP: đang chạy bằng số giả lập, cần sửa sau. CHUA_LAM: spec có nhưng chờ nhà cung cấp / quyết định. OK: đã có.
import { q } from './db';
import { CONNECTORS, connectorEnabled } from './connectors';

export type SetupStatus = 'OK' | 'THIEU' | 'GIA_LAP' | 'CHUA_LAM';
export type SetupItem = { group: string; label: string; status: SetupStatus; detail: string; where: string; href?: string };

const env = (...keys: string[]) => keys.every((k) => !!process.env[k]);

export async function setupItems(): Promise<SetupItem[]> {
  const n = async (sql: string) => Number((await q<{ n: number }>(sql))[0]?.n ?? 0);
  const [simProducts, products, simSuppliers, suppliers, simCapital, noBalance, comps, simFees, noQc, noTrace, noI18n] = await Promise.all([
    n('SELECT count(*)::int n FROM products WHERE is_simulated'),
    n('SELECT count(*)::int n FROM products'),
    n('SELECT count(*)::int n FROM suppliers WHERE is_simulated'),
    n('SELECT count(*)::int n FROM suppliers'),
    n('SELECT count(*)::int n FROM working_capital WHERE is_simulated'),
    n('SELECT count(*)::int n FROM working_capital WHERE mb_bank_balance IS NULL'),
    n("SELECT count(*)::int n FROM price_comparisons WHERE checked_at >= now() - interval '30 days'"),
    n("SELECT count(*)::int n FROM sales_channels WHERE kind <> 'OWN' AND (notes ILIKE '%giả lập%' OR notes ILIKE '%cần cập nhật%')"),
    n('SELECT count(*)::int n FROM products WHERE rynn_brain_pass IS NULL'),
    n('SELECT count(*)::int n FROM products WHERE latr_ctr IS NULL'),
    n("SELECT count(*)::int n FROM products WHERE published AND NOT name_i18n ? 'zh'"),
  ]);
  const rateSet = Number(process.env.CNY_VND_RATE) > 0;
  const [simLive, liveNoRealSupplier, supNoCat, unverifiedLive] = await Promise.all([
    n('SELECT count(*)::int n FROM products WHERE published AND is_simulated'),
    n('SELECT count(*)::int n FROM products p LEFT JOIN suppliers s ON s.id=p.supplier_id WHERE p.published AND NOT p.is_simulated AND (s.id IS NULL OR s.is_simulated)'),
    n("SELECT count(*)::int n FROM suppliers WHERE categories = '{}'"),
    n(`SELECT count(*)::int n FROM products p WHERE p.published AND NOT p.is_simulated
       AND NOT EXISTS (SELECT 1 FROM supplier_offers o WHERE o.product_id=p.id AND o.supplier_id=p.supplier_id AND o.verified)`),
  ]);
  const https = (process.env.SITE_URL ?? '').startsWith('https://');
  const [simRates, rates, simAds] = await Promise.all([
    n('SELECT count(*)::int n FROM shipping_rates WHERE is_simulated'), n('SELECT count(*)::int n FROM shipping_rates'),
    n('SELECT count(*)::int n FROM ad_campaigns WHERE is_simulated'),
  ]);

  return [
    // --- Bắt buộc trước khi nhận đơn và tiền thật ---
    { group: 'Trước khi bán thật', label: 'Không bán hàng giả lập', status: simLive ? 'THIEU' : 'OK', href: '/quan-tri/san-pham', where: 'Quản trị → Sản phẩm',
      detail: simLive ? `${simLive} sản phẩm giả lập đang hiển thị bán. Sửa số thật (giá vốn, giá bán, xưởng) rồi bỏ ô "Dữ liệu giả lập", hoặc ẩn sản phẩm.` : 'Không còn sản phẩm giả lập đang bán.' },
    { group: 'Trước khi bán thật', label: 'Xưởng thật cho hàng đang bán', status: liveNoRealSupplier ? 'THIEU' : 'OK', href: '/quan-tri/tim-xuong', where: 'Quản trị → Tìm xưởng (AI)',
      detail: `${liveNoRealSupplier} sản phẩm thật đang bán chưa có xưởng thật. AI tìm xưởng, CEO chọn.` },
    { group: 'Trước khi bán thật', label: 'Báo giá xưởng đã xác nhận', status: unverifiedLive ? 'THIEU' : 'OK', href: '/quan-tri/tim-xuong', where: 'Tìm xưởng → Báo giá xưởng',
      detail: `${unverifiedLive} sản phẩm thật đang bán chưa có báo giá của xưởng chính được xác nhận lại.` },
    { group: 'Trước khi bán thật', label: 'Ngành hàng của xưởng', status: supNoCat ? 'THIEU' : 'OK', href: '/quan-tri/xuong', where: 'Quản trị → Xưởng',
      detail: `${supNoCat} xưởng chưa có ngành hàng: AI không xếp được vào đúng ngành.` },
    { group: 'Trước khi bán thật', label: 'Máy chủ, tên miền, HTTPS', status: https ? 'OK' : 'THIEU', where: 'SITE_URL=https://taomua.com',
      detail: https ? `Đang chạy ở ${process.env.SITE_URL}.` : 'Khách thật chỉ nên đặt và trả tiền qua https. Cần máy chủ, tên miền, chứng chỉ và sao lưu database hằng ngày.' },
    { group: 'Trước khi bán thật', label: 'Nhận tiền quốc tế', status: env('PAYMENT_SWIFT', 'USD_VND_RATE') ? 'OK' : 'THIEU', where: 'PAYMENT_SWIFT, USD_VND_RATE',
      detail: 'Mã SWIFT để khách nước ngoài chuyển khoản, tỷ giá USD để hiện số tiền tham khảo. Phí vận chuyển quốc tế nhập trên từng đơn.' },
    { group: 'Trước khi bán thật', label: 'Kế toán xác nhận cách ghi phí vận chuyển quốc tế và thuế xuất khẩu', status: 'CHUA_LAM', where: 'Kế toán',
      detail: 'Hiện phí vận chuyển thu thêm được cộng vào số tiền khách trả, không tính vào doanh thu hàng hóa và biên.' },

    // --- Khóa API và cấu hình (ghi vào file .env trên máy chủ, không gửi qua chat) ---
    { group: 'Cấu hình .env', label: 'AI ngôn ngữ (Qwen / OpenAI)', status: env('AI_API_KEY') ? 'OK' : 'THIEU', where: 'AI_API_KEY, AI_BASE_URL, AI_MODEL',
      detail: 'Dịch tên sản phẩm 7 ngôn ngữ, dịch tin nhắn xưởng. Chưa có thì 7 agent vẫn chạy bằng quy tắc, phần dịch tạm dừng.' },
    { group: 'Cấu hình .env', label: 'Khóa API cho n8n gọi lịch 6 giờ', status: env('INTERNAL_API_KEY') ? 'OK' : 'THIEU', where: 'INTERNAL_API_KEY',
      detail: 'n8n gọi POST /api/v1/agents/run với header x-api-key. Hoặc chạy "npm run agents" bằng Task Scheduler.' },
    { group: 'Cấu hình .env', label: 'Bot Telegram báo CEO', status: env('TELEGRAM_BOT_TOKEN') ? 'OK' : 'THIEU', where: 'TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET; chat id trong Người dùng',
      detail: 'Gửi cảnh báo và yêu cầu duyệt. Chưa có thì chỉ hiện trên trang quản trị.' },
    { group: 'Cấu hình .env', label: 'Tài khoản nhận tiền hiển thị cho khách', status: env('PAYMENT_BANK_NAME', 'PAYMENT_ACCOUNT_NO', 'PAYMENT_ACCOUNT_NAME') ? 'OK' : 'THIEU',
      where: 'PAYMENT_BANK_NAME, PAYMENT_ACCOUNT_NO, PAYMENT_ACCOUNT_NAME', detail: 'Chưa có thì khách không thấy số tài khoản nào.' },
    { group: 'Cấu hình .env', label: 'Tỷ giá CNY → VND', status: rateSet ? 'OK' : 'GIA_LAP', where: 'CNY_VND_RATE',
      detail: rateSet ? `Đang dùng ${process.env.CNY_VND_RATE}.` : 'RYN-NEGO đang dùng tạm 3.500 đ/tệ để tính giá đàm phán.' },

    // --- Dữ liệu giả lập ---
    { group: 'Dữ liệu giả lập', label: 'Sản phẩm', status: simProducts ? 'GIA_LAP' : products ? 'OK' : 'THIEU', href: '/quan-tri/san-pham', where: 'Quản trị → Sản phẩm',
      detail: `${simProducts}/${products} sản phẩm là giả lập (giá vốn, phí, giá bán, điểm trend, CTR, QC). Sửa số thật rồi bỏ ô "Dữ liệu giả lập".` },
    { group: 'Dữ liệu giả lập', label: 'Xưởng và xưởng dự phòng', status: simSuppliers ? 'GIA_LAP' : suppliers ? 'OK' : 'THIEU', href: '/quan-tri/xuong', where: 'Quản trị → Xưởng',
      detail: `${simSuppliers}/${suppliers} xưởng giả lập. Xưởng dự phòng của từng sản phẩm đang gán chung, chưa đúng ngành hàng: RYN-SUPPLY có thể đề xuất đổi sai xưởng cho tới khi sửa.` },
    { group: 'Dữ liệu giả lập', label: 'Dự toán 12 tháng và biên an toàn', status: simCapital ? 'GIA_LAP' : 'OK', href: '/quan-tri/von', where: 'Quản trị → Vốn & dự toán',
      detail: `${simCapital}/12 tháng là dự toán giả lập. RYN-LOGI không tự khóa nhập hàng dựa trên số giả lập, chỉ đề xuất.` },
    { group: 'Dữ liệu giả lập', label: 'Phí sàn của kênh bán', status: simFees ? 'GIA_LAP' : 'OK', href: '/quan-tri/kenh-ban', where: 'Quản trị → Kênh bán',
      detail: `${simFees} kênh có phí sàn giả lập hoặc chưa theo hợp đồng.` },

    // --- Số liệu còn thiếu ---
    { group: 'Số liệu cần nhập', label: 'Số dư ngân hàng theo tháng', status: noBalance ? 'THIEU' : 'OK', href: '/quan-tri/von', where: 'Quản trị → Vốn & dự toán',
      detail: `${noBalance}/12 tháng chưa có số dư: chưa so được vốn thực với vốn cần 45%.` },
    { group: 'Số liệu cần nhập', label: 'Giá đối thủ đã kiểm tra (30 ngày)', status: comps ? 'OK' : 'THIEU', href: '/quan-tri/san-pham', where: 'Quản trị → Sản phẩm → So sánh giá',
      detail: `${comps} giá đối thủ còn hạn. RYN-PRICE chỉ giảm giá theo đối thủ khi có giá đã kiểm tra.` },
    { group: 'Số liệu cần nhập', label: 'Kết quả QC từng sản phẩm', status: noQc ? 'THIEU' : 'OK', where: 'Quản trị → Sản phẩm', detail: `${noQc} sản phẩm chưa có tỉ lệ QC đạt.` },
    { group: 'Số liệu cần nhập', label: 'Kết quả bán thử (CTR)', status: noTrace ? 'THIEU' : 'OK', where: 'API /api/v1/latr/test hoặc Sản phẩm',
      detail: `${noTrace} sản phẩm chưa có CTR bán thử; RYN-SALES chưa quyết định nhập lớn / dừng được.` },
    { group: 'Số liệu cần nhập', label: 'Tên sản phẩm 7 ngôn ngữ', status: noI18n ? (env('AI_API_KEY') ? 'THIEU' : 'CHUA_LAM') : 'OK', where: 'Tự động khi có AI_API_KEY',
      detail: `${noI18n} sản phẩm đang bán chưa có tên tiếng Trung/Anh/...` },
    { group: 'Dữ liệu giả lập', label: 'Bảng giá vận chuyển', status: !rates ? 'THIEU' : simRates ? 'GIA_LAP' : 'OK', href: '/quan-tri/logistics', where: 'Quản trị → Logistics',
      detail: `${simRates}/${rates} giá hãng là giả lập; nhập theo hợp đồng GHN / GHTK / J&T. Khối lượng sản phẩm cũng cần cân thật.` },
    { group: 'Dữ liệu giả lập', label: 'Chiến dịch quảng cáo mẫu', status: simAds ? 'GIA_LAP' : 'OK', href: '/quan-tri/marketing', where: 'Quản trị → Marketing',
      detail: `${simAds} chiến dịch giả lập để thử quy tắc ROAS / CTR; kết thúc hoặc xóa khi chạy thật.` },
    { group: 'Số liệu cần nhập', label: 'Danh sách 19 yếu tố TrustScore và trọng số', status: 'GIA_LAP', where: 'lib/trust.ts', detail: 'Đang tạm tính 5 yếu tố.' },

    // --- Chờ nhà cung cấp / quyết định ---
    // Cổng kết nối dịch vụ ngoài (lib/connectors.ts): tự đổi sang 'Đã có' khi nhập đủ khóa trong .env.
    ...CONNECTORS.map((c): SetupItem => ({ group: 'Kết nối dịch vụ ngoài', label: c.name, status: connectorEnabled(c.key) ? 'OK' : 'CHUA_LAM', where: c.env.join(', '),
      detail: `${c.note} Dùng cho ${c.used_by}.${connectorEnabled(c.key) ? '' : ' Chưa có khóa: đang chạy bằng dữ liệu nội bộ / nhập tay.'}` })),
    { group: 'Cấu hình .env', label: 'Báo duyệt qua Zalo OA', status: env('ZALO_OA_ACCESS_TOKEN', 'ZALO_CEO_USER_ID') ? 'OK' : 'THIEU', where: 'ZALO_OA_ACCESS_TOKEN, ZALO_CEO_USER_ID',
      detail: 'Kênh phụ của One-Tap: tin Zalo kèm link mở Duyệt nhanh. Tạo OA tại oa.zalo.me.' },
    { group: 'Cấu hình .env', label: 'Báo duyệt qua email', status: env('SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'APPROVAL_EMAIL_TO') ? 'OK' : 'THIEU', where: 'SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, APPROVAL_EMAIL_TO',
      detail: 'Kênh dự phòng: email kèm link mở Duyệt nhanh.' },
    { group: 'Chờ API nhà cung cấp', label: 'API các sàn (Shopee, TikTok Shop, Lazada, 9mua)', status: 'CHUA_LAM', href: '/quan-tri/kenh-ban', where: 'lib/channels.ts', detail: 'Hiện nhập đơn tay / CSV.' },
    { group: 'Chờ quyết định', label: 'Xác thực 2 lớp và nhà đầu tư duyệt Cấp 5', status: 'CHUA_LAM', where: 'Kiểm soát chi', detail: 'Đang dùng nhập lại mật khẩu cho khoản lớn.' },
  ];
}

export const STATUS_TEXT: Record<SetupStatus, [string, string]> = {
  OK: ['Đã có', 'ok'], THIEU: ['Cần nhập', 'bad'], GIA_LAP: ['Giả lập, sửa sau', 'warn'], CHUA_LAM: ['Chờ nhà cung cấp', 'orange'],
};
