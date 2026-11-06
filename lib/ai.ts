// Gọi mô hình ngôn ngữ qua giao thức tương thích OpenAI (chat/completions).
// Mặc định là Qwen trên Alibaba Cloud DashScope (đúng công nghệ trong spec); đổi AI_BASE_URL/AI_MODEL để dùng OpenAI, Azure OpenAI...
// Chưa có AI_API_KEY thì mọi hàm trả null và hệ thống chạy bằng quy tắc, không bịa nội dung.

export const LANGS = ['vi', 'en', 'zh', 'fr', 'es', 'ja', 'ko'] as const;
export type Lang = (typeof LANGS)[number];
export const LANG_LABEL: Record<Lang, string> = { vi: 'Tiếng Việt', en: 'English', zh: '中文', fr: 'Français', es: 'Español', ja: '日本語', ko: '한국어' };

export const aiConfig = () => ({
  key: process.env.AI_API_KEY || '',
  baseUrl: (process.env.AI_BASE_URL || 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1').replace(/\/$/, ''),
  model: process.env.AI_MODEL || 'qwen-max',
});
export const aiEnabled = () => !!aiConfig().key;

type Msg = { role: 'system' | 'user' | 'assistant'; content: string };

export async function chat(messages: Msg[], opts: { json?: boolean; timeoutMs?: number } = {}): Promise<string | null> {
  const cfg = aiConfig();
  if (!cfg.key) return null;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), opts.timeoutMs ?? 30_000);
  try {
    const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.key}` },
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

/** Dịch một đoạn (ví dụ tin nhắn xưởng tiếng Trung) sang tiếng Việt. */
export async function translateToVi(text: string): Promise<string | null> {
  return chat([
    { role: 'system', content: 'Dịch sang tiếng Việt, giữ nguyên số và đơn vị. Chỉ trả bản dịch.' },
    { role: 'user', content: text.slice(0, 4000) },
  ]);
}
