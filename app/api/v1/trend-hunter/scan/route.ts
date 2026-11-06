import { apiAuth, json, handle } from '@/lib/api';
import { one } from '@/lib/db';
import { runAgents } from '@/lib/agents';
import { externalSourceStatus } from '@/lib/connectors';

// Spec #1. Input {source: TIKTOK|1688|AMAZON|WALMART|INTERNAL, limit ≤ 50} → {trends: [{name, score 0-100, source}]}.
// RYN-TREND xếp hạng từ dữ liệu trong hệ thống; nguồn ngoài chạy khi có khóa API (xem lib/connectors.ts).
export async function POST(req: Request) {
  const a = await apiAuth(req, 'products.edit');
  if (a instanceof Response) return a;
  return handle(async () => {
    const b = await req.json().catch(() => ({}));
    const limit = Math.min(50, Math.max(1, Math.round(Number(b.limit) || 50)));
    const source = String(b.source ?? 'INTERNAL').toUpperCase();
    await runAgents('API', a.actor, ['RYN-TREND']);
    const r = await one("SELECT title, detail, created_at FROM agent_actions WHERE agent='RYN-TREND' AND detail ? 'top' ORDER BY created_at DESC LIMIT 1");
    const trends = ((r?.detail?.top ?? []) as any[]).slice(0, limit).map((t) => ({ name: t.name, sku: t.sku, score: t.score, source: 'INTERNAL', ban_7_ngay: t.ban_7_ngay, ctr: t.ctr }));
    return json({ trends, source, external: source === 'INTERNAL' ? null : externalSourceStatus(source), created_at: r?.created_at });
  });
}
