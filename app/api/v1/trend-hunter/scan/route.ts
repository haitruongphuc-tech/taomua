import { apiAuth, json, handle } from '@/lib/api';
import { one } from '@/lib/db';
import { runAgents } from '@/lib/agents';

// RYN-TREND: xếp hạng hàng hot từ dữ liệu trong hệ thống (điểm trend, bán 7 ngày, CTR bán thử). Chỉ đọc.
// Nguồn ngoài (TikTok, 1688, Amazon, Google Trends) sẽ thêm khi có tài khoản API.
export async function POST(req: Request) {
  const a = await apiAuth(req, 'products.edit');
  if (a instanceof Response) return a;
  return handle(async () => {
    await runAgents('API', a.actor, ['RYN-TREND']);
    const r = await one("SELECT title, detail, created_at FROM agent_actions WHERE agent='RYN-TREND' AND detail ? 'top' ORDER BY created_at DESC LIMIT 1");
    return json({ ...r?.detail, title: r?.title, created_at: r?.created_at, external_sources: 'chưa kết nối' });
  });
}
