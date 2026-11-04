import { apiAuth, notImplemented } from '@/lib/api';

export async function POST(req: Request) {
  const a = await apiAuth(req, 'products.edit');
  if (a instanceof Response) return a;
  return notImplemented('Quét xu hướng (Qwen / RynnBrain / Accio)');
}
