import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import crypto from 'node:crypto';
import { one, q } from './db';
import { hashPassword, verifyPassword } from './password';

export { hashPassword, verifyPassword };
export type Role = 'CEO' | 'TRUONG_NHOM' | 'KE_TOAN' | 'NHAN_VIEN';
export type User = { id: string; email: string; name: string; role: Role };
export const ROLE_LABEL: Record<Role, string> = { CEO: 'CEO', TRUONG_NHOM: 'Trưởng nhóm', KE_TOAN: 'Kế toán', NHAN_VIEN: 'Nhân viên' };

// Ma trận quyền: mỗi quyền liệt kê các vai trò được làm.
export const PERMS = {
  'orders.view': ['CEO', 'TRUONG_NHOM', 'KE_TOAN', 'NHAN_VIEN'],
  'orders.fulfil': ['CEO', 'TRUONG_NHOM', 'NHAN_VIEN'],
  'orders.payment': ['CEO', 'KE_TOAN'],
  'orders.create': ['CEO', 'TRUONG_NHOM', 'NHAN_VIEN'],
  'escrow.release': ['CEO'],
  'products.edit': ['CEO', 'TRUONG_NHOM', 'NHAN_VIEN'],
  'suppliers.edit': ['CEO', 'TRUONG_NHOM', 'NHAN_VIEN'],
  'channels.edit': ['CEO', 'TRUONG_NHOM'],
  'listings.edit': ['CEO', 'TRUONG_NHOM', 'NHAN_VIEN'],
  'rfq.edit': ['CEO', 'TRUONG_NHOM', 'NHAN_VIEN'],
  'finance.view': ['CEO', 'KE_TOAN'],
  'reconcile.run': ['CEO', 'KE_TOAN'],
  'payout.propose': ['CEO', 'TRUONG_NHOM', 'KE_TOAN', 'NHAN_VIEN'],
  'payout.approve': ['CEO'],
  'payout.pay': ['CEO', 'KE_TOAN'],
  'audit.view': ['CEO', 'KE_TOAN'],
  'users.manage': ['CEO'],
} as const satisfies Record<string, readonly Role[]>;
export type Perm = keyof typeof PERMS;
export const can = (u: User | null, p: Perm) => !!u && (PERMS[p] as readonly string[]).includes(u.role);

const COOKIE = 'tm_session';
const SESSION_HOURS = 12;
const sha = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

function clientIp() {
  const h = headers();
  return (h.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'local';
}

export async function login(email: string, password: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const key = `${email.toLowerCase()}|${clientIp()}`;
  const recent = await one<{ n: number }>(
    "SELECT count(*)::int AS n FROM login_attempts WHERE key=$1 AND at > now() - interval '15 minutes'", [key]);
  if ((recent?.n ?? 0) >= 5) return { ok: false, error: 'Sai quá 5 lần. Hãy thử lại sau 15 phút.' };
  const u = await one<User & { password_hash: string; active: boolean }>('SELECT * FROM users WHERE lower(email)=lower($1)', [email]);
  if (!u || !u.active || !verifyPassword(password, u.password_hash)) {
    await q('INSERT INTO login_attempts(key) VALUES ($1)', [key]);
    return { ok: false, error: 'Email hoặc mật khẩu không đúng.' };
  }
  await q('DELETE FROM login_attempts WHERE key=$1', [key]);
  const token = crypto.randomBytes(32).toString('base64url');
  await q(`INSERT INTO sessions(token_hash, user_id, expires_at) VALUES ($1,$2, now() + make_interval(hours => $3))`,
    [sha(token), u.id, SESSION_HOURS]);
  cookies().set(COOKIE, token, {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: SESSION_HOURS * 3600,
  });
  return { ok: true };
}

export async function logout() {
  const t = cookies().get(COOKIE)?.value;
  if (t) await q('DELETE FROM sessions WHERE token_hash=$1', [sha(t)]);
  cookies().set(COOKIE, '', { path: '/', maxAge: 0 });
}

export async function currentUser(): Promise<User | null> {
  const t = cookies().get(COOKIE)?.value;
  if (!t) return null;
  return one<User>(
    `SELECT u.id, u.email, u.name, u.role FROM sessions s JOIN users u ON u.id=s.user_id
     WHERE s.token_hash=$1 AND s.expires_at > now() AND u.active`, [sha(t)]);
}

/** Dùng trong trang và server action quản trị. Chưa đăng nhập → về trang đăng nhập; thiếu quyền → lỗi. */
export async function requireUser(perm?: Perm): Promise<User> {
  const u = await currentUser();
  if (!u) redirect('/quan-tri/dang-nhap');
  if (perm && !can(u, perm)) redirect(`/quan-tri?loi=${encodeURIComponent('Bạn không có quyền vào mục này.')}`);
  return u;
}
export const actorOf = (u: User) => ({ id: u.id, label: `${u.name} (${ROLE_LABEL[u.role]})` });
