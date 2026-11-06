import { currentUser, can } from '@/lib/auth';
import { q } from '@/lib/db';

// Sổ bán hàng theo năm để nhập MISA / FAST: mỗi dòng một đơn đã nhận tiền (trừ đơn hoàn tiền).
export async function GET(req: Request) {
  const u = await currentUser();
  if (!can(u, 'finance.view')) return new Response('Không có quyền', { status: 403 });
  const year = Math.min(2100, Math.max(2020, Number(new URL(req.url).searchParams.get('nam')) || new Date().getFullYear()));
  const rows = await q(`SELECT to_char(o.paid_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD') AS ngay, o.code, cu.name, cu.tax_code, ch.name AS kenh, o.ship_country,
      o.tong_dt - o.vat_8 AS chua_vat, o.vat_8, o.tong_dt, o.vat_dau_vao, o.tong_chi_phi_truoc_thue, o.phi_kenh, o.phi_mb_1, o.thue_tndn_20, o.ln_rong_sau_thue,
      o.ship_fee, o.invoice_no
    FROM wholesale_orders o JOIN customers cu ON cu.id=o.customer_id JOIN sales_channels ch ON ch.id=o.channel_id
    WHERE o.payment_status='DA_NHAN' AND o.trade_assurance_status <> 'REFUND' AND extract(year FROM o.paid_at AT TIME ZONE 'Asia/Ho_Chi_Minh') = $1
    ORDER BY o.paid_at`, [year]);
  const esc = (v: unknown) => {
    let s = String(v ?? '');
    if (/^[=+\-@]/.test(s)) s = "'" + s; // chặn công thức khi mở bằng Excel
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = 'ngay,ma_don,khach,mst_khach,kenh,noi_giao,doanh_thu_chua_vat,vat_8,tong_thanh_toan_hang,vat_dau_vao,chi_phi_truoc_thue,phi_kenh,phi_ngan_hang,tndn_tam_tinh,ln_rong,phi_van_chuyen_thu_ho,so_hoa_don';
  const csv = [head, ...rows.map((r) => [r.ngay, r.code, r.name, r.tax_code, r.kenh, r.ship_country, r.chua_vat, r.vat_8, r.tong_dt, r.vat_dau_vao,
    r.tong_chi_phi_truoc_thue, r.phi_kenh, r.phi_mb_1, r.thue_tndn_20, r.ln_rong_sau_thue, r.ship_fee, r.invoice_no].map(esc).join(','))].join('\n');
  return new Response('﻿' + csv, {
    headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="so-ban-hang-${year}.csv"` },
  });
}
