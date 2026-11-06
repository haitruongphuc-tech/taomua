# Báo cáo đối soát thuyết minh ↔ mã nguồn taomua.com

Đối chiếu từng mục trong file `00`–`10` và `docs/` với mã nguồn. Ký hiệu:
**✅ Đã code** (chạy ngay) · **🔌 Đã code, chạy khi có khóa** (nhập khóa vào `.env`, xem *Quản trị → Thông tin cần nhập*) ·
**⚠️ Cố ý làm khác** (lý do ghi bên cạnh).

Dữ liệu sản phẩm, xưởng, giá, dự toán, bảng giá ship, chiến dịch mẫu hiện là **giả lập**, chủ dự án sửa sau.

## 1. Logic kinh doanh (01 chương 2, 09)

| Mục | Trạng thái | Ở đâu |
|---|---|---|
| Biên ròng sau thuế phí 15–150% (VAT 8%, phí ngân hàng 1%, TNDN 20%) | ✅ | `lib/pricing.ts` |
| 5 cấp duyệt theo giá trị đơn, sàn biên 15%, đơn lỗ ≥ Cấp 4 | ✅ | `lib/approval.ts` |
| Vốn lưu động 30% + dự phòng 15% = 45%, vòng quay > 3, biên an toàn > 20% (< 25% vàng, < 20% khóa nhập) | ✅ | `lib/capital.ts`, RYN-LOGI |
| Giữ tiền (Trade Assurance) đến khi khách nhận hàng, hoàn tiền | ✅ | `lib/orders.ts` |
| LATR bán thử 50–100 cái, CTR > 3% nhập lớn, < 2% dừng | ✅ | RYN-SALES, API #12 |
| TrustScore | ✅ 5 yếu tố | ⚠️ spec ghi 17 / 19 yếu tố nhưng chưa có danh sách; chờ chủ dự án gửi |
| Agent Profiles 10 / 50 / 100 triệu (theo tháng) | ✅ | `lib/orders.ts`, API #8 |

## 2. 14 API (03_API_SPEC.md)

| # | Endpoint | Trạng thái |
|---|---|---|
| 1 | trend-hunter/scan `{source, limit}` → `{trends}` | ✅ dữ liệu nội bộ · 🔌 TikTok / 1688 / Amazon / Walmart / Google Trends |
| 2 | supplier-brain/find `{product_name, category}` → `{suppliers}` + 3 dự phòng | ✅ · 🔌 tìm mới trên 1688 / Accio |
| 3 | supplier-brain/trust-score → `{trust_score, factors}` | ✅ |
| 4 | pricing-engine/calculate `{cost, fee, quantity, tier}` → 4 bậc giá, biên, cấp, vốn | ✅ |
| 5 | approval/queue (thay Telegram) | ✅ |
| 6 | approval/approve (1 chạm) | ✅ |
| 7 | agent-gateway/shop-md `{query, agent}` → sản phẩm + link giỏ + thanh toán | ✅ |
| 8 | agent-gateway/profiles → `{limit, spent, remaining, agent_gateway}` | ✅ |
| 9 | wfs/fulfillment → `{tracking_id, status, wfs_type}` | ✅ |
| 10 | trade-assurance/hold `HOLD / RELEASED / REFUND` | ✅ (giải ngân, hoàn tiền: chỉ CEO) |
| 11 | rynn-brain/check → `{defect_rate, passed}` | ✅ nhận kết quả kiểm · 🔌 camera AI |
| 12 | latr/test → `TESTING / SCALING / STOPPED` | ✅ |
| 13 | scintilla/analytics → `{sales, roas, ctr, bien_rong, von_luu_dong, vong_quay}` | ✅ |
| 14 | working-capital/calculate | ✅ |
| — | API Telegram cũ | Đã xóa theo 07 ("bỏ Telegram") |

## 3. Trang (04_FRONTEND_PAGES, ALGORITHM mục 7)

| Trang | Trạng thái |
|---|---|
| `/` B2B: bảng giá 4 bậc, TrustScore, xưởng, trợ lý tìm hàng AI (câu tự nhiên), tìm bằng giọng nói, máy tính lời siêu tốc 10→500, so sánh giá đối thủ, logo, slogan | ✅ |
| `/san-pham/[id]` (= `/product/[id]`): 4 bậc giá + thanh kéo, TrustScore, QR 7 ngôn ngữ, so sánh giá, lịch sử giá 365 ngày | ✅ |
| `/truy-xuat/[sku]` (= `/qr/[id]`): truy xuất 7 ngôn ngữ | ✅ (không hiện giá vốn, biên: quy tắc đã chốt) |
| `/shop` 9mua bán lẻ kiểu TikTok, mua 1 chạm | ✅ · 🔌 cổng thanh toán 9PAY / VNPay / Momo / Alipay; ⚠️ video thật cần HeyGen |
| `/quan-tri` (= `/admin`) CEO: tổng quan, kế toán thuế, hóa đơn, vốn, marketing, logistics, CSKH, khủng hoảng & khiếu nại Kanban, 7 agent, chi tiền | ✅ |
| `/quan-tri/duyet-nhanh` (= `/admin/approval`) Quick Approve Center + bảng phân quyền 95% AI | ✅ (trang "Chờ duyệt" cũ đã gộp vào đây) |
| `/quan-tri/kiem-soat-chi` (= `/admin/payment`): phân quyền chi theo cấp, 10 nút Tắt/Mở (gồm canh mua giảm giá), Trade Assurance luôn bật | ✅ |
| Canvas sửa giao diện bằng lời | ✅ `/quan-tri/giao-dien` (sửa bằng lời cần AI_API_KEY) |
| Logo mọi trang, slogan từng trang | ✅ |
| Ngôn ngữ 7 thứ tiếng | ✅ trang truy xuất, giỏ hàng & tra cứu song ngữ · 🔌 tên sản phẩm 7 ngôn ngữ (AI dịch khi có khóa) |
| Image search (tìm bằng ảnh), AR "Shop to Light" | ⚠️ chưa làm: cần dịch vụ thị giác / AR |

## 4. 7 AI agent (MULTILINGUAL_7_AI_SPEC, 01 chương 3, ALGORITHM mục 4)

| Agent | Đã tự động | Cần khóa ngoài |
|---|---|---|
| RYN-TREND | xếp hạng hàng hot, gợi ý bán thử | 🔌 20 nguồn trend ngoài |
| RYN-SUPPLY | TrustScore, tìm xưởng cùng ngành theo giá/số lượng/MOQ, CEO chọn, canh xưởng giảm giá ≥ 10% | 🔌 1688 / Accio |
| RYN-NEGO | 4 kịch bản đàm phán tiếng Trung, đàm phán lại khi khách mua 500 cái | 🔌 video HeyGen tiếng Trung |
| RYN-PRICE | giữ biên ≥ 15%, đối thủ rẻ hơn giảm 2%, kiểm giá trên kênh bán / 9mua | 🔌 giá Amazon / Walmart tự động |
| RYN-TRACE | lịch sử giá vốn, QC < 98%, **Compliance** (xưởng chưa chứng nhận, hóa đơn chưa xuất) | 🔌 camera QC |
| RYN-SALES | báo giá RFQ, LATR, quảng cáo ROAS/CTR, CSKH AI chat, **Content** (AI viết mô tả, người duyệt), dịch 7 ngôn ngữ | 🔌 AI ngôn ngữ, Ads API, video |
| RYN-LOGI | biên an toàn vốn, khóa nhập, chọn hãng ship rẻ nhất, đơn quá hạn / chờ thanh toán / chờ giải ngân | 🔌 API GHN / GHTK / J&T, ngân hàng |

Lịch 6 giờ: `n8n/taomua_7_agents_6h.json` hoặc `npm run agents`.

## 5. Chồng lấn đã sửa trong lần đối soát này

- Xóa `docs/goc/` (bản sao spec, Excel, mockup; workflow n8n cũ còn Telegram; mockup CEO bản cũ). `Du_toan_12_thang.xlsx` chuyển sang `excels/`.
- Xóa 3 mockup trùng nội dung (giữ `mockup_thanh_toan_ai_full_integrated.html`, `dashboard_revenue_capital_full.html`, `mockup_trang_chu_logo.html`); bỏ file tên lộ PIN.
- Xóa 2 file logo trùng (`logo_taomua_real.jpg`, `.png` thực ra là JPEG); thay `assets/logo_taomua.png` hỏng chữ bằng logo thật.
- Xóa `Artifact (4).html` (trang web lưu nhầm, không phải tài liệu).
- Gộp trang "Chờ duyệt" vào Duyệt nhanh; xóa API `approval/telegram`.

## 6. Mâu thuẫn giữa các file thuyết minh (cần chủ dự án chốt)

1. **7 agent**: 01 chương 3 ghi Sourcing / Content / Ads / CSKH / Accounting / Logistics / Compliance; MULTILINGUAL ghi RYN-TREND … RYN-LOGI. Code theo bộ RYN và gộp đủ chức năng của bộ kia (bảng mục 4).
2. **Cấp duyệt**: 01 ghi theo biên và giá trị; code theo giá trị đơn + sàn biên (quy tắc đã chốt trong README).
3. **Pháp nhân**: 01 ghi taomua.com đứng tên Lê Huỳnh Như, nhà đầu tư Nữ Hoàng Nội Thất "tạm ngưng"; code đang dùng CÔNG TY CP NỮ HOÀNG NỘI THẤT, MST 0316437942 (theo giấy chủ dự án cung cấp trước đó).
4. **PIN 9999**: spec dùng PIN; code thay bằng nhập lại mật khẩu (PIN đã công khai trên GitHub).
5. **Nút chi tiền tự chuyển khoản**: spec muốn tự CK; code chỉ duyệt và ghi nhận, kế toán chuyển trên ngân hàng (an toàn tiền thật).
6. **Slogan /shop**: SLOGAN_MUA_NHIEU_LOI_NHIEU gợi ý "Tao thích cứ mua"; code dùng 4 câu chủ dự án chọn.
