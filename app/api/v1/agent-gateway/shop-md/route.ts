import { listProducts } from '@/lib/catalog';
import { LEGAL } from '@/lib/legal';

// Danh mục dạng Markdown cho AI agent (ChatGPT, Claude, Gemini…) đọc và đặt hàng sỉ thay người mua.
// Công khai: chỉ có giá bán, không có chi phí hay biên.
async function render(req: Request) {
  const origin = new URL(req.url).origin;
  const items = await listProducts({});
  const lines = [
    '# taomua.com — danh mục sỉ',
    '',
    `Người bán: ${LEGAL.name}, MST ${LEGAL.taxCode}. Giá đã gồm VAT 8%, đơn vị VND, theo bậc số lượng.`,
    '',
    '## Cách đặt hàng',
    `POST ${origin}/api/orders với JSON: {"name","phone","address","note","lines":[{"id":"<product id>","qty":<số lượng>}]}`,
    'Số lượng tối thiểu 10 hoặc MOQ của sản phẩm. Đơn lớn cần người duyệt trước khi thanh toán. Tiền được giữ đến khi người mua xác nhận đã nhận hàng.',
    'AI agent đặt hàng thay người mua phải được taomua cấp hạn mức chi (10, 50 hoặc 100 triệu mỗi đơn).',
    '',
    '## Sản phẩm',
    '',
    '| id | Tên | Danh mục | MOQ | 10+ | 50+ | 100+ | 500+ | TrustScore |',
    '|---|---|---|---|---|---|---|---|---|',
    ...items.map((p) => `| ${p.id} | ${p.name.replace(/\|/g, '/')} | ${p.category} | ${Math.max(10, p.moq)} | ${p.price_taomua_10} | ${p.price_taomua_50} | ${p.price_taomua_100} | ${p.price_taomua_500} | ${p.trust_score ?? ''} |`),
    '',
    items.some((p) => p.is_simulated) ? '> Lưu ý: đây là bản thử nghiệm, sản phẩm là dữ liệu giả lập.' : '',
  ];
  return new Response(lines.join('\n'), { headers: { 'content-type': 'text/markdown; charset=utf-8', 'cache-control': 'public, max-age=300' } });
}

export const GET = render;
export const POST = render;
