import { apiAuth, json, handle } from '@/lib/api';
import { workingCapital } from '@/lib/capital';

// Spec #14. Input {tong_dt, ln_rong?, mb_bank_balance?, margin_on_cost?} → {von_luu_dong_30, du_phong_15, tong_von_can_45, vong_quay,
// bien_an_toan, status SAFE|WARNING|DANGER, mb_bank_balance}. Vòng quay = DT / vốn lưu động; biên an toàn = LN ròng / tổng vốn cần.
export async function POST(req: Request) {
  const a = await apiAuth(req, 'finance.view');
  if (a instanceof Response) return a;
  return handle(async () => {
    const b = await req.json().catch(() => ({}));
    const revenue = Number(b.tong_dt ?? b.revenue);
    if (!(revenue > 0)) return json({ error: 'tong_dt > 0' }, 400);
    const raw = b.mb_bank_balance ?? b.balance;
    const balance = raw === undefined || raw === null ? null : Number(raw);
    const ln = b.ln_rong !== undefined ? Number(b.ln_rong) : null;
    const wc = workingCapital(revenue, balance, Number(b.margin_on_cost ?? 25));
    const safety = ln !== null ? Math.round((ln / wc.total) * 10000) / 100 : null;
    const status = safety !== null && safety < 20 ? 'DANGER' : safety !== null && safety < 25 && wc.status === 'SAFE' ? 'WARNING' : wc.status;
    return json({
      tong_dt: revenue, von_luu_dong_30: wc.vld, du_phong_15: wc.reserve, tong_von_can_45: wc.total,
      vong_quay: Math.round((revenue / wc.vld) * 100) / 100, bien_an_toan: safety, status, mb_bank_balance: balance, thieu_von: wc.shortfall,
      // tên cũ, giữ để không hỏng chỗ đang dùng
      vld: wc.vld, reserve: wc.reserve, total: wc.total,
    });
  });
}
