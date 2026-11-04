import crypto from 'node:crypto';
import { tx } from './db';
import { audit, type Actor } from './audit';
import { markPaid } from './orders';

export type BankRow = { date: string; amount: number; description: string; ref: string };

/** CSV sao kê: ngay (YYYY-MM-DD hoặc DD/MM/YYYY), so_tien (âm là tiền ra), noi_dung, ma_gd. */
export function parseStatement(text: string): { rows: BankRow[]; errors: string[] } {
  const lines = text.replace(/\r/g, '').split('\n').filter((l) => l.trim());
  const errors: string[] = [];
  const rows: BankRow[] = [];
  if (!lines.length) return { rows, errors: ['Sao kê trống.'] };
  const head = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const ix = ['ngay', 'so_tien', 'noi_dung', 'ma_gd'].map((k) => head.indexOf(k));
  if (ix.some((i) => i < 0)) return { rows, errors: ['Cần các cột: ngay,so_tien,noi_dung,ma_gd'] };
  for (let i = 1; i < lines.length && i <= 5000; i++) {
    const c = lines[i].split(',');
    let date = (c[ix[0]] ?? '').trim();
    const m = date.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) date = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    const amount = Number((c[ix[1]] ?? '').replace(/[.\s]/g, '').replace(/,/g, ''));
    const ref = (c[ix[3]] ?? '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(amount) || amount === 0 || !ref) { errors.push(`Dòng ${i + 1} sai định dạng.`); continue; }
    rows.push({ date, amount: Math.round(amount), description: (c[ix[2]] ?? '').trim().slice(0, 500), ref: ref.slice(0, 100) });
  }
  return { rows, errors };
}

/** Nhập sao kê, tự khớp tiền vào với đơn (nội dung có mã đơn và đúng số tiền), tiền ra với khoản chi (mã giao dịch).
 *  Lệch trên 1% giữa tiền đơn đã ghi nhận và tiền thực vào thì đánh dấu LỆCH. */
export async function reconcile(rows: BankRow[], actor: Actor & { id: string }) {
  if (!rows.length) throw new Error('Không có giao dịch.');
  const batch = crypto.randomUUID();
  return tx(async (c) => {
    let inserted = 0, matchedOrders = 0, matchedPayouts = 0, duplicates = 0;
    for (const r of rows) {
      const ins = await c.query(`INSERT INTO bank_transactions(batch_id, txn_date, amount, description, bank_ref, imported_by) VALUES ($1,$2,$3,$4,$5,$6)
        ON CONFLICT (bank_ref) DO NOTHING RETURNING id`, [batch, r.date, r.amount, r.description, r.ref, actor.id]);
      if (!ins.rows[0]) { duplicates++; continue; }
      inserted++;
      const tid = ins.rows[0].id;
      if (r.amount > 0) {
        const code = r.description.toUpperCase().match(/TM\d{4,}/)?.[0];
        if (!code) continue;
        const o = (await c.query('SELECT id, tong_dt, status, payment_status FROM wholesale_orders WHERE code=$1', [code])).rows[0];
        if (!o || Number(o.tong_dt) !== r.amount) continue;
        if (o.payment_status !== 'DA_NHAN' && o.status === 'CHO_THANH_TOAN') await markPaid(o.id, actor, c);
        await c.query('UPDATE bank_transactions SET matched_order_id=$2 WHERE id=$1', [tid, o.id]);
        matchedOrders++;
      } else {
        const p = (await c.query("SELECT id FROM payouts WHERE paid_ref=$1 AND amount=$2 AND status='DA_CHI'", [r.ref, -r.amount])).rows[0];
        if (p) { await c.query('UPDATE bank_transactions SET matched_payout_id=$2 WHERE id=$1', [tid, p.id]); matchedPayouts++; }
      }
    }
    const from = rows.reduce((a, r) => (r.date < a ? r.date : a), rows[0].date);
    const to = rows.reduce((a, r) => (r.date > a ? r.date : a), rows[0].date);
    const actual = (await c.query('SELECT COALESCE(sum(amount),0) AS s FROM bank_transactions WHERE amount > 0 AND txn_date BETWEEN $1 AND $2', [from, to])).rows[0].s;
    const expected = (await c.query(`SELECT COALESCE(sum(tong_dt),0) AS s FROM wholesale_orders WHERE payment_status='DA_NHAN'
      AND (paid_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date BETWEEN $1 AND $2`, [from, to])).rows[0].s;
    const unmatched = Number((await c.query('SELECT count(*) AS n FROM bank_transactions WHERE batch_id=$1 AND matched_order_id IS NULL AND matched_payout_id IS NULL', [batch])).rows[0].n);
    const base = Math.max(Number(expected), Number(actual), 1);
    const diffPct = Math.round((Math.abs(Number(actual) - Number(expected)) / base) * 10000) / 100;
    const status = diffPct > 1 ? 'LECH' : 'KHOP';
    await c.query(`INSERT INTO reconciliation_runs(batch_id, period_from, period_to, expected_in, actual_in, diff_pct, unmatched, status, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [batch, from, to, expected, actual, diffPct, unmatched, status, actor.id]);
    await audit(actor, 'reconcile.run', 'reconciliation', batch, { from, to, expected, actual, diffPct, status, inserted, duplicates }, c);
    return { inserted, duplicates, matchedOrders, matchedPayouts, unmatched, expected: Number(expected), actual: Number(actual), diffPct, status };
  });
}
