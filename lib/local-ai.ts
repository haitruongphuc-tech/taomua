// AI LOCAL của taomua: chạy ngay trên máy chủ, không cần khóa, không gửi dữ liệu ra ngoài.
// 1) Tách từ tiếng Việt (bỏ dấu, ghép 2 âm tiết thành từ ghép: "giao hang", "chu nhat").
// 2) BM25: tìm bài học / câu hỏi mẫu gần nhất với câu hỏi (cùng thuật toán của các máy tìm kiếm).
// 3) Naive Bayes: phân loại ý định câu hỏi, tự học thêm từ nhật ký chat thật (câu đã được trả lời đúng ý định).
// Có AI_API_KEY (hoặc AI ngôn ngữ chạy local như Ollama) thì các kết quả BM25 được đưa vào lời nhắc làm "trí nhớ" (RAG).
// Thuần (không đọc database) để kiểm thử được; phần nạp dữ liệu ở lib/lessons.ts và lib/cskh.ts.
import { fold } from './sourcing';

// Từ phổ biến không mang nghĩa khi tìm. Từ hỏi (có, không, được, gì…) bỏ ở từ đơn nhưng vẫn giữ trong từ ghép ("bao_lau", "co_ship").
const STOP = new Set(['a', 'ah', 'oi', 'nhe', 'nha', 'nhi', 'thi', 'la', 'va', 'cua', 'cho', 'toi', 'minh', 'em', 'anh', 'chi', 'ban', 'shop', 'ad',
  'the', 'nay', 'do', 'voi', 'duoc', 'roi', 'ma', 'ne', 'vay', 'u', 'uh', 'ok', 'hen', 'nhung', 'cac', 'mot', 'giup', 'xin', 'vui', 'long',
  'co', 'khong', 'ko', 'k', 'gi', 'nao', 'sao', 'chua', 'vay', 'hoi', 'ben', 'nhieu', 'lam', 'qua']);

/** Tách câu thành đặc trưng: từ đơn (bỏ từ dừng) + từ ghép 2 âm tiết liền nhau. */
export function features(text: string): string[] {
  const syl = fold(text).split(/[^a-z0-9]+/).filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i < syl.length; i++) {
    if (!STOP.has(syl[i]) && syl[i].length >= 2) out.push(syl[i]);
    if (i + 1 < syl.length) out.push(`${syl[i]}_${syl[i + 1]}`);
  }
  return out;
}
/** Từ có nghĩa (từ đơn, đã bỏ từ dừng). */
export const contentWords = (text: string) => [...new Set(features(text).filter((f) => !f.includes('_')))];

/** `boost` = câu hỏi mẫu; nhiều cách hỏi cách nhau bằng dấu | (vd "mấy giờ làm việc | có làm ban đêm không"). */
export type Doc = { id: string | number; text: string; boost?: string };
export const variantsOf = (q: string) => q.split('|').map((x) => x.trim()).filter(Boolean);

/** BM25 (k1 = 1.5, b = 0.75). `boost` (vd câu hỏi mẫu) được tính gấp đôi. */
export class Bm25 {
  private docs: { id: Doc['id']; tf: Map<string, number>; len: number; words: Set<string>; variants: Set<string>[] }[] = [];
  private df = new Map<string, number>();
  private avg = 1;
  constructor(docs: Doc[], private k1 = 1.5, private b = 0.75) {
    for (const d of docs) {
      const f = [...features(d.text), ...(d.boost ? [...features(d.boost), ...features(d.boost)] : [])];
      const tf = new Map<string, number>();
      for (const x of f) tf.set(x, (tf.get(x) ?? 0) + 1);
      for (const x of tf.keys()) this.df.set(x, (this.df.get(x) ?? 0) + 1);
      // Độ khớp tính trên câu hỏi mẫu (nếu có), không tính trên câu trả lời dài.
      const variants = variantsOf(d.boost ?? d.text).map((v) => new Set(contentWords(v)));
      this.docs.push({ id: d.id, tf, len: f.length, words: new Set(variants.flatMap((v) => [...v])), variants });
    }
    this.avg = this.docs.reduce((a, d) => a + d.len, 0) / Math.max(1, this.docs.length) || 1;
  }
  get size() { return this.docs.length; }
  private idf(t: string) {
    const n = this.df.get(t) ?? 0;
    return Math.log(1 + (this.docs.length - n + 0.5) / (n + 0.5));
  }
  /** Kết quả xếp hạng. `coverage` = tỉ lệ từ có nghĩa của câu hỏi nằm trong tài liệu; `match` = tỉ lệ từ của câu mẫu nằm trong câu hỏi. */
  search(query: string, k = 5): { id: Doc['id']; score: number; coverage: number; match: number }[] {
    const qf = features(query);
    const qw = contentWords(query);
    const qs = new Set(qw);
    if (!qf.length) return [];
    return this.docs.map((d) => {
      let s = 0;
      for (const t of qf) {
        const f = d.tf.get(t);
        if (f) s += this.idf(t) * ((f * (this.k1 + 1)) / (f + this.k1 * (1 - this.b + (this.b * d.len) / this.avg)));
      }
      const coverage = qw.length ? qw.filter((w) => d.words.has(w)).length / qw.length : 0;
      // khớp theo cách hỏi giống nhất
      const match = Math.max(0, ...d.variants.map((v) => (v.size ? [...v].filter((w) => qs.has(w)).length / v.size : 0)));
      return { id: d.id, score: s, coverage, match };
    }).filter((r) => r.score > 0).sort((a, b) => b.score - a.score).slice(0, k);
  }
}

/** Naive Bayes đa thức, làm trơn Laplace. Học từ cặp (câu, nhãn); dự đoán kèm xác suất. */
export class NaiveBayes {
  private count = new Map<string, number>();
  private words = new Map<string, Map<string, number>>();
  private total = new Map<string, number>();
  private vocab = new Set<string>();
  private n = 0;
  train(examples: { text: string; label: string }[]) {
    for (const e of examples) {
      this.n++;
      this.count.set(e.label, (this.count.get(e.label) ?? 0) + 1);
      const m = this.words.get(e.label) ?? new Map<string, number>();
      for (const f of features(e.text)) {
        m.set(f, (m.get(f) ?? 0) + 1);
        this.total.set(e.label, (this.total.get(e.label) ?? 0) + 1);
        this.vocab.add(f);
      }
      this.words.set(e.label, m);
    }
    return this;
  }
  get labels() { return [...this.count.keys()]; }
  predict(text: string): { label: string; prob: number } | null {
    if (!this.n) return null;
    const f = features(text).filter((x) => this.vocab.has(x));
    if (!f.length) return null;
    const V = this.vocab.size;
    const scores = this.labels.map((l) => {
      let s = Math.log((this.count.get(l) ?? 0) / this.n);
      const m = this.words.get(l)!;
      const tot = this.total.get(l) ?? 0;
      for (const x of f) s += Math.log(((m.get(x) ?? 0) + 1) / (tot + V));
      return { label: l, s };
    });
    const max = Math.max(...scores.map((x) => x.s));
    const sum = scores.reduce((a, x) => a + Math.exp(x.s - max), 0);
    const best = scores.reduce((a, x) => (x.s > a.s ? x : a));
    return { label: best.label, prob: Math.exp(best.s - max) / sum };
  }
}

/** Câu mẫu cho từng ý định (khởi đầu). Mô hình học thêm từ nhật ký chat thật khi chạy. */
export const INTENT_EXAMPLES: { text: string; label: string }[] = [
  ...['giá sỉ bao nhiêu', 'báo giá giúp mình', 'bao nhiêu tiền một cái', 'có chiết khấu không', 'mua 100 cái giá thế nào', 'giá rẻ nhất', 'how much is it', 'price list', 'giá lấy nhiều', 'giá đại lý']
    .map((text) => ({ text, label: 'GIA' })),
  ...['còn hàng không', 'có sẵn không', 'hết hàng chưa', 'số lượng tối thiểu', 'mua ít nhất mấy cái', 'kho còn không', 'in stock', 'đặt tối thiểu bao nhiêu']
    .map((text) => ({ text, label: 'TON_KHO' })),
  ...['đơn của tôi tới đâu rồi', 'kiểm tra đơn hàng', 'đơn đã giao chưa', 'mã vận đơn', 'theo dõi đơn', 'where is my order', 'đơn bị chậm', 'khi nào nhận được hàng đã đặt']
    .map((text) => ({ text, label: 'DON_HANG' })),
  ...['giao hàng mấy ngày', 'phí ship bao nhiêu', 'có ship tỉnh không', 'gửi đi nước ngoài được không', 'giao nhanh trong ngày', 'shipping fee', 'hãng vận chuyển nào', 'giao tận nơi không']
    .map((text) => ({ text, label: 'VAN_CHUYEN' })),
  ...['chuyển khoản thế nào', 'trả tiền bằng gì', 'có nhận momo không', 'thanh toán khi nhận hàng được không', 'quẹt thẻ được không', 'payment method', 'số tài khoản', 'trả góp được không']
    .map((text) => ({ text, label: 'THANH_TOAN' })),
  ...['xuất hóa đơn đỏ', 'cần hóa đơn công ty', 'có vat không', 'hóa đơn điện tử', 'invoice for company', 'mã số thuế công ty']
    .map((text) => ({ text, label: 'HOA_DON' })),
  ...['hàng bị lỗi', 'giao thiếu hàng', 'muốn trả hàng', 'hoàn tiền cho tôi', 'sản phẩm bị vỡ', 'không giống hình', 'giao sai màu', 'chất lượng kém quá',
    'hàng giao tới bị bể', 'đồ bị móp méo trầy xước', 'xử lý giúp đơn bị hư', 'nhận hàng bị rách', 'hàng dỏm quá', 'shop giao nhầm']
    .map((text) => ({ text, label: 'KHIEU_NAI' })),
  ...['cho gặp nhân viên', 'gọi lại cho tôi', 'nói chuyện với người thật', 'số hotline', 'tư vấn trực tiếp', 'talk to a human']
    .map((text) => ({ text, label: 'NGUOI_THAT' })),
  ...['xin chào', 'chào shop', 'hello', 'alo có ai không', 'hi taomua']
    .map((text) => ({ text, label: 'CHAO' })),
];
