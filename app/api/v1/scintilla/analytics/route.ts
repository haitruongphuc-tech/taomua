import { apiAuth, notImplemented } from '@/lib/api';

export async function POST(req: Request) {
  const a = await apiAuth(req, 'finance.view');
  if (a instanceof Response) return a;
  return notImplemented('Phân tích Scintilla');
}
