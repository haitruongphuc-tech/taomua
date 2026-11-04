// Vốn lưu động 30% + dự phòng 15% = 45% doanh thu. Vòng quay > 3, biên an toàn > 20%.
export function workingCapital(revenue: number, bankBalance: number | null, marginOnCost: number) {
  const vld = Math.round(revenue * 0.3);
  const reserve = Math.round(revenue * 0.15);
  const total = vld + reserve;
  let status: 'SAFE' | 'WARNING' | 'DANGER' = 'SAFE';
  if (bankBalance !== null) {
    if (bankBalance < vld) status = 'DANGER';
    else if (bankBalance < total) status = 'WARNING';
  }
  if (status === 'SAFE' && marginOnCost < 20) status = 'WARNING';
  return { vld, reserve, total, status, shortfall: bankBalance === null ? null : Math.max(0, total - bankBalance) };
}
