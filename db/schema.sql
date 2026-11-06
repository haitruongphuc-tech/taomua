-- Lược đồ taomua.com. Tiền lưu bằng đồng (BIGINT), không dùng số thực.
-- 4 bảng trong spec (suppliers, products, wholesale_orders, working_capital) được giữ tên,
-- bổ sung các bảng cần cho vận hành thật: người dùng, kênh bán, duyệt, đối soát, chi tiền, nhật ký.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('CEO','TRUONG_NHOM','KE_TOAN','NHAN_VIEN','KY_SU')),
  password_hash TEXT NOT NULL,
  telegram_chat_id TEXT,
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS login_attempts (
  key        TEXT NOT NULL,
  at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS login_attempts_key_at ON login_attempts(key, at);

CREATE TABLE IF NOT EXISTS suppliers (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT NOT NULL,
  source            TEXT NOT NULL CHECK (source IN ('1688','AMAZON','WALMART','VN_FACTORY','OEM')),
  country           TEXT NOT NULL DEFAULT 'VN',
  years_active      INT NOT NULL DEFAULT 0,
  contact           TEXT,
  trust_score       INT NOT NULL DEFAULT 0 CHECK (trust_score BETWEEN 0 AND 100),
  response_time_sec INT NOT NULL DEFAULT 3600,
  defect_rate       NUMERIC(5,4) NOT NULL DEFAULT 0.02,   -- 0.02 = 2%
  on_time_rate      NUMERIC(5,4) NOT NULL DEFAULT 0.9,
  verified_cert     BOOLEAN NOT NULL DEFAULT FALSE,
  inventory_sync    BOOLEAN NOT NULL DEFAULT FALSE,
  moq               INT NOT NULL DEFAULT 10,
  price_1688        BIGINT,
  price_vn          BIGINT,
  is_simulated      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS products (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku                 TEXT NOT NULL UNIQUE,
  name                TEXT NOT NULL,
  category            TEXT NOT NULL,
  description         TEXT NOT NULL DEFAULT '',
  image_emoji         TEXT NOT NULL DEFAULT '📦',
  trend_score         INT NOT NULL DEFAULT 0 CHECK (trend_score BETWEEN 0 AND 100),
  supplier_id         UUID REFERENCES suppliers(id),
  supplier_ids_backup UUID[] NOT NULL DEFAULT '{}',
  -- Chi phí một cái: giá vốn + phí (ship, marketing, logistics, AI, pháp lý, cổng thanh toán)
  cost                BIGINT NOT NULL CHECK (cost >= 0),
  fee                 BIGINT NOT NULL DEFAULT 0 CHECK (fee >= 0),
  input_vat           BIGINT NOT NULL DEFAULT 0 CHECK (input_vat >= 0), -- VAT đầu vào được khấu trừ, mỗi cái
  price_taomua_10     BIGINT NOT NULL CHECK (price_taomua_10 > 0),
  price_taomua_50     BIGINT NOT NULL CHECK (price_taomua_50 > 0),
  price_taomua_100    BIGINT NOT NULL CHECK (price_taomua_100 > 0),
  price_taomua_500    BIGINT NOT NULL CHECK (price_taomua_500 > 0),
  moq                 INT NOT NULL DEFAULT 10 CHECK (moq >= 1),
  stock_note          TEXT NOT NULL DEFAULT 'Giao thẳng từ xưởng',
  latr_test_qty       INT,
  latr_ctr            NUMERIC(5,2),
  rynn_brain_pass     NUMERIC(5,2),
  vong_quay_von       NUMERIC(5,2),
  status              TEXT NOT NULL DEFAULT 'PRICING' CHECK (status IN
                        ('TREND_HUNTER','SUPPLIER_BRAIN','PRICING','PENDING_APPROVAL','APPROVED','LATR_TEST','MASS_IMPORT','DROPSHIP_SI','PAUSED')),
  published           BOOLEAN NOT NULL DEFAULT FALSE,
  is_simulated        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (input_vat <= cost + fee)
);

-- Giá trên nền tảng khác để khách so sánh. Chỉ hiện khi đã kiểm tra trong 30 ngày.
CREATE TABLE IF NOT EXISTS price_comparisons (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  platform    TEXT NOT NULL,
  price       BIGINT NOT NULL CHECK (price > 0),
  qty_basis   INT NOT NULL DEFAULT 1,
  source_url  TEXT NOT NULL,
  checked_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  checked_by  UUID REFERENCES users(id)
);

-- Kênh bán: taomua.com là kênh riêng; 9mua, Shopee, TikTok Shop... là các nền tảng bên ngoài ngang nhau.
CREATE TABLE IF NOT EXISTS sales_channels (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('OWN','MARKETPLACE','SOCIAL','PARTNER_SITE')),
  connector   TEXT NOT NULL DEFAULT 'MANUAL' CHECK (connector IN ('NATIVE','MANUAL','CSV','API')),
  api_status  TEXT NOT NULL DEFAULT 'CHUA_KET_NOI' CHECK (api_status IN ('KHONG_CAN','CHUA_KET_NOI','DANG_KET_NOI','LOI')),
  fee_pct     NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (fee_pct >= 0 AND fee_pct < 100),
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  notes       TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS channel_listings (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id   UUID NOT NULL REFERENCES sales_channels(id) ON DELETE CASCADE,
  product_id   UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  price        BIGINT NOT NULL CHECK (price > 0),
  external_sku TEXT,
  external_url TEXT,
  status       TEXT NOT NULL DEFAULT 'NHAP' CHECK (status IN ('NHAP','DANG_BAN','TAM_DUNG')),
  synced_at    TIMESTAMPTZ,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (channel_id, product_id)
);

CREATE TABLE IF NOT EXISTS customers (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  phone        TEXT NOT NULL,
  email        TEXT,
  kind         TEXT NOT NULL DEFAULT 'SI' CHECK (kind IN ('SI','LE','AI_AGENT')),
  agent_limit  BIGINT,       -- hạn mức chi tiêu cho AI agent: 10tr/50tr/100tr
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (phone)
);

CREATE SEQUENCE IF NOT EXISTS order_code_seq START 1001;

CREATE TABLE IF NOT EXISTS wholesale_orders (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code                     TEXT NOT NULL UNIQUE,
  channel_id               UUID NOT NULL REFERENCES sales_channels(id),
  external_ref             TEXT,
  customer_id              UUID NOT NULL REFERENCES customers(id),
  ship_address             TEXT NOT NULL,
  note                     TEXT NOT NULL DEFAULT '',
  status                   TEXT NOT NULL DEFAULT 'CHO_DUYET' CHECK (status IN
                             ('CHO_DUYET','CHO_THANH_TOAN','DANG_CHUAN_BI','DANG_GIAO','DA_GIAO','HOAN_TAT','TU_CHOI','HUY')),
  tong_dt                  BIGINT NOT NULL,
  tong_chi_phi_truoc_thue  BIGINT NOT NULL,
  vat_dau_vao              BIGINT NOT NULL DEFAULT 0,
  phi_kenh                 BIGINT NOT NULL DEFAULT 0,
  vat_8                    BIGINT NOT NULL,
  phi_mb_1                 BIGINT NOT NULL,
  ln_truoc_tndn            BIGINT NOT NULL,
  thue_tndn_20             BIGINT NOT NULL,
  ln_rong_sau_thue         BIGINT NOT NULL,
  bien_rong_tren_chi_phi   NUMERIC(8,2) NOT NULL,
  bien_rong_tren_dt        NUMERIC(8,2) NOT NULL,
  cap_duyet                INT NOT NULL CHECK (cap_duyet BETWEEN 1 AND 5),
  cap_ly_do                TEXT NOT NULL DEFAULT '',
  approval_status          TEXT NOT NULL DEFAULT 'PENDING' CHECK (approval_status IN ('PENDING','APPROVED','REJECTED')),
  approval_deadline        TIMESTAMPTZ,
  approved_by              UUID REFERENCES users(id),
  approved_by_label        TEXT,
  approved_at              TIMESTAMPTZ,
  payment_status           TEXT NOT NULL DEFAULT 'CHUA_THANH_TOAN' CHECK (payment_status IN ('CHUA_THANH_TOAN','DA_NHAN')),
  paid_at                  TIMESTAMPTZ,
  trade_assurance_status   TEXT NOT NULL DEFAULT 'NONE' CHECK (trade_assurance_status IN ('NONE','HOLD','RELEASED','REFUND')),
  released_by_label        TEXT,
  released_at              TIMESTAMPTZ,
  wfs_status               TEXT NOT NULL DEFAULT 'DROPSHIP' CHECK (wfs_status IN ('DROPSHIP','WFS_FULFILLMENT','SAME_DAY_30MIN')),
  carrier                  TEXT,
  tracking_no              TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (channel_id, external_ref)
);
CREATE INDEX IF NOT EXISTS orders_status ON wholesale_orders(status);

CREATE TABLE IF NOT EXISTS order_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    UUID NOT NULL REFERENCES wholesale_orders(id) ON DELETE CASCADE,
  product_id  UUID NOT NULL REFERENCES products(id),
  product_name TEXT NOT NULL,
  quantity    INT NOT NULL CHECK (quantity > 0),
  tier        INT NOT NULL CHECK (tier IN (0,10,50,100,500)),  -- 0 = giá kênh bán, không theo bậc
  unit_price  BIGINT NOT NULL,
  unit_cost   BIGINT NOT NULL,
  unit_input_vat BIGINT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS approvals (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id   UUID NOT NULL REFERENCES wholesale_orders(id) ON DELETE CASCADE,
  level      INT NOT NULL,
  decision   TEXT NOT NULL CHECK (decision IN ('APPROVED','REJECTED')),
  decided_by UUID REFERENCES users(id),
  decided_by_label TEXT NOT NULL,
  via        TEXT NOT NULL DEFAULT 'WEB' CHECK (via IN ('WEB','TELEGRAM','AUTO')),
  note       TEXT NOT NULL DEFAULT '',
  decided_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rfqs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code         TEXT NOT NULL UNIQUE,
  contact_name TEXT NOT NULL,
  phone        TEXT NOT NULL,
  email        TEXT,
  product_text TEXT NOT NULL,
  quantity     INT NOT NULL CHECK (quantity > 0),
  target_price BIGINT,
  status       TEXT NOT NULL DEFAULT 'MOI' CHECK (status IN ('MOI','DANG_TIM_XUONG','DA_BAO_GIA','DONG')),
  quote_price  BIGINT,
  quote_note   TEXT NOT NULL DEFAULT '',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS working_capital (
  month           INT PRIMARY KEY CHECK (month BETWEEN 1 AND 12),
  tong_dt         BIGINT NOT NULL,
  von_luu_dong_30 BIGINT NOT NULL,
  du_phong_15     BIGINT NOT NULL,
  tong_von_can_45 BIGINT NOT NULL,
  ln_rong         BIGINT NOT NULL DEFAULT 0,
  vong_quay_von   NUMERIC(5,2) NOT NULL,
  bien_an_toan    NUMERIC(5,2) NOT NULL,
  mb_bank_balance BIGINT,
  status          TEXT NOT NULL CHECK (status IN ('SAFE','WARNING','DANGER')),
  is_simulated    BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS bank_transactions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id      UUID NOT NULL,
  txn_date      DATE NOT NULL,
  amount        BIGINT NOT NULL,           -- dương: tiền vào, âm: tiền ra
  description   TEXT NOT NULL,
  bank_ref      TEXT,
  matched_order_id UUID REFERENCES wholesale_orders(id),
  matched_payout_id UUID,
  imported_by   UUID REFERENCES users(id),
  imported_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (bank_ref)
);

CREATE TABLE IF NOT EXISTS reconciliation_runs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id    UUID NOT NULL,
  period_from DATE NOT NULL,
  period_to   DATE NOT NULL,
  expected_in BIGINT NOT NULL,
  actual_in   BIGINT NOT NULL,
  diff_pct    NUMERIC(8,2) NOT NULL,
  unmatched   INT NOT NULL,
  status      TEXT NOT NULL CHECK (status IN ('KHOP','LECH')),
  created_by  UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payouts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category     TEXT NOT NULL CHECK (category IN ('NAP_AI','NAP_ADS','TAM_UNG_SHIP','MUA_MAU_LATR','DAT_COC_XUONG','NOP_THUE','KHAC')),
  amount       BIGINT NOT NULL CHECK (amount > 0),
  payee        TEXT NOT NULL,
  reason       TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'DE_XUAT' CHECK (status IN ('DE_XUAT','DA_DUYET','DA_CHI','TU_CHOI')),
  proposed_by  UUID NOT NULL REFERENCES users(id),
  approved_by  UUID REFERENCES users(id),
  paid_by      UUID REFERENCES users(id),
  paid_ref     TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at  TIMESTAMPTZ,
  paid_at      TIMESTAMPTZ
);
ALTER TABLE payouts ADD COLUMN IF NOT EXISTS auto_approved BOOLEAN NOT NULL DEFAULT FALSE;

-- Nút Tắt/Mở kiểm soát chi (lib/payouts.ts). Không có dòng thì dùng giá trị mặc định.
CREATE TABLE IF NOT EXISTS payment_controls (
  key        TEXT PRIMARY KEY,
  enabled    BOOLEAN NOT NULL,
  updated_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_log (
  id        BIGSERIAL PRIMARY KEY,
  user_id   UUID REFERENCES users(id),
  actor     TEXT NOT NULL,
  action    TEXT NOT NULL,
  entity    TEXT NOT NULL,
  entity_id TEXT,
  detail    JSONB NOT NULL DEFAULT '{}',
  at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_at ON audit_log(at DESC);

-- ===== 7 AI agent tự động (lib/agents). Chạy 6 giờ/lần qua n8n hoặc nút "Chạy ngay". =====
ALTER TABLE products ADD COLUMN IF NOT EXISTS name_i18n JSONB NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS agent_runs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger     TEXT NOT NULL,                 -- 'TAY' (bấm nút), 'LICH' (n8n / lịch), 'API'
  started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  status      TEXT NOT NULL DEFAULT 'DANG_CHAY' CHECK (status IN ('DANG_CHAY','XONG','LOI')),
  summary     JSONB NOT NULL DEFAULT '{}',
  error       TEXT
);

-- Hàng đợi One-Tap: đề xuất, cảnh báo, việc AI đã tự làm.
CREATE TABLE IF NOT EXISTS agent_actions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id        UUID REFERENCES agent_runs(id) ON DELETE SET NULL,
  agent         TEXT NOT NULL,               -- RYN-TREND ... RYN-LOGI
  kind          TEXT NOT NULL,               -- PRICE_CHANGE, SWITCH_SUPPLIER, PRODUCT_STATUS, CONTROL_SET, RFQ_QUOTE, SUPPLIER_TRUST, NOTE
  severity      TEXT NOT NULL DEFAULT 'INFO' CHECK (severity IN ('INFO','WARN','DANGER')),
  title         TEXT NOT NULL,
  detail        JSONB NOT NULL DEFAULT '{}',
  entity        TEXT,
  entity_id     TEXT,
  level         INT CHECK (level BETWEEN 1 AND 5),   -- cấp duyệt khi cần người duyệt
  status        TEXT NOT NULL CHECK (status IN ('DE_XUAT','TU_DONG','DA_DUYET','TU_CHOI','TIN','DA_XEM','LOI')),
  dedupe_key    TEXT,
  decided_by    UUID REFERENCES users(id),
  decided_label TEXT,
  decided_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agent_actions_status ON agent_actions(status, created_at DESC);
-- Một đề xuất / tin còn mở thì không tạo lại mỗi lần chạy.
CREATE UNIQUE INDEX IF NOT EXISTS agent_actions_open_dedupe ON agent_actions(dedupe_key) WHERE status IN ('DE_XUAT','TIN');

-- Lịch sử giá vốn để RYN-TRACE phát hiện xưởng tăng giá.
CREATE TABLE IF NOT EXISTS product_cost_history (
  id          BIGSERIAL PRIMARY KEY,
  product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  supplier_id UUID REFERENCES suppliers(id),
  cost        BIGINT NOT NULL,
  fee         BIGINT NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cost_history_product ON product_cost_history(product_id, recorded_at DESC);

-- ===== AI tìm xưởng (RYN-SUPPLY): xưởng theo ngành hàng, báo giá xưởng, yêu cầu tìm xưởng. AI đề xuất, CEO chọn. =====
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS categories TEXT[] NOT NULL DEFAULT '{}';      -- ngành hàng xưởng làm được
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS lead_time_days INT;                            -- thời gian sản xuất thường lệ
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS ships_international BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS supplier_offers (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id    UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  product_id     UUID REFERENCES products(id) ON DELETE SET NULL,
  product_text   TEXT NOT NULL,                       -- mô tả hàng xưởng báo giá
  category       TEXT NOT NULL,
  unit_cost      BIGINT NOT NULL CHECK (unit_cost > 0),  -- giá xưởng 1 cái, quy ra VND
  currency       TEXT NOT NULL DEFAULT 'VND',
  price_original NUMERIC(14,2),                       -- giá gốc theo tiền tệ xưởng
  moq            INT NOT NULL DEFAULT 1 CHECK (moq >= 1),
  lead_time_days INT,
  source         TEXT NOT NULL DEFAULT 'NHAP_TAY' CHECK (source IN ('NHAP_TAY','AI_TRICH','CSV','API')),
  source_url     TEXT,
  raw_text       TEXT,
  verified       BOOLEAN NOT NULL DEFAULT FALSE,      -- người đã xác nhận lại với xưởng
  is_simulated   BOOLEAN NOT NULL DEFAULT FALSE,
  valid_until    DATE,
  created_by     UUID REFERENCES users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS offers_category ON supplier_offers(category);

CREATE SEQUENCE IF NOT EXISTS sourcing_code_seq START 101;
CREATE TABLE IF NOT EXISTS sourcing_requests (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code              TEXT NOT NULL UNIQUE,
  product_id        UUID REFERENCES products(id) ON DELETE SET NULL,
  rfq_id            UUID REFERENCES rfqs(id) ON DELETE SET NULL,
  product_text      TEXT NOT NULL,
  category          TEXT,
  quantity          INT NOT NULL CHECK (quantity > 0),
  target_unit_price BIGINT,                          -- giá bán dự kiến / giá khách muốn, mỗi cái
  ship_country      TEXT NOT NULL DEFAULT 'VN',
  reason            TEXT NOT NULL DEFAULT '',
  status            TEXT NOT NULL DEFAULT 'MO' CHECK (status IN ('MO','DA_DE_XUAT','DA_CHON','KHONG_TIM_THAY','DONG')),
  result            JSONB NOT NULL DEFAULT '{}',
  chosen_offer_id   UUID REFERENCES supplier_offers(id) ON DELETE SET NULL,
  created_by        UUID REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_by        UUID REFERENCES users(id),
  decided_at        TIMESTAMPTZ
);
-- Mỗi sản phẩm / RFQ chỉ một yêu cầu tìm xưởng đang mở.
CREATE UNIQUE INDEX IF NOT EXISTS sourcing_open_product ON sourcing_requests(product_id) WHERE status IN ('MO','DA_DE_XUAT','KHONG_TIM_THAY');
CREATE UNIQUE INDEX IF NOT EXISTS sourcing_open_rfq ON sourcing_requests(rfq_id) WHERE status IN ('MO','DA_DE_XUAT','KHONG_TIM_THAY');

-- ===== Bán thật trong nước và quốc tế =====
ALTER TABLE wholesale_orders ADD COLUMN IF NOT EXISTS ship_country TEXT NOT NULL DEFAULT 'VN';
ALTER TABLE wholesale_orders ADD COLUMN IF NOT EXISTS ship_fee BIGINT NOT NULL DEFAULT 0 CHECK (ship_fee >= 0);  -- phí vận chuyển thu thêm (đơn quốc tế)
ALTER TABLE wholesale_orders ADD COLUMN IF NOT EXISTS customer_email TEXT;

-- Nhật ký lỗi hệ thống và báo lỗi của khách trong giai đoạn chạy thật.
CREATE TABLE IF NOT EXISTS app_errors (
  id       BIGSERIAL PRIMARY KEY,
  at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  place    TEXT NOT NULL,
  message  TEXT NOT NULL,
  detail   JSONB NOT NULL DEFAULT '{}',
  resolved BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE TABLE IF NOT EXISTS issue_reports (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_code TEXT,
  contact    TEXT NOT NULL,
  page       TEXT,
  message    TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'MOI' CHECK (status IN ('MOI','DANG_XU_LY','DA_SUA','KHONG_PHAI_LOI')),
  note       TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ===== Kế toán thuế: hóa đơn điện tử (> 10 triệu bắt buộc theo spec) =====
ALTER TABLE wholesale_orders ADD COLUMN IF NOT EXISTS invoice_no TEXT;
ALTER TABLE wholesale_orders ADD COLUMN IF NOT EXISTS invoice_at TIMESTAMPTZ;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS tax_code TEXT;   -- MST khách sỉ để xuất hóa đơn

-- ===== Khủng hoảng & khiếu nại (Kanban): Mới → Đang xử lý → Chờ CEO → Hoàn thành =====
ALTER TABLE issue_reports ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'LOI';
ALTER TABLE issue_reports ADD COLUMN IF NOT EXISTS severity TEXT NOT NULL DEFAULT 'VUA';
ALTER TABLE issue_reports ADD COLUMN IF NOT EXISTS resolution TEXT;
ALTER TABLE issue_reports ADD COLUMN IF NOT EXISTS ai_reason TEXT NOT NULL DEFAULT '';
ALTER TABLE issue_reports DROP CONSTRAINT IF EXISTS issue_reports_status_check;
ALTER TABLE issue_reports ADD CONSTRAINT issue_reports_status_check CHECK (status IN ('MOI','DANG_XU_LY','CHO_CEO','DA_SUA','KHONG_PHAI_LOI'));
ALTER TABLE issue_reports DROP CONSTRAINT IF EXISTS issue_reports_kind_check;
ALTER TABLE issue_reports ADD CONSTRAINT issue_reports_kind_check CHECK (kind IN ('LOI','KHIEU_NAI'));
ALTER TABLE issue_reports DROP CONSTRAINT IF EXISTS issue_reports_severity_check;
ALTER TABLE issue_reports ADD CONSTRAINT issue_reports_severity_check CHECK (severity IN ('THAP','VUA','CAO'));
ALTER TABLE issue_reports DROP CONSTRAINT IF EXISTS issue_reports_resolution_check;
ALTER TABLE issue_reports ADD CONSTRAINT issue_reports_resolution_check CHECK (resolution IS NULL OR resolution IN ('DOI_HANG','HOAN_TIEN','BOI_THUONG','XIN_LOI','SUA_WEB','KHONG'));

-- ===== CSKH AI 95% (RYN-SALES): nhật ký hội thoại để đo tỉ lệ AI tự trả lời và thời gian phản hồi =====
CREATE TABLE IF NOT EXISTS chat_logs (
  id         BIGSERIAL PRIMARY KEY,
  session    TEXT NOT NULL,
  message    TEXT NOT NULL,
  reply      TEXT NOT NULL,
  intent     TEXT NOT NULL,
  answered_by TEXT NOT NULL CHECK (answered_by IN ('AI_QUY_TAC','AI_NGON_NGU','CHUYEN_NGUOI')),
  ms         INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chat_logs_at ON chat_logs(created_at DESC);

-- ===== Marketing: chiến dịch quảng cáo (TikTok / Facebook / Google Ads). Số liệu nhập tay hoặc CSV cho tới khi có API. =====
CREATE TABLE IF NOT EXISTS ad_campaigns (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform     TEXT NOT NULL CHECK (platform IN ('TIKTOK','FACEBOOK','GOOGLE','ZALO','KHAC')),
  name         TEXT NOT NULL,
  product_id   UUID REFERENCES products(id) ON DELETE SET NULL,
  status       TEXT NOT NULL DEFAULT 'DANG_CHAY' CHECK (status IN ('DANG_CHAY','TAM_DUNG','KET_THUC')),
  daily_budget BIGINT NOT NULL CHECK (daily_budget > 0),
  roas_target  NUMERIC(6,2) NOT NULL DEFAULT 2,
  is_simulated BOOLEAN NOT NULL DEFAULT FALSE,
  created_by   UUID REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ad_stats (
  campaign_id  UUID NOT NULL REFERENCES ad_campaigns(id) ON DELETE CASCADE,
  day          DATE NOT NULL,
  spend        BIGINT NOT NULL DEFAULT 0 CHECK (spend >= 0),
  impressions  INT NOT NULL DEFAULT 0 CHECK (impressions >= 0),
  clicks       INT NOT NULL DEFAULT 0 CHECK (clicks >= 0),
  orders       INT NOT NULL DEFAULT 0 CHECK (orders >= 0),
  revenue      BIGINT NOT NULL DEFAULT 0 CHECK (revenue >= 0),
  PRIMARY KEY (campaign_id, day)
);

-- ===== Logistics: bảng giá hãng vận chuyển (GHN / GHTK / J&T...) để AI chọn hãng rẻ nhất. Nhập tay cho tới khi có API. =====
ALTER TABLE products ADD COLUMN IF NOT EXISTS weight_grams INT NOT NULL DEFAULT 300 CHECK (weight_grams > 0);
CREATE TABLE IF NOT EXISTS shipping_rates (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  carrier      TEXT NOT NULL,
  zone         TEXT NOT NULL CHECK (zone IN ('NOI_TINH','NOI_MIEN','LIEN_MIEN','QUOC_TE')),
  base_fee     BIGINT NOT NULL CHECK (base_fee >= 0),      -- phí cho phần khối lượng cơ bản
  base_grams   INT NOT NULL DEFAULT 500 CHECK (base_grams > 0),
  step_fee     BIGINT NOT NULL DEFAULT 0 CHECK (step_fee >= 0), -- mỗi bước khối lượng thêm
  step_grams   INT NOT NULL DEFAULT 500 CHECK (step_grams > 0),
  days         INT,
  active       BOOLEAN NOT NULL DEFAULT TRUE,
  is_simulated BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (carrier, zone)
);
ALTER TABLE wholesale_orders ADD COLUMN IF NOT EXISTS ship_zone TEXT;

-- ===== Canvas: nội dung giao diện sửa trên trang quản trị (spec Canvas visual editor). Không có dòng thì dùng mặc định. =====
CREATE TABLE IF NOT EXISTS site_content (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ===== Lịch sử giá bán 365 ngày (spec: Price history 365 days) — công khai cho khách =====
CREATE TABLE IF NOT EXISTS product_price_history (
  id          BIGSERIAL PRIMARY KEY,
  product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  price_10    BIGINT NOT NULL,
  price_50    BIGINT NOT NULL,
  price_100   BIGINT NOT NULL,
  price_500   BIGINT NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS price_history_product ON product_price_history(product_id, recorded_at DESC);

-- Mỗi lần giá 4 bậc đổi (sửa tay, AI đổi giá, nhập mới) tự ghi lịch sử.
CREATE OR REPLACE FUNCTION record_price_history() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.price_taomua_10 IS DISTINCT FROM OLD.price_taomua_10 OR NEW.price_taomua_50 IS DISTINCT FROM OLD.price_taomua_50
     OR NEW.price_taomua_100 IS DISTINCT FROM OLD.price_taomua_100 OR NEW.price_taomua_500 IS DISTINCT FROM OLD.price_taomua_500 THEN
    INSERT INTO product_price_history(product_id, price_10, price_50, price_100, price_500)
    VALUES (NEW.id, NEW.price_taomua_10, NEW.price_taomua_50, NEW.price_taomua_100, NEW.price_taomua_500);
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS products_price_history ON products;
CREATE TRIGGER products_price_history AFTER INSERT OR UPDATE ON products FOR EACH ROW EXECUTE FUNCTION record_price_history();
INSERT INTO product_price_history(product_id, price_10, price_50, price_100, price_500, recorded_at)
  SELECT p.id, p.price_taomua_10, p.price_taomua_50, p.price_taomua_100, p.price_taomua_500, p.created_at FROM products p
  WHERE NOT EXISTS (SELECT 1 FROM product_price_history h WHERE h.product_id=p.id);

-- ===== Hộp thư thông báo: mọi tin gửi CEO / khách qua Zalo OA, email, Telegram. Chưa cấu hình kênh thì ghi GIA_LAP (không gửi). =====
CREATE TABLE IF NOT EXISTS notification_log (
  id         BIGSERIAL PRIMARY KEY,
  channel    TEXT NOT NULL,
  recipient  TEXT NOT NULL DEFAULT '',
  subject    TEXT NOT NULL DEFAULT '',
  body       TEXT NOT NULL,
  mode       TEXT NOT NULL CHECK (mode IN ('THAT','GIA_LAP')),
  ok         BOOLEAN NOT NULL DEFAULT TRUE,
  error      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notification_log_at ON notification_log(created_at DESC);

-- ===== Kết quả dịch vụ ngoài chạy giả lập (trend 20 nguồn, tìm xưởng 1688, camera QC, video, hóa đơn điện tử, chuyển khoản) =====
CREATE TABLE IF NOT EXISTS connector_runs (
  id         BIGSERIAL PRIMARY KEY,
  connector  TEXT NOT NULL,
  mode       TEXT NOT NULL CHECK (mode IN ('THAT','GIA_LAP')),
  input      JSONB NOT NULL DEFAULT '{}',
  output     JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS connector_runs_at ON connector_runs(connector, created_at DESC);
ALTER TABLE payouts ADD COLUMN IF NOT EXISTS transfer_mode TEXT;      -- THAT / GIA_LAP khi chuyển qua API ngân hàng
ALTER TABLE wholesale_orders ADD COLUMN IF NOT EXISTS invoice_mode TEXT; -- THAT / GIA_LAP khi xuất hóa đơn qua API

-- ===== Chat & huấn luyện 7 agent (CEO, Trưởng nhóm, Kỹ sư AI) =====
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('CEO','TRUONG_NHOM','KE_TOAN','NHAN_VIEN','KY_SU'));
-- Bài học: QUY_TAC = điều agent phải nhớ khi làm việc / trả lời; HOI_DAP = câu hỏi mẫu + câu trả lời chuẩn (CSKH dùng trả lời khách).
CREATE TABLE IF NOT EXISTS agent_lessons (
  id            BIGSERIAL PRIMARY KEY,
  agent         TEXT NOT NULL,
  kind          TEXT NOT NULL CHECK (kind IN ('QUY_TAC','HOI_DAP')),
  question      TEXT,
  answer        TEXT NOT NULL,
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  used          INT NOT NULL DEFAULT 0,
  created_by    UUID REFERENCES users(id),
  created_label TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agent_lessons_agent ON agent_lessons(agent, active);
CREATE TABLE IF NOT EXISTS agent_chat (
  id         BIGSERIAL PRIMARY KEY,
  agent      TEXT NOT NULL,
  sender     TEXT NOT NULL CHECK (sender IN ('NGUOI','AGENT')),
  user_id    UUID REFERENCES users(id),
  user_label TEXT NOT NULL DEFAULT '',
  body       TEXT NOT NULL,
  mode       TEXT CHECK (mode IN ('LENH','AI_NGON_NGU','GIA_LAP')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agent_chat_agent ON agent_chat(agent, created_at DESC);

-- ===== AI LOCAL + huấn luyện thực chiến =====
ALTER TABLE chat_logs ADD COLUMN IF NOT EXISTS intent_by TEXT NOT NULL DEFAULT 'QUY_TAC';  -- QUY_TAC / AI_LOCAL: mô hình chỉ tự học từ câu luật nhận đúng
ALTER TABLE chat_logs ADD COLUMN IF NOT EXISTS lesson_id BIGINT;                         -- bài học AI dùng để trả lời
ALTER TABLE chat_logs DROP CONSTRAINT IF EXISTS chat_logs_answered_by_check;
ALTER TABLE chat_logs ADD CONSTRAINT chat_logs_answered_by_check CHECK (answered_by IN ('AI_QUY_TAC','AI_LOCAL','AI_NGON_NGU','CHUYEN_NGUOI'));
ALTER TABLE agent_chat DROP CONSTRAINT IF EXISTS agent_chat_mode_check;
ALTER TABLE agent_chat ADD CONSTRAINT agent_chat_mode_check CHECK (mode IN ('LENH','AI_LOCAL','AI_NGON_NGU','GIA_LAP'));
ALTER TABLE agent_chat ADD COLUMN IF NOT EXISTS rating SMALLINT CHECK (rating IN (-1, 1));   -- CEO / kỹ sư chấm câu trả lời: dữ liệu huấn luyện
ALTER TABLE agent_lessons ADD COLUMN IF NOT EXISTS seed_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS agent_lessons_seed ON agent_lessons(seed_key);
-- Lịch AI 24/7: mỗi vòng chạy ghi 1 dòng để trang huấn luyện biết AI còn sống.
CREATE TABLE IF NOT EXISTS ai_heartbeat (
  worker     TEXT PRIMARY KEY,
  beat_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  info       JSONB NOT NULL DEFAULT '{}'
);

-- Bài học mặc định (CEO sửa / "Quên" trên trang Chat & huấn luyện agent). Đã quên thì chạy lại lược đồ không thêm lại.
INSERT INTO agent_lessons(seed_key, agent, kind, question, answer, created_label) VALUES
 ('cskh-chu-nhat', 'RYN-SALES', 'HOI_DAP', 'Có giao hàng chủ nhật không | Cuối tuần thứ 7 chủ nhật có giao không | Chủ nhật có ship không',
  'Có ạ. taomua làm việc 24/7: AI nhận đơn, trả lời và theo dõi đơn cả thứ 7, chủ nhật và ngày lễ. Hàng vẫn giao chủ nhật, nội thành HCM có giao nhanh; tỉnh xa và quốc tế theo lịch hãng vận chuyển, mã vận đơn hiện khi bạn tra cứu đơn.', 'Mặc định taomua'),
 ('cskh-24-7', 'RYN-SALES', 'HOI_DAP', 'taomua làm việc mấy giờ | Có làm ban đêm không | Làm việc 24/7 không | Giờ mở cửa | Khuya có trả lời không',
  'taomua.com hoạt động 24/7. Trợ lý AI trả lời ngay mọi lúc, nhận đơn và báo giá cả ban đêm, thứ 7, chủ nhật. Việc cần nhân viên (khiếu nại, đơn lớn) được xử lý trong giờ làm việc, khiếu nại phản hồi trong 2 giờ.', 'Mặc định taomua'),
 ('cskh-ngay-le', 'RYN-SALES', 'HOI_DAP', 'Ngày lễ tết có giao hàng không | Tết có làm việc không | Ngày lễ có ship không',
  'Có ạ, taomua vẫn nhận đơn và trả lời 24/7 dịp lễ tết. Ngày giao phụ thuộc lịch nghỉ của hãng vận chuyển; taomua báo trước nếu đơn của bạn bị chậm.', 'Mặc định taomua'),
 ('cskh-thoi-gian-giao', 'RYN-SALES', 'HOI_DAP', 'Bao lâu thì nhận được hàng | Giao mất mấy ngày | Khi nào hàng tới nơi',
  'Thời gian tham khảo: nội thành HCM 1–2 ngày, các tỉnh 2–5 ngày, quốc tế 7–15 ngày tùy hãng. Hàng đặt xưởng sản xuất theo yêu cầu cộng thêm thời gian xưởng làm, taomua báo rõ khi xác nhận đơn.', 'Mặc định taomua'),
 ('cskh-quoc-te', 'RYN-SALES', 'HOI_DAP', 'Có giao hàng quốc tế không | Ship ra nước ngoài được không | Gửi hàng đi nước ngoài',
  'Có ạ. taomua giao quốc tế; phí vận chuyển được báo qua email trước khi bạn thanh toán, giá hiện kèm USD tham khảo. Bạn chọn quốc gia khi đặt hàng.', 'Mặc định taomua'),
 ('cskh-mua-le', 'RYN-SALES', 'HOI_DAP', 'Mua lẻ 1 cái được không | Mua thử mẫu | Lấy số lượng ít được không',
  'Được ạ. Mua lẻ từ 1 cái ở 9mua.com (mục 9mua bán lẻ). Giá sỉ áp dụng từ 10 cái, mua càng nhiều giá càng thấp (bậc 10 / 50 / 100 / 500 cái).', 'Mặc định taomua'),
 ('cskh-chiet-khau', 'RYN-SALES', 'HOI_DAP', 'Mua nhiều có được giảm giá không | Có chiết khấu không | Lấy số lượng lớn có bớt không',
  'Có ạ: mua càng nhiều giá càng thấp. Mỗi sản phẩm có 4 bậc giá sỉ 10 / 50 / 100 / 500 cái, đã gồm VAT. Đơn lớn hơn 500 cái, bạn gửi yêu cầu báo giá để taomua đàm phán thêm với xưởng.', 'Mặc định taomua'),
 ('cskh-in-logo', 'RYN-SALES', 'HOI_DAP', 'Có in logo không | Làm hàng theo mẫu riêng OEM | Đặt sản xuất theo yêu cầu',
  'Có ạ. Bạn gửi yêu cầu báo giá ở mục Yêu cầu báo giá: tên hàng, số lượng, mẫu / logo. AI taomua tìm xưởng phù hợp theo giá và số lượng, CEO duyệt rồi báo giá cho bạn.', 'Mặc định taomua'),
 ('cskh-an-toan', 'RYN-SALES', 'HOI_DAP', 'Chuyển khoản trước có an toàn không | Sợ bị lừa | Có uy tín không',
  'An toàn ạ. taomua giữ tiền của bạn (Trade Assurance) đến khi bạn xác nhận đã nhận hàng đúng. Hàng lỗi, thiếu: đừng bấm đã nhận hàng, gửi khiếu nại để được hoàn tiền.', 'Mặc định taomua'),
 ('cskh-doi-tra', 'RYN-SALES', 'HOI_DAP', 'Chính sách đổi trả hàng | Đổi trả hàng được không | Bảo hành thế nào',
  'Hàng lỗi, sai mẫu, thiếu số lượng: bạn gửi khiếu nại kèm mã đơn và ảnh trong mục Báo lỗi, taomua phản hồi trong 2 giờ và đổi hàng hoặc hoàn tiền. Tiền vẫn được giữ đến khi xử lý xong.', 'Mặc định taomua'),
 ('cskh-cod', 'RYN-SALES', 'HOI_DAP', 'Có thanh toán khi nhận hàng COD không | Nhận hàng rồi mới trả tiền | Ship COD',
  'Đơn sỉ thanh toán chuyển khoản hoặc cổng thanh toán (9PAY, VNPay, Momo, Alipay); taomua giữ tiền đến khi bạn nhận hàng nên an toàn như nhận hàng rồi mới trả.', 'Mặc định taomua'),
 ('cskh-dai-ly', 'RYN-SALES', 'HOI_DAP', 'Muốn làm đại lý | Làm cộng tác viên bán hàng | Hợp tác phân phối',
  'Rất vui hợp tác ạ. Bạn để lại tên, số điện thoại và khu vực ở mục Báo lỗi / liên hệ, nhân viên taomua gọi lại tư vấn giá đại lý (bậc 100 / 500 cái).', 'Mặc định taomua'),
 ('cskh-r-xung-ho', 'RYN-SALES', 'QUY_TAC', NULL, 'Luôn lịch sự, xưng "taomua", gọi khách là "bạn", trả lời bằng ngôn ngữ của khách.', 'Mặc định taomua'),
 ('cskh-r-gia', 'RYN-SALES', 'QUY_TAC', NULL, 'Không hứa giảm giá ngoài bảng 4 bậc; không nói giá vốn, phí, biên lợi nhuận cho khách.', 'Mặc định taomua'),
 ('cskh-r-bao-mat', 'RYN-SALES', 'QUY_TAC', NULL, 'Không bao giờ hỏi mật khẩu, mã OTP hay số thẻ của khách.', 'Mặc định taomua'),
 ('all-r-24-7-trend', 'RYN-TREND', 'QUY_TAC', NULL, 'Làm việc 24/7. Hàng mới phải bán thử 50–100 cái trước khi nhập lớn; trend ngoài chỉ mở tối đa 3 yêu cầu tìm xưởng mỗi ngày.', 'Mặc định taomua'),
 ('all-r-24-7-supply', 'RYN-SUPPLY', 'QUY_TAC', NULL, 'Làm việc 24/7. Ưu tiên xưởng TrustScore cao, có chứng nhận, tỉ lệ lỗi thấp; luôn đề xuất kèm 3 xưởng dự phòng; CEO quyết định chọn xưởng.', 'Mặc định taomua'),
 ('all-r-24-7-nego', 'RYN-NEGO', 'QUY_TAC', NULL, 'Làm việc 24/7. Mục tiêu giảm 10% khi đàm phán, lịch sự, không ép xưởng dưới giá vốn; khách mua 500 cái thì đàm phán lại.', 'Mặc định taomua'),
 ('all-r-24-7-price', 'RYN-PRICE', 'QUY_TAC', NULL, 'Làm việc 24/7. Giữ biên ròng sau thuế phí từ 15%; đối thủ rẻ hơn thì giảm tối đa 2% mỗi lần; biên trên 150% thì cảnh báo CEO.', 'Mặc định taomua'),
 ('all-r-24-7-trace', 'RYN-TRACE', 'QUY_TAC', NULL, 'Làm việc 24/7. QC phải đạt từ 98%; xưởng tăng giá từ 10% thì báo ngay; đơn từ 10 triệu phải có hóa đơn.', 'Mặc định taomua'),
 ('all-r-24-7-sales', 'RYN-SALES', 'QUY_TAC', NULL, 'Làm việc 24/7: trả lời khách ngay mọi lúc kể cả ban đêm, thứ 7, chủ nhật; việc cần người thì chuyển nhân viên kèm tóm tắt.', 'Mặc định taomua'),
 ('all-r-24-7-logi', 'RYN-LOGI', 'QUY_TAC', NULL, 'Làm việc 24/7. Chọn hãng vận chuyển rẻ nhất đạt thời gian; đơn quốc tế báo phí cho khách trước khi thu tiền; biên an toàn vốn dưới 20% thì khóa nhập mới.', 'Mặc định taomua'),
 ('price-qa-tinh-gia', 'RYN-PRICE', 'HOI_DAP', 'Giá bán được tính thế nào',
  'Giá bán = (giá xưởng + phí) cộng biên theo bậc 10 / 50 / 100 / 500 cái, đã gồm VAT 8%. Biên ròng tính sau VAT 8%, phí ngân hàng 1% và thuế TNDN 20%, tối thiểu 15%.', 'Mặc định taomua'),
 ('logi-qa-ship', 'RYN-LOGI', 'HOI_DAP', 'Chọn hãng vận chuyển thế nào',
  'Theo khối lượng và vùng giao (nội thành, nội tỉnh, liên tỉnh, quốc tế), so bảng giá các hãng và chọn hãng rẻ nhất đạt thời gian; có API hãng thì lấy giá thật.', 'Mặc định taomua'),
 ('supply-qa-chon-xuong', 'RYN-SUPPLY', 'HOI_DAP', 'Chọn xưởng sản xuất theo tiêu chí nào',
  'Theo ngành hàng, giá theo số lượng và MOQ, biên còn lại, TrustScore, tỉ lệ lỗi, thời gian giao. AI đề xuất xưởng chính + 3 dự phòng, CEO chọn trên trang Tìm xưởng.', 'Mặc định taomua')
ON CONFLICT (seed_key) DO NOTHING;
