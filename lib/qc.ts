// RYN-TRACE kiểm chất lượng (spec RynnBrain QC 98%): nhận kết quả kiểm tay / camera tại kho, hoặc gửi ảnh cho dịch vụ thị giác.
// Chưa có khóa camera thì chấm GIẢ LẬP (cố định theo ảnh) và gắn nhãn.
import { one } from './db';
import { audit, type Actor } from './audit';
import { UserError } from './action';
import { connectorEnabled } from './connectors';
import { simQc, logConnector } from './sim';

export async function recordQc(productId: string, input: { checked?: number; defects?: number; imageUrl?: string }, actor: Actor) {
  let checked = Math.round(Number(input.checked)), defects = Math.round(Number(input.defects));
  let source: 'KIEM_TAY' | 'CAMERA_AI' | 'CAMERA_GIA_LAP' = 'KIEM_TAY';
  if (!(checked > 0) && input.imageUrl) {
    const url = String(input.imageUrl).slice(0, 1000);
    if (connectorEnabled('RYNNBRAIN')) {
      const r = await fetch(process.env.QC_VISION_API_URL!, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.QC_VISION_API_KEY}` },
        body: JSON.stringify({ image_url: url }) });
      if (!r.ok) throw new UserError(`Dịch vụ camera QC trả lỗi ${r.status}`);
      const v = await r.json();
      checked = Math.round(Number(v.checked ?? 100)); defects = Math.round(Number(v.defects ?? Number(v.defect_rate) * checked));
      source = 'CAMERA_AI';
      await logConnector('RYNNBRAIN', 'THAT', { url }, v);
    } else {
      const v = simQc(url);
      checked = v.checked; defects = v.defects; source = 'CAMERA_GIA_LAP';
      await logConnector('RYNNBRAIN', 'GIA_LAP', { url }, v);
    }
  }
  if (!(checked > 0) || !(defects >= 0) || defects > checked) throw new UserError('Cần số đã kiểm > 0 và 0 ≤ số lỗi ≤ số đã kiểm, hoặc ảnh để camera chấm.');
  const defectRate = Math.round((defects / checked) * 10000) / 100;
  const pass = Math.round((100 - defectRate) * 100) / 100;
  const p = await one('UPDATE products SET rynn_brain_pass=$2, updated_at=now() WHERE id=$1 RETURNING id, name', [productId, pass]);
  if (!p) throw new UserError('Không tìm thấy sản phẩm.');
  await audit(actor, 'product.qc', 'product', p.id, { checked, defects, pass, source });
  return { product_id: p.id, name: p.name, defect_rate: defectRate, qc_pass: pass, passed: defectRate <= 2, checked, defects, source, gia_lap: source === 'CAMERA_GIA_LAP' };
}
