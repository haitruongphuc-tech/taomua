// Marketing (spec module Marketing & RYN-SALES): ROAS, CTR, CPA và quy tắc AI cho chiến dịch quảng cáo.
// Spec: "Nút Auto Ads — Tắt khi ROAS < 2 hoặc CTR < 2%"; "LATR CTR > 3% mới scale — nếu CTR > 3% tự động tăng Ads 20%, nếu CTR < 2% dừng".
export const ROAS_STOP = 2;
export const CTR_STOP = 2;     // %
export const CTR_SCALE = 3;    // %
export const SCALE_STEP = 0.2; // +20% ngân sách/ngày
export const MIN_DAYS = 3;     // cần ít nhất 3 ngày số liệu trong 7 ngày gần nhất mới quyết định
export const MIN_IMPRESSIONS = 1000;

export type AdTotals = { days: number; spend: number; impressions: number; clicks: number; orders: number; revenue: number };

export function adMetrics(t: AdTotals) {
  const ctr = t.impressions > 0 ? Math.round((t.clicks / t.impressions) * 10000) / 100 : null;
  const roas = t.spend > 0 ? Math.round((t.revenue / t.spend) * 100) / 100 : null;
  const cpa = t.orders > 0 ? Math.round(t.spend / t.orders) : null;
  return { ctr, roas, cpa };
}

/** Quyết định cho một chiến dịch đang chạy dựa trên 7 ngày gần nhất. */
export function adDecision(t: AdTotals, roasTarget = ROAS_STOP): { action: 'STOP' | 'SCALE' | null; reason: string } {
  if (t.days < MIN_DAYS || t.impressions < MIN_IMPRESSIONS) return { action: null, reason: 'Chưa đủ số liệu (cần ≥ 3 ngày và ≥ 1.000 lượt hiển thị).' };
  const { ctr, roas } = adMetrics(t);
  if (roas !== null && roas < ROAS_STOP) return { action: 'STOP', reason: `ROAS ${roas} < ${ROAS_STOP}` };
  if (ctr !== null && ctr < CTR_STOP) return { action: 'STOP', reason: `CTR ${ctr}% < ${CTR_STOP}%` };
  if (ctr !== null && ctr > CTR_SCALE && roas !== null && roas >= Math.max(roasTarget, ROAS_STOP)) {
    return { action: 'SCALE', reason: `CTR ${ctr}% > ${CTR_SCALE}% và ROAS ${roas} ≥ ${Math.max(roasTarget, ROAS_STOP)}` };
  }
  return { action: null, reason: 'Trong ngưỡng, giữ nguyên.' };
}

/** CSV số liệu: ngay,chi_phi,hien_thi,click,don,doanh_thu (dòng đầu là tiêu đề). */
export function parseAdCsv(text: string) {
  const lines = text.replace(/\r/g, '').split('\n').filter((l) => l.trim());
  const rows: { day: string; spend: number; impressions: number; clicks: number; orders: number; revenue: number }[] = [];
  const errors: string[] = [];
  const head = (lines[0] ?? '').split(',').map((h) => h.trim().toLowerCase());
  const need = ['ngay', 'chi_phi', 'hien_thi', 'click', 'don', 'doanh_thu'];
  const ix = need.map((n) => head.indexOf(n));
  if (ix.some((i) => i < 0)) return { rows, errors: [`Cần các cột: ${need.join(',')}`] };
  for (let i = 1; i < lines.length && i <= 400; i++) {
    const c = lines[i].split(',').map((x) => x.trim());
    let day = c[ix[0]] ?? '';
    const m = day.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) day = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    const n = (k: number) => Number(String(c[ix[k]] ?? '').replace(/[.\s]/g, ''));
    const r = { day, spend: n(1), impressions: n(2), clicks: n(3), orders: n(4), revenue: n(5) };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || [r.spend, r.impressions, r.clicks, r.orders, r.revenue].some((x) => !Number.isFinite(x) || x < 0) || r.clicks > r.impressions) {
      errors.push(`Dòng ${i + 1} sai.`); continue;
    }
    rows.push(r);
  }
  return { rows, errors };
}
