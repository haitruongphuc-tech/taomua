import { apiAuth, json, handle } from '@/lib/api';
import { workingCapital } from '@/lib/capital';

// Vốn cần = 30% doanh thu (lưu động) + 15% (dự phòng) = 45%.
export async function POST(req: Request) {
  const a = await apiAuth(req, 'finance.view');
  if (a instanceof Response) return a;
  return handle(async () => {
    const b = await req.json().catch(() => ({}));
    const revenue = Number(b.revenue);
    if (!(revenue > 0)) return json({ error: 'revenue > 0' }, 400);
    const balance = b.balance === undefined || b.balance === null ? null : Number(b.balance);
    return json(workingCapital(revenue, balance, Number(b.margin_on_cost ?? 25)));
  });
}
