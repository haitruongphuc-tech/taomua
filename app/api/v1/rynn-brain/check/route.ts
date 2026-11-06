import { apiAuth, json, handle } from '@/lib/api';
import { one } from '@/lib/db';
import { isUuid } from '@/lib/catalog';
import { audit } from '@/lib/audit';
import { connectorEnabled } from '@/lib/connectors';

// Spec #11 RynnBrain QC. Input {product_id, image_url} hoặc kết quả kiểm {checked, defects} → {defect_rate, passed, details}.
// Đạt khi tỉ lệ lỗi ≤ 2% (QC ≥ 98%). Có QC_VISION_API_URL thì gửi ảnh cho dịch vụ thị giác; không thì nhận số kiểm tay / camera tại kho.
export async function POST(req: Request) {
  const a = await apiAuth(req, 'orders.fulfil');
  if (a instanceof Response) return a;
  return handle(async () => {
    const b = await req.json().catch(() => ({}));
    if (!isUuid(String(b.product_id ?? ''))) return json({ error: 'product_id không hợp lệ' }, 400);
    let checked = Math.round(Number(b.checked)), defects = Math.round(Number(b.defects));
    let source = 'KIEM_TAY';
    if (!(checked > 0) && b.image_url) {
      if (!connectorEnabled('RYNNBRAIN')) {
        return json({ error: 'Chưa kết nối dịch vụ camera QC', detail: 'Nhập QC_VISION_API_URL, QC_VISION_API_KEY trong .env, hoặc gửi kết quả kiểm {checked, defects}.' }, 501);
      }
      const r = await fetch(process.env.QC_VISION_API_URL!, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.QC_VISION_API_KEY}` },
        body: JSON.stringify({ image_url: String(b.image_url).slice(0, 1000) }) });
      if (!r.ok) return json({ error: `Dịch vụ QC trả lỗi ${r.status}` }, 502);
      const v = await r.json();
      checked = Math.round(Number(v.checked ?? 100)); defects = Math.round(Number(v.defects ?? Number(v.defect_rate) * checked));
      source = 'CAMERA_AI';
    }
    if (!(checked > 0) || !(defects >= 0) || defects > checked) return json({ error: 'Cần checked > 0 và 0 ≤ defects ≤ checked' }, 400);
    const defectRate = Math.round((defects / checked) * 10000) / 100;
    const pass = Math.round((100 - defectRate) * 100) / 100;
    const p = await one('UPDATE products SET rynn_brain_pass=$2, updated_at=now() WHERE id=$1 RETURNING id, name', [b.product_id, pass]);
    if (!p) return json({ error: 'Không tìm thấy sản phẩm' }, 404);
    await audit(a.actor, 'product.qc', 'product', p.id, { checked, defects, pass, source });
    return json({ product_id: p.id, defect_rate: defectRate, qc_pass: pass, passed: defectRate <= 2,
      details: { checked, defects, source, rule: 'Đạt khi lỗi ≤ 2% (QC ≥ 98%). Lỗi > 2% thì không giải ngân cho xưởng, hoàn khách theo Trade Assurance.' } });
  });
}
