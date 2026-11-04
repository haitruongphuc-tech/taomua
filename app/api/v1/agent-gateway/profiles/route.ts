import { apiAuth, json, handle } from '@/lib/api';
import { one } from '@/lib/db';
import { normalizePhone } from '@/lib/orders';
import { audit } from '@/lib/audit';

const LIMITS = [10_000_000, 50_000_000, 100_000_000];

// Cấp hạn mức chi mỗi đơn cho AI agent mua hộ (10tr/50tr/100tr). Đơn của agent vượt hạn mức bị từ chối.
export async function POST(req: Request) {
  const a = await apiAuth(req, 'channels.edit');
  if (a instanceof Response) return a;
  return handle(async () => {
    const b = await req.json().catch(() => ({}));
    const limit = Number(b.limit);
    if (!LIMITS.includes(limit)) return json({ error: 'limit phải là 10000000, 50000000 hoặc 100000000' }, 400);
    const phone = normalizePhone(String(b.phone ?? ''));
    const name = String(b.name ?? 'AI agent').slice(0, 120);
    const c = await one(`INSERT INTO customers(name, phone, kind, agent_limit) VALUES ($1,$2,'AI_AGENT',$3)
      ON CONFLICT (phone) DO UPDATE SET kind='AI_AGENT', agent_limit=EXCLUDED.agent_limit RETURNING id, name, phone, agent_limit`, [name, phone, limit]);
    await audit(a.actor, 'agent.profile', 'customer', c.id, { limit });
    return json(c);
  });
}
