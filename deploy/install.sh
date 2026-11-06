#!/usr/bin/env bash
# Cài taomua.com lên VPS Ubuntu / Debian bằng MỘT lệnh (chạy bằng root, tên miền đã trỏ về IP máy chủ):
#
#   curl -fsSL https://raw.githubusercontent.com/haitruongphuc-tech/taomua/main/deploy/install.sh -o taomua-install.sh
#   bash taomua-install.sh taomua.com email@cua-ban.com        (email để nhận thông báo chứng chỉ HTTPS, có thể bỏ trống)
#
# Tự làm: cài Node 20, PostgreSQL, Nginx, pm2, certbot; tạo database (mật khẩu ngẫu nhiên); tải mã nguồn; tạo .env;
# tạo bảng; build; tạo tài khoản quản trị (mật khẩu ngẫu nhiên, lưu ở /root/taomua-tai-khoan.txt); chạy web + AI 24/7;
# HTTPS miễn phí (Let's Encrypt); sao lưu database hằng ngày; lệnh cập nhật `taomua-update`.
# Chạy lại an toàn: phần nào đã có thì bỏ qua, không xóa dữ liệu.
set -euo pipefail

DOMAIN="${1:-taomua.com}"
EMAIL="${2:-}"
REPO="${TAOMUA_REPO:-https://github.com/haitruongphuc-tech/taomua.git}"
BRANCH="${TAOMUA_BRANCH:-main}"
PORT="${TAOMUA_PORT:-3000}"
APP_USER=taomua
APP_DIR="/home/$APP_USER/app"
CRED_FILE=/root/taomua-tai-khoan.txt

say()  { printf '\n\033[1;33m==> %s\033[0m\n' "$*"; }
ok()   { printf '\033[1;32m✔ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;31m! %s\033[0m\n' "$*"; }
as_app() { sudo -u "$APP_USER" -H bash -lc "cd '$APP_DIR' && $*"; }
rand() { openssl rand -hex "${1:-24}"; }

# Toàn bộ chạy trong main (đọc hết script trước khi chạy; an toàn cả khi dùng curl | bash)
main() {

[ "$(id -u)" -eq 0 ] || { warn "Hãy chạy bằng root (sudo -i)."; exit 1; }
command -v apt-get >/dev/null || { warn "Script dành cho Ubuntu / Debian (apt)."; exit 1; }
[[ "$DOMAIN" =~ ^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$ ]] || { warn "Tên miền không hợp lệ: $DOMAIN"; exit 1; }
# Cổng 80 đang bị phần mềm web khác (Apache, Caddy...) chiếm thì Nginx không chạy được
if command -v ss >/dev/null && ss -ltnp 2>/dev/null | grep -E '[:.]80[[:space:]]' | grep -vq nginx; then
  warn "Cổng 80 đang có phần mềm khác dùng:"; ss -ltnp | grep -E '[:.]80[[:space:]]'
  warn "Tắt phần mềm đó (vd: systemctl disable --now apache2) rồi chạy lại."; exit 1
fi

say "1/9 Cài phần mềm hệ thống"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y git curl ca-certificates openssl sudo nginx postgresql certbot python3-certbot-nginx
NODE_MAJOR=$(node -v 2>/dev/null | sed -E 's/^v([0-9]+).*/\1/' || echo 0)
if [ "${NODE_MAJOR:-0}" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
command -v pm2 >/dev/null || npm install -g pm2
ok "Node $(node -v), PostgreSQL, Nginx, pm2"

# Máy ít RAM: thêm swap để build không bị hết bộ nhớ
MEM_MB=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)
if [ "$MEM_MB" -lt 3500 ] && [ -z "$(swapon --show --noheadings)" ]; then
  say "Máy có ${MEM_MB} MB RAM: thêm 2 GB swap"
  if { fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048; } && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile; then
    grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  else
    warn "Không tạo được swap; build vẫn thử tiếp."
  fi
fi

say "2/9 Người dùng chạy web: $APP_USER"
id "$APP_USER" >/dev/null 2>&1 || adduser --disabled-password --gecos "" "$APP_USER"

say "3/9 Tải mã nguồn"
if [ -d "$APP_DIR/.git" ]; then
  sudo -u "$APP_USER" -H git -C "$APP_DIR" pull --ff-only
else
  sudo -u "$APP_USER" -H git clone --branch "$BRANCH" "$REPO" "$APP_DIR"
fi
ok "$(sudo -u "$APP_USER" -H git -C "$APP_DIR" log --oneline -1)"

say "4/9 Database"
systemctl enable --now postgresql
psql_root() { (cd /tmp && sudo -u postgres psql -v ON_ERROR_STOP=1 -tAc "$1"); }
ENV_FILE="$APP_DIR/.env"
if [ ! -f "$ENV_FILE" ]; then
  DB_PASS=$(rand 24)
  if [ "$(psql_root "SELECT 1 FROM pg_roles WHERE rolname='taomua'")" = "1" ]; then
    psql_root "ALTER ROLE taomua WITH LOGIN PASSWORD '$DB_PASS'"
  else
    psql_root "CREATE ROLE taomua WITH LOGIN PASSWORD '$DB_PASS'"
  fi
  [ "$(psql_root "SELECT 1 FROM pg_database WHERE datname='taomua'")" = "1" ] || psql_root "CREATE DATABASE taomua OWNER taomua"

  say "5/9 Tạo file cấu hình .env"
  sudo -u "$APP_USER" cp "$APP_DIR/.env.example" "$ENV_FILE"
  set_env() { # set_env KEY VALUE (giá trị không chứa dấu |)
    if grep -q "^$1=" "$ENV_FILE"; then sed -i "s|^$1=.*|$1=$2|" "$ENV_FILE"; else echo "$1=$2" >> "$ENV_FILE"; fi
  }
  set_env DATABASE_URL "postgres://taomua:$DB_PASS@localhost:5432/taomua"
  set_env SITE_URL "https://$DOMAIN"
  set_env INTERNAL_API_KEY "$(rand 32)"
  set_env SIM_ACTIONS off
  set_env PORT "$PORT"
  chmod 600 "$ENV_FILE"; chown "$APP_USER:$APP_USER" "$ENV_FILE"
  ok "Đã tạo $ENV_FILE (mật khẩu database ngẫu nhiên)"
else
  say "5/9 Giữ nguyên .env đã có"
fi

say "6/9 Cài thư viện, tạo bảng, build (vài phút)"
as_app "npm ci --include=dev --no-audit --no-fund"
as_app "npm run db:migrate"
as_app "NODE_OPTIONS=--max-old-space-size=2048 npm run build"

if [ ! -f "$CRED_FILE" ]; then
  CEO_PW=$(rand 9); STAFF_PW=$(rand 9)
  if ! OUT=$(as_app "SEED_CEO_PASSWORD='$CEO_PW' SEED_STAFF_PASSWORD='$STAFF_PW' npm run -s db:seed" 2>&1); then
    warn "Tạo tài khoản ban đầu bị lỗi:"; echo "$OUT" | tail -20
  elif echo "$OUT" | grep -q "bỏ qua"; then
    ok "Database đã có tài khoản, không tạo thêm."
  else
    install -m 600 /dev/null "$CRED_FILE"
    cat > "$CRED_FILE" <<EOF
taomua.com — tài khoản quản trị ban đầu (tạo $(date '+%F %T'))
Trang quản trị: https://$DOMAIN/quan-tri
CEO:          ceo@taomua.local          mật khẩu: $CEO_PW
Trưởng nhóm / Kế toán / Nhân viên: truongnhom@ / ketoan@ / nhanvien@taomua.local   mật khẩu: $STAFF_PW
Việc cần làm: đăng nhập, đổi mật khẩu, tạo tài khoản thật ở "Người dùng", rồi Khóa các tài khoản @taomua.local.
EOF
    ok "Đã tạo tài khoản quản trị, lưu ở $CRED_FILE"
  fi
fi

say "7/9 Chạy web + AI 24/7 (pm2, tự chạy lại khi khởi động máy)"
as_app "pm2 startOrReload deploy/ecosystem.config.cjs --update-env && pm2 save"
pm2 startup systemd -u "$APP_USER" --hp "/home/$APP_USER" >/dev/null
for i in $(seq 1 30); do curl -fs -o /dev/null "http://127.0.0.1:$PORT" && break; sleep 2; done
curl -fs -o /dev/null "http://127.0.0.1:$PORT" && ok "Web chạy ở cổng $PORT" || warn "Web chưa lên, xem: sudo -u $APP_USER pm2 logs taomua-web"

say "8/9 Nginx + HTTPS"
NGX=/etc/nginx/sites-available/taomua
PUBLIC_IP=$(curl -fs4 --max-time 5 https://api.ipify.org || true)
resolves() { [ -z "$PUBLIC_IP" ] || getent ahostsv4 "$1" | awk '{print $1}' | grep -qx "$PUBLIC_IP"; }
NAMES="$DOMAIN"; resolves "www.$DOMAIN" && NAMES="$DOMAIN www.$DOMAIN"
if [ ! -f "$NGX" ]; then
  cat > "$NGX" <<EOF
server {
    listen 80;
    server_name $NAMES;
    client_max_body_size 10m;
    location / {
        proxy_pass http://127.0.0.1:$PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-For \$remote_addr;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
EOF
  ln -sf "$NGX" /etc/nginx/sites-enabled/taomua
fi
command -v ufw >/dev/null && ufw status | grep -q "Status: active" && ufw allow 'Nginx Full' >/dev/null && ok "Tường lửa: mở cổng 80, 443"
systemctl enable --now nginx
nginx -t && systemctl reload nginx
if [ -d "/etc/letsencrypt/live/$DOMAIN" ]; then
  ok "Đã có chứng chỉ HTTPS cho $DOMAIN"
elif resolves "$DOMAIN"; then
  CERT_ARGS=(); for n in $NAMES; do CERT_ARGS+=(-d "$n"); done
  if [ -n "$EMAIL" ]; then CERT_ARGS+=(-m "$EMAIL"); else CERT_ARGS+=(--register-unsafely-without-email); fi
  if certbot --nginx "${CERT_ARGS[@]}" --redirect --agree-tos -n; then ok "HTTPS: https://$DOMAIN"
  elif [ "$NAMES" != "$DOMAIN" ] && certbot --nginx -d "$DOMAIN" "${CERT_ARGS[@]:4}" --redirect --agree-tos -n; then ok "HTTPS: https://$DOMAIN (chưa gồm www)"
  else warn "Chưa cấp được HTTPS. Kiểm tra tên miền / cổng 80 rồi chạy lại script."; fi
else
  warn "$DOMAIN chưa trỏ về IP $PUBLIC_IP của máy này: bỏ qua HTTPS. Trỏ xong chạy lại script."
fi

say "9/9 Sao lưu hằng ngày + lệnh cập nhật"
mkdir -p /var/backups/taomua && chown postgres:postgres /var/backups/taomua && chmod 700 /var/backups/taomua
cat > /etc/cron.d/taomua-backup <<'EOF'
# Sao lưu database taomua lúc 2:00 mỗi ngày, giữ 14 ngày
0 2 * * * postgres pg_dump -Fc taomua > /var/backups/taomua/taomua-$(date +\%F).dump && find /var/backups/taomua -name '*.dump' -mtime +14 -delete
EOF
install -m 755 "$APP_DIR/deploy/update.sh" /usr/local/bin/taomua-update

echo
ok "XONG. Mở https://$DOMAIN và https://$DOMAIN/quan-tri"
[ -f "$CRED_FILE" ] && echo "   Tài khoản quản trị: cat $CRED_FILE"
echo "   Nhập thông tin thật (MST, ngân hàng, AI_API_KEY...): nano $ENV_FILE  rồi chạy: taomua-update"
echo "   Cập nhật bản mới từ GitHub: taomua-update"
echo "   Xem nhật ký: sudo -u $APP_USER pm2 logs"
}

main "$@" </dev/null
