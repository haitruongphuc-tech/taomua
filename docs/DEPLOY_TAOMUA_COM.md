# Hướng dẫn đưa taomua.com lên mạng

## ⚡ Cách nhanh: 1 lệnh (VPS đã có, tên miền đã trỏ về IP VPS)

Đăng nhập VPS bằng root (`ssh root@IP_VPS`), chạy 2 dòng sau. Thay email bằng email nhận thông báo chứng chỉ HTTPS, hoặc bỏ trống:

```bash
curl -fsSL https://raw.githubusercontent.com/haitruongphuc-tech/taomua/main/deploy/install.sh -o taomua-install.sh
bash taomua-install.sh taomua.com EMAIL_CUA_BAN
```

Chờ khoảng 5–10 phút. Script tự làm toàn bộ các mục 2–7 bên dưới:

- cài Node 20, PostgreSQL, Nginx, pm2;
- tạo database với mật khẩu ngẫu nhiên;
- tải mã nguồn, tạo `.env` (`SITE_URL=https://taomua.com`, `SIM_ACTIONS=off`), build;
- tạo tài khoản quản trị;
- chạy web và AI 24/7, tự chạy lại khi khởi động máy;
- cấp HTTPS miễn phí;
- sao lưu database lúc 2 giờ sáng mỗi ngày.

Khi xong:

| Việc | Lệnh / nơi |
|---|---|
| Xem mật khẩu quản trị ban đầu | `cat /root/taomua-tai-khoan.txt` → đăng nhập https://taomua.com/quan-tri, đổi mật khẩu, tạo tài khoản thật, khóa tài khoản `@taomua.local` |
| Nhập MST, địa chỉ, ngân hàng, `AI_API_KEY`… | `nano /home/taomua/app/.env`, sau đó chạy `taomua-update` |
| Cập nhật bản mới sau mỗi lần commit lên GitHub | `taomua-update` (tự sao lưu database trước) |
| Xem nhật ký web / AI | `sudo -u taomua pm2 logs` |

Ghi chú:

- Chạy lại script an toàn: phần nào đã có thì bỏ qua, không xóa dữ liệu.
- Web chỉ nghe ở `127.0.0.1`, Nginx đứng trước lo HTTPS. Script không đổi tường lửa, chỉ mở thêm cổng 80/443 nếu ufw đang bật.
- Dùng **Cloudflare** (đám mây cam) thì tạm tắt proxy (chuyển sang "DNS only") khi chạy script để cấp HTTPS, xong bật lại với chế độ SSL "Full (strict)".
- Cổng 80 đang bị phần mềm khác dùng (Apache, aaPanel…): script dừng và báo; tắt phần mềm đó rồi chạy lại.
- Script tải mã từ kho GitHub công khai. Nếu sau này chuyển kho sang riêng tư, cần thêm khóa truy cập (deploy key).

Phần dưới đây là **cách làm tay từng bước**, chỉ cần khi muốn tự kiểm soát hoặc khi script báo lỗi.

---

Cách khuyên dùng: **1 máy chủ VPS Ubuntu**. Trên máy chủ cài:

- Node.js chạy web;
- PostgreSQL làm database;
- Nginx + chứng chỉ HTTPS miễn phí;
- pm2 giữ web và AI 24/7 luôn chạy.

Lý do không dùng Vercel/Netlify: taomua cần vòng nền AI 24/7 (`npm run ai:247`). Sau này còn có thể cần AI ngôn ngữ chạy local (Ollama), và hai thứ này không chạy được trên các dịch vụ đó.

Thời gian làm: khoảng 1 giờ. Các lệnh dưới đây gõ trên máy chủ (qua SSH), trừ khi ghi khác.

---

## 0. Chuẩn bị

| Cần | Gợi ý |
|---|---|
| VPS Ubuntu 22.04 hoặc 24.04 | Tối thiểu 2 CPU, 4 GB RAM, 40 GB SSD. Muốn chạy AI ngôn ngữ local (Ollama, `qwen2.5:7b`) thì 8 CPU, 16 GB RAM. Nhà cung cấp: Viettel IDC, VNPT, FPT, BizFly, Vultr Singapore, DigitalOcean Singapore… |
| Tên miền `taomua.com` | Quyền vào trang quản lý DNS nơi mua tên miền (Mắt Bão, PA, iNET, Tenten, Namecheap…) |
| IP của VPS | Ví dụ `103.x.x.x`. Bên dưới gọi là `IP_VPS` |

> ⚠️ **Không chạy `npm test` trên máy chủ thật.** Bài test xóa và tạo lại database `taomua_test`. Nếu cấu hình nhầm, nó có thể xóa dữ liệu thật.

---

## 1. Trỏ tên miền về máy chủ

Làm trong trang quản lý DNS của taomua.com:

| Loại | Tên (Host) | Giá trị | TTL |
|---|---|---|---|
| A | `@` | `IP_VPS` | 300 |
| A | `www` | `IP_VPS` | 300 |

Xóa các bản ghi A / AAAA / CNAME cũ trùng tên `@` hoặc `www`, nếu có. DNS thường cập nhật trong 5–30 phút.

Kiểm tra từ máy tính của anh/chị:

```bash
nslookup taomua.com
```

Kết quả phải ra đúng `IP_VPS`.

---

## 2. Cài phần mềm trên VPS

```bash
ssh root@IP_VPS
```

```bash
apt update && apt -y upgrade
apt -y install git nginx postgresql ufw
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt -y install nodejs
npm install -g pm2
```

Tạo người dùng riêng để chạy web (không chạy bằng root):

```bash
adduser --disabled-password --gecos "" taomua
```

Mở tường lửa (chỉ SSH, HTTP, HTTPS):

```bash
ufw allow OpenSSH && ufw allow 'Nginx Full' && ufw --force enable
```

---

## 3. Tạo database

Tự đặt một mật khẩu dài cho database (ví dụ tạo bằng `openssl rand -base64 24`). Bên dưới gọi là `MAT_KHAU_DB`.

```bash
sudo -u postgres psql -c "CREATE USER taomua WITH PASSWORD 'MAT_KHAU_DB';"
sudo -u postgres psql -c "CREATE DATABASE taomua OWNER taomua;"
```

PostgreSQL mặc định chỉ nghe trong máy chủ (localhost), không mở ra Internet. Giữ nguyên như vậy.

---

## 4. Lấy mã nguồn và cấu hình

```bash
su - taomua
git clone https://github.com/haitruongphuc-tech/taomua.git app
cd app
cp .env.example .env
nano .env
```

Sửa tối thiểu các dòng sau trong `.env`:

```ini
DATABASE_URL=postgres://taomua:MAT_KHAU_DB@localhost:5432/taomua
SITE_URL=https://taomua.com
INTERNAL_API_KEY=<chuỗi ngẫu nhiên dài, dùng cho n8n gọi /api/v1>
LEGAL_TAX_CODE=<MST TAOMUA Co., LTD>
LEGAL_ADDRESS=<địa chỉ đăng ký>
# Chạy thật trên tên miền công khai: TẮT giả lập dính tiền (xem mục 9)
SIM_ACTIONS=off
```

Các dòng khác (tài khoản ngân hàng, `AI_API_KEY`, Zalo, email, hãng vận chuyển…) nhập dần khi có. Thiếu dòng nào thì phần đó chạy GIẢ LẬP như trên máy thử. Danh sách đầy đủ xem ở *Quản trị → Thông tin cần nhập*.

Cài thư viện, tạo bảng và build:

```bash
npm ci
npm run db:migrate
npm run build
```

Tạo tài khoản quản trị ban đầu. Tự đặt hai mật khẩu mạnh và **ghi lại ngay**, vì chúng không được lưu ở đâu khác:

```bash
SEED_CEO_PASSWORD='mật-khẩu-CEO-mạnh' SEED_STAFF_PASSWORD='mật-khẩu-nhân-viên-mạnh' npm run db:seed
```

> `db:seed` tạo 4 tài khoản `…@taomua.local` và **sản phẩm / xưởng mẫu có nhãn giả lập** để thấy trọn luồng. Sau khi đăng nhập:
> 1. Vào *Người dùng*, tạo tài khoản thật (email thật) cho CEO, kế toán, Kỹ sư AI…
> 2. Bấm **Khóa** các tài khoản `@taomua.local`.
> 3. Thay sản phẩm mẫu bằng sản phẩm thật, hoặc tắt hiển thị sản phẩm mẫu.

---

## 5. Chạy web và AI 24/7 bằng pm2

Vẫn đăng nhập là người dùng `taomua`, trong thư mục `~/app`:

```bash
pm2 start npm --name taomua-web -- start
pm2 start npm --name taomua-ai -- run ai:247
pm2 save
```

Cho pm2 tự chạy lại khi máy chủ khởi động lại. Lệnh `pm2 startup` in ra một dòng lệnh `sudo …`. Thoát về root, chạy đúng dòng đó:

```bash
exit
```

```bash
pm2 startup systemd -u taomua --hp /home/taomua
```

Kiểm tra web đã chạy:

```bash
curl -I http://localhost:3000
```

Phải ra `HTTP/1.1 200`.

---

## 6. Nginx + HTTPS

Làm bằng root. Tạo file `/etc/nginx/sites-available/taomua`:

```nginx
server {
    listen 80;
    server_name taomua.com www.taomua.com;
    client_max_body_size 10m;          # tải ảnh tìm hàng, ảnh QC

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $remote_addr;   # không ghép IP do khách gửi lên (chống giả IP để vượt giới hạn đăng nhập sai)
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

Bật cấu hình rồi cấp chứng chỉ HTTPS miễn phí (Let's Encrypt, tự gia hạn). Thay `EMAIL_CUA_BAN` bằng email nhận thông báo hết hạn chứng chỉ:

```bash
ln -s /etc/nginx/sites-available/taomua /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
apt -y install certbot python3-certbot-nginx
certbot --nginx -d taomua.com -d www.taomua.com --redirect -m EMAIL_CUA_BAN --agree-tos -n
```

Mở **https://taomua.com**: phải thấy cửa hàng có ổ khóa HTTPS. Trang quản trị ở **https://taomua.com/quan-tri**.

---

## 7. Sao lưu database hằng ngày

Làm bằng root:

```bash
mkdir -p /var/backups/taomua && chown postgres /var/backups/taomua
crontab -u postgres -e
```

Thêm dòng sau. Mỗi ngày lúc 2 giờ sáng máy sẽ sao lưu và giữ 14 ngày gần nhất:

```cron
0 2 * * * pg_dump -Fc taomua > /var/backups/taomua/taomua-$(date +\%F).dump && find /var/backups/taomua -mtime +14 -delete
```

Nên chép thêm bản sao lưu ra ngoài máy chủ (Google Drive, S3, máy khác), ít nhất mỗi tuần một lần.

Khôi phục khi cần (cẩn thận: lệnh này ghi đè dữ liệu hiện tại):

```bash
sudo -u postgres pg_restore --clean -d taomua /var/backups/taomua/taomua-NGAY.dump
```

---

## 8. Cập nhật phiên bản mới

Sau mỗi lần commit lên GitHub, chạy trên máy chủ:

```bash
su - taomua -c 'cd app && git pull && npm ci && npm run db:migrate && npm run build && pm2 reload taomua-web taomua-ai'
```

`db:migrate` chạy lại an toàn nhiều lần: không xóa dữ liệu, không thêm lại bài học mặc định đã "Quên".

---

## 9. Giả lập trên tên miền thật — đọc kỹ

Trên `https://taomua.com` (production), các thao tác **giả lập dính tiền** mặc định **TẮT**:

- nút cổng 9PAY / VNPay / Momo / Alipay giả lập;
- chuyển khoản chi giả lập;
- hóa đơn điện tử giả lập.

Lý do: nếu bật trên trang công khai, **bất kỳ ai cũng bấm được "đã thanh toán" mà không trả tiền**.

- **Thử nghiệm 10–100 đơn thật:** khách chuyển khoản thật vào tài khoản công ty (QR VietQR khi có `PAYMENT_BANK_BIN`). Kế toán đối soát ở *Đối soát sao kê*, hoặc ghi nhận đã nhận tiền trong đơn.
- **Muốn chạy thử giả lập trên mạng:** dựng thêm bản thử ở tên miền phụ, ví dụ `thu.taomua.com`, với database riêng và `SIM_ACTIONS=on`. Lặp lại mục 3–6 với tên khác (`taomua_thu`, cổng 3001, `pm2 --name taomua-thu`).

Các phần giả lập không dính tiền (trend, tìm xưởng 1688, QC, video, AI LOCAL…) vẫn chạy và có nhãn **GIẢ LẬP** cho tới khi nhập khóa thật.

---

## 10. Sau khi lên mạng — kiểm tra nhanh

- [ ] `https://taomua.com` mở được, có ổ khóa; `http://` và `www.` tự chuyển về https.
- [ ] Đăng nhập `/quan-tri`, đổi mật khẩu, tạo tài khoản thật, khóa tài khoản mẫu.
- [ ] *Thông tin cần nhập*: mục "Máy chủ, tên miền, HTTPS" báo OK.
- [ ] *Chat & huấn luyện agent*: dòng **AI 24/7: đang chạy**.
- [ ] Khung chat "Hỏi AI" ngoài cửa hàng trả lời được (thử "chủ nhật có giao hàng không").
- [ ] Đặt 1 đơn thử, tra cứu đơn, thấy hướng dẫn thanh toán.
- [ ] Sau 1 ngày có file sao lưu trong `/var/backups/taomua/`.

## Sự cố thường gặp

| Hiện tượng | Xem / sửa |
|---|---|
| 502 Bad Gateway | Web chưa chạy: `su - taomua -c 'pm2 logs taomua-web --lines 50'` |
| Không đăng nhập được, đăng nhập xong bị đẩy ra | Phải mở bằng **https** (cookie phiên chỉ gửi qua https khi chạy production) |
| certbot báo lỗi tên miền | DNS chưa trỏ xong (kiểm tra lại mục 1), hoặc cổng 80 bị chặn (`ufw status`) |
| AI 24/7 không chạy | `su - taomua -c 'pm2 logs taomua-ai --lines 50'` |
| Đổi `.env` mà không có tác dụng | `su - taomua -c 'cd app && npm run build && pm2 reload all'` |
