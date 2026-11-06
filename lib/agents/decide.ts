import { tx } from '../db';
import { canApprove, LEVELS, type Level } from '../approval';
import { audit } from '../audit';
import { UserError } from '../action';
import { loadControls } from '../controls';
import { applyAction } from './apply';

type Decider = { id: string; role: string; label: string };

/** One-Tap: duyệt / từ chối đề xuất của AI, hoặc đánh dấu đã xem một tin. */
export async function decideAgentAction(id: string, user: Decider, op: 'approve' | 'reject' | 'seen') {
  return tx(async (c) => {
    const a = (await c.query('SELECT * FROM agent_actions WHERE id=$1 FOR UPDATE', [id])).rows[0];
    if (!a) throw new UserError('Không tìm thấy đề xuất.');
    if (op === 'seen') {
      if (a.status !== 'TIN') throw new UserError('Mục này không phải tin.');
      await c.query("UPDATE agent_actions SET status='DA_XEM', decided_by=$2, decided_label=$3, decided_at=now() WHERE id=$1", [id, user.id, user.label]);
      return 'Đã đánh dấu đã xem.';
    }
    if (a.status !== 'DE_XUAT') throw new UserError('Đề xuất đã được xử lý.');
    const level = (a.level ?? 2) as Level;
    if (!canApprove(user.role, level)) throw new UserError(`${LEVELS[level].label} cần ${level >= 3 ? 'CEO' : 'Trưởng nhóm hoặc CEO'} duyệt.`);
    if (op === 'approve') {
      const ctl = await loadControls(c);
      if (a.kind === 'PRODUCT_STATUS' && a.detail?.to === 'MASS_IMPORT' && ctl.KHOA_NHAP_MOI) {
        throw new UserError('Đang khóa nhập hàng mới. CEO mở khóa ở Kiểm soát chi trước.');
      }
      let msg: string;
      try {
        msg = await applyAction(c, a);
      } catch (e: any) {
        if (!e?.userFacing) throw e;
        await c.query("UPDATE agent_actions SET status='LOI', decided_by=$2, decided_label=$3, decided_at=now(), detail = detail || $4 WHERE id=$1",
          [id, user.id, user.label, JSON.stringify({ error: e.message })]);
        await audit({ id: user.id, label: user.label }, 'agent.stale', 'agent_action', id, { error: e.message }, c);
        return `Không áp dụng được: ${e.message}`;
      }
      await c.query("UPDATE agent_actions SET status='DA_DUYET', decided_by=$2, decided_label=$3, decided_at=now() WHERE id=$1", [id, user.id, user.label]);
      await audit({ id: user.id, label: user.label }, 'agent.approve', 'agent_action', id, { kind: a.kind, title: a.title }, c);
      return msg;
    }
    await c.query("UPDATE agent_actions SET status='TU_CHOI', decided_by=$2, decided_label=$3, decided_at=now() WHERE id=$1", [id, user.id, user.label]);
    await audit({ id: user.id, label: user.label }, 'agent.reject', 'agent_action', id, { kind: a.kind, title: a.title }, c);
    return 'Đã từ chối đề xuất.';
  });
}
