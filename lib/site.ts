// Canvas (spec: Canvas visual editor / Sidekick): nội dung giao diện cửa hàng chỉnh trên trang quản trị, không cần sửa code.
import { q } from './db';
import { chat, aiEnabled } from './ai';

export const SITE_FIELDS = {
  hero_title: { label: 'Tiêu đề lớn trang chủ', def: 'Nguồn hàng sỉ từ xưởng, giá theo số lượng', max: 120 },
  hero_text: { label: 'Đoạn giới thiệu trang chủ', def: 'Mỗi sản phẩm có xưởng chính và xưởng dự phòng, chấm điểm TrustScore. Giá giảm theo 4 bậc 10, 50, 100, 500 cái. Tiền được giữ đến khi bạn nhận hàng.', max: 400 },
  hero_cta: { label: 'Nút trang chủ', def: 'Chưa thấy hàng cần? Gửi yêu cầu báo giá', max: 60 },
  announcement: { label: 'Thông báo chạy trên đầu trang (để trống = ẩn)', def: '', max: 200 },
  shop_title: { label: 'Tiêu đề trang 9mua bán lẻ', def: '9mua · Mua lẻ', max: 60 },
} as const;
export type SiteKey = keyof typeof SITE_FIELDS;
export const isSiteKey = (k: string): k is SiteKey => k in SITE_FIELDS;

export async function siteContent(): Promise<Record<SiteKey, string>> {
  const rows = await q<{ key: string; value: string }>('SELECT key, value FROM site_content');
  const out = Object.fromEntries(Object.entries(SITE_FIELDS).map(([k, v]) => [k, v.def])) as Record<SiteKey, string>;
  for (const r of rows) if (isSiteKey(r.key)) out[r.key] = r.value;
  return out;
}

/** Sửa giao diện bằng lời (Sidekick): AI đổi câu lệnh tự nhiên thành {key, value}. Không có khóa AI thì trả null. */
export async function canvasCommand(command: string, current: Record<SiteKey, string>): Promise<{ key: SiteKey; value: string } | null> {
  if (!aiEnabled()) return null;
  const out = await chat([
    { role: 'system', content: `Bạn sửa nội dung trang bán hàng taomua.com. Các ô: ${JSON.stringify(Object.fromEntries(Object.entries(SITE_FIELDS).map(([k, v]) => [k, { mo_ta: v.label, toi_da: v.max, hien_tai: current[k as SiteKey] }])))}. Trả JSON {"key":"...","value":"..."} cho đúng một ô theo yêu cầu, tiếng Việt, không bịa giá hay khuyến mãi.` },
    { role: 'user', content: command.slice(0, 500) },
  ], { json: true });
  try {
    const j = JSON.parse(String(out).replace(/^```(json)?|```$/g, '').trim());
    if (isSiteKey(j.key) && typeof j.value === 'string') return { key: j.key, value: j.value.slice(0, SITE_FIELDS[j.key as SiteKey].max) };
  } catch { /* AI trả sai định dạng */ }
  return null;
}
