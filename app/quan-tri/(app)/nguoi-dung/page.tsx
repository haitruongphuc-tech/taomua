import crypto from 'node:crypto';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { requireUser, actorOf, hashPassword, ROLE_LABEL, type Role } from '@/lib/auth';
import { q, one } from '@/lib/db';
import { audit } from '@/lib/audit';
import { runAction, UserError } from '@/lib/action';
import Flash from '@/components/Flash';

async function act(fd: FormData) {
  'use server';
  const u = await requireUser('users.manage');
  const op = String(fd.get('op'));
  if (op === 'create' || op === 'reset') {
    // Mật khẩu tạm hiện một lần cho CEO để gửi riêng cho nhân viên.
    const pw = crypto.randomBytes(9).toString('base64url');
    let email = '';
    if (op === 'create') {
      email = String(fd.get('email') ?? '').trim().toLowerCase();
      const name = String(fd.get('name') ?? '').trim();
      const role = String(fd.get('role')) as Role;
      if (!/^[^@\s]+@[^@\s]+$/.test(email) || !name || !ROLE_LABEL[role]) redirect('/quan-tri/nguoi-dung?loi=' + encodeURIComponent('Cần email, tên và vai trò hợp lệ.'));
      const ex = await one('SELECT 1 FROM users WHERE lower(email)=$1', [email]);
      if (ex) redirect('/quan-tri/nguoi-dung?loi=' + encodeURIComponent('Email đã tồn tại.'));
      await q('INSERT INTO users(email, name, role, password_hash) VALUES ($1,$2,$3,$4)', [email, name, role, hashPassword(pw)]);
    } else {
      const r = await one('UPDATE users SET password_hash=$2 WHERE id=$1 RETURNING email', [String(fd.get('id')), hashPassword(pw)]);
      if (!r) redirect('/quan-tri/nguoi-dung?loi=' + encodeURIComponent('Không tìm thấy người dùng.'));
      email = r.email;
      await q('DELETE FROM sessions WHERE user_id=$1', [String(fd.get('id'))]);
    }
    await audit(actorOf(u), `user.${op}`, 'user', email);
    // Không đưa mật khẩu lên URL: lưu cookie ngắn hạn chỉ cho trang này.
    cookies().set('tm_flash_pw', JSON.stringify({ email, pw }), { httpOnly: true, sameSite: 'strict', path: '/quan-tri/nguoi-dung', maxAge: 60, secure: process.env.NODE_ENV === 'production' });
    redirect('/quan-tri/nguoi-dung');
  }
  await runAction('/quan-tri/nguoi-dung', async () => {
    const id = String(fd.get('id'));
    if (id === u.id) throw new UserError('Không tự sửa tài khoản của mình ở đây.');
    if (op === 'toggle') {
      await q('UPDATE users SET active = NOT active WHERE id=$1', [id]);
      await q('DELETE FROM sessions WHERE user_id=$1', [id]);
    } else if (op === 'telegram') {
      const chat = String(fd.get('telegram_chat_id') ?? '').trim();
      if (chat && !/^-?\d{3,20}$/.test(chat)) throw new UserError('Telegram chat id là một dãy số.');
      await q('UPDATE users SET telegram_chat_id=$2 WHERE id=$1', [id, chat || null]);
    } else throw new UserError('Thao tác không hợp lệ.');
    await audit(actorOf(u), `user.${op}`, 'user', id);
    return 'Đã cập nhật.';
  });
}

async function setOwnTelegram(fd: FormData) {
  'use server';
  const u = await requireUser('users.manage');
  await runAction('/quan-tri/nguoi-dung', async () => {
    const chat = String(fd.get('telegram_chat_id') ?? '').trim();
    if (chat && !/^-?\d{3,20}$/.test(chat)) throw new UserError('Telegram chat id là một dãy số.');
    await q('UPDATE users SET telegram_chat_id=$2 WHERE id=$1', [u.id, chat || null]);
    await audit(actorOf(u), 'user.telegram', 'user', u.id);
    return 'Đã lưu Telegram của bạn.';
  });
}

export default async function Users({ searchParams }: { searchParams: { ok?: string; loi?: string } }) {
  const me = await requireUser('users.manage');
  const rows = await q('SELECT id, email, name, role, active, telegram_chat_id FROM users ORDER BY role, name');
  let flash: { email: string; pw: string } | null = null;
  try { flash = JSON.parse(cookies().get('tm_flash_pw')?.value ?? 'null'); } catch { flash = null; }
  return (
    <div className="stack">
      <h1>Người dùng</h1>
      <Flash sp={searchParams} />
      {flash && <div className="alert ok">Mật khẩu tạm cho {flash.email}: <b className="mono">{flash.pw}</b> — hiện trong 1 phút, hãy gửi riêng cho người dùng và nhắc họ đổi mật khẩu.</div>}
      <div className="table-wrap"><table>
        <thead><tr><th>Tên</th><th>Email</th><th>Vai trò</th><th>Telegram chat id</th><th>Trạng thái</th><th></th></tr></thead>
        <tbody>{rows.map((r) => (
          <tr key={r.id}>
            <td>{r.name}</td><td>{r.email}</td><td>{ROLE_LABEL[r.role as Role]}</td>
            <td>{r.id === me.id ? (
              <form action={setOwnTelegram} className="row"><input name="telegram_chat_id" defaultValue={r.telegram_chat_id ?? ''} style={{ width: 140 }} /><button className="btn secondary sm">Lưu</button></form>
            ) : (
              <form action={act} className="row"><input type="hidden" name="id" value={r.id} /><input type="hidden" name="op" value="telegram" /><input name="telegram_chat_id" defaultValue={r.telegram_chat_id ?? ''} style={{ width: 140 }} /><button className="btn secondary sm">Lưu</button></form>
            )}</td>
            <td>{r.active ? <span className="badge ok">Hoạt động</span> : <span className="badge bad">Đã khóa</span>}</td>
            <td>{r.id !== me.id && (
              <form action={act} className="row"><input type="hidden" name="id" value={r.id} />
                <button className="btn secondary sm" name="op" value="toggle">{r.active ? 'Khóa' : 'Mở khóa'}</button>
                <button className="btn secondary sm" name="op" value="reset">Cấp mật khẩu tạm</button></form>
            )}</td>
          </tr>
        ))}</tbody>
      </table></div>
      <form action={act} className="card form-grid">
        <input type="hidden" name="op" value="create" />
        <label className="field">Tên<input name="name" required /></label>
        <label className="field">Email<input name="email" type="email" required /></label>
        <label className="field">Vai trò<select name="role">{Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <div style={{ alignSelf: 'end' }}><button className="btn sm">Thêm người dùng</button></div>
      </form>
      <p className="muted small">Telegram chat id dùng để gửi yêu cầu duyệt. Người dùng nhắn cho bot trước, sau đó lấy chat id từ bot.</p>
    </div>
  );
}
