#!/usr/bin/env bash
# Cập nhật taomua.com lên bản mới nhất trên GitHub (hoặc áp dụng .env vừa sửa). Chạy bằng root: taomua-update
# Không xóa dữ liệu: db:migrate chỉ thêm bảng / cột mới; bài học mặc định đã "Quên" không bị thêm lại.
set -euo pipefail
APP_USER=taomua
APP_DIR="/home/$APP_USER/app"
as_app() { sudo -u "$APP_USER" -H bash -lc "cd '$APP_DIR' && $*"; }

[ "$(id -u)" -eq 0 ] || { echo "Hãy chạy bằng root (sudo taomua-update)."; exit 1; }
echo "==> Sao lưu database trước khi cập nhật"
mkdir -p /var/backups/taomua
(cd /tmp && sudo -u postgres pg_dump -Fc taomua > "/var/backups/taomua/truoc-cap-nhat-$(date +%F-%H%M).dump")
echo "==> Tải bản mới"
sudo -u "$APP_USER" -H git -C "$APP_DIR" pull --ff-only
echo "==> Cài thư viện, cập nhật bảng, build"
as_app "npm ci --include=dev --no-audit --no-fund"
as_app "npm run db:migrate"
as_app "NODE_OPTIONS=--max-old-space-size=2048 npm run build"
echo "==> Chạy lại web + AI 24/7"
as_app "pm2 startOrReload deploy/ecosystem.config.cjs --update-env && pm2 save"
install -m 755 "$APP_DIR/deploy/update.sh" /usr/local/bin/taomua-update
echo "✔ Đã cập nhật: $(sudo -u "$APP_USER" -H git -C "$APP_DIR" log --oneline -1)"
