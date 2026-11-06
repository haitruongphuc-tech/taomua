import { apiAuth, json, handle } from '@/lib/api';
import { q } from '@/lib/db';
import { audit } from '@/lib/audit';
import { SITE_FIELDS, isSiteKey, siteContent, canvasCommand } from '@/lib/site';

// Canvas: sửa nội dung giao diện. Body {key, value} hoặc {command: "đổi tiêu đề trang chủ thành ..."} (cần AI_API_KEY).
export async function POST(req: Request) {
  const a = await apiAuth(req, 'channels.edit');
  if (a instanceof Response) return a;
  return handle(async () => {
    const b = await req.json().catch(() => ({}));
    let key = String(b.key ?? ''), value = typeof b.value === 'string' ? b.value : null;
    if (b.command) {
      const r = await canvasCommand(String(b.command), await siteContent());
      if (!r) return json({ error: 'Không hiểu lệnh, hoặc chưa có AI_API_KEY. Gửi {key, value}.', keys: Object.keys(SITE_FIELDS) }, 400);
      ({ key, value } = r);
    }
    if (!isSiteKey(key) || value === null) return json({ error: 'Cần key hợp lệ và value', keys: Object.keys(SITE_FIELDS) }, 400);
    const v = value.trim().slice(0, SITE_FIELDS[key].max);
    await q(`INSERT INTO site_content(key, value, updated_by, updated_at) VALUES ($1,$2,$3,now())
      ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_by=EXCLUDED.updated_by, updated_at=now()`, [key, v, a.userId]);
    await audit(a.actor, 'canvas.edit', 'site_content', key, { value: v });
    return json({ key, value: v });
  });
}
