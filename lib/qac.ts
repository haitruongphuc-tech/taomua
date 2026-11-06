// TAOMUA One-Tap Approve — CEO Quick Approve Center (QAC), docs 06_APPROVAL_SYSTEM.md.
// Một hàng đợi duy nhất cho mọi việc cần người duyệt: đơn hàng Cấp 2-5, khoản chi, đề xuất của 7 AI agent, và việc n8n gửi vào.
// Mã duyệt dạng "LOAI:uuid" (ORDER / PAYOUT / AI).
import { q, one } from './db';
import { canApprove, LEVELS, approvalLevel, type Level } from './approval';
import { can, type User } from './auth';
import { decideApproval, OrderError } from './orders';
import { decidePayout } from './payouts-db';
import { decideAgentAction } from './agents/decide';
import { payoutApproveError, needsReauth, PAYOUT_CATEGORIES } from './payouts';
import { loadControls } from './controls';
import { calcMargin } from './pricing';
import { UserError } from './action';
import { audit, type Actor } from './audit';
import { notifyText } from './notify';

export type QacType = 'ORDER' | 'PAYOUT' | 'AI';
export type QacItem = {
  approval_id: string; type: QacType; title: string; detail: string; amount: number | null; margin: number | null;
  level: number; level_label: string; deadline: string | null; overdue: boolean; created_at: string;
  can_decide: boolean; needs_password: boolean; reject_needs_note: boolean; link: string; severity: 'INFO' | 'WARN' | 'DANGER';
};

const TYPE_LABEL: Record<QacType, string> = { ORDER: 'Đơn hàng', PAYOUT: 'Khoản chi', AI: 'Đề xuất AI' };
export const qacTypeLabel = (t: QacType) => TYPE_LABEL[t];

export async function loadQueue(u: User): Promise<QacItem[]> {
  const now = Date.now();
  const [orders, payouts, ai] = await Promise.all([
    q(`SELECT o.id, o.code, o.tong_dt, o.ship_country, o.bien_rong_tren_chi_phi, o.cap_duyet, o.cap_ly_do, o.approval_deadline, o.created_at, cu.name AS customer,
         (SELECT string_agg(product_name || ' × ' || quantity, ', ') FROM order_items WHERE order_id=o.id) AS items
       FROM wholesale_orders o JOIN customers cu ON cu.id=o.customer_id WHERE o.approval_status='PENDING'`),
    q(`SELECT p.*, us.name AS proposer FROM payouts p JOIN users us ON us.id=p.proposed_by WHERE p.status='DE_XUAT'`),
    q(`SELECT * FROM agent_actions WHERE status='DE_XUAT'`),
  ]);
  const items: QacItem[] = [
    ...orders.map((o): QacItem => ({
      approval_id: `ORDER:${o.id}`, type: 'ORDER', title: `Đơn ${o.code} · ${o.customer}${o.ship_country !== 'VN' ? ` · ${o.ship_country}` : ''}`,
      detail: `${o.items ?? ''}. ${o.cap_ly_do}`, amount: Number(o.tong_dt), margin: Number(o.bien_rong_tren_chi_phi),
      level: o.cap_duyet, level_label: LEVELS[o.cap_duyet as Level].label, deadline: o.approval_deadline,
      overdue: !!o.approval_deadline && new Date(o.approval_deadline).getTime() < now, created_at: o.created_at,
      can_decide: canApprove(u.role, o.cap_duyet as Level), needs_password: false, reject_needs_note: true,
      link: `/quan-tri/don-hang/${o.id}`, severity: Number(o.bien_rong_tren_chi_phi) < 0 ? 'DANGER' : Number(o.bien_rong_tren_chi_phi) > 150 ? 'WARN' : 'INFO',
    })),
    ...payouts.map((p): QacItem => {
      const amount = Number(p.amount);
      const lv = (amount < 5e6 ? 1 : amount < 2e7 ? 2 : amount < 5e7 ? 3 : amount <= 2e8 ? 4 : 5) as Level;
      return {
        approval_id: `PAYOUT:${p.id}`, type: 'PAYOUT', title: `Chi ${PAYOUT_CATEGORIES[p.category as keyof typeof PAYOUT_CATEGORIES] ?? p.category} · ${p.payee}`,
        detail: `${p.reason} (đề xuất: ${p.proposer})`, amount, margin: null, level: lv, level_label: LEVELS[lv].label,
        deadline: null, overdue: now - new Date(p.created_at).getTime() > 24 * 3600_000, created_at: p.created_at,
        can_decide: can(u, 'payout.approve') && !payoutApproveError(u, { amount, proposed_by: p.proposed_by }),
        needs_password: needsReauth(amount), reject_needs_note: false, link: '/quan-tri/chi-tien', severity: amount >= 5e7 ? 'WARN' : 'INFO',
      };
    }),
    ...ai.map((a): QacItem => {
      const lv = (a.level ?? 2) as Level;
      const total = Number(a.detail?.recommendation?.total ?? a.detail?.total ?? a.detail?.value ?? NaN);
      return {
        approval_id: `AI:${a.id}`, type: 'AI', title: `${a.agent}: ${a.title}`, detail: a.detail?.reason ?? a.detail?.ly_do ?? a.detail?.note ?? '',
        amount: Number.isFinite(total) ? total : null, margin: a.detail?.recommendation?.margin ?? a.detail?.bien ?? null, level: lv, level_label: LEVELS[lv].label,
        deadline: null, overdue: false, created_at: a.created_at, can_decide: canApprove(u.role, lv), needs_password: false, reject_needs_note: false,
        link: a.kind === 'SOURCING_CHOICE' ? '/quan-tri/tim-xuong' : '/quan-tri/ai', severity: a.severity,
      };
    }),
  ];
  // Việc mình duyệt được lên trước; rồi quá hạn, cấp cao, cũ trước.
  return items.sort((x, y) => Number(y.can_decide) - Number(x.can_decide) || Number(y.overdue) - Number(x.overdue) || y.level - x.level
    || new Date(x.created_at).getTime() - new Date(y.created_at).getTime());
}

/** Một chạm: duyệt hoặc từ chối bất kỳ mục nào trong hàng đợi. */
export async function qacDecide(approvalId: string, action: 'APPROVED' | 'REJECTED', u: User, actor: Actor, opts: { note?: string; password?: string } = {}) {
  const [type, id] = approvalId.split(':');
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) throw new UserError('Mã duyệt không hợp lệ.');
  const who = { id: u.id, role: u.role, label: actor.label };
  try {
    if (type === 'ORDER') {
      const note = (opts.note ?? '').trim();
      if (action === 'REJECTED' && !note) throw new UserError('Từ chối đơn cần ghi lý do.');
      await decideApproval(id, who, action, note, 'WEB');
      return action === 'APPROVED' ? 'Đã duyệt đơn. Khách thấy hướng dẫn thanh toán khi tra cứu.' : 'Đã từ chối đơn.';
    }
    if (type === 'PAYOUT') {
      if (!can(u, 'payout.approve')) throw new UserError('Bạn không có quyền duyệt chi.');
      return await decidePayout(id, who, action === 'APPROVED' ? 'approve' : 'reject', opts.password ?? '');
    }
    if (type === 'AI') return await decideAgentAction(id, who, action === 'APPROVED' ? 'approve' : 'reject');
  } catch (e) {
    if (e instanceof OrderError) throw new UserError(e.message);
    throw e;
  }
  throw new UserError('Loại duyệt không hợp lệ.');
}

/** n8n gửi một việc cần duyệt (spec POST /api/v1/approval/queue). Cấp 1 AI tự duyệt nếu nút tổng bật. */
export async function qacCreateExternal(b: { product_name: string; bien?: number; cap?: number; price?: number; total_cost?: number; quantity?: number; tier?: number; method?: string }, actor: Actor) {
  const name = String(b.product_name ?? '').trim().slice(0, 200);
  if (!name) throw new UserError('Cần product_name.');
  const qty = Math.max(1, Math.round(Number(b.quantity ?? 1)));
  const price = Number(b.price ?? 0);
  const value = price * qty;
  let level = Number(b.cap) as Level;
  let margin = b.bien != null ? Number(b.bien) : null;
  if (price > 0 && Number(b.total_cost) > 0) {
    const m = calcMargin({ revenue: value, cost: Number(b.total_cost) * qty });
    margin = m.marginOnCost;
    level = approvalLevel(value, m.marginOnCost, m.net).level;
  }
  if (!(level >= 1 && level <= 5)) throw new UserError('Cần cap 1-5, hoặc price + total_cost để hệ thống tự tính cấp.');
  const auto = level === 1 && (await loadControls()).AI_AUTO;
  const title = `${name}${qty > 1 ? ` × ${qty}` : ''}${margin != null ? `, biên ${margin}%` : ''}${value ? `, ${value.toLocaleString('vi-VN')} đ` : ''}`;
  const row = await one(`INSERT INTO agent_actions(agent, kind, severity, title, detail, level, status, decided_label, decided_at)
    VALUES ('N8N','EXTERNAL','INFO',$1,$2,$3,$4,$5,$6) RETURNING id`,
    [title, JSON.stringify({ ...b, value, bien: margin, method: b.method ?? 'ONE_TAP' }), level, auto ? 'TU_DONG' : 'DE_XUAT',
      auto ? 'AI tự duyệt (Cấp 1)' : null, auto ? new Date() : null]);
  await audit(actor, 'qac.create', 'agent_action', row.id, { title, level, auto });
  const link = `${process.env.SITE_URL ?? ''}/quan-tri/duyet-nhanh`;
  if (!auto) await notifyText(`[TAOMUA ${LEVELS[level].label}] Cần duyệt: ${title}`, link).catch(() => {});
  return { approval_id: `AI:${row.id}`, status: auto ? 'APPROVED_BY_AI' : 'PENDING', web_link: link, method: b.method ?? 'ONE_TAP', cap: level };
}

/** Trạng thái một mục (cho n8n hỏi lại). */
export async function qacStatus(approvalId: string) {
  const [type, id] = approvalId.split(':');
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  if (type === 'ORDER') {
    const o = await one('SELECT approval_status AS s, approved_by_label AS by, approved_at AS at FROM wholesale_orders WHERE id=$1', [id]);
    return o && { status: o.s, approved_by: o.by, approved_at: o.at };
  }
  if (type === 'PAYOUT') {
    const p = await one('SELECT status, approved_at FROM payouts WHERE id=$1', [id]);
    return p && { status: { DE_XUAT: 'PENDING', DA_DUYET: 'APPROVED', DA_CHI: 'APPROVED', TU_CHOI: 'REJECTED' }[p.status as string], approved_at: p.approved_at };
  }
  const a = await one('SELECT status, decided_label, decided_at FROM agent_actions WHERE id=$1', [id]);
  return a && { status: { DE_XUAT: 'PENDING', TU_DONG: 'APPROVED_BY_AI', DA_DUYET: 'APPROVED', TU_CHOI: 'REJECTED', LOI: 'FAILED' }[a.status as string] ?? a.status, approved_by: a.decided_label, approved_at: a.decided_at };
}
