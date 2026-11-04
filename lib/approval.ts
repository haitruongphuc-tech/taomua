import { MARGIN_FLOOR } from './pricing';

// Cấp duyệt lấy theo giá trị đơn. Biên chỉ đặt mức sàn: biên < 15% → tối thiểu Cấp 2, đơn lỗ → tối thiểu Cấp 4.
export const LEVELS = {
  1: { label: 'Cấp 1', approver: 'Tự động', roles: [] as string[], minutes: 2 },
  2: { label: 'Cấp 2', approver: 'Trưởng nhóm (CEO duyệt thay được)', roles: ['TRUONG_NHOM', 'CEO'], minutes: 30 },
  3: { label: 'Cấp 3', approver: 'CEO', roles: ['CEO'], minutes: 5 },
  4: { label: 'Cấp 4', approver: 'CEO', roles: ['CEO'], minutes: 120 },
  5: { label: 'Cấp 5', approver: 'CEO', roles: ['CEO'], minutes: 24 * 60 },
} as const;
export type Level = keyof typeof LEVELS;

const M = 1_000_000;

export function levelByValue(orderValue: number): Level {
  if (orderValue < 5 * M) return 1;
  if (orderValue < 20 * M) return 2;
  if (orderValue < 50 * M) return 3;
  if (orderValue <= 200 * M) return 4;
  return 5;
}

export function approvalLevel(orderValue: number, marginOnCost: number, net: number): { level: Level; reason: string } {
  const byValue = levelByValue(orderValue);
  let floor: Level = 1;
  let floorReason = '';
  if (net <= 0) { floor = 4; floorReason = 'Đơn lỗ: tối thiểu Cấp 4.'; }
  else if (marginOnCost < MARGIN_FLOOR) { floor = 2; floorReason = `Biên ${marginOnCost}% dưới sàn ${MARGIN_FLOOR}%: tối thiểu Cấp 2.`; }
  const level = Math.max(byValue, floor) as Level;
  const reason = level > byValue ? floorReason : `Giá trị đơn thuộc ${LEVELS[byValue].label}.`;
  return { level, reason };
}

export function canApprove(role: string, level: Level): boolean {
  return (LEVELS[level].roles as readonly string[]).includes(role);
}

export function deadlineFor(level: Level, from = new Date()): Date {
  return new Date(from.getTime() + LEVELS[level].minutes * 60_000);
}
