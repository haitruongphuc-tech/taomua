// CHẾ ĐỘ GIẢ LẬP cho các dịch vụ ngoài trong thuyết minh (chủ dự án yêu cầu: chưa có tài khoản thật thì chạy giả lập cho dễ hiểu).
// Mọi kết quả ở đây đều gắn gia_lap: true và hiện nhãn "GIẢ LẬP" trên giao diện. Có khóa thật trong .env thì dịch vụ đó chạy thật.
// Kết quả cố định theo đầu vào (cùng sản phẩm, cùng ngày → cùng số) để dễ theo dõi, không ngẫu nhiên mỗi lần bấm.
import { q } from './db';

/** Băm chuỗi ra số 0..1 (cố định). */
export function seeded(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 100000) / 100000;
}
const pick = <T,>(arr: readonly T[], key: string) => arr[Math.floor(seeded(key) * arr.length) % arr.length];

export async function logConnector(connector: string, mode: 'THAT' | 'GIA_LAP', input: unknown, output: unknown) {
  await q('INSERT INTO connector_runs(connector, mode, input, output) VALUES ($1,$2,$3,$4)',
    [connector, mode, JSON.stringify(input ?? {}), JSON.stringify(output ?? {})]).catch(() => {});
}

// ---------- RYN-TREND: 20 nguồn trend (spec MULTILINGUAL Agent 1) ----------
export const TREND_SOURCES = ['TikTok VN', 'TikTok US', 'Douyin CN', '1688 hot', 'Amazon Best Seller US', 'Amazon Best Seller JP', 'Amazon Best Seller EU', 'Walmart Best Seller',
  'Alibaba.com', 'Shein', 'Temu', 'Google Trends VI', 'Google Trends EN', 'Google Trends ZH', 'Google Trends FR', 'Facebook Ad Library', 'Shopee VN', 'Lazada VN', 'Etsy', 'Pinterest'] as const;
const TREND_IDEAS: Record<string, [string, string, string][]> = {
  'Đồ chơi': [['Thú bông dễ thương', 'Cute plush toy', '可爱毛绒玩具'], ['Đồ chơi bóp giảm stress', 'Squishy stress toy', '解压捏捏乐'], ['Mô hình lắp ráp mini', 'Mini building blocks', '迷你积木']],
  'Thời trang': [['Áo thun in 3D', '3D print T-shirt', '3D印花T恤'], ['Túi tote canvas', 'Canvas tote bag', '帆布托特包'], ['Mũ bucket thêu', 'Embroidered bucket hat', '刺绣渔夫帽']],
  'Gia dụng': [['Bình giữ nhiệt khắc tên', 'Engraved tumbler', '刻字保温杯'], ['Hộp cơm giữ nhiệt', 'Insulated lunch box', '保温饭盒'], ['Kệ gia vị xoay', 'Rotating spice rack', '旋转调料架']],
  'Điện tử': [['Tai nghe TWS chống ồn', 'ANC TWS earbuds', '降噪蓝牙耳机'], ['Đèn LED dây nháy nhạc', 'Music sync LED strip', '音乐律动灯带'], ['Quạt cầm tay mini', 'Mini handheld fan', '迷你手持风扇']],
};
export function simTrends(categories: string[], day: string, limit = 50) {
  const cats = categories.length ? categories : Object.keys(TREND_IDEAS);
  const out: { name: string; name_en: string; name_zh: string; category: string; source: string; score: number; bien_du_kien: number; gia_lap: true }[] = [];
  for (const src of TREND_SOURCES) {
    for (const cat of cats) {
      const ideas = TREND_IDEAS[cat] ?? [[`${cat} hot`, `${cat} trending`, `${cat}热卖`]];
      const [vi, en, zh] = pick(ideas, `${src}|${cat}|${day}`);
      const score = 55 + Math.round(seeded(`${src}|${vi}|${day}`) * 44);
      out.push({ name: vi, name_en: en, name_zh: zh, category: cat, source: src, score, bien_du_kien: 20 + Math.round(seeded(`b|${vi}|${src}`) * 100), gia_lap: true });
    }
  }
  // Gộp cùng tên: điểm = cao nhất, nguồn = danh sách
  const merged = new Map<string, (typeof out)[number] & { sources: string[] }>();
  for (const t of out) {
    const m = merged.get(t.name);
    if (!m) merged.set(t.name, { ...t, sources: [t.source] });
    else { m.score = Math.max(m.score, t.score); if (!m.sources.includes(t.source)) m.sources.push(t.source); }
  }
  return [...merged.values()].map((t) => ({ ...t, score: Math.min(100, t.score + Math.min(10, t.sources.length)) }))
    .sort((a, b) => b.score - a.score).slice(0, limit);
}

// ---------- RYN-SUPPLY: tìm xưởng 1688 / Accio (spec: 50 xưởng mỗi sản phẩm) ----------
const CN_CITIES = ['Nghĩa Ô', 'Quảng Châu', 'Thâm Quyến', 'Đông Quản', 'Ninh Ba', 'Phật Sơn', 'Sán Đầu'] as const;
const VN_CITIES = ['Bình Dương', 'Bình Tân', 'Long An', 'Bắc Ninh', 'Hà Nội'] as const;
export function sim1688Suppliers(product: string, category: string, refCostVnd: number | null, count = 8) {
  const base = refCostVnd && refCostVnd > 0 ? refCostVnd : 10000 + Math.round(seeded(product) * 90000);
  return Array.from({ length: count }, (_, i) => {
    const key = `${product}|${i}`;
    const cn = seeded(`cn|${key}`) < 0.7;
    const city = cn ? pick(CN_CITIES, key) : pick(VN_CITIES, key);
    const trust = 70 + Math.round(seeded(`t|${key}`) * 29);
    return {
      name: `[GIẢ LẬP] Xưởng ${city} #${i + 1}`, source: cn ? '1688' : 'VN_FACTORY', country: cn ? 'CN' : 'VN', category,
      unit_cost: Math.round(base * (cn ? 0.82 + seeded(`p|${key}`) * 0.25 : 0.95 + seeded(`p|${key}`) * 0.25) / 100) * 100,
      moq: cn ? [100, 200, 300, 500][Math.floor(seeded(`m|${key}`) * 4)] : [20, 50, 100][Math.floor(seeded(`m|${key}`) * 3)],
      trust_score: trust, defect_rate: Math.round((0.005 + seeded(`d|${key}`) * 0.035) * 1000) / 1000,
      response_time_sec: 40 + Math.round(seeded(`r|${key}`) * 600), lead_time_days: cn ? 10 + Math.round(seeded(`l|${key}`) * 10) : 4 + Math.round(seeded(`l|${key}`) * 6),
      verified_cert: seeded(`v|${key}`) > 0.35, ships_international: cn, gia_lap: true as const,
    };
  });
}

// ---------- RYN-TRACE: camera QC (RynnBrain) ----------
export function simQc(imageUrl: string, checked = 100) {
  const defectRate = Math.round((0.004 + seeded(imageUrl) * 0.03) * 10000) / 10000; // 0.4% – 3.4%
  return { checked, defects: Math.round(defectRate * checked), defect_rate: defectRate, gia_lap: true as const };
}

// ---------- RYN-SALES: video 7 ngôn ngữ (HeyGen / CapCut) ----------
export function simVideoScript(p: { name: string; price10: number; price500: number }, names: Partial<Record<string, string>> = {}) {
  const f = (n: number) => n.toLocaleString('vi-VN');
  return {
    vi: `Xin chào! Đây là ${names.vi ?? p.name}. Mua sỉ từ 10 cái giá ${f(p.price10)} đồng, từ 500 cái chỉ ${f(p.price500)} đồng. Mua càng nhiều giá càng thấp — taomua cùng vui với bạn!`,
    en: `Hi! Meet ${names.en ?? p.name}. Wholesale from 10 pcs at ${f(p.price10)} VND, from 500 pcs only ${f(p.price500)} VND. The more you buy, the lower the price!`,
    zh: `大家好！这是${names.zh ?? p.name}。10件起批${f(p.price10)}越南盾，500件仅${f(p.price500)}越南盾。买得越多越便宜！`,
    fr: `Bonjour ! Voici ${names.fr ?? p.name}. En gros dès 10 pièces à ${f(p.price10)} VND, dès 500 pièces seulement ${f(p.price500)} VND.`,
    es: `¡Hola! Este es ${names.es ?? p.name}. Al por mayor desde 10 unidades a ${f(p.price10)} VND, desde 500 solo ${f(p.price500)} VND.`,
    ja: `こんにちは！${names.ja ?? p.name}です。10個から卸価格${f(p.price10)}ドン、500個なら${f(p.price500)}ドン。たくさん買うほどお得！`,
    ko: `안녕하세요! ${names.ko ?? p.name}입니다. 10개부터 도매가 ${f(p.price10)}동, 500개 이상은 ${f(p.price500)}동. 많이 살수록 더 저렴해요!`,
  };
}

// ---------- Kế toán: hóa đơn điện tử, Tài chính: chuyển khoản qua API ngân hàng ----------
export const simInvoiceNo = (code: string) => `GL-HD-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${code}`;
export const simTransferRef = (id: string) => `GL-CK-${Date.now().toString(36).toUpperCase()}-${id.slice(0, 6).toUpperCase()}`;
