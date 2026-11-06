# taomua.com

Nền tảng mua bán hàng tự động: tìm xưởng, báo giá sỉ 4 bậc, duyệt đơn 5 cấp, giữ tiền đến khi khách nhận hàng, và bán trên bất kỳ nền tảng nào (9mua, Shopee, TikTok Shop, Lazada… đều là kênh bán ngang nhau).

Pháp nhân bán hàng: **TAOMUA Co., LTD**, đại diện pháp luật **Lê Thị Huỳnh Như**. MST và địa chỉ đăng ký nhập ở `.env` (`LEGAL_TAX_CODE`, `LEGAL_ADDRESS`).

> Bản thử nghiệm. Sản phẩm, xưởng, phí sàn và dự toán 12 tháng là **dữ liệu giả lập**. Chưa nhận đơn thật.

## Chạy thử

Cần Node 20+. PostgreSQL 14+ cài sẵn, hoặc dùng bản chạy trong thư mục dự án (`npm run db:local`, dữ liệu ở `.pgdata/`).

```bash
cp .env.example .env            # sửa DATABASE_URL nếu không dùng db:local
npm install
npm run db:local                # cửa sổ riêng, để mở (chỉ khi máy chưa có PostgreSQL)
npm run db:migrate
npm run agents                  # chạy 7 AI agent một lần (lịch 6 giờ: n8n/taomua_7_agents_6h.json)
SEED_CEO_PASSWORD=... SEED_STAFF_PASSWORD=... npm run db:seed   # bỏ trống thì seed tự sinh mật khẩu và in ra một lần
npm run dev                     # http://localhost:3000
npm test                        # cần database taomua_test (hoặc TEST_DATABASE_URL); bài test sẽ XÓA và tạo lại database này
```

Tài khoản seed: `ceo@`, `truongnhom@`, `ketoan@`, `nhanvien@taomua.local`. Đổi mật khẩu ở *Quản trị → Đổi mật khẩu*.

## Cấu trúc

| Phần | Đường dẫn |
|---|---|
| Cửa hàng sỉ | `/`, `/san-pham/[id]`, `/gio-hang`, `/don-hang` (tra cứu bằng mã đơn + SĐT), `/bao-gia` (RFQ) |
| Quản trị | `/quan-tri` — tổng quan, chờ duyệt, đơn hàng, sản phẩm, xưởng, kênh bán, nhập đơn từ kênh, báo giá, vốn, đối soát, chi tiền, kiểm soát chi, AI tự động, thông tin cần nhập, nhật ký, người dùng |
| API theo spec | `/api/v1/...` (15 endpoint, xem *Quản trị → AI tự động*) |
| 7 AI agent | `lib/agents/` — quy tắc `rules.ts`, chạy `index.ts`, áp dụng `apply.ts`, duyệt One-Tap `decide.ts`; AI ngôn ngữ `lib/ai.ts` |
| Thông tin còn thiếu | `lib/setup-status.ts` → trang `/quan-tri/can-nhap` |
| Logic | `lib/pricing.ts` (biên), `lib/approval.ts` (cấp duyệt), `lib/orders.ts` (vòng đời đơn, giữ tiền), `lib/channels.ts` (kênh bán), `lib/reconcile.ts` (đối soát) |
| Lược đồ | `db/schema.sql` |
| Tài liệu gốc | file `00`–`10` ở thư mục gốc, `docs/`, `mockups/`, `excels/`, `pdfs/`, `pngs/`, `n8n/` (mỗi file một chức năng, không trùng) |

## Đối soát thuyết minh

Bảng đối chiếu từng mục thuyết minh với mã nguồn, mục chạy khi có khóa và mục cố ý làm khác: [`docs/BAO_CAO_DOI_SOAT_THUYET_MINH.md`](docs/BAO_CAO_DOI_SOAT_THUYET_MINH.md).

## Thương hiệu: logo và slogan

Logo ở mọi trang (đầu trang, chân trang, thanh bên quản trị, đăng nhập, 404, biểu tượng tab, ảnh chia sẻ link). Sửa logo: thay file trong `public/brand/` giữ nguyên tên (`logo-full.png` đầy đủ, `logo-mark.png` túi mặt cười, `logo-chu.png` chữ ngang, `logo-goc.jpg` ảnh gốc), cấu hình ở `lib/brand.ts`; biểu tượng tab ở `app/icon.png`, `app/apple-icon.png`.

Slogan (`lib/slogans.ts`), mỗi trang một câu: trang chủ *Mua càng nhiều giá càng thấp* · sản phẩm, yêu cầu báo giá *Mua càng nhiều chiết khấu càng cao* · giỏ hàng *Mua càng nhiều thưởng càng lớn* · tra cứu đơn, báo lỗi, truy xuất, quản trị, đăng nhập, 404 *taomua cùng vui với bạn*. Chân trang hiện cả 4 câu.

## Quy tắc đã chốt với chủ dự án

**Biên ròng sau thuế, phí** (giá bán đã gồm VAT):

```
VAT đầu ra     = Giá bán × 8/108
Chi phí thực   = Giá vốn + phí + phí kênh − VAT đầu vào được trừ
LN trước TNDN  = Giá bán − Chi phí thực − VAT đầu ra − Phí ngân hàng 1%
LN ròng        = LN trước TNDN − TNDN 20% (chỉ khi có lãi)
Biên / chi phí = LN ròng ÷ Chi phí thực
```

**Duyệt đơn** theo giá trị đơn: dưới 5 triệu Cấp 1 (tự duyệt) · 5–20 triệu Cấp 2 (trưởng nhóm, 30 phút) · 20–50 triệu Cấp 3 (CEO, 5 phút) · 50–200 triệu Cấp 4 (CEO, 2 giờ) · trên 200 triệu Cấp 5 (CEO, 24 giờ).
Mức sàn: biên dưới 15% → tối thiểu Cấp 2; đơn lỗ → tối thiểu Cấp 4. Biên sỉ trên 150% chỉ cảnh báo, không chặn.

**Chi tiền** (`lib/payouts.ts`, theo `docs/PAYMENT_MANAGEMENT_AI_CEO_200D.md`): cùng ngưỡng cấp như duyệt đơn. Dưới 5 triệu tự duyệt (trừ loại "Khác") · 5–20 triệu trưởng nhóm hoặc CEO, không tự duyệt khoản mình đề xuất · từ 20 triệu chỉ CEO · từ 10 triệu người duyệt nhập lại mật khẩu. Hệ thống không tự chuyển tiền: kế toán chuyển khoản rồi ghi mã giao dịch.

**Kiểm soát chi** (`/quan-tri/kiem-soat-chi`, CEO đổi): nút tổng tắt thì mọi đơn và khoản chi Cấp 1 cần người duyệt · 6 nút khóa từng loại chi · nút khóa nhập hàng mới (chặn đặt cọc xưởng và mua mẫu) · Trade Assurance luôn bật. Mỗi lần đổi ghi nhật ký.

**7 AI agent** (`docs/MULTILINGUAL_7_AI_SPEC.md`), chạy 6 giờ/lần trên dữ liệu thật:

| Agent | Tự làm | Đưa vào hàng đợi One-Tap |
|---|---|---|
| RYN-TREND | Bảng xếp hạng hàng hot (trend, bán 7 ngày, CTR) | — (chỉ đọc) |
| RYN-SUPPLY | Tính lại TrustScore | Đổi xưởng chính không đạt (Trust < 85, lỗi > 2%) sang xưởng dự phòng (Cấp 2) |
| RYN-NEGO | 4 kịch bản đàm phán tiếng Trung + tiếng Việt cho xưởng 1688, mục tiêu −10% | — |
| RYN-PRICE | Giảm 2% khi đối thủ rẻ hơn, vẫn giữ biên ≥ 15% (Cấp 1) | Nâng giá bậc có biên < 15% (Cấp 2); cảnh báo biên > 150% |
| RYN-TRACE | Lưu lịch sử giá vốn; cảnh báo giá vốn tăng ≥ 10%, QC < 98% | — |
| RYN-SALES | Báo giá yêu cầu sỉ dưới 5 triệu; dừng hàng bán thử CTR < 2%; dịch tên 7 ngôn ngữ (khi có AI_API_KEY) | Báo giá lớn hơn (theo cấp); nhập lớn khi CTR > 3% (Cấp 3) |
| RYN-LOGI | Cảnh báo đơn quá hạn duyệt, chờ thanh toán, chờ giải ngân, khoản chi chờ lâu | Khóa nhập mới khi biên an toàn < 20% (tự làm nếu số thật, đề xuất nếu số giả lập) |

**AI tìm xưởng** (`lib/sourcing.ts`, trang `/quan-tri/tim-xuong`): mỗi nhu cầu (sản phẩm có xưởng không đạt, khách hỏi giá hàng chưa có, hoặc người tạo) được RYN-SUPPLY chấm điểm trên mọi xưởng cùng ngành hàng: báo giá đúng món đó, giá xưởng + phí, MOQ so với số lượng (MOQ cao → bán thử trước), biên ở giá bán dự kiến, TrustScore ≥ 85, lỗi ≤ 2%, ngày sản xuất, giao quốc tế. AI đề xuất 1 xưởng chính + 3 dự phòng, **CEO chọn** (Cấp 3). Chưa có báo giá đạt thì AI soạn tin hỏi giá tiếng Trung / Việt. AI không bịa xưởng: chỉ xếp hạng xưởng và báo giá có trong hệ thống; báo giá nhập tay hoặc dán tin nhắn xưởng để AI đọc (cần `AI_API_KEY`).

**Bán thật trong nước và quốc tế**: khách chọn nơi giao (23 nước), số điện thoại quốc tế `+mã nước`, đơn quốc tế bắt buộc email và tối thiểu Cấp 2 để nhân viên nhập phí vận chuyển trước khi khách trả tiền; số tiền khách trả = tiền hàng + phí vận chuyển, đối soát sao kê khớp theo số này. Khách báo lỗi ở `/bao-loi`; lỗi máy chủ tự ghi vào `/quan-tri/loi` cùng bộ đếm đơn thật (mục tiêu 10–100 đơn). Danh sách việc phải xong trước khi nhận tiền thật ở *Thông tin cần nhập → Trước khi bán thật*.

Nút tổng tắt thì không gì tự làm, trừ phân tích dữ liệu. Không agent nào chuyển tiền. Đề xuất bị từ chối thì 7 ngày không nhắc lại; đề xuất cũ không áp dụng nếu dữ liệu đã bị người khác đổi.

**Quick Approve Center (QAC, One-Tap)** — `/quan-tri/duyet-nhanh` (cũng mở được bằng `/admin/approval` theo spec): một hàng đợi cho đơn Cấp 2–5, khoản chi, đề xuất 7 agent và việc n8n gửi vào (`POST /api/v1/approval/queue`, n8n hỏi trạng thái bằng `GET ?id=`). Trang tự cập nhật 10 giây, bật popup trình duyệt, nút DUYỆT / TỪ CHỐI lớn cho điện thoại; duyệt qua `POST /api/v1/approval/approve` (chỉ người đăng nhập). Kênh phụ: Zalo OA, email, Telegram nếu có cấu hình.

**Kế toán & thuế** (`/quan-tri/ke-toan`): theo tháng VAT đầu ra / đầu vào / phải nộp, TNDN 20% tạm tính, phí sàn, phí ngân hàng, chi vận hành; hóa đơn điện tử bắt buộc cho đơn từ 10 triệu (ghi số hóa đơn); tải sổ bán hàng CSV để nhập MISA / FAST.

**Khủng hoảng & khiếu nại** (`/quan-tri/khieu-nai`, `lib/complaints.ts`): khách gửi ở `/bao-loi`; AI phân loại mức độ và cách xử lý (đổi hàng, hoàn tiền Trade Assurance, bồi thường, xin lỗi, sửa web). Hoàn tiền / bồi thường đơn trên 10 triệu, nguy cơ khủng hoảng, khách mất tiền → mức Cao, vào thẳng cột Chờ CEO. Kanban: Mới → Đang xử lý → Chờ CEO → Hoàn thành.

**Truy xuất nguồn gốc** (`/truy-xuat/[sku]`, RYN-TRACE): QR trên trang sản phẩm và trang quản trị; quét ra 7 ngôn ngữ theo máy người quét (xưởng, quốc gia, TrustScore, QC, lỗi, đúng hạn, giá sỉ). Không hiện giá vốn, biên.

**9mua bán lẻ** (`/shop`, spec trang 3): bảng tin dọc kiểu TikTok các sản phẩm đang bán trên kênh 9mua, Mua ngay 1 chạm (nhớ thông tin giao hàng), 1–9 cái; từ 10 cái mời mua sỉ. Giá lấy từ niêm yết kênh 9mua ở máy chủ, đơn đi qua cùng quy trình duyệt, giữ tiền, đối soát.

**CSKH AI** (`lib/cskh.ts`, nút "Hỏi AI" mọi trang cửa hàng): phân loại câu hỏi (giá sỉ, tồn kho, trạng thái đơn, vận chuyển, thanh toán, hóa đơn, khiếu nại, gặp người) và trả lời bằng dữ liệu thật; tra đơn cần mã + số điện thoại; câu tự do dùng AI ngôn ngữ khi có khóa, không thì chuyển người. Nhật ký và tỉ lệ AI tự trả lời ở trang Khiếu nại.

**Marketing** (`/quan-tri/marketing`, `lib/marketing.ts`): chiến dịch TikTok / Facebook / Google / Zalo Ads, số liệu ngày bằng CSV; RYN-SALES 7 ngày: ROAS < 2 hoặc CTR < 2% tự tạm dừng, CTR > 3% và ROAS đạt mục tiêu đề xuất +20% ngân sách; khóa chi quảng cáo ở Kiểm soát chi thì dừng hết.

**Logistics** (`/quan-tri/logistics`, `lib/logistics.ts`): bảng giá hãng theo vùng (nội tỉnh, nội miền, liên miền, quốc tế) và khối lượng; RYN-LOGI chọn hãng rẻ nhất cho đơn đang chuẩn bị, trang đơn chọn sẵn hãng đó.

**Giữ tiền**: tiền khách chuyển được giữ đến khi khách xác nhận đã nhận hàng, hoặc CEO xác nhận. CEO có thể hoàn tiền từ khoản đang giữ.

**Kênh bán**: taomua.com là kênh riêng. Mọi nền tảng khác là một dòng trong `sales_channels` với phí sàn riêng. Chưa kênh nào có API: đơn được nhập tay hoặc bằng CSV, sản phẩm xuất CSV để đăng thủ công. Khi có API, viết một `ChannelConnector` trong `lib/channels.ts`.

**Bảo mật**: đăng nhập bằng email + mật khẩu (scrypt), phiên lưu ở máy chủ, khóa sau 5 lần sai trong 15 phút, phân quyền theo vai trò. Không có PIN chung. Khách không bao giờ thấy giá vốn, phí hay biên. Không có số tài khoản nào trong mã nguồn; thông tin nhận tiền lấy từ biến môi trường.

## Khung chat

- **Khách hàng ↔ CSKH AI**: nút "Hỏi AI" ở mọi trang cửa hàng.
- **CEO, Trưởng nhóm, Kỹ sư AI ↔ 7 agent**: *Quản trị → Chat & huấn luyện agent* (`/quan-tri/huan-luyen-agent`). Lệnh: `chạy`, `báo cáo`, `nhiệm vụ`, `đã học gì`, `dạy: <quy tắc>`, `hỏi: <câu hỏi> => <câu trả lời>`, `quên #<số>`. Câu dạy cho RYN-SALES được CSKH dùng trả lời khách. Vai trò mới **Kỹ sư AI** (tạo ở *Người dùng*) được chạy và huấn luyện agent, xem đơn; không có quyền duyệt hay chi tiền.
- 🏷️ Trang 7 agent đang **đánh dấu chờ CEO đặt tên và chia việc** lại.

## Chế độ GIẢ LẬP

Chưa có tài khoản thật thì mọi dịch vụ ngoài chạy **giả lập** để thấy trọn luồng 95% tự động: trend 20 nguồn, tìm xưởng 1688, camera QC, video 7 ngôn ngữ, tìm bằng ảnh, cổng thanh toán 9PAY / VNPay / Momo / Alipay, QR chuyển khoản, chuyển khoản chi, hóa đơn điện tử, Zalo / email.
Mọi dữ liệu giả lập có nhãn **GIẢ LẬP** và được ghi ở *Quản trị → Thông báo & kết nối*. Nhập khóa vào `.env` là tự chuyển sang thật (xem *Quản trị → Thông tin cần nhập*).
Thao tác dính tiền giả lập chỉ chạy khi `SIM_ACTIONS=on` hoặc chạy ở máy thử; khi chạy thật (production) chúng tự tắt.

## Còn chờ chủ dự án nhập

- Pháp nhân TAOMUA Co., LTD: mã số thuế, địa chỉ đăng ký (`LEGAL_TAX_CODE`, `LEGAL_ADDRESS`).
- Tài khoản nhận tiền (`PAYMENT_BANK_*`, `PAYMENT_BANK_BIN` để QR VietQR thật), API ngân hàng, cổng thanh toán, hóa đơn điện tử VNPT / Viettel.
- Khóa 1688 / Accio, TikTok, Amazon, Walmart, Google Trends, HeyGen, Ads, GHN / GHTK / J&T, AI (`AI_API_KEY`, `AI_VISION_MODEL`), Zalo OA, SMTP.
- Danh sách 19 yếu tố TrustScore và trọng số (đang tạm tính 5 yếu tố).
- Máy chủ, tên miền, sao lưu database; kế toán và luật sư xem cách ghi nhận tiền đang giữ, VAT, điều khoản giữ tiền.
