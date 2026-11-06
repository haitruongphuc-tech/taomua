import { apiAuth, json, handle } from '@/lib/api';
import { runAgents, AGENTS, type AgentCode } from '@/lib/agents';

// n8n gọi mỗi 6 giờ (header x-api-key = INTERNAL_API_KEY). Body tùy chọn: {"agents":["RYN-PRICE",...]}.
export async function POST(req: Request) {
  const a = await apiAuth(req, 'agents.run');
  if (a instanceof Response) return a;
  return handle(async () => {
    const b = await req.json().catch(() => ({}));
    const only = Array.isArray(b.agents) ? (b.agents as string[]).filter((k): k is AgentCode => k in AGENTS) : undefined;
    if (Array.isArray(b.agents) && !only?.length) return json({ error: `agents phải thuộc ${Object.keys(AGENTS).join(', ')}` }, 400);
    return json(await runAgents(a.role === 'AUTOMATION' ? 'LICH' : 'API', a.actor, only));
  });
}
