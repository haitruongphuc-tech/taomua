-- 02_DATABASE_SCHEMA.sql - TAOMUA.COM - 4 BANG CHINH - POSTGRESQL/SUPABASE

-- BANG 1: suppliers - Nguon hang
CREATE TABLE suppliers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  source TEXT CHECK (source IN ('1688','AMAZON','WALMART','VN_FACTORY_0316437942','OEM')),
  trust_score INT CHECK (trust_score >=0 AND trust_score <=100),
  response_time_sec INT, -- <90s 18% TrustScore
  defect_rate DECIMAL(5,4), -- <0.02 2%
  on_time_rate DECIMAL(5,4),
  verified_cert BOOLEAN,
  inventory_sync BOOLEAN,
  moq INT,
  price_1688 INT,
  price_vn INT,
  price_oem INT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- BANG 2: products - San pham
CREATE TABLE products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT,
  trend_score INT,
  supplier_id TEXT REFERENCES suppliers(id),
  supplier_ids_backup JSONB, -- 3 xuong du phong [{"id":"xuongA","trust":92},...]
  cost INT, -- COGS
  fee INT, -- ship+marketing+logistics+AI+phap ly+9PAY
  total_cost INT, -- cost+fee
  price_taomua_10 INT, -- Gia si 10 cai
  price_taomua_50 INT,
  price_taomua_100 INT,
  price_taomua_500 INT,
  price_9mua_retail INT, -- Gia le 9mua.com
  bien_rong_tren_chi_phi DECIMAL(5,2), -- 15-150%
  bien_tren_dt DECIMAL(5,2), -- 8-52%
  cap_duyet INT CHECK (cap_duyet >=1 AND cap_duyet <=5),
  latur_test_qty INT, -- 50-100 cai test
  latur_ctr DECIMAL(5,2), -- CTR realtime >3% moi scale
  rynn_brain DECIMAL(5,2), -- 98% defect check
  vong_quay_von DECIMAL(5,2), -- >3
  trust_score INT,
  status TEXT CHECK (status IN ('PENDING','APPROVED','REJECTED','LATR_TESTING','SCALING')),
  created_at TIMESTAMP DEFAULT NOW()
);

-- BANG 3: wholesale_orders - Don si
CREATE TABLE wholesale_orders (
  id TEXT PRIMARY KEY,
  product_id TEXT REFERENCES products(id),
  customer_id TEXT, -- 9mua VIP + 200 wholesale TikTok/Shopee
  quantity INT,
  tier INT CHECK (tier IN (10,50,100,500)),
  tong_dt BIGINT,
  tong_chi_phi BIGINT,
  vat_8 BIGINT, -- DT*0.08
  phi_mb_1 BIGINT, -- DT*0.01
  ln_truoc_tndn BIGINT,
  thue_tndn_20 BIGINT, -- (DT - tong chi phi - VAT - MB)*0.2
  ln_rong_sau_thue BIGINT,
  bien_rong_tren_chi_phi DECIMAL(5,2),
  cap_duyet INT,
  telegram_approval TEXT, -- CU - Bo, thay bang approval_queue
  approval_queue_id TEXT, -- MOI - Link den approval_queue
  approved_by TEXT,
  trade_assurance TEXT CHECK (trade_assurance IN ('HOLD','RELEASED','REFUND')),
  wfs TEXT CHECK (wfs IN ('DROPSHIP','WFS','SAME_DAY_30MIN')),
  status TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- BANG 4: working_capital - Von luu dong
CREATE TABLE working_capital (
  id SERIAL PRIMARY KEY,
  month INT CHECK (month >=1 AND month <=12),
  tong_dt BIGINT,
  von_luu_dong_30 BIGINT, -- DT*0.3
  du_phong_15 BIGINT, -- DT*0.15
  tong_von_can_45 BIGINT, -- DT*0.45
  vong_quay_von DECIMAL(5,2), -- >3
  bien_an_toan DECIMAL(5,2), -- >20%
  mb_bank_balance BIGINT,
  status TEXT CHECK (status IN ('SAFE','WARNING','DANGER'))
);

-- BANG 5 MOI: approval_queue - Duyet don One-Tap Approve - THAY THE TELEGRAM
CREATE TABLE approval_queue (
  id TEXT PRIMARY KEY, -- APPROVAL_Ao_thun_3D_2_123456789
  product_name TEXT NOT NULL,
  bien_rong_percent INT CHECK (bien_rong_percent >=15 AND bien_rong_percent <=150),
  cap_duyet INT CHECK (cap_duyet >=1 AND cap_duyet <=5),
  price INT,
  total_cost INT,
  quantity INT,
  tier INT,
  status TEXT CHECK (status IN ('PENDING','APPROVED','REJECTED','APPROVED_BY_AI')) DEFAULT 'PENDING',
  created_at TIMESTAMP DEFAULT NOW(),
  approved_by TEXT, -- AI, Ms Nhu, CEO Nguyen Hai
  approved_at TIMESTAMP,
  web_link TEXT, -- https://taomua.com/admin/approval/...
  method TEXT CHECK (method IN ('ONE_TAP','ZALO_OA','EMAIL')) DEFAULT 'ONE_TAP',
  product_id TEXT REFERENCES products(id)
);

-- INDEX
CREATE INDEX idx_products_bien ON products(bien_rong_tren_chi_phi);
CREATE INDEX idx_products_cap ON products(cap_duyet);
CREATE INDEX idx_approval_status ON approval_queue(status);
CREATE INDEX idx_approval_cap ON approval_queue(cap_duyet);
