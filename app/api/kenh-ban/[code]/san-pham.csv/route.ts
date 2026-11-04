import { currentUser, can } from '@/lib/auth';
import { q } from '@/lib/db';

// Xuất danh sách sản phẩm của một kênh để đăng thủ công lên nền tảng (khi chưa có API).
export async function GET(_: Request, { params }: { params: { code: string } }) {
  const u = await currentUser();
  if (!can(u, 'listings.edit')) return new Response('Không có quyền', { status: 403 });
  const rows = await q(`SELECT p.sku, p.name, p.category, p.description, l.price, l.status, l.external_sku
    FROM channel_listings l JOIN products p ON p.id=l.product_id JOIN sales_channels ch ON ch.id=l.channel_id WHERE ch.code=$1 ORDER BY p.name`, [params.code]);
  const esc = (v: unknown) => {
    let s = String(v ?? '');
    if (/^[=+\-@]/.test(s)) s = "'" + s; // chặn công thức khi mở bằng Excel
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = ['sku,ten,danh_muc,mo_ta,gia,trang_thai,ma_tren_kenh', ...rows.map((r) => [r.sku, r.name, r.category, r.description, r.price, r.status, r.external_sku].map(esc).join(','))].join('\n');
  return new Response('﻿' + csv, {
    headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${params.code.replace(/[^a-z0-9-]/g, '')}-san-pham.csv"` },
  });
}
