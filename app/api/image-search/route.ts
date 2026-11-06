import { NextResponse } from 'next/server';
import { chat, aiConfig } from '@/lib/ai';
import { categories } from '@/lib/catalog';
import { logConnector } from '@/lib/sim';

// Tìm hàng bằng ảnh (spec chương 6: Image search, học eBay / Walmart Sparky). Ảnh không lưu lại.
// Có AI_API_KEY + AI_VISION_MODEL (vd qwen-vl-max, gpt-4o-mini) thì AI nhìn ảnh và viết từ khóa; chưa có thì GIẢ LẬP theo tên file ảnh.
export async function POST(req: Request) {
  const fd = await req.formData().catch(() => null);
  const file = fd?.get('image');
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: 'Chọn một ảnh.' }, { status: 400 });
  if (file.size > 5_000_000 || !/^image\/(jpeg|png|webp|gif)$/.test(file.type)) return NextResponse.json({ error: 'Ảnh JPG/PNG/WEBP, tối đa 5 MB.' }, { status: 400 });
  const cats = await categories();
  const vision = process.env.AI_VISION_MODEL;
  if (aiConfig().key && vision) {
    const b64 = Buffer.from(await file.arrayBuffer()).toString('base64');
    const out = await fetch(`${aiConfig().baseUrl}/chat/completions`, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${aiConfig().key}` },
      body: JSON.stringify({ model: vision, temperature: 0, messages: [
        { role: 'system', content: `Nhìn ảnh sản phẩm, trả về đúng 2-5 từ khóa tiếng Việt để tìm hàng sỉ (tên loại hàng), không giải thích. Ngành có sẵn: ${cats.join(', ')}.` },
        { role: 'user', content: [{ type: 'image_url', image_url: { url: `data:${file.type};base64,${b64}` } }] },
      ] }),
    }).then((r) => r.json()).catch(() => null);
    const query = String(out?.choices?.[0]?.message?.content ?? '').replace(/["\n]/g, ' ').trim().slice(0, 80);
    if (query) { await logConnector('IMAGE_SEARCH', 'THAT', { file: file.name, size: file.size }, { query }); return NextResponse.json({ query, gia_lap: false }); }
  }
  // GIẢ LẬP: lấy từ khóa từ tên file (vd "ao-thun-3d.jpg" → "ao thun 3d").
  const fromName = file.name.replace(/\.[a-z0-9]+$/i, '').replace(/[-_.]+/g, ' ').replace(/\b(img|image|photo|anh|dsc|screenshot|\d{3,})\b/gi, ' ').replace(/\s+/g, ' ').trim();
  const query = (fromName || cats[0] || '').slice(0, 80);
  await logConnector('IMAGE_SEARCH', 'GIA_LAP', { file: file.name, size: file.size }, { query });
  return NextResponse.json({ query, gia_lap: true, note: 'GIẢ LẬP: chưa có AI nhìn ảnh, đoán theo tên file. Nhập AI_API_KEY + AI_VISION_MODEL để AI nhận diện ảnh thật.' });
}
