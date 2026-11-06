import QRCode from 'qrcode';
import { headers } from 'next/headers';

/** QR truy xuất nguồn gốc (SVG vẽ phía máy chủ). Dùng SITE_URL nếu có, không thì địa chỉ đang truy cập. */
export default async function TraceQr({ sku, size = 140, label = true }: { sku: string; size?: number; label?: boolean }) {
  const h = headers();
  const base = process.env.SITE_URL || `${h.get('x-forwarded-proto') ?? 'http'}://${h.get('host') ?? 'localhost:3000'}`;
  const url = `${base.replace(/\/$/, '')}/truy-xuat/${encodeURIComponent(sku)}`;
  const svg = await QRCode.toString(url, { type: 'svg', margin: 1, width: size, errorCorrectionLevel: 'M' });
  return (
    <figure style={{ margin: 0, textAlign: 'center' }}>
      <div style={{ width: size, height: size, display: 'inline-block', background: '#fff' }} dangerouslySetInnerHTML={{ __html: svg }} />
      {label && <figcaption className="small muted"><a href={url}>Truy xuất nguồn gốc · 7 ngôn ngữ</a></figcaption>}
    </figure>
  );
}
