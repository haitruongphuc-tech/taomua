import { requireUser, actorOf } from '@/lib/auth';
import { q, one } from '@/lib/db';
import { workingCapital } from '@/lib/capital';
import { audit } from '@/lib/audit';
import { runAction, UserError } from '@/lib/action';
import { short, pct, vnd } from '@/lib/format';
import Flash from '@/components/Flash';

async function setBalance(fd: FormData) {
  'use server';
  const u = await requireUser('reconcile.run');
  await runAction('/quan-tri/von', async () => {
    const month = Math.round(Number(fd.get('month')));
    const bal = Math.round(Number(fd.get('balance')));
    if (!(month >= 1 && month <= 12) || !(bal >= 0)) throw new UserError('Tháng hoặc số dư không hợp lệ.');
    const row = await one('SELECT tong_dt, bien_an_toan FROM working_capital WHERE month=$1', [month]);
    if (!row) throw new UserError('Không có dữ liệu tháng này.');
    const w = workingCapital(row.tong_dt, bal, row.bien_an_toan);
    await q('UPDATE working_capital SET mb_bank_balance=$2, status=$3 WHERE month=$1', [month, bal, w.status]);
    await audit(actorOf(u), 'capital.balance', 'working_capital', String(month), { balance: bal, status: w.status });
    return `Đã cập nhật số dư tháng ${month}: ${w.status}.`;
  });
}

const TONE: Record<string, string> = { SAFE: 'ok', WARNING: 'warn', DANGER: 'bad' };
const TXT: Record<string, string> = { SAFE: 'An toàn', WARNING: 'Cảnh báo', DANGER: 'Nguy hiểm' };

export default async function Capital({ searchParams }: { searchParams: { ok?: string; loi?: string } }) {
  await requireUser('finance.view');
  const rows = await q('SELECT * FROM working_capital ORDER BY month');
  const total = rows.reduce((a, r) => ({ dt: a.dt + r.tong_dt, ln: a.ln + r.ln_rong }), { dt: 0, ln: 0 });
  const held = await one("SELECT COALESCE(sum(tong_dt),0) AS s FROM wholesale_orders WHERE trade_assurance_status='HOLD'");
  const max = Math.max(...rows.map((r) => r.tong_dt), 1);
  return (
    <div className="stack">
      <h1>Vốn lưu động &amp; dự toán 12 tháng</h1>
      <Flash sp={searchParams} />
      <div className="alert warn">Doanh thu và lợi nhuận dưới đây là <b>số giả lập</b> từ file dự toán, không phải kết quả thực. File dự toán tính VAT theo cách cũ (8% doanh thu).</div>
      <div className="grid cols-4">
        <div className="card kpi"><span className="l">Tổng DT 12 tháng (giả lập)</span><span className="v">{short(total.dt)}</span></div>
        <div className="card kpi"><span className="l">Tổng LN ròng (giả lập)</span><span className="v">{short(total.ln)}</span></div>
        <div className="card kpi"><span className="l">Quy tắc vốn</span><span className="v">45%</span><span className="small muted">30% lưu động + 15% dự phòng</span></div>
        <div className="card kpi"><span className="l">Tiền khách đang giữ (thực)</span><span className="v">{short(held.s)}</span><span className="small muted">Không tính là vốn của công ty</span></div>
      </div>
      <section className="card stack" aria-label="Biểu đồ doanh thu dự toán">
        <h2>Doanh thu và vốn cần theo tháng (giả lập)</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 6, alignItems: 'end', height: 180 }}>
          {rows.map((r) => (
            <div key={r.month} title={`Tháng ${r.month}: DT ${short(r.tong_dt)}, vốn cần ${short(r.tong_von_can_45)}`} style={{ display: 'grid', gap: 2, alignItems: 'end', height: '100%' }}>
              <div style={{ position: 'relative', height: '100%', display: 'flex', alignItems: 'end' }}>
                <div style={{ width: '100%', height: `${(r.tong_dt / max) * 100}%`, background: 'var(--blue)', borderRadius: '4px 4px 0 0', position: 'relative' }}>
                  <div style={{ position: 'absolute', bottom: 0, width: '100%', height: '45%', background: 'var(--orange)', opacity: .85 }} />
                </div>
              </div>
              <div className="small muted" style={{ textAlign: 'center' }}>T{r.month}</div>
            </div>
          ))}
        </div>
        <div className="row small"><span><span style={{ display: 'inline-block', width: 10, height: 10, background: 'var(--blue)' }} /> Doanh thu</span><span><span style={{ display: 'inline-block', width: 10, height: 10, background: 'var(--orange)' }} /> Vốn cần 45%</span></div>
      </section>
      <div className="table-wrap"><table>
        <thead><tr><th>Tháng</th><th className="num">Doanh thu</th><th className="num">LN ròng</th><th className="num">Biên/CP</th><th className="num">Vốn LĐ 30%</th><th className="num">Dự phòng 15%</th><th className="num">Tổng cần 45%</th><th className="num">Số dư thực</th><th>Trạng thái</th></tr></thead>
        <tbody>{rows.map((r) => (
          <tr key={r.month}>
            <td>{r.month}</td><td className="num">{short(r.tong_dt)}</td><td className="num">{short(r.ln_rong)}</td><td className="num">{pct(r.bien_an_toan)}</td>
            <td className="num">{short(r.von_luu_dong_30)}</td><td className="num">{short(r.du_phong_15)}</td><td className="num">{short(r.tong_von_can_45)}</td>
            <td className="num">{r.mb_bank_balance === null ? '—' : vnd(r.mb_bank_balance)}</td>
            <td><span className={`badge ${TONE[r.status]}`}>{TXT[r.status]}</span></td>
          </tr>
        ))}</tbody>
      </table></div>
      <form action={setBalance} className="card form-grid">
        <label className="field">Tháng<input name="month" type="number" min={1} max={12} required /></label>
        <label className="field">Số dư tài khoản thực (đ)<input name="balance" type="number" min={0} required /></label>
        <div style={{ alignSelf: 'end' }}><button className="btn sm">Cập nhật số dư</button></div>
      </form>
      <p className="muted small">Trạng thái: số dư dưới 30% DT là Nguy hiểm, dưới 45% là Cảnh báo; biên dưới 20% cũng là Cảnh báo. Khi có API ngân hàng, số dư sẽ được lấy tự động.</p>
    </div>
  );
}
