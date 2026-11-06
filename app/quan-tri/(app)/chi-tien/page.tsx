import Link from 'next/link';
import { requireUser, actorOf, can } from '@/lib/auth';
import { decidePayout } from '@/lib/payouts-db';
import { verifyPassword } from '@/lib/password';
import { bankTransfer, simActionsAllowed } from '@/lib/money-sim';
import { connectorEnabled } from '@/lib/connectors';
import { q, tx } from '@/lib/db';
import { audit } from '@/lib/audit';
import { runAction, UserError } from '@/lib/action';
import { vnd, dt } from '@/lib/format';
import { LEVELS } from '@/lib/approval';
import { loadControls } from '@/lib/controls';
import {
  PAYOUT_CATEGORIES as CAT, type PayoutCategory, payoutLevel, payoutBlock, autoApprovePayout,
  payoutApproveError, needsReauth, REAUTH_THRESHOLD,
} from '@/lib/payouts';
import Flash from '@/components/Flash';

const ST: Record<string, [string, string]> = { DE_XUAT: ['Đề xuất', 'warn'], DA_DUYET: ['Đã duyệt, chờ chi', 'orange'], DA_CHI: ['Đã chi', 'ok'], TU_CHOI: ['Từ chối', 'bad'] };
const isCat = (k: string): k is PayoutCategory => k in CAT;

async function act(fd: FormData) {
  'use server';
  const u = await requireUser();
  const op = String(fd.get('op'));
  await runAction('/quan-tri/chi-tien', async () => {
    const a = actorOf(u);
    if (op === 'propose') {
      if (!can(u, 'payout.propose')) throw new UserError('Bạn không có quyền đề xuất chi.');
      const cat = String(fd.get('category'));
      const amount = Math.round(Number(fd.get('amount')));
      const payee = String(fd.get('payee') ?? '').trim().slice(0, 200);
      const reason = String(fd.get('reason') ?? '').trim().slice(0, 1000);
      if (!isCat(cat) || !(amount > 0) || !payee || !reason) throw new UserError('Cần đủ loại chi, số tiền, người nhận và lý do.');
      return tx(async (c) => {
        const ctl = await loadControls(c);
        const blocked = payoutBlock(cat, ctl);
        if (blocked) throw new UserError(blocked);
        const auto = autoApprovePayout(amount, cat, ctl);
        const r = await c.query(
          `INSERT INTO payouts(category, amount, payee, reason, proposed_by, status, auto_approved, approved_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
          [cat, amount, payee, reason, u.id, auto ? 'DA_DUYET' : 'DE_XUAT', auto, auto ? new Date() : null]);
        await audit(a, auto ? 'payout.auto_approve' : 'payout.propose', 'payout', r.rows[0].id, { cat, amount, payee, level: payoutLevel(amount) }, c);
        return auto
          ? 'Cấp 1 (dưới 5 triệu): đã tự duyệt. Kế toán chuyển khoản rồi ghi mã giao dịch.'
          : `Đã gửi đề xuất. ${LEVELS[payoutLevel(amount)].label}: chờ ${payoutLevel(amount) <= 2 ? 'Trưởng nhóm hoặc CEO' : 'CEO'} duyệt.`;
      });
    }
    const id = String(fd.get('id'));
    if (op === 'approve' || op === 'reject') {
      if (!can(u, 'payout.approve')) throw new UserError('Bạn không có quyền duyệt chi.');
      return decidePayout(id, { id: u.id, role: u.role, label: a.label }, op, String(fd.get('password') ?? ''));
    }
    return tx(async (c) => {
      const p = (await c.query('SELECT * FROM payouts WHERE id=$1 FOR UPDATE', [id])).rows[0];
      if (!p) throw new UserError('Không tìm thấy khoản chi.');
      const amount = Number(p.amount);
      const ctl = await loadControls(c);
      if (op === 'paid') {
        if (!can(u, 'payout.pay')) throw new UserError('Chỉ kế toán hoặc CEO ghi nhận đã chi.');
        if (p.status !== 'DA_DUYET') throw new UserError('Chỉ ghi nhận khoản đã duyệt.');
        const blocked = payoutBlock(p.category, ctl);
        if (blocked) throw new UserError(blocked);
        const ref = String(fd.get('paid_ref') ?? '').trim();
        if (!ref) throw new UserError('Cần mã giao dịch ngân hàng để đối soát.');
        await c.query("UPDATE payouts SET status='DA_CHI', paid_by=$2, paid_ref=$3, paid_at=now() WHERE id=$1", [id, u.id, ref.slice(0, 100)]);
        await audit(a, 'payout.paid', 'payout', id, { amount, ref }, c);
        return 'Đã ghi nhận đã chi.';
      }
      if (op === 'transfer') {
        if (!can(u, 'payout.pay')) throw new UserError('Chỉ kế toán hoặc CEO chuyển khoản.');
        if (p.status !== 'DA_DUYET') throw new UserError('Chỉ chuyển khoản đã duyệt.');
        const blocked = payoutBlock(p.category, ctl);
        if (blocked) throw new UserError(blocked);
        if (needsReauth(amount)) {
          const row = (await c.query('SELECT password_hash FROM users WHERE id=$1', [u.id])).rows[0];
          if (!row || !verifyPassword(String(fd.get('password') ?? ''), row.password_hash)) throw new UserError(`Khoản từ ${vnd(REAUTH_THRESHOLD)} cần nhập đúng mật khẩu để chuyển.`);
        }
        const t = await bankTransfer({ id, amount, payee: p.payee, reason: p.reason });
        await c.query("UPDATE payouts SET status='DA_CHI', paid_by=$2, paid_ref=$3, paid_at=now(), transfer_mode=$4 WHERE id=$1", [id, u.id, t.ref, t.mode]);
        await audit(a, 'payout.transfer', 'payout', id, { amount, ref: t.ref, mode: t.mode }, c);
        return t.mode === 'THAT' ? `Ngân hàng đã nhận lệnh, mã GD ${t.ref}.` : `Chuyển khoản GIẢ LẬP, mã ${t.ref} (không có tiền đi thật).`;
      }
      throw new UserError('Thao tác không hợp lệ.');
    });
  });
}

export default async function Payouts({ searchParams }: { searchParams: { ok?: string; loi?: string } }) {
  const u = await requireUser();
  const ctl = await loadControls();
  const bankLive = connectorEnabled('BANK');
  const simOk = simActionsAllowed();
  const rows = await q(`SELECT p.*, a.name AS proposer, b.name AS approver, c.name AS payer FROM payouts p
    JOIN users a ON a.id=p.proposed_by LEFT JOIN users b ON b.id=p.approved_by LEFT JOIN users c ON c.id=p.paid_by ORDER BY p.created_at DESC LIMIT 200`);
  const locked = (Object.keys(CAT) as PayoutCategory[]).filter((k) => payoutBlock(k, ctl));
  return (
    <div className="stack">
      <h1>Chi tiền</h1>
      <Flash sp={searchParams} />
      <p className="muted">
        Đề xuất → duyệt → kế toán chuyển khoản ngoài hệ thống và ghi mã giao dịch. Hệ thống không tự chuyển tiền.
        Dưới 5 triệu {ctl.AI_AUTO ? 'tự duyệt' : 'cần người duyệt (nút tổng đang tắt)'}; 5–20 triệu Trưởng nhóm hoặc CEO; từ 20 triệu chỉ CEO;
        từ {vnd(REAUTH_THRESHOLD)} phải nhập lại mật khẩu. <Link href="/quan-tri/kiem-soat-chi">Kiểm soát chi</Link>
      </p>
      {locked.length > 0 && <div className="card" style={{ borderColor: 'var(--bad)' }}>Đang khóa: {locked.map((k) => CAT[k]).join(', ')}.</div>}
      {can(u, 'payout.propose') && (
        <form action={act} className="card form-grid">
          <input type="hidden" name="op" value="propose" />
          <label className="field">Loại chi<select name="category">{(Object.keys(CAT) as PayoutCategory[]).map((k) => (
            <option key={k} value={k} disabled={!!payoutBlock(k, ctl)}>{CAT[k]}{payoutBlock(k, ctl) ? ' (đang khóa)' : ''}</option>
          ))}</select></label>
          <label className="field">Số tiền (đ)<input name="amount" type="number" min={1} required /></label>
          <label className="field">Người / đơn vị nhận<input name="payee" required /></label>
          <label className="field">Lý do<input name="reason" required /></label>
          <div style={{ alignSelf: 'end' }}><button className="btn sm">Đề xuất chi</button></div>
        </form>
      )}
      <div className="table-wrap"><table>
        <thead><tr><th>Loại</th><th className="num">Số tiền</th><th>Cấp</th><th>Nhận</th><th>Lý do</th><th>Trạng thái</th><th>Người làm</th><th></th></tr></thead>
        <tbody>{rows.map((p) => {
          const amount = Number(p.amount);
          const mayApprove = p.status === 'DE_XUAT' && can(u, 'payout.approve') && !payoutApproveError(u, { amount, proposed_by: p.proposed_by });
          return (
            <tr key={p.id}>
              <td>{CAT[p.category as PayoutCategory]}</td><td className="num">{vnd(amount)}</td><td>{LEVELS[payoutLevel(amount)].label}</td>
              <td>{p.payee}</td><td className="small">{p.reason}</td>
              <td><span className={`badge ${ST[p.status][1]}`}>{ST[p.status][0]}</span>{p.paid_ref && <div className="small mono">{p.paid_ref}</div>}</td>
              <td className="small">Đề xuất: {p.proposer} · {dt(p.created_at)}
                {p.auto_approved && <><br />Duyệt: Tự động (Cấp 1)</>}{p.approver && <><br />Duyệt: {p.approver}</>}{p.payer && <><br />Chi: {p.payer}</>}</td>
              <td>
                {mayApprove && (
                  <form action={act} className="row"><input type="hidden" name="id" value={p.id} />
                    {needsReauth(amount) && <input name="password" type="password" placeholder="Mật khẩu của bạn" autoComplete="current-password" style={{ width: 140 }} />}
                    <button className="btn sm" name="op" value="approve">Duyệt</button><button className="btn danger sm" name="op" value="reject">Từ chối</button></form>
                )}
                {p.status === 'DA_DUYET' && can(u, 'payout.pay') && (
                  <form action={act} className="row"><input type="hidden" name="id" value={p.id} /><input type="hidden" name="op" value="paid" />
                    <input name="paid_ref" placeholder="Mã GD ngân hàng" required style={{ width: 150 }} /><button className="btn sm">Đã chi</button></form>
                )}
                {p.status === 'DA_DUYET' && can(u, 'payout.pay') && (bankLive || simOk) && (
                  <form action={act} className="row" style={{ marginTop: 4 }}><input type="hidden" name="id" value={p.id} /><input type="hidden" name="op" value="transfer" />
                    {needsReauth(Number(p.amount)) && <input name="password" type="password" placeholder="Mật khẩu" autoComplete="current-password" style={{ width: 110 }} />}
                    <button className="btn blue sm">{bankLive ? 'Chuyển qua ngân hàng' : 'Chuyển khoản (GIẢ LẬP)'}</button></form>
                )}
                {p.transfer_mode === 'GIA_LAP' && <div className="small"><span className="badge warn">GIẢ LẬP</span></div>}
              </td>
            </tr>
          );
        })}</tbody>
      </table></div>
    </div>
  );
}
