import { tx } from './db';
import { audit } from './audit';
import { UserError } from './action';
import { verifyPassword } from './password';
import { loadControls } from './controls';
import { payoutBlock, payoutApproveError, payoutLevel, needsReauth, REAUTH_THRESHOLD } from './payouts';

type Decider = { id: string; role: string; label: string };

/** Duyệt / từ chối một khoản chi (dùng chung cho trang Chi tiền và Quick Approve Center). */
export async function decidePayout(id: string, user: Decider, op: 'approve' | 'reject', password = '') {
  return tx(async (c) => {
    const p = (await c.query('SELECT * FROM payouts WHERE id=$1 FOR UPDATE', [id])).rows[0];
    if (!p) throw new UserError('Không tìm thấy khoản chi.');
    if (p.status !== 'DE_XUAT') throw new UserError('Khoản chi đã được xử lý.');
    const amount = Number(p.amount);
    const err = payoutApproveError(user, { amount, proposed_by: p.proposed_by });
    if (err) throw new UserError(err);
    if (op === 'approve') {
      const blocked = payoutBlock(p.category, await loadControls(c));
      if (blocked) throw new UserError(blocked);
      if (needsReauth(amount)) {
        const row = (await c.query('SELECT password_hash FROM users WHERE id=$1', [user.id])).rows[0];
        if (!row || !verifyPassword(password, row.password_hash)) {
          throw new UserError(`Khoản từ ${REAUTH_THRESHOLD.toLocaleString('vi-VN')} đ cần nhập đúng mật khẩu của bạn để duyệt.`);
        }
      }
    }
    await c.query('UPDATE payouts SET status=$2, approved_by=$3, approved_at=now() WHERE id=$1', [id, op === 'approve' ? 'DA_DUYET' : 'TU_CHOI', user.id]);
    await audit({ id: user.id, label: user.label }, `payout.${op}`, 'payout', id, { amount, level: payoutLevel(amount), reauth: op === 'approve' && needsReauth(amount) }, c);
    return op === 'approve' ? 'Đã duyệt chi. Kế toán chuyển khoản rồi ghi nhận.' : 'Đã từ chối khoản chi.';
  });
}
