import { redirect } from 'next/navigation';
import { requireUser, actorOf } from '@/lib/auth';
import { q } from '@/lib/db';
import { parseStatement, reconcile } from '@/lib/reconcile';
import { notifyText } from '@/lib/notify';
import { vnd, pct, dt } from '@/lib/format';
import Flash from '@/components/Flash';

async function upload(fd: FormData) {
  'use server';
  const u = await requireUser('reconcile.run');
  const file = fd.get('file');
  let text = String(fd.get('csv') ?? '');
  if (file && typeof file === 'object' && 'text' in file && file.size > 0) {
    if (file.size > 5_000_000) redirect('/quan-tri/doi-soat?loi=' + encodeURIComponent('File quá 5 MB.'));
    text = await file.text();
  }
  const { rows, errors } = parseStatement(text);
  if (!rows.length) redirect('/quan-tri/doi-soat?loi=' + encodeURIComponent(errors.join(' ') || 'Không có giao dịch.'));
  const r = await reconcile(rows, { ...actorOf(u), id: u.id });
  if (r.status === 'LECH') await notifyText(`Đối soát LỆCH ${r.diffPct}%: tiền vào ${vnd(r.actual)}, đơn đã ghi nhận ${vnd(r.expected)}.`).catch(() => null);
  const msg = `Đã nhập ${r.inserted} giao dịch (${r.duplicates} trùng bỏ qua). Khớp ${r.matchedOrders} đơn, ${r.matchedPayouts} khoản chi. Chưa khớp ${r.unmatched}. Lệch ${r.diffPct}%.${errors.length ? ' Lỗi: ' + errors.slice(0, 5).join(' ') : ''}`;
  redirect(`/quan-tri/doi-soat?${r.status === 'LECH' ? 'loi' : 'ok'}=${encodeURIComponent(msg)}`);
}

export default async function Reconcile({ searchParams }: { searchParams: { ok?: string; loi?: string } }) {
  await requireUser('reconcile.run');
  const runs = await q('SELECT r.*, u.name AS by_name FROM reconciliation_runs r LEFT JOIN users u ON u.id=r.created_by ORDER BY created_at DESC LIMIT 20');
  const unmatched = await q('SELECT * FROM bank_transactions WHERE matched_order_id IS NULL AND matched_payout_id IS NULL ORDER BY txn_date DESC LIMIT 100');
  return (
    <div className="stack">
      <h1>Đối soát sao kê</h1>
      <Flash sp={searchParams} />
      <p className="muted">Tải sao kê ngân hàng dạng CSV. Hệ thống tự khớp tiền vào có mã đơn (TMxxxx) và đúng số tiền, ghi nhận đã thanh toán và chuyển tiền sang trạng thái giữ. Lệch trên 1% sẽ báo động. Hệ thống không tự chuyển tiền.</p>
      <form action={upload} className="card stack">
        <div className="form-grid"><label className="field">File CSV<input type="file" name="file" accept=".csv,text/csv" /></label></div>
        <label className="field">Hoặc dán CSV<textarea name="csv" rows={5} placeholder={'ngay,so_tien,noi_dung,ma_gd\n2026-11-04,2250000,CK TM1001 thanh toan,FT2611040001'} /></label>
        <div><button className="btn">Đối soát</button></div>
      </form>
      <h2>Các lần đối soát</h2>
      <div className="table-wrap"><table>
        <thead><tr><th>Lúc</th><th>Kỳ</th><th className="num">Đơn đã ghi nhận</th><th className="num">Tiền thực vào</th><th className="num">Lệch</th><th className="num">Chưa khớp</th><th>Kết quả</th></tr></thead>
        <tbody>{runs.map((r) => (
          <tr key={r.id}><td className="small">{dt(r.created_at)}<br />{r.by_name}</td><td className="small">{String(r.period_from).slice(0, 10)} → {String(r.period_to).slice(0, 10)}</td>
            <td className="num">{vnd(r.expected_in)}</td><td className="num">{vnd(r.actual_in)}</td><td className="num">{pct(r.diff_pct)}</td><td className="num">{r.unmatched}</td>
            <td>{r.status === 'KHOP' ? <span className="badge ok">Khớp</span> : <span className="badge bad">Lệch</span>}</td></tr>
        ))}</tbody>
      </table></div>
      <h2>Giao dịch chưa khớp</h2>
      <div className="table-wrap"><table>
        <thead><tr><th>Ngày</th><th className="num">Số tiền</th><th>Nội dung</th><th>Mã GD</th></tr></thead>
        <tbody>{unmatched.map((t) => <tr key={t.id}><td>{new Date(t.txn_date).toLocaleDateString('vi-VN')}</td><td className="num">{vnd(t.amount)}</td><td>{t.description}</td><td className="mono small">{t.bank_ref}</td></tr>)}</tbody>
      </table></div>
    </div>
  );
}
