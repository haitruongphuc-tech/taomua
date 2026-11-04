import { apiAuth, notImplemented } from '@/lib/api';

export async function POST(req: Request) {
  const a = await apiAuth(req, 'orders.fulfil');
  if (a instanceof Response) return a;
  return notImplemented('Kiểm lỗi bằng camera RynnBrain');
}
