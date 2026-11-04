import { requireUser, actorOf, hashPassword, verifyPassword } from '@/lib/auth';
import { q, one } from '@/lib/db';
import { audit } from '@/lib/audit';
import { runAction, UserError } from '@/lib/action';
import Flash from '@/components/Flash';

async function change(fd: FormData) {
  'use server';
  const u = await requireUser();
  await runAction('/quan-tri/tai-khoan', async () => {
    const cur = String(fd.get('current') ?? '');
    const next = String(fd.get('next') ?? '');
    if (next.length < 10) throw new UserError('Mật khẩu mới cần ít nhất 10 ký tự.');
    if (next !== String(fd.get('confirm') ?? '')) throw new UserError('Nhập lại mật khẩu không khớp.');
    const row = await one('SELECT password_hash FROM users WHERE id=$1', [u.id]);
    if (!row || !verifyPassword(cur, row.password_hash)) throw new UserError('Mật khẩu hiện tại không đúng.');
    await q('UPDATE users SET password_hash=$2 WHERE id=$1', [u.id, hashPassword(next)]);
    await audit(actorOf(u), 'user.password', 'user', u.id);
    return 'Đã đổi mật khẩu.';
  });
}

export default async function Account({ searchParams }: { searchParams: { ok?: string; loi?: string } }) {
  const u = await requireUser();
  return (
    <div className="stack" style={{ maxWidth: 480 }}>
      <h1>Đổi mật khẩu</h1>
      <p className="muted">{u.name} · {u.email}</p>
      <Flash sp={searchParams} />
      <form action={change} className="card stack">
        <label className="field">Mật khẩu hiện tại<input name="current" type="password" required autoComplete="current-password" /></label>
        <label className="field">Mật khẩu mới (ít nhất 10 ký tự)<input name="next" type="password" required minLength={10} autoComplete="new-password" /></label>
        <label className="field">Nhập lại<input name="confirm" type="password" required minLength={10} autoComplete="new-password" /></label>
        <button className="btn blue">Đổi mật khẩu</button>
      </form>
    </div>
  );
}
