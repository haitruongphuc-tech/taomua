# 03_API_SPEC.md - 14 API ENDPOINTS - TAOMUA.COM

## TONG QUAN
Base URL: https://taomua.com/api/v1
Auth: Bearer token - MB Bank BIZ API + Supabase

## 14 ENDPOINTS - KHONG CHONG LAN - MOI ENDPOINT 1 CHUC NANG

1. POST /api/v1/trend-hunter/scan
   - Chuc nang: Quet trend tu TikTok/1688/Amazon Best Seller/Walmart - Qwen3.7-Max + RynnBrain + Accio
   - Input: {source: 'TIKTOK|1688|AMAZON|WALMART', limit: 50}
   - Output: {trends: [{name, score 0-100, source}]}
   - N8N: Agent 1

2. POST /api/v1/supplier-brain/find
   - Tim 50 xuong/sp, 3 xuong du phong/sp
   - Input: {product_name, category}
   - Output: {suppliers: [{name, source, trust_score, price, moq, defect_rate}]}
   - N8N: Agent 2

3. POST /api/v1/supplier-brain/trust-score
   - Tinh TrustScore 17 factors: response <90s 18% + verified cert + defect <2% + on-time + inventory_sync
   - Input: {supplier_id}
   - Output: {trust_score 0-100, factors: {response_time, verified, defect, on_time, inventory}}
   - N8N: Agent 2

4. POST /api/v1/pricing-engine/calculate
   - Tinh bien rong 15-150% sau thue phi chuan ke toan - QUAN TRONG NHAT
   - Cong thuc: Tong chi phi truoc thue = Bien (COGS+ship+marketing+logistics+AI+phap ly+9PAY) + Co dinh, VAT 8% = DT*0.08, MB 1% = DT*0.01, LN truoc TNDN = DT - Tong chi phi - VAT - MB, TNDN 20%, LN rong = truoc - TNDN, Bien = LN rong / Tong chi phi *100% =15-150% (8-52% tren DT)
   - Input: {cost, fee, quantity, tier}
   - Output: {price_10, price_50, price_100, price_500, bien_tren_chi_phi, bien_tren_dt, cap_duyet 1-5, von_luu_dong_30, du_phong_15, tong_von_can_45}
   - N8N: Agent 3

5. POST /api/v1/approval/queue - MOI - THAY THE TELEGRAM - ONE-TAP APPROVE
   - Tao duyet don trong approval_queue - One-Tap + Zalo OA + Email
   - Input: {product_name, bien, cap, price, total_cost, quantity, tier, method: ONE_TAP|ZALO_OA|EMAIL}
   - Output: {approval_id, status PENDING/APPROVED_BY_AI, web_link https://taomua.com/admin/approval/..., method}
   - Logic: Cap1 15-30% <5M AI tu duyet <2p -> status APPROVED_BY_AI, Cap2-5 luu PENDING -> gui Email + Zalo OA + Web Push den /admin
   - N8N: Agent 4 - Simple Approval Logic

6. POST /api/v1/approval/approve - MOI - DUYET 1 CHAM
   - CEO bam nut DUYET trong /admin
   - Input: {approval_id, action: APPROVED|REJECTED, approved_by}
   - Output: {status, approved_at}
   - N8N: Cap nhat approval_queue

7. POST /api/v1/agent-gateway/shop-md
   - ChatGPT/Claude/Gemini mua si qua taomua.com - shop.md 1B products
   - Input: {query, agent: CHATGPT|CLAUDE|GEMINI}
   - Output: {products, add_to_cart_link, checkout_link}
   - Hoc Shopify Fall 26 Exponential shop.md

8. POST /api/v1/agent-gateway/profiles
   - Agent Profiles han muc 10tr/50tr/100tr - UCP/MCP/AP2
   - Input: {customer_id, profile: 10|50|100}
   - Output: {limit, spent, remaining, agent_gateway: UCP/MCP/AP2}

9. POST /api/v1/wfs/fulfillment
   - WFS taomua fulfillment - Tang 50% GMV nhu Walmart WFS
   - Input: {order_id, type: DROPSHIP|WFS|SAME_DAY_30MIN}
   - Output: {tracking_id, status, wfs_type}

10. POST /api/v1/trade-assurance/hold
    - Trade Assurance hold money den khi nhan hang, hoan tien 100% neu loi
    - Input: {order_id, amount, action: HOLD|RELEASED|REFUND}
    - Output: {status, amount_hold, refund_amount}

11. POST /api/v1/rynn-brain/check
    - RynnBrain camera defect check 98% live - Vuot Amazon Vulcan 75%
    - Input: {product_id, image_url}
    - Output: {defect_rate, passed: true/false, details}

12. POST /api/v1/latr/test
    - LATR test 50-100 cai, CTR realtime, >3% moi scale - Hoc Shein LATR
    - Input: {product_id, test_qty 50-100}
    - Output: {test_id, ctr, status: TESTING|SCALING|STOPPED}

13. POST /api/v1/scintilla/analytics
    - Scintilla commerce intelligence - Phan tich hieu suat ban si - Hoc Walmart Scintilla
    - Input: {product_id, period}
    - Output: {sales, roas, ctr, bien_rong, von_luu_dong, vong_quay}

14. POST /api/v1/working-capital/calculate
    - Tinh von luu dong 30% + du phong 15% =45% + vong quay >3 + bien an toan >20%
    - Input: {tong_dt}
    - Output: {von_luu_dong_30, du_phong_15, tong_von_can_45, vong_quay, bien_an_toan, status SAFE|WARNING|DANGER, mb_bank_balance}

## KHONG CO TELEGRAM API NUA - DA BO - THAY BANG APPROVAL QUEUE + ONE-TAP
