import { apiAuth, json, handle } from '@/lib/api';
import { isUuid } from '@/lib/catalog';
import { recordQc } from '@/lib/qc';

// Spec #11 RynnBrain QC. Input {product_id, image_url} hoặc kết quả kiểm {checked, defects} → {defect_rate, passed, details}.
// Đạt khi lỗi ≤ 2% (QC ≥ 98%). Có QC_VISION_API_URL + KEY thì camera AI chấm thật; chưa có thì GIẢ LẬP (gia_lap: true).
export async function POST(req: Request) {
  const a = await apiAuth(req, 'orders.fulfil');
  if (a instanceof Response) return a;
  return handle(async () => {
    const b = await req.json().catch(() => ({}));
    if (!isUuid(String(b.product_id ?? ''))) return json({ error: 'product_id không hợp lệ' }, 400);
    const r = await recordQc(b.product_id, { checked: b.checked, defects: b.defects, imageUrl: b.image_url }, a.actor);
    return json({ ...r, details: { checked: r.checked, defects: r.defects, source: r.source, gia_lap: r.gia_lap,
      rule: 'Đạt khi lỗi ≤ 2% (QC ≥ 98%). Lỗi > 2% thì không giải ngân cho xưởng, hoàn khách theo Trade Assurance.' } });
  });
}
