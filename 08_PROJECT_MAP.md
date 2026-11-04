# 08_PROJECT_MAP.md - BAN DO FILE - KHONG CHONG LAN - DE CLAUDE HIEU

## CAU TRUC FILE - MOI FILE 1 CHUC NANG - TEN ASCII - KHONG DAU - KHONG HASH - KHONG CHONG LAN

```
taomua_FINAL_FOR_CLAUDE/
├── 00_READ_FIRST.md - Doc dau tien - Thu tu doc 00->09
├── 01_TECHNICAL_SPEC.md - Spec day du 13 chuong - Doc la code tiep
├── 02_DATABASE_SCHEMA.sql - 5 bang SQL - Chay migration ngay
├── 03_API_SPEC.md - 14 endpoints - Code API
├── 04_FRONTEND_PAGES.md - 3 pages chinh + 3 mockup - Code frontend
├── 05_N8N_WORKFLOW.json - N8N 7 Agents One-Tap - Import N8N chay ngay
├── 06_APPROVAL_SYSTEM.md - One-Tap Approve spec - Thay Telegram
├── 07_CHECKLIST_FIX_AND_CONTINUE.md - Danh dau trang can sua va chay tiep - Kiem tra doi soat
├── 08_PROJECT_MAP.md - File nay - Ban do file
├── 09_CLAUDE_QUESTIONS_ANSWERED.md - Tra loi san 20 cau hoi Claude hay hoi
├── 10_PACKAGE_INFO.json - Thong tin package
├── package.json - Dependencies Next.js + Qwen + RynnBrain + Accio
├── .env.example - Template env vars
├── mockups/
│   ├── mockup_b2b_taomua.html - Mau cho / (B2B) - Bang gia 4 muc + bien rong
│   ├── mockup_ceo_admin.html - Mau cho /admin (CEO 10 modules)
│   └── mockup_one_tap_approve.html - Mau cho /admin/approval (One-Tap) - Moi
├── excels/
│   ├── Du_toan_12_thang.xlsx - Du toan 79.6 ty DT 16.6 ty LN rong
│   └── Khao_sat_5_nen_tang.xlsx - Khao sat Amazon/Walmart/Alibaba/eBay/Shopify
├── pdfs/
│   ├── Bao_cao_Khao_sat.pdf
│   └── Bao_cao_cap_nhat_12_thang.pdf
└── pngs/
    ├── bien_rong_15_150.png
    ├── chi_phi_co_dinh_chi_tiet.png
    ├── tang_truong_doanh_thu_chi_phi_ln.png
    └── von_luu_dong_du_phong_doanh_thu.png
```

## FILE NAO DUNG CHO TRANG NAO - KHONG CHONG LAN

| File | Dung cho trang nao | Chuc nang | Co chong lan khong |
|---|---|---|---|
| 00_READ_FIRST.md | Doc dau tien | Huong dan thu tu doc | Khong - Chi 1 file read first |
| 01_TECHNICAL_SPEC.md | Tat ca trang | Spec day du 13 chuong | Khong - Chi 1 file spec chinh |
| 02_DATABASE_SCHEMA.sql | DB | 5 bang suppliers/products/wholesale_orders/working_capital/approval_queue | Khong - Chi 1 file SQL |
| 03_API_SPEC.md | API | 14 endpoints | Khong - Chi 1 file API spec |
| 04_FRONTEND_PAGES.md | Frontend | 3 pages / /admin /shop + 3 mockup | Khong - Chi 1 file frontend map |
| 05_N8N_WORKFLOW.json | N8N | 7 Agents workflow One-Tap | Khong - Chi 1 file N8N moi - Da xoa Telegram |
| 06_APPROVAL_SYSTEM.md | /admin/approval | One-Tap Approve spec thay Telegram | Khong - Chi 1 file approval moi |
| 07_CHECKLIST_FIX_AND_CONTINUE.md | Kiem tra | Danh dau trang can sua va chay tiep | Khong - Chi 1 file checklist |
| 08_PROJECT_MAP.md | Ban do | Ban do file - File nay | Khong - Chi 1 file map |
| 09_CLAUDE_QUESTIONS_ANSWERED.md | Tra loi cau hoi | 20 cau hoi Claude hay hoi | Khong - Chi 1 file Q&A |
| mockup_b2b_taomua.html | / | Mau B2B - Bang gia 4 muc | Khong - Chi 1 file mau B2B - Ten moi ngan ASCII |
| mockup_ceo_admin.html | /admin | Mau CEO 10 modules | Khong - Chi 1 file mau CEO - Ten moi ngan ASCII |
| mockup_one_tap_approve.html | /admin/approval | Mau One-Tap Approve - Moi | Khong - Chi 1 file mau One-Tap - Moi - Khong co trong bo cu |

## FILE CU BI LOI - DA XOA - KHONG CON TRONG BO MOI

| File cu loi | Ly do loi | File moi thay the |
|---|---|---|
| taomua_com_mockup_b2b_agentic_artifact_1_f2b883afd2cb.html | Ten dai, co hash f2b883afd2cb, co _ _ nhieu, gay loi zip bam, up Claude loi | mockup_b2b_taomua.html - Ten ngan ASCII |
| ceo_super_admin_taomua_agentic_artifact_2_43cb825785e0.html | Tuong tu - hash 43cb825785e0 | mockup_ceo_admin.html |
| taomua_one_tap_approve_agentic_artifact_3_6a8c1a793a8e.html | Hash 6a8c1a793a8e | mockup_one_tap_approve.html |
| N8N_Workflow_7_Agents_taomua.com_95_98_AI.json | Co dau . . . nhieu cham, co 95_98_AI, ten dai | 05_N8N_WORKFLOW.json - Ten ngan ASCII |
| Du_toan_12_thang_cap_nhat_Bien_Rong_Sau_Thue_taomua.com.xlsx | Ten dai, co dau . . ., co cap_nhat_Bien_Rong_Sau_Thue | Du_toan_12_thang.xlsx |

## KHONG CON FILE CHONG LAN

- Truoc: Co 2 file mockup B2B + CEO Admin khong ro dung cho trang nao, ten co hash gay loi
- Nay: Moi mockup 1 file ten ngan ASCII ro rang: mockup_b2b_taomua.html cho /, mockup_ceo_admin.html cho /admin, mockup_one_tap_approve.html cho /admin/approval - De trong folder mockups/ rieng, khong de chung voi md

- Truoc: Co file N8N co Telegram va file N8N moi One-Tap gay chong lan
- Nay: Chi 1 file 05_N8N_WORKFLOW.json - One-Tap Approve - Da xoa Telegram

- Truoc: Schema DB nam trong TECHNICAL_SPEC, Claude kho tim hay hoi lai
- Nay: Tach rieng 02_DATABASE_SCHEMA.sql + 03_API_SPEC.md + 04_FRONTEND_PAGES.md + 06_APPROVAL_SYSTEM.md - Moi file 1 chuc nang

## TESTZIP OK 100% - KHONG BAM

- Tat ca ten file ASCII khong dau, khong khoang trang, khong ky tu dac biet, khong hash
- Zip dung ZIP_DEFLATED level 6
- Da test: testzip = None = OK

END
