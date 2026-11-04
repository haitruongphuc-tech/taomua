import { requireUser, actorOf, can } from '@/lib/auth';
import { q, tx } from '@/lib/db';
import { audit } from '@/lib/audit';
import { runAction, UserError } from '@/lib/action';
import { vnd, dt } from '@/lib/format';
import Flash from '@/components/Flash';

const CAT: Record<string, string> = { NAP_AI: 'Nạp tiền dịch vụ AI', NAP_ADS: 'Nạp quảng cáo', TAM_UNG_SHIP: 'Tạm ứng phí ship', MUA_MAU_LATR: 'Mua mẫu bán thử', DAT_COC_XUONG: 'Đặt cọc xưởng', NOP_THUE: 'Nộp thuế', KHAC: 'Khác' };
const ST: Record<string, [string, string]> = { DE_XUAT: ['Đề xuất', 'warn'], DA_DUYET: ['Đã duyệt, chờ chi', 'orange'], DA_CHI: ['Đã chi', 'ok'], TU_CHOI: ['Từ chối', 'bad'] };

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
      if (!CAT[cat] || !(amount > 0) || !payee || !reason) throw new UserError('Cần đủ loại chi, số tiền, người nhận và lý do.');
      const r = await q('INSERT INTO payouts(category, amount, payee, reason, proposed_by) VALUES ($1,$2,$3,$4,$5) RETURNING id', [cat, amount, payee, reason, u.id]);
      await audit(a, 'payout.propose', 'payout', r[0].id, { cat, amount, payee });
      return 'Đã gửi đề xuất chi. Chờ CEO duyệt.';
    }
    const id = String(fd.get('id'));
    return tx(async (c) => {
      const p = (await c.query('SELECT * FROM payouts WHERE id=$1 FOR UPDATE', [id])).rows[0];
      if (!p) throw new UserError('Không tìm thấy khoản chi.');
      if (op === 'approve' || op === 'reject') {
        if (!can(u, 'payout.approve')) throw new UserError('Chỉ CEO duyệt chi.');
        if (p.status !== 'DE_XUAT') throw new UserError('Khoản chi đã được xử lý.');
        await c.query('UPDATE payouts SET status=$2, approved_by=$3, approved_at=now() WHERE id=$1', [id, op === 'approve' ? 'DA_DUYET' : 'TU_CHOI', u.id]);
        await audit(a, `payout.${op}`, 'payout', id, { amount: p.amount }, c);
        return op === 'approve' ? 'Đã duyệt chi. Kế toán thực hiện chuyển khoản rồi ghi nhận.' : 'Đã từ chối.';
      }
      if (op === 'paid') {
        if (!can(u, 'payout.pay')) throw new UserError('Chỉ kế toán hoặc CEO ghi nhận đã chi.');
        if (p.status !== 'DA_DUYET') throw new UserError('Chỉ ghi nhận khoản đã duyệt.');
        const ref = String(fd.get('paid_ref') ?? '').trim();
        if (!ref) throw new UserError('Cần mã giao dịch ngân hàng để đối soát.');
        await c.query("UPDATE payouts SET status='DA_CHI', paid_by=$2, paid_ref=$3, paid_at=now() WHERE id=$1", [id, u.id, ref.slice(0, 100)]);
        await audit(a, 'payout.paid', 'payout', id, { amount: p.amount, ref }, c);
        return 'Đã ghi nhận đã chi.';
      }
      throw new UserError('Thao tác không hợp lệ.');
    });
  });
}

export default async function Payouts({ searchParams }: { searchParams: { ok?: string; loi?: string } }) {
  const u = await requireUser();
  const rows = await q(`SELECT p.*, a.name AS proposer, b.name AS approver, c.name AS payer FROM payouts p
    JOIN users a ON a.id=p.proposed_by LEFT JOIN users b ON b.id=p.approved_by LEFT JOIN users c ON c.id=p.paid_by ORDER BY p.created_at DESC LIMIT 200`);
  return (
    <div className="stack">
      <h1>Chi tiền</h1>
      <Flash sp={searchParams} />
      <p className="muted">Ba bước: đề xuất → CEO duyệt → kế toán chuyển khoản ngoài hệ thống và ghi mã giao dịch. Hệ thống không tự chuyển tiền.</p>
      {can(u, 'payout.propose') && (
        <form action={act} className="card form-grid">
          <input type="hidden" name="op" value="propose" />
          <label className="field">Loại chi<select name="category">{Object.entries(CAT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label className="field">Số tiền (đ)<input name="amount" type="number" min={1} required /></label>
          <label className="field">Người / đơn vị nhận<input name="payee" required /></label>
          <label className="field">Lý do<input name="reason" required /></label>
          <div style={{ alignSelf: 'end' }}><button className="btn sm">Đề xuất chi</button></div>
        </form>
      )}
      <div className="table-wrap"><table>
        <thead><tr><th>Loại</th><th className="num">Số tiền</th><th>Nhận</th><th>Lý do</th><th>Trạng thái</th><th>Người làm</th><th></th></tr></thead>
        <tbody>{rows.map((p) => (
          <tr key={p.id}>
            <td>{CAT[p.category]}</td><td className="num">{vnd(p.amount)}</td><td>{p.payee}</td><td className="small">{p.reason}</td>
            <td><span className={`badge ${ST[p.status][1]}`}>{ST[p.status][0]}</span>{p.paid_ref && <div className="small mono">{p.paid_ref}</div>}</td>
            <td className="small">Đề xuất: {p.proposer} · {dt(p.created_at)}{p.approver && <><br />Duyệt: {p.approver}</>}{p.payer && <><br />Chi: {p.payer}</>}</td>
            <td>
              {p.status === 'DE_XUAT' && can(u, 'payout.approve') && (
                <form action={act} className="row"><input type="hidden" name="id" value={p.id} />
                  <button className="btn sm" name="op" value="approve">Duyệt</button><button className="btn danger sm" name="op" value="reject">Từ chối</button></form>
              )}
              {p.status === 'DA_DUYET' && can(u, 'payout.pay') && (
                <form action={act} className="row"><input type="hidden" name="id" value={p.id} /><input type="hidden" name="op" value="paid" />
                  <input name="paid_ref" placeholder="Mã GD ngân hàng" required style={{ width: 150 }} /><button className="btn sm">Đã chi</button></form>
              )}
            </td>
          </tr>
        ))}</tbody>
      </table></div>
    </div>
  );
}
