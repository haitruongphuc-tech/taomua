// Lớp kênh bán: taomua bán trên bất kỳ nền tảng nào. Mỗi nền tảng là một dòng trong sales_channels.
// Hiện mọi kênh ngoài chạy thủ công (nhập đơn bằng form hoặc CSV, xuất CSV sản phẩm để đăng).
// Khi có API của nền tảng, viết một ChannelConnector và đăng ký vào CONNECTORS theo mã kênh.
import { createOrder, OrderError } from './orders';
import { calcMargin } from './pricing';
import { q } from './db';
import type { Actor } from './audit';

export interface ChannelConnector {
  /** Đăng hoặc cập nhật giá một sản phẩm lên nền tảng. Trả về mã sản phẩm phía nền tảng. */
  pushListing(listing: { productId: string; sku: string; name: string; price: number; description: string }): Promise<{ externalSku: string; url?: string }>;
  /** Lấy đơn mới kể từ thời điểm cho trước. */
  pullOrders(since: Date): Promise<ChannelOrderRow[]>;
}

export const CONNECTORS: Record<string, ChannelConnector> = {
  // Chưa có kết nối API nào. Ví dụ khi có: shopee: new ShopeeConnector(process.env.SHOPEE_PARTNER_KEY!)
};

export type ChannelOrderRow = { externalRef: string; name: string; phone: string; address: string; sku: string; quantity: number; unitPrice: number };

export function listingMargin(price: number, unitCost: number, inputVat: number, feePct: number) {
  return calcMargin({ revenue: price, cost: unitCost, inputVat, channelFeePct: feePct });
}

/** Đọc CSV đơn từ kênh. Cột: ma_don_kenh,ten_khach,sdt,dia_chi,sku,so_luong,don_gia (dòng đầu là tiêu đề). */
export function parseOrderCsv(text: string): { rows: ChannelOrderRow[]; errors: string[] } {
  const lines = text.replace(/\r/g, '').split('\n').filter((l) => l.trim());
  const rows: ChannelOrderRow[] = [];
  const errors: string[] = [];
  if (!lines.length) return { rows, errors: ['CSV trống.'] };
  const header = splitCsv(lines[0]).map((h) => h.trim().toLowerCase());
  const need = ['ma_don_kenh', 'ten_khach', 'sdt', 'dia_chi', 'sku', 'so_luong', 'don_gia'];
  const idx = need.map((n) => header.indexOf(n));
  if (idx.some((i) => i < 0)) return { rows, errors: [`Thiếu cột: ${need.filter((_, k) => idx[k] < 0).join(', ')}`] };
  for (let i = 1; i < lines.length && i <= 2000; i++) {
    const c = splitCsv(lines[i]);
    const r = {
      externalRef: c[idx[0]]?.trim(), name: c[idx[1]]?.trim(), phone: c[idx[2]]?.trim(), address: c[idx[3]]?.trim(),
      sku: c[idx[4]]?.trim(), quantity: Number(c[idx[5]]), unitPrice: Number(String(c[idx[6]] ?? '').replace(/[.,\s]/g, '')),
    };
    if (!r.externalRef || !r.sku || !(r.quantity > 0) || !(r.unitPrice > 0)) { errors.push(`Dòng ${i + 1}: thiếu hoặc sai dữ liệu.`); continue; }
    rows.push(r as ChannelOrderRow);
  }
  return { rows, errors };
}

function splitCsv(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') quoted = false; else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur);
  return out;
}

/** Nhập đơn từ kênh: gom các dòng cùng mã đơn kênh thành một đơn, mỗi đơn đi qua cùng quy tắc duyệt. */
export async function importChannelOrders(channelCode: string, rows: ChannelOrderRow[], actor: Actor) {
  const skus = Array.from(new Set(rows.map((r) => r.sku)));
  const prods = await q<{ id: string; sku: string }>('SELECT id, sku FROM products WHERE sku = ANY($1)', [skus]);
  const bySku = new Map(prods.map((p) => [p.sku, p.id]));
  const groups = new Map<string, ChannelOrderRow[]>();
  for (const r of rows) groups.set(r.externalRef, [...(groups.get(r.externalRef) ?? []), r]);
  const created: { code: string; level: number; pending: boolean; id: string; tong_dt: number; bien: number }[] = [];
  const errors: string[] = [];
  for (const [ref, rs] of Array.from(groups)) {
    const missing = rs.filter((r) => !bySku.has(r.sku)).map((r) => r.sku);
    if (missing.length) { errors.push(`${ref}: không có SKU ${missing.join(', ')}`); continue; }
    try {
      const o = await createOrder({
        channelCode, externalRef: ref, customer: { name: rs[0].name, phone: rs[0].phone }, address: rs[0].address,
        items: rs.map((r) => ({ productId: bySku.get(r.sku)!, quantity: r.quantity, unitPrice: r.unitPrice })),
      }, actor);
      created.push({ code: o.code, level: o.cap_duyet, pending: o.approval_status === 'PENDING', id: o.id, tong_dt: o.tong_dt, bien: o.bien_rong_tren_chi_phi });
    } catch (e) {
      if (e instanceof OrderError) errors.push(`${ref}: ${e.message}`); else throw e;
    }
  }
  return { created, errors };
}
