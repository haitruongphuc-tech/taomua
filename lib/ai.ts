// Gọi mô hình ngôn ngữ qua giao thức tương thích OpenAI (chat/completions).
// Mặc định là Qwen trên Alibaba Cloud DashScope (đúng công nghệ trong spec); đổi AI_BASE_URL/AI_MODEL để dùng OpenAI, Azure OpenAI...
// AI LOCAL ngôn ngữ: đặt AI_BASE_URL=http://localhost:11434/v1 (Ollama) và AI_MODEL=qwen2.5:7b, để trống AI_API_KEY.
// Chưa có khóa và không chạy local thì mọi hàm trả null; hệ thống chạy bằng AI LOCAL thuật toán (lib/local-ai.ts), không bịa nội dung.

export const LANGS = ['vi', 'en', 'zh', 'fr', 'es', 'ja', 'ko'] as const;
export type Lang = (typeof LANGS)[number];
export const LANG_LABEL: Record<Lang, string> = { vi: 'Tiếng Việt', en: 'English', zh: '中文', fr: 'Français', es: 'Español', ja: '日本語', ko: '한국어' };

export const aiConfig = () => ({
  key: process.env.AI_API_KEY || '',
  baseUrl: (process.env.AI_BASE_URL || 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1').replace(/\/$/, ''),
  model: process.env.AI_MODEL || 'qwen-max',
});
/** AI ngôn ngữ chạy trên máy của taomua (không gửi dữ liệu ra ngoài, không cần khóa). */
export const aiLocalLlm = () => /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|[a-z0-9-]+\.local)(:\d+)?\//i.test(aiConfig().baseUrl + '/');
export const aiEnabled = () => !!aiConfig().key || aiLocalLlm();

type Msg = { role: 'system' | 'user' | 'assistant'; content: string };

export async function chat(messages: Msg[], opts: { json?: boolean; timeoutMs?: number } = {}): Promise<string | null> {
  const cfg = aiConfig();
  if (!cfg.key && !aiLocalLlm()) return null;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), opts.timeoutMs ?? 30_000);
  try {
    const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(cfg.key ? { authorization: `Bearer ${cfg.key}` } : {}) },
      body: JSON.stringify({
        model: cfg.model, messages, temperature: 0.2,
        ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
      }),
      signal: ctl.signal,
    });
    if (!res.ok) throw new Error(`AI ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    return data?.choices?.[0]?.message?.content ?? null;
  } finally {
    clearTimeout(t);
  }
}

/** Dịch tên sản phẩm sang 7 ngôn ngữ. Trả null nếu chưa cấu hình AI hoặc kết quả không hợp lệ. */
export async function translate7(text: string): Promise<Partial<Record<Lang, string>> | null> {
  const out = await chat([
    { role: 'system', content: 'You translate short B2B product names. Reply with JSON only: {"vi":"","en":"","zh":"","fr":"","es":"","ja":"","ko":""}. zh is Simplified Chinese. Keep brand names and numbers unchanged.' },
    { role: 'user', content: text },
  ], { json: true });
  if (!out) return null;
  try {
    const j = JSON.parse(out.replace(/^```(json)?|```$/g, '').trim());
    const r: Partial<Record<Lang, string>> = {};
    for (const l of LANGS) if (typeof j[l] === 'string' && j[l].trim()) r[l] = j[l].trim().slice(0, 200);
    return Object.keys(r).length >= 4 ? r : null;
  } catch {
    return null;
  }
}

/** Xếp mô tả hàng vào một ngành có sẵn. Trả null nếu chưa có AI hoặc AI không chọn được ngành trong danh sách. */
export async function classify(text: string, options: string[]): Promise<string | null> {
  if (!options.length) return null;
  const out = await chat([
    { role: 'system', content: `Chọn đúng một ngành hàng trong danh sách cho mô tả sản phẩm. Chỉ trả tên ngành, hoặc "KHONG" nếu không ngành nào phù hợp. Danh sách: ${options.join(' | ')}` },
    { role: 'user', content: text.slice(0, 500) },
  ]);
  const pick = out?.trim().replace(/^"|"$/g, '');
  return options.find((o) => o.toLowerCase() === pick?.toLowerCase()) ?? null;
}

/** AI đọc tin nhắn / trang báo giá của xưởng (Trung, Anh, Việt) và trích các trường. Chỉ trích những gì có trong văn bản. */
export async function extractOffer(text: string): Promise<{ supplier_name?: string; product_text?: string; price?: number; currency?: string; moq?: number; lead_time_days?: number } | null> {
  const out = await chat([
    { role: 'system', content: 'Extract a factory price quote from the text. Reply JSON only: {"supplier_name":string|null,"product_text":string|null (in Vietnamese),"price":number|null (unit price),"currency":"CNY"|"USD"|"VND"|null,"moq":number|null,"lead_time_days":number|null}. Use null for anything not stated. Never guess numbers.' },
    { role: 'user', content: text.slice(0, 6000) },
  ], { json: true });
  if (!out) return null;
  try {
    const j = JSON.parse(out.replace(/^```(json)?|```$/g, '').trim());
    const num = (x: unknown) => (typeof x === 'number' && x > 0 ? x : undefined);
    return {
      supplier_name: typeof j.supplier_name === 'string' ? j.supplier_name.slice(0, 200) : undefined,
      product_text: typeof j.product_text === 'string' ? j.product_text.slice(0, 300) : undefined,
      price: num(j.price), currency: ['CNY', 'USD', 'VND'].includes(j.currency) ? j.currency : undefined,
      moq: num(j.moq) ? Math.round(j.moq) : undefined, lead_time_days: num(j.lead_time_days) ? Math.round(j.lead_time_days) : undefined,
    };
  } catch {
    return null;
  }
}

/** Dịch một đoạn (ví dụ tin nhắn xưởng tiếng Trung) sang tiếng Việt. */
export async function translateToVi(text: string): Promise<string | null> {
  return chat([
    { role: 'system', content: 'Dịch sang tiếng Việt, giữ nguyên số và đơn vị. Chỉ trả bản dịch.' },
    { role: 'user', content: text.slice(0, 4000) },
  ]);
}
