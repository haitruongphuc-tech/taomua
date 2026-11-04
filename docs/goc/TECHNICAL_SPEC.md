# TECHNICAL SPECIFICATION - TAOMUA.COM 95-98% AI - CLAUDE CODE READY
# MST 0316437942 - MB BANK 0331 09MUA 9999 - CEO NGUYEN HAI - HAI@9MUA.COM

## 1. PROJECT OVERVIEW - DOC NGAY KHI CLAUDE CODE HOI LAI
taomua.com = B2B wholesale sourcing platform, 95-98% AI automation + 2-5% human CEO, autonomous sourcing.
9mua.com = B2C retail, VIP wholesale customer of taomua.com.
Model: Autonomous Sourcing Cobot Network / Agentic B2B Commerce 2026-2030 = Alibaba Cainiao (platform orchestrator) + Shein LATR (test 50-100 units) + Amazon Cobot language ("dong doi AI cong tac") + Shopify/TikTok Agentic Storefronts (UCP, shop.md, MCP).

**LEGAL:**
- 9mua.com owner: CONG TY TNHH CONG NGHE THUONG MAI 9MUA, 500M VND capital, 40M first installment, MB Bank 0331 09MUA 9999, email hai@9mua.com, 12 business lines main 4791.
- taomua.com founded by Nguyen Hai but legally under Le Huynh Nhu (Vietnam), NOT Chinese.
- Investor: CONG TY CO PHAN NU HOANG NOI THAT MST 0316437942 (temporarily suspended).
- CEO-led automation model: CEO Nguyen Hai final approval, Ms Nhu level 2.

**GOAL:** Build taomua.com most attractive for wholesale buyers in VN, combining best of Amazon/Walmart/Alibaba/eBay/Shopify 2026 tech.

## 2. CORE BUSINESS LOGIC - BIEN RONG SAU THUE PHI 15-150%
**Formula chuan ke toan, LN rong thuc te cam ve:**
```
Tong chi phi truoc thue = Chi phi bien (COGS + van chuyen + marketing + logistics + AI API + phap ly + 9PAY) + Chi phi co dinh (VP+Kho+CSKH+Ky su+Mau test+Du phong)
VAT 8% = Tong doanh thu * 0.08
Phi MB Bank 1% = Tong doanh thu * 0.01
Phi 9PAY 1.5% = (tinh trong chi phi bien)
LN truoc TNDN = Tong DT - Tong chi phi truoc thue - VAT - MB
Thue TNDN 20% = LN truoc TNDN * 0.2
LN rong sau thue = LN truoc TNDN - Thue TNDN
Bien rong tren chi phi % = LN rong sau thue / Tong chi phi truoc thue * 100 (15-150% linh dong)
Bien rong tren DT % = LN rong sau thue / Tong DT *100 (8-52% tuong duong)
```

**5 cap duyet AI/CEO - Bat buoc implement:**
- Level 1: Bien rong 15-30% tren chi phi, don <5M, AI tu duyet 98% <2min
- Level 2: 30-50%, 5-20M, AI + Ms Nhu (Le Huynh Nhu) <30min Telegram
- Level 3: 50-80%, 20-50M, AI + CEO Telegram <5min
- Level 4: 80-150%, 50-200M, CEO mandatory <2h
- Level 5: >150% or >200M, CEO + investor MST 0316437942 <24h
- LATR test special: Bien 80-150% nhung duoc test 50-100 cai truoc, CTR >3% moi nhap lon

**Vi du cu the:**
- Von 20k + phi 8k = 28k, ban 35k, LN rong 3.08k => Bien 11% ~ Cap 1 AI
- Von 20k + phi 8k = 28k, ban 50k, LN rong 14.3k => Bien 51% ~ Cap 3 CEO nhanh
- Von 20k + phi 24k = 44k, ban 130k, LN rong 59.4k => Bien 135% ~ Cap 4 CEO bat buoc (hot trend)

## 3. ARCHITECTURE 5 LAYERS + 7 AI AGENTS + N8N
**5 tang:**
1. Trend Hunter: Qwen3.7-Max + RynnBrain + Accio AI scan TikTok/1688/Amazon Best Seller/Walmart, du bao trend 2026
2. Supplier Brain: Tim 50 xuong/sp 1688 + xuong VN Binh Duong (MST 0316437942) + Amazon, cham diem TrustScore, chat TV-Trung tu dong
3. Procurement & Pricing Engine: Tinh bien rong 15-150% chuan ke toan, de xuat gia si 4 muc (10/50/100/500), tinh von luu dong 30% + du phong 15% = 45% DT, vong quay >3 lan/thang
4. Wholesale Sales Agent: Ban si cho 9mua.com VIP + 200 khach si TikTok/Shopee, Agent Gateway UCP/MCP/AP2, Agent Profiles han muc 10tr/50tr/100tr
5. Logistics/Finance: GHN/GHTK/J&T AI chon re nhat + WFS taomua fulfillment + MB Bank BIZ 0331 09MUA 9999 + 9PAY/9XU + Trade Assurance + Scintilla analytics + Canvas visual editor + shop.md

**7 AI Agents (N8N workflow):**
- Agent 1 Sourcing: Tim xuong, dam phan gia, TrustScore
- Agent 2 Content: Tu tao mo ta sp Azure OpenAI, background anh, video TikTok
- Agent 3 Ads: Tu chay TikTok Ads + Facebook Ads, toi uu CTR
- Agent 4 CSKH: Tra loi khach si 95% tu dong, 5% chuyen CEO
- Agent 5 Accounting: Tinh bien rong sau thue, VAT, TNDN, MB, von luu dong, du phong, vong quay
- Agent 6 Logistics: Chon GHN/GHTK/J&T re nhat, tracking real-time
- Agent 7 Compliance: Kiem tra phap ly MST 0316437942, hop dong, chung chi xuong

**N8N workflow trigger:** Trend Hunter moi 6h -> Supplier Brain -> Pricing Engine tinh bien rong -> Telegram duyet theo cap -> Content + Ads + CSKH + Accounting + Logistics + Compliance

## 4. DATABASE SCHEMA - IMPLEMENT NGAY
```sql
-- Suppliers
CREATE TABLE suppliers (
  id UUID PRIMARY KEY,
  name VARCHAR(255),
  source ENUM('1688','AMAZON','WALMART','VN_FACTORY_0316437942','OEM'),
  contact_wechat VARCHAR(100),
  trust_score INT 0-100,
  response_time_sec INT,
  defect_rate DECIMAL(3,2),
  on_time_rate DECIMAL(3,2),
  verified_cert BOOLEAN,
  inventory_sync BOOLEAN,
  moq INT,
  price_1688 DECIMAL(10,2),
  price_vn DECIMAL(10,2),
  created_at TIMESTAMP
);

-- Products
CREATE TABLE products (
  id UUID PRIMARY KEY,
  name VARCHAR(500),
  category VARCHAR(100),
  trend_score INT 0-100,
  supplier_id UUID FK,
  supplier_ids_backup JSON [3 xuong du phong],
  cost_20k_example DECIMAL(10,2),
  fee_8k_example DECIMAL(10,2),
  total_cost DECIMAL(10,2),
  price_taomua_10 DECIMAL(10,2),
  price_taomua_50 DECIMAL(10,2),
  price_taomua_100 DECIMAL(10,2),
  price_taomua_500 DECIMAL(10,2),
  price_9mua_retail DECIMAL(10,2),
  bien_rong_tren_chi_phi DECIMAL(5,2), -- 15-150%
  bien_rong_tren_dt DECIMAL(5,2), -- 8-52%
  cap_duyet INT 1-5,
  latur_test_qty INT 50-100,
  latur_ctr DECIMAL(5,2),
  rynn_brain_defect_check DECIMAL(3,2) 98%,
  vong_quay_von DECIMAL(5,2),
  status ENUM('TREND_HUNTER','SUPPLIER_BRAIN','PRICING','PENDING_APPROVAL','APPROVED','LATR_TEST','MASS_IMPORT','DROPSHIP_SI')
);

-- Orders wholesale
CREATE TABLE wholesale_orders (
  id UUID PRIMARY KEY,
  product_id UUID FK,
  customer_id UUID FK (9mua.com = VIP, plus 200 wholesale customers),
  quantity INT,
  tier ENUM('10','50','100','500'),
  tong_dt DECIMAL(12,2),
  tong_chi_phi_truoc_thue DECIMAL(12,2),
  vat_8 DECIMAL(12,2),
  phi_mb_1 DECIMAL(12,2),
  ln_truoc_tndn DECIMAL(12,2),
  thue_tndn_20 DECIMAL(12,2),
  ln_rong_sau_thue DECIMAL(12,2),
  bien_rong_tren_chi_phi DECIMAL(5,2),
  cap_duyet INT,
  telegram_approval_status ENUM('PENDING','APPROVED','REJECTED'),
  approved_by VARCHAR(100) (AI/Ms Nhu/CEO Nguyen Hai/investor),
  trade_assurance_status ENUM('HOLD','RELEASED','REFUND'),
  wfs_status ENUM('DROPSHIP','WFS_FULFILLMENT','SAME_DAY_30MIN'),
  created_at TIMESTAMP
);

-- Working capital
CREATE TABLE working_capital (
  month INT 1-12,
  tong_dt DECIMAL(12,2),
  von_luu_dong_30 DECIMAL(12,2),
  du_phong_15 DECIMAL(12,2),
  tong_von_can_45 DECIMAL(12,2),
  vong_quay_von DECIMAL(5,2),
  bien_an_toan DECIMAL(5,2) >20% safe,
  mb_bank_balance DECIMAL(12,2),
  status ENUM('SAFE','WARNING','DANGER')
);
```

## 5. API ENDPOINTS - MUST IMPLEMENT
```
POST /api/v1/trend-hunter/scan - Qwen3.7-Max scan trend 6h
POST /api/v1/supplier-brain/find - Find 50 suppliers/product
POST /api/v1/supplier-brain/trust-score - Calculate TrustScore 0-100 (response <90s 18%, verified cert, defect <2%, on-time, inventory sync)
POST /api/v1/pricing-engine/calculate - Input: cost, fee, Input: dt => Output: bien rong tren chi phi 15-150%, bien tren dt 8-52%, cap duyet 1-5, gia si 4 muc
POST /api/v1/approval/telegram - Send Telegram to Ms Nhu/CEO Nguyen Hai with bien rong, don amount, <2min/<30min/<5min/<2h/<24h logic
POST /api/v1/agent-gateway/shop-md - shop.md skill for ChatGPT/Claude/Gemini agent buy wholesale via UCP/MCP/AP2
POST /api/v1/agent-gateway/profiles - Agent Profiles spending limit 10tr/50tr/100tr
POST /api/v1/wfs/fulfillment - WFS taomua fulfillment, dropship si, same-day 30min HCM
POST /api/v1/trade-assurance/hold - Hold money until customer receives, refund if defect
POST /api/v1/rynn-brain/check - RynnBrain camera defect check 98% live
POST /api/v1/latr/test - LATR test 50-100 units, CTR realtime
POST /api/v1/scintilla/analytics - Scintilla commerce intelligence performance
POST /api/v1/canvas/edit - Canvas visual editor edit by talking to Sidekick AI
POST /api/v1/working-capital/calculate - 30% + 15% =45% DT, vong quay >3
```

## 6. UI/UX SPEC - TAOMUA.COM B2B + 9MUA.COM B2C
**taomua.com B2B (wholesale):**
- Color: Xanh duong tin cay #0D47A1 + Cam hanh dong #FF6F00
- Mobile-first 95%
- Header: Logo taomua.com + Search conversational + Image search + Voice + Agent Gateway icon + TrustScore
- Hero: AI Shopping Assistant input "Tim ao thun hot trend gia duoi 50k bien 40%" + RynnBrain camera live
- Product table: Columns: Anh, Ten, TrustScore xuong, Gia 4 muc (10/50/100/500) linh dong, Bien rong tren chi phi 15-150% + Bien tren DT 8-52% hien ro LN rong, Vong quay von, LATR CTR, Telegram duyet, Trade Assurance, WFS, Scintilla
- Example row: Ao thun in 3D | Xuong A TrustScore 92 | 10c:45k 50c:40k 100c:38k 500c:35k | Bien rong 38% tren chi phi ~24% tren DT | Cap 2 | Vong quay 3.5 | CTR 4.2% | Duyet AI | Trade Assurance | WFS
- Sidebar: RFQ (yeu cau bao gia) + Price history 365 days + Auto-Buy + Working capital dashboard 30%/15%/45% + Vong quay >3 + Bien an toan >20%
- Footer: MB Bank 0331 09MUA 9999 + 9PAY/9XU + Alipay/WeChat Pay

**9mua.com B2C (retail):**
- TikTok style video feed san pham
- Shop Pay 1-click, VNPay/Momo/Alipay/WeChat Pay
- Shop to Light AR
- Gia le: = Gia si taomua.com + bien rong 8-52% tren DT (da tinh sau thue phi)

## 7. TECHNOLOGY STACK - BAT BUOC
- Frontend: Next.js 14 + Hydrogen (Shopify) + Horizon design system + Canvas visual editor
- Backend: Node.js + Python (Qwen3.7-Max, RynnBrain)
- AI: Qwen3.7-Max (Trend Hunter, Supplier Brain), RynnBrain (camera defect 98%), Accio AI (market research, supplier sourcing), Rufus-style AI Shopping Assistant, Sparky-style image to list + voice, Sidekick AI admin
- Agent: UCP/MCP/AP2, shop.md, Model Context Protocol (Anthropic), Agent Gateway, Agent Profiles, WebMCP tools browser agents search/add to cart/checkout
- Database: PostgreSQL + Redis + Tongyi Data Mesh style
- Workflow: N8N 7 Agents
- Payment: MB Bank BIZ API 0331 09MUA 9999 + 9PAY/9XU + Shop Pay + Alipay/WeChat Pay/VNPay/Momo
- Logistics: GHN/GHTK/J&T API + WFS taomua + Cainiao-style tracking real-time + Same-day 30min HCM
- Analytics: Scintilla commerce intelligence + Product Opportunity Explorer + Price history 365 days
- Trust: TrustScore 17 factors + Trade Assurance 3.0 + Shopify Protect fraud
- Chat: Telegram bot for approval <2min/<30min/<5min/<2h/<24h
- Deployment: Vercel + AWS (Bedrock, Trainium, Inferentia)

## 8. INTEGRATION WITH 5 PLATFORMS - DA KHAO SAT
**Amazon 2026:** Rufus AI 115% MAU growth, Seller Assistant memory 24/7, Buy For Me autonomous, Price history 365 days, Auto-Buy, Product Opportunity Explorer -> Apply: AI Shopping Assistant taomua + Auto-Buy + Price history
**Walmart 2026:** Sparky image to list + recipes + voice, Agent Gateway Model Context Protocol, Agent Profiles $50/$100/$200 spending limit, Same-day 30min, WFS 50% GMV growth, Scintilla, Shop to Light, Instant checkout Gemini linked account -> Apply: Agent Gateway + Agent Profiles 10tr/50tr/100tr + WFS taomua + Sparky image search + Instant checkout
**Alibaba.com 2026:** Accio agentic AI automate workflows no code, Tongyi Data Mesh 12.4 exabytes/day, MatchPro -63% RFQ time, 22M manufacturers, TrustScore 17 factors response <90s 18%, Trade Assurance 3.0 real-time inventory sync, supply chain resilience, Incoterms auto, 1688.com MOQ-flexible quality inspection APIs -> Apply: Accio + TrustScore 0-100 + Trade Assurance taomua + supply chain resilience + 3 suppliers/product + 1688 MOQ-flexible
**eBay 2026:** Conversational search natural language, image search upgrade, Magical Listing Azure OpenAI adoption numbers, AI photo backgrounds, barcode-scan-to-list, AI assistant messaging, Rebrand clean lines white space fresh logo, Shopping View larger high-res images, eBay Live social shopping -> Apply: Conversational search + image search + Magical Listing + eBay Live RynnBrain camera
**Shopify 2026:** Fall 26 Exponential 150+ updates, Agentic commerce, shop.md 1B products, Connectors 9 agents ChatGPT/Claude/Copilot/Gemini/Grok, Canvas visual theme edit together + Sidekick, Horizon design system speed in-canvas, WebMCP browser agents search/add to cart/checkout, shop.dev single connection catalog/cart/checkout/Shop Pay, Hydrogen framework, 7 new local payment methods Alipay/WeChat Pay/MB WAY/OXXO, Shopify Protect fraud -> Apply: shop.md taomua + Connectors 9 agents + Canvas + Horizon + WebMCP + shop.dev + Hydrogen + Alipay/WeChat Pay + Protect

## 9. GROWTH FORECAST 12 THANG - DA CAP NHAT BIEN RONG SAU THUE
Thang 1: DT 500tr (taomua si 200 + 9mua le 300), chi phi co dinh 80tr, bien 55%, tong chi phi truoc thue 355tr, VAT 40tr, MB 5tr, LN truoc TNDN 100tr, TNDN 20tr, LN rong 80tr, von LD 150tr, du phong 75tr, tong von can 225tr, vong quay 3.33, bien rong 22.6% tren chi phi ~16.3% tren DT Cap1
Thang 3: DT 1.3 ty, LN rong 250tr, bien 29.4% Cap1
Thang 6: DT 6.825 ty, LN rong 1.6 ty, bien 37% Cap2-3
Thang 12: DT 17 ty, LN rong 4.08 ty, bien 39.6% Cap2
Tong nam: DT 79.6 ty, LN rong 16.6 ty, von can TB 3.5 ty, bien TB 35% tren chi phi ~22% tren DT, tong von can 45% DT, an toan, khong dut gay, vong quay >3

## 10. RISK & INVENTORY & WORKING CAPITAL
- Ton kho: Khong ton kho chinh, chi 20 mau, dropship si, vong quay 3.33 lan/thang
- Check loi: RynnBrain camera 98% (vuot Amazon Vulcan 75%), giam loi 10% ->2%
- Du phong rui ro 15% DT: Dut von 40%, dut chuoi 25%, ton kho 15%, xuong loi 10%, trend giam 10%, AI canh bao Telegram CEO khi rui ro >70%
- Von luu dong 30% + du phong 15% =45% DT trong MB Bank 0331 09MUA 9999, vong quay >3, bien an toan >20%
- 3 suppliers per product, RynnBrain camera, scenarios capital break, supply chain break, inventory damage

## 11. CLAUDE CODE INSTRUCTIONS - DOC KY KHI AI HOI LAI/DUYET/BO SUNG
**Khi Claude Code hoi lai, duyet, bo sung:**
1. Doc file nay truoc, khong hoi lai nguoi dung
2. Check bien rong 15-150% la bien rong sau thue phi chuan ke toan, khong phai bien gop
3. Check 5 cap duyet AI/CEO bat buoc, Telegram approval <2min/<30min/<5min/<2h/<24h
4. Check database schema 4 bang suppliers/products/wholesale_orders/working_capital
5. Check API endpoints 14 endpoints phai implement
6. Check UI/UX spec taomua.com B2B bang gia 4 muc + bien rong hien ro + TrustScore + RynnBrain + LATR + Telegram + Trade Assurance + WFS + Scintilla + Canvas + working capital dashboard
7. Check technology stack Next.js + Hydrogen + Qwen3.7-Max + RynnBrain + Accio + UCP/MCP/AP2 + shop.md + Model Context Protocol + N8N 7 Agents + MB Bank BIZ + 9PAY/9XU + GHN/GHTK/J&T + Scintilla + TrustScore + Telegram bot
8. Check integration 5 platforms Amazon/Walmart/Alibaba/eBay/Shopify da khao sat chi tiet trong file Bao_cao_Khao_sat
9. Check growth forecast 12 thang 500tr->17 ty DT, LN rong 80tr->4.08 ty, von can 45% DT, vong quay 3.33
10. Neu thieu thong tin, tu suy luan tu file nay, khong hoi lai CEO Nguyen Hai tru khi Cap 4-5

**DO NOT:**
- Do not hoi lai bien 15-150% la gi, da giai thich ro la bien rong sau thue phi
- Do not hoi lai phan quyen AI/CEO, da co 5 cap chi tiet
- Do not hoi lai von luu dong, da co 30%+15%=45%
- Do not hoi lai TrustScore, da co 17 factors
- Do not hoi lai Agent Gateway, da co UCP/MCP/AP2 + Agent Profiles 10tr/50tr/100tr
- Do not hoi lai taomua.com la gi, la B2B wholesale, 9mua.com la B2C retail VIP

**MUST DO:**
- Implement dung cong thuc bien rong sau thue phi
- Implement dung 5 cap duyet Telegram
- Implement dung database schema
- Implement dung 14 API endpoints
- Implement UI dung spec bang gia 4 muc + bien rong hien ro + TrustScore + RynnBrain + LATR
- Giu 95-98% AI automation, 2-5% human CEO
- Dam bao vong quay von >3, bien an toan >20%
- Dam bao RynnBrain 98% defect check
- Dam bao LATR test 50-100 cai CTR realtime
- Dam bao Trade Assurance hold money
- Dam bao WFS taomua fulfillment

## 12. FILES REFERENCE - ALL DATA INTEGRATED
- Du_toan_12_thang_cap_nhat_Bien_Rong_Sau_Thue_taomua.com.xlsx: Du toan 12 thang bien rong sau thue
- Khao_sat_Amazon_Walmart_Alibaba_eBay_Shopify_De_xuat_taomua.com.xlsx: Khao sat 5 nen tang + lo trinh 5 giai doan
- Bao_cao_cap_nhat_12_thang_Bien_Rong_taomua.com.pdf: Bao cao do thi tang truong
- Bao_cao_Khao_sat_Amazon_Walmart_Alibaba_eBay_Shopify_taomua.com.pdf: Bao cao khao sat 5 nen tang chi tiet co trich dan
- Dieu_le_Cong_ty_TNHH_Cong_nghe_Thuong_mai_9MUA.pdf: Dieu le 9MUA
- Bang_Bien_Rong_Sau_Thue_Phi_15_150_Chuan_Ke_toan + Bang_Bien_LN_linh_dong_15_150_Phan_quyen_AI_CEO + Bang_Von_luu_dong_Rui_ro_Ton_kho: Cac file bien, von, phan quyen truoc do

## 13. CONTACT & APPROVAL
CEO: Nguyen Hai - hai@9mua.com - MB Bank 0331 09MUA 9999
Legal taomua.com: Le Huynh Nhu (Vietnam)
Investor: CONG TY CO PHAN NU HOANG NOI THAT MST 0316437942 (temporarily suspended)
Working capital: 30% + risk reserve 15% =45% revenue, turnover >3x/month
Risk reserve scenarios: Capital break, supply chain break, inventory damage, factory defect, trend drop
AI automation: 95-98% AI + 2-5% human CEO, autonomous sourcing, Cobot LATR Platform

END OF TECHNICAL SPEC - CLAUDE CODE READY - DO NOT ASK AGAIN - IMPLEMENT DIRECTLY
