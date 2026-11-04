import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { currentUser, can, actorOf, type Perm } from './auth';
import { OrderError } from './orders';
import type { Actor } from './audit';

export const json = (data: unknown, status = 200) => NextResponse.json(data, { status });

/** Xác thực API nội bộ: phiên đăng nhập quản trị, hoặc khóa INTERNAL_API_KEY (cho n8n) qua header x-api-key. */
export async function apiAuth(req: Request, perm: Perm): Promise<{ actor: Actor; role: string; userId: string | null } | NextResponse> {
  const key = req.headers.get('x-api-key');
  const expected = process.env.INTERNAL_API_KEY;
  if (key && expected && key.length === expected.length && crypto.timingSafeEqual(Buffer.from(key), Buffer.from(expected))) {
    return { actor: { id: null, label: 'Tự động hóa (API key)' }, role: 'AUTOMATION', userId: null };
  }
  const u = await currentUser();
  if (!u) return json({ error: 'Chưa xác thực' }, 401);
  if (!can(u, perm)) return json({ error: 'Không có quyền' }, 403);
  return { actor: actorOf(u), role: u.role, userId: u.id };
}

export const notImplemented = (what: string) =>
  json({ error: 'Chưa triển khai', detail: `${what} cần tài liệu API của nhà cung cấp. Hệ thống không trả dữ liệu giả.` }, 501);

export async function handle(fn: () => Promise<NextResponse>) {
  try {
    return await fn();
  } catch (e: any) {
    if (e instanceof OrderError || e?.userFacing) return json({ error: e.message }, 400);
    console.error(e);
    return json({ error: 'Lỗi hệ thống' }, 500);
  }
}
