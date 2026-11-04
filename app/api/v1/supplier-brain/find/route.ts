import { apiAuth, notImplemented } from '@/lib/api';

export async function POST(req: Request) {
  const a = await apiAuth(req, 'suppliers.edit');
  if (a instanceof Response) return a;
  return notImplemented('Tìm 50 xưởng cho mỗi sản phẩm (Accio / 1688)');
}
