// Cổng kết nối dịch vụ ngoài trong thuyết minh. Mỗi dịch vụ bật khi có khóa trong .env; chưa có thì hệ thống chạy bằng
// dữ liệu nội bộ / nhập tay và báo rõ "chưa kết nối", không trả dữ liệu giả.
// Khóa và địa chỉ API do chủ dự án nhập sau (Quản trị → Thông tin cần nhập).
export type Connector = { key: string; name: string; env: string[]; used_by: string; note: string };

export const CONNECTORS: Connector[] = [
  { key: 'TIKTOK', name: 'TikTok Creative Center / Shop', env: ['TIKTOK_API_KEY'], used_by: 'RYN-TREND, RYN-SALES', note: 'Trend video, sản phẩm hot, quảng cáo.' },
  { key: '1688', name: '1688 / Alibaba Open Platform (Accio)', env: ['ALIBABA_APP_KEY', 'ALIBABA_APP_SECRET'], used_by: 'RYN-TREND, RYN-SUPPLY', note: 'Hàng hot 1688, tìm 50 xưởng mỗi sản phẩm, giá xưởng.' },
  { key: 'AMAZON', name: 'Amazon SP-API', env: ['AMAZON_SPAPI_CLIENT_ID', 'AMAZON_SPAPI_SECRET'], used_by: 'RYN-TREND, RYN-PRICE', note: 'Best Seller, giá đối thủ.' },
  { key: 'WALMART', name: 'Walmart Marketplace API', env: ['WALMART_CLIENT_ID', 'WALMART_CLIENT_SECRET'], used_by: 'RYN-TREND, RYN-PRICE', note: 'Best Seller, giá đối thủ.' },
  { key: 'GOOGLE_TRENDS', name: 'Google Trends (qua SerpAPI)', env: ['SERPAPI_KEY'], used_by: 'RYN-TREND', note: 'Xu hướng tìm kiếm VI/EN/ZH/FR.' },
  { key: 'RYNNBRAIN', name: 'Camera QC (RynnBrain hoặc dịch vụ thị giác tương đương)', env: ['QC_VISION_API_URL', 'QC_VISION_API_KEY'], used_by: 'RYN-TRACE, /api/v1/rynn-brain/check', note: 'Gửi ảnh, nhận tỉ lệ lỗi.' },
  { key: 'HEYGEN', name: 'HeyGen / CapCut (video 7 ngôn ngữ)', env: ['HEYGEN_API_KEY'], used_by: 'RYN-SALES, RYN-NEGO', note: 'Video giới thiệu sản phẩm, video đàm phán tiếng Trung.' },
  { key: 'ADS', name: 'TikTok / Facebook / Google Ads API', env: ['TIKTOK_ADS_TOKEN', 'META_ADS_TOKEN', 'GOOGLE_ADS_TOKEN'], used_by: 'RYN-SALES (Marketing)', note: 'Tự bật/tắt chiến dịch, lấy số liệu hằng ngày.' },
  { key: 'SHIPPING', name: 'GHN / GHTK / J&T API', env: ['GHN_TOKEN', 'GHTK_TOKEN', 'JT_TOKEN'], used_by: 'RYN-LOGI (Logistics)', note: 'Tính phí thật, tạo vận đơn, theo dõi.' },
  { key: 'BANK', name: 'Ngân hàng doanh nghiệp (sao kê, số dư)', env: ['BANK_API_URL', 'BANK_API_KEY'], used_by: 'Đối soát, RYN-LOGI', note: 'Số dư real-time, sao kê tự động. Hệ thống không tự chuyển tiền.' },
  { key: 'PAYMENT_GATEWAY', name: 'Cổng thanh toán (9PAY / VNPay / Momo / Alipay / WeChat Pay)', env: ['PAYMENT_GATEWAY', 'PAYMENT_GATEWAY_KEY'], used_by: 'Thanh toán khách', note: 'Hiện khách chuyển khoản, đối soát bằng sao kê.' },
  { key: 'INVOICE', name: 'Hóa đơn điện tử (VNPT Invoice / Viettel S-Invoice / MISA)', env: ['EINVOICE_API_URL', 'EINVOICE_API_KEY'], used_by: 'Kế toán & thuế', note: 'Hiện ghi số hóa đơn tay, xuất sổ CSV cho MISA.' },
];

export const connectorEnabled = (key: string) => {
  const c = CONNECTORS.find((x) => x.key === key);
  return !!c && c.env.every((e) => !!process.env[e]);
};

export function externalSourceStatus(key: string) {
  const c = CONNECTORS.find((x) => x.key === key.toUpperCase());
  if (!c) return { source: key, status: 'KHONG_HO_TRO' as const };
  return { source: c.key, name: c.name, status: connectorEnabled(c.key) ? 'DA_CAU_HINH' as const : 'CHUA_KET_NOI' as const, can_nhap: c.env };
}
