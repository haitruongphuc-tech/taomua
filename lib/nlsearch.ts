// AI Shopping Assistant (spec chương 6): hiểu câu tìm kiếm tự nhiên, ví dụ "tìm áo thun hot trend giá dưới 50k",
// "bình giữ nhiệt rẻ nhất", "đồ chơi xưởng uy tín dưới 1 triệu". Hàm thuần, kiểm thử được.
export const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();

export type ParsedQuery = { words: string[]; category?: string; maxPrice?: number; minTrust?: number; sort?: 'gia' | 'trust' | 'hot'; explain: string[] };

const STOP = new Set(['tim', 'kiem', 'mua', 'can', 'cho', 'toi', 'minh', 'hang', 'san', 'pham', 'gia', 'duoi', 'tren', 'tu', 'den', 'khoang', 're', 'nhat',
  'hot', 'trend', 'xu', 'huong', 'dang', 'uy', 'tin', 'xuong', 'chat', 'luong', 'cao', 'loai', 'cai', 'si', 'le', 'bien', 'nhieu', 'it', 'nao', 'gi', 'co',
  'khong', 'voi', 'va', 'la', 'cua', 'mot', 'the', 'k', 'nghin', 'ngan', 'trieu', 'tr', 'vnd', 'dong', 'd', 'tot', 'nhanh']);

/** Đổi "50k", "50 nghìn", "1 triệu", "1,5tr", "200000" ra đồng. */
function money(numText: string, unit?: string): number {
  const n = Number(numText.replace(',', '.'));
  if (!Number.isFinite(n)) return NaN;
  if (unit && /^(k|nghin|ngan)$/.test(unit)) return n * 1_000;
  if (unit && /^(tr|trieu)$/.test(unit)) return n * 1_000_000;
  return n < 1000 ? n * 1_000 : n; // "dưới 50" hiểu là 50 nghìn
}

export function parseQuery(text: string, categories: string[] = []): ParsedQuery {
  const t = ` ${fold(text).replace(/[^a-z0-9.,%]+/g, ' ')} `;
  const out: ParsedQuery = { words: [], explain: [] };
  const price = t.match(/(?:duoi|nho hon|toi da|<=?|khong qua)\s*([\d.,]+)\s*(k|nghin|ngan|tr|trieu)?\b/);
  if (price) {
    const v = money(price[1].replace(/\.(?=\d{3}\b)/g, ''), price[2]);
    if (v > 0) { out.maxPrice = Math.round(v); out.explain.push(`giá sỉ 10+ ≤ ${out.maxPrice.toLocaleString('vi-VN')} đ`); }
  }
  if (/\b(re nhat|gia re|gia thap)\b/.test(t)) { out.sort = 'gia'; out.explain.push('rẻ trước'); }
  else if (/\b(uy tin|chat luong|xuong tot)\b/.test(t)) { out.sort = 'trust'; out.minTrust = 85; out.explain.push('xưởng TrustScore ≥ 85'); }
  else if (/\b(hot|trend|xu huong|ban chay)\b/.test(t)) { out.sort = 'hot'; out.explain.push('hàng hot trước'); }
  const trust = t.match(/\btrust(?:score)?\s*(\d{2})\b/);
  if (trust) { out.minTrust = Number(trust[1]); out.explain.push(`TrustScore ≥ ${out.minTrust}`); }
  let rest = t.replace(/(?:duoi|nho hon|toi da|<=?|khong qua)\s*[\d.,]+\s*(k|nghin|ngan|tr|trieu)?\b/, ' ').replace(/\btrust(?:score)?\s*\d{2}\b/, ' ').replace(/\bbien\s*\d+\s*%?/, ' ');
  const cat = categories.find((c) => rest.includes(` ${fold(c)} `));
  if (cat) { out.category = cat; out.explain.push(`ngành ${cat}`); rest = rest.replace(` ${fold(cat)} `, ' '); }
  out.words = rest.split(/\s+/).filter((w) => w.length >= 2 && !STOP.has(w) && !/^\d+%?$/.test(w));
  if (out.words.length) out.explain.unshift(`tìm "${out.words.join(' ')}"`);
  return out;
}

/** Khớp không dấu: mọi từ khóa đều có trong tên / ngành / mô tả. */
export function matchesWords(p: { name: string; category: string; description?: string }, words: string[]) {
  if (!words.length) return true;
  const hay = ` ${fold(`${p.name} ${p.category} ${p.description ?? ''}`).replace(/[^a-z0-9]+/g, ' ')} `;
  return words.every((w) => hay.includes(` ${w}`));
}
