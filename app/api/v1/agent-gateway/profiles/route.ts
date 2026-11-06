import { apiAuth, json, handle } from '@/lib/api';
import { one } from '@/lib/db';
import { normalizePhone } from '@/lib/orders';
import { audit } from '@/lib/audit';
import { isUuid } from '@/lib/catalog';

const LIMITS = [10_000_000, 50_000_000, 100_000_000];

// Spec #8 Agent Profiles: hạn mức chi theo tháng 10 / 50 / 100 triệu cho AI agent mua hộ. Vượt hạn mức thì đơn bị từ chối.
export async function POST(req: Request) {
  const a = await apiAuth(req, 'channels.edit');
  if (a instanceof Response) return a;
  return handle(async () => {
    const b = await req.json().catch(() => ({}));
    const limit = b.profile !== undefined ? Number(b.profile) * 1_000_000 : Number(b.limit);
    if (!LIMITS.includes(limit)) return json({ error: 'profile phải là 10, 50 hoặc 100 (triệu/tháng)' }, 400);
    let c;
    if (b.customer_id) {
      if (!isUuid(String(b.customer_id))) return json({ error: 'customer_id không hợp lệ' }, 400);
      c = await one(`UPDATE customers SET kind='AI_AGENT', agent_limit=$2 WHERE id=$1 RETURNING id, name, phone, agent_limit`, [b.customer_id, limit]);
      if (!c) return json({ error: 'Không tìm thấy khách' }, 404);
    } else {
      const phone = normalizePhone(String(b.phone ?? ''));
      const name = String(b.name ?? 'AI agent').slice(0, 120);
      c = await one(`INSERT INTO customers(name, phone, kind, agent_limit) VALUES ($1,$2,'AI_AGENT',$3)
        ON CONFLICT (phone) DO UPDATE SET kind='AI_AGENT', agent_limit=EXCLUDED.agent_limit RETURNING id, name, phone, agent_limit`, [name, phone, limit]);
    }
    const spent = Number((await one(`SELECT COALESCE(sum(tong_dt),0) AS s FROM wholesale_orders WHERE customer_id=$1
      AND status NOT IN ('HUY','TU_CHOI') AND created_at >= date_trunc('month', now())`, [c.id])).s);
    await audit(a.actor, 'agent.profile', 'customer', c.id, { limit });
    return json({ ...c, limit, spent, remaining: Math.max(0, limit - spent), period: 'THANG', agent_gateway: ['UCP', 'MCP', 'AP2'] });
  });
}
