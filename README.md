# taomua.com

Nền tảng mua bán hàng tự động: tìm xưởng, báo giá sỉ 4 bậc, duyệt đơn 5 cấp, giữ tiền đến khi khách nhận hàng, và bán trên bất kỳ nền tảng nào (9mua, Shopee, TikTok Shop, Lazada… đều là kênh bán ngang nhau).

Pháp nhân bán hàng: **CÔNG TY CỔ PHẦN NỮ HOÀNG NỘI THẤT**, MST 0316437942.

> Bản thử nghiệm. Sản phẩm, xưởng, phí sàn và dự toán 12 tháng là **dữ liệu giả lập**. Chưa nhận đơn thật.

## Chạy thử

Cần Node 20+ và PostgreSQL 14+.

```bash
cp .env.example .env            # sửa DATABASE_URL
npm install
npm run db:migrate
SEED_CEO_PASSWORD=... SEED_STAFF_PASSWORD=... npm run db:seed   # bỏ trống thì seed tự sinh mật khẩu và in ra một lần
npm run dev                     # http://localhost:3000
npm test                        # cần database taomua_test (hoặc TEST_DATABASE_URL); bài test sẽ XÓA và tạo lại database này
```

Tài khoản seed: `ceo@`, `truongnhom@`, `ketoan@`, `nhanvien@taomua.local`. Đổi mật khẩu ở *Quản trị → Đổi mật khẩu*.

## Cấu trúc

| Phần | Đường dẫn |
|---|---|
| Cửa hàng sỉ | `/`, `/san-pham/[id]`, `/gio-hang`, `/don-hang` (tra cứu bằng mã đơn + SĐT), `/bao-gia` (RFQ) |
| Quản trị | `/quan-tri` — tổng quan, chờ duyệt, đơn hàng, sản phẩm, xưởng, kênh bán, nhập đơn từ kênh, báo giá, vốn, đối soát, chi tiền, kiểm soát chi, dịch vụ AI, nhật ký, người dùng |
| API theo spec | `/api/v1/...` (14 endpoint, xem *Quản trị → Dịch vụ AI*) |
| Logic | `lib/pricing.ts` (biên), `lib/approval.ts` (cấp duyệt), `lib/orders.ts` (vòng đời đơn, giữ tiền), `lib/channels.ts` (kênh bán), `lib/reconcile.ts` (đối soát) |
| Lược đồ | `db/schema.sql` |
| Tài liệu gốc | `docs/goc/` (spec, workflow n8n, mockup, dự toán) |

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

**Giữ tiền**: tiền khách chuyển được giữ đến khi khách xác nhận đã nhận hàng, hoặc CEO xác nhận. CEO có thể hoàn tiền từ khoản đang giữ.

**Kênh bán**: taomua.com là kênh riêng. Mọi nền tảng khác là một dòng trong `sales_channels` với phí sàn riêng. Chưa kênh nào có API: đơn được nhập tay hoặc bằng CSV, sản phẩm xuất CSV để đăng thủ công. Khi có API, viết một `ChannelConnector` trong `lib/channels.ts`.

**Bảo mật**: đăng nhập bằng email + mật khẩu (scrypt), phiên lưu ở máy chủ, khóa sau 5 lần sai trong 15 phút, phân quyền theo vai trò. Không có PIN chung. Khách không bao giờ thấy giá vốn, phí hay biên. Không có số tài khoản nào trong mã nguồn; thông tin nhận tiền lấy từ biến môi trường.

## Còn chờ

- Tài liệu API của Qwen, RynnBrain, Accio (5 endpoint AI đang trả 501, không trả dữ liệu giả).
- Tài khoản nhận tiền và API ngân hàng (hiện đối soát bằng sao kê CSV; hệ thống không tự chuyển tiền).
- Danh sách nền tảng cần kết nối API và quyền truy cập của từng nền tảng; phí sàn thật.
- Danh sách 19 yếu tố TrustScore và trọng số (đang tạm tính 5 yếu tố).
- Xác thực 2 lớp cho khoản chi lớn và cách nhà đầu tư cùng duyệt Cấp 5 (spec yêu cầu, chưa làm).
- Bot Telegram thật và chat id người duyệt (đã có code gửi và webhook, chưa thử với bot thật).
- Máy chủ, tên miền, sao lưu database.
- Kế toán xác nhận cách ghi nhận tiền đang giữ và VAT đầu vào; luật sư xem điều khoản giữ tiền và bảng so sánh giá.
