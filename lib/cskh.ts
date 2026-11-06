// CSKH AI 95% (spec RYN-SALES, module CSKH): phân loại câu hỏi và trả lời bằng dữ liệu thật trong hệ thống.
// Hỏi giá sỉ / tồn kho / trạng thái đơn / vận chuyển / thanh toán / hóa đơn → AI trả lời ngay.
// Khiếu nại, hoàn tiền → hướng dẫn gửi khiếu nại (AI phân loại, mức cao chuyển CEO).
// Câu tự do → AI LOCAL (Naive Bayes đoán ý định, BM25 tìm câu đã dạy) → AI ngôn ngữ có "trí nhớ" bài học (RAG) nếu có khóa → chuyển người.
import { q } from './db';
import { fold } from './sourcing';
import { matchProduct } from './agents/rules';
import { findOrderForCustomer } from './orders';
import { classifyIssue } from './complaints';
import { chat, aiEnabled } from './ai';
import { LEGAL } from './legal';
import { trainedAnswer, lessonRules, localAnswer, searchLessons, intentModel } from './lessons';

export type Intent = 'CHAO' | 'GIA' | 'TON_KHO' | 'DON_HANG' | 'VAN_CHUYEN' | 'THANH_TOAN' | 'HOA_DON' | 'KHIEU_NAI' | 'NGUOI_THAT' | 'KHAC';
export type Reply = { reply: string; intent: Intent; links: { label: string; href: string }[]; answeredBy: 'AI_QUY_TAC' | 'AI_LOCAL' | 'AI_NGON_NGU' | 'CHUYEN_NGUOI'; intentBy?: 'QUY_TAC' | 'AI_LOCAL'; lessonId?: number };

const w = (t: string, list: string[]) => list.some((x) => t.includes(` ${x} `));

/** Phân loại câu hỏi (thuần, kiểm thử được). */
export function detectIntent(message: string): Intent {
  const t = ` ${fold(message).replace(/[^a-z0-9]+/g, ' ').trim()} `;
  if (w(t, ['khieu nai', 'hoan tien', 'boi thuong', 'hang loi', 'bi loi', 'bi hong', 'hong', 'thieu hang', 'giao sai', 'doi hang', 'tra hang', 'refund', 'complaint', 'broken'])) return 'KHIEU_NAI';
  if (w(t, ['nguoi that', 'nhan vien', 'gap nguoi', 'tu van vien', 'human', 'agent', 'goi lai'])) return 'NGUOI_THAT';
  if (/\btm\d{4,}\b/.test(t) || w(t, ['don hang', 'don cua toi', 'tra cuu', 'ma don', 'trang thai', 'order status', 'track'])) return 'DON_HANG';
  if (w(t, ['hoa don', 'vat', 'xuat hoa don', 'mst', 'ma so thue', 'invoice'])) return 'HOA_DON';
  if (w(t, ['thanh toan', 'chuyen khoan', 'tai khoan', 'tra tien', 'giu tien', 'payment', 'pay'])) return 'THANH_TOAN';
  if (w(t, ['giao hang', 'van chuyen', 'ship', 'phi ship', 'bao lau', 'may ngay', 'quoc te', 'shipping', 'delivery'])) return 'VAN_CHUYEN';
  if (w(t, ['con hang', 'ton kho', 'het hang', 'co san', 'stock', 'moq', 'toi thieu'])) return 'TON_KHO';
  if (w(t, ['gia', 'bao nhieu', 'bao gia', 'gia si', 'chiet khau', 'price', 'how much', 'si'])) return 'GIA';
  if (w(t, ['chao', 'hello', 'hi', 'alo', 'xin chao'])) return 'CHAO';
  return 'KHAC';
}

/** Khách chat hay viết tắt ("giá sỉ áo thun 3D"): tính cả từ 2 ký tự, cần khớp ≥ 2 từ và ≥ 50% tên sản phẩm. */
export function chatMatch<T extends { name: string }>(message: string, products: T[]): T | null {
  const toks = (s: string) => fold(s).split(/[^a-z0-9]+/).filter((x) => x.length >= 2);
  const msg = new Set(toks(message));
  let best: { p: T; score: number } | null = null;
  for (const p of products) {
    const words = [...new Set(toks(p.name))];
    const hits = words.filter((x) => msg.has(x)).length;
    const score = hits / Math.max(1, words.length);
    if (hits >= Math.min(2, words.length) && score >= 0.5 && (!best || score > best.score)) best = { p, score };
  }
  return best?.p ?? null;
}

const money = (n: number) => `${Number(n).toLocaleString('vi-VN')} đ`;
const STATUS: Record<string, string> = {
  CHO_DUYET: 'đang chờ taomua xác nhận', CHO_THANH_TOAN: 'đã xác nhận, chờ bạn chuyển khoản', DANG_CHUAN_BI: 'đã nhận tiền, xưởng đang chuẩn bị hàng',
  DANG_GIAO: 'đang giao', DA_GIAO: 'đã giao, chờ bạn xác nhận nhận hàng', HOAN_TAT: 'đã hoàn tất', TU_CHOI: 'không nhận được', HUY: 'đã hủy',
};

export async function answer(message: string, ctx: { phone?: string } = {}): Promise<Reply> {
  const msg = message.trim().slice(0, 1000);
  let intent = detectIntent(msg);
  let intentBy: Reply['intentBy'] = 'QUY_TAC';
  let lessonId: number | undefined;
  const links: Reply['links'] = [];
  const done = (reply: string, by: Reply['answeredBy'] = 'AI_QUY_TAC'): Reply => ({ reply, intent, links, answeredBy: by, intentBy, lessonId });

  // CEO / kỹ sư đã dạy câu trả lời chuẩn (Quản trị → Chat & huấn luyện agent) thì dùng trước; tra đơn cụ thể và khiếu nại vẫn theo luồng thật.
  if (!/TM\d{4,}/i.test(msg) && intent !== 'KHIEU_NAI') {
    const taught = await trainedAnswer(msg);
    if (taught) { lessonId = taught.id; return done(taught.answer); }
  }
  // Luật không nhận ra ý định → AI LOCAL (Naive Bayes, tự học từ nhật ký chat) đoán.
  if (intent === 'KHAC') {
    const p = (await intentModel()).nb.predict(msg);
    if (p && p.prob >= 0.7 && p.label !== 'KHAC') { intent = p.label as Intent; intentBy = 'AI_LOCAL'; }
  }

  if (intent === 'DON_HANG') {
    const code = msg.toUpperCase().match(/TM\d{4,}/)?.[0];
    const phone = ctx.phone || msg.match(/(\+?\d[\d\s.]{7,14}\d)/)?.[1];
    links.push({ label: 'Tra cứu đơn', href: code ? `/don-hang?ma=${code}` : '/don-hang' });
    if (!code) return done('Bạn gửi giúp mã đơn (dạng TM1234) và số điện thoại đặt hàng, AI tra ngay cho bạn.');
    if (!phone) return done(`Để bảo mật, gửi thêm số điện thoại đã đặt đơn ${code} nhé.`);
    const o = await findOrderForCustomer(code, phone);
    if (!o) return done(`Không thấy đơn ${code} với số điện thoại này. Kiểm tra lại giúp mình nhé.`);
    const extra = o.status === 'CHO_THANH_TOAN' ? ` Cần thanh toán ${money(o.amount_due)}, nội dung chuyển khoản: ${o.code}.`
      : o.carrier ? ` Hãng ${o.carrier}, mã vận đơn ${o.tracking_no}.` : '';
    return done(`Đơn ${o.code}: ${STATUS[o.status] ?? o.status}.${extra}`);
  }

  if (intent === 'GIA' || intent === 'TON_KHO') {
    const prods = await q(`SELECT id, sku, name, moq, stock_note, price_taomua_10, price_taomua_50, price_taomua_100, price_taomua_500 FROM products WHERE published AND status <> 'PAUSED'`);
    const p = matchProduct(msg, prods) ?? chatMatch(msg, prods);
    if (p) {
      links.push({ label: `Xem ${p.name}`, href: `/san-pham/${p.id}` });
      if (intent === 'TON_KHO') return done(`${p.name}: ${p.stock_note}. Đặt tối thiểu ${Math.max(10, p.moq)} cái (sỉ); mua lẻ từ 1 cái ở 9mua nếu có bán lẻ.`);
      return done(`${p.name} (giá đã gồm VAT): 10+ ${money(p.price_taomua_10)} · 50+ ${money(p.price_taomua_50)} · 100+ ${money(p.price_taomua_100)} · 500+ ${money(p.price_taomua_500)} mỗi cái. Mua càng nhiều giá càng thấp!`);
    }
    links.push({ label: 'Gửi yêu cầu báo giá', href: '/bao-gia' }, { label: 'Xem sản phẩm', href: '/' });
    return done('Mình chưa thấy món này trong danh mục. Gửi yêu cầu báo giá (tên hàng, số lượng), AI taomua tìm xưởng phù hợp và báo giá cho bạn.');
  }

  if (intent === 'VAN_CHUYEN') return done('Hàng giao thẳng từ xưởng (dropship sỉ) hoặc từ kho taomua; nội thành HCM có giao nhanh. Đơn quốc tế: taomua báo phí vận chuyển qua email trước khi bạn thanh toán. Mã vận đơn hiện khi tra cứu đơn.');
  if (intent === 'THANH_TOAN') {
    links.push({ label: 'Tra cứu đơn', href: '/don-hang' });
    return done('Bạn chuyển khoản sau khi đơn được xác nhận (hướng dẫn và số tài khoản hiện khi tra cứu đơn). taomua giữ tiền đến khi bạn xác nhận đã nhận hàng đúng; hàng lỗi được hoàn tiền.');
  }
  if (intent === 'HOA_DON') return done(`taomua xuất hóa đơn điện tử VAT 8% (${LEGAL.name}, MST ${LEGAL.taxCode}). Đơn từ 10 triệu luôn có hóa đơn; đơn nhỏ hơn gửi MST công ty khi đặt hàng (ghi ở ô ghi chú).`);
  if (intent === 'KHIEU_NAI') {
    const c = classifyIssue({ kind: 'KHIEU_NAI', message: msg });
    const code = msg.toUpperCase().match(/TM\d{4,}/)?.[0];
    links.push({ label: 'Gửi khiếu nại', href: `/bao-loi${code ? `?ma=${code}` : ''}` });
    return done(`Rất tiếc về sự cố. Bạn gửi khiếu nại kèm mã đơn và ảnh/mô tả, taomua xử lý trong 2 giờ${c.severity === 'CAO' ? ' (trường hợp này CEO trực tiếp xử lý)' : ''}. Đừng bấm "đã nhận hàng" khi hàng lỗi: tiền vẫn được giữ để hoàn cho bạn.`,
      'CHUYEN_NGUOI');
  }
  if (intent === 'NGUOI_THAT') {
    links.push({ label: 'Để lại liên hệ', href: '/bao-loi' });
    return done('Mình chuyển cho nhân viên taomua. Bạn để lại số điện thoại hoặc email và nội dung, nhân viên liên hệ lại sớm nhất.', 'CHUYEN_NGUOI');
  }
  if (intent === 'CHAO') return done('Xin chào! Mình là trợ lý AI của taomua. Hỏi mình giá sỉ, tình trạng đơn (mã TM + số điện thoại), vận chuyển, thanh toán, hóa đơn hoặc khiếu nại nhé. taomua cùng vui với bạn!');

  // Câu tự do: AI LOCAL tìm câu đã dạy gần nhất (BM25); đủ tin cậy thì trả lời ngay.
  const local = await localAnswer(msg);
  if (local) { lessonId = local.id; return done(local.answer, 'AI_LOCAL'); }
  // AI ngôn ngữ (khóa API hoặc AI chạy local) trả lời với "trí nhớ" là các bài học gần nhất; không có thì chuyển người.
  if (aiEnabled()) {
    const memory = (await searchLessons('RYN-SALES', msg, 4)).filter((l) => l.kind === 'HOI_DAP')
      .map((l) => `- Hỏi: ${l.question}\n  Đáp: ${l.answer}`).join('\n');
    const cats = (await q('SELECT DISTINCT category FROM products WHERE published')).map((r) => r.category).join(', ');
    const rules = (await lessonRules('RYN-SALES')).map((r) => `- ${r}`).join('\n');
    const out = await chat([
      { role: 'system', content: `Bạn là trợ lý CSKH của taomua.com (sàn sỉ, ${LEGAL.name}). Trả lời ngắn, lịch sự, cùng ngôn ngữ với khách. Chỉ dùng thông tin: giá sỉ 4 bậc 10/50/100/500 cái đã gồm VAT 8%; tiền được giữ đến khi khách xác nhận nhận hàng; ngành hàng: ${cats}. Không bịa giá, không hứa giảm giá, không hỏi thông tin thẻ/mật khẩu. Nếu không chắc, mời khách gửi yêu cầu báo giá ở /bao-gia hoặc để lại liên hệ ở /bao-loi.${rules ? `\nQuy tắc CEO đã dạy (bắt buộc):\n${rules}` : ''}${memory ? `\nCâu trả lời chuẩn CEO đã dạy (ưu tiên dùng):\n${memory}` : ''}` },
      { role: 'user', content: msg },
    ]).catch(() => null);
    if (out) return done(out.slice(0, 1200), 'AI_NGON_NGU');
  }
  links.push({ label: 'Yêu cầu báo giá', href: '/bao-gia' }, { label: 'Để lại liên hệ', href: '/bao-loi' });
  return done('Mình chưa hiểu rõ câu hỏi. Bạn hỏi về giá sỉ, đơn hàng, vận chuyển, thanh toán, hóa đơn, hoặc để lại liên hệ để nhân viên taomua gọi lại nhé.', 'CHUYEN_NGUOI');
}
