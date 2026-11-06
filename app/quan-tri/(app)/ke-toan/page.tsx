import Link from 'next/link';
import { requireUser, actorOf, can } from '@/lib/auth';
import { q } from '@/lib/db';
import { audit } from '@/lib/audit';
import { runAction, UserError } from '@/lib/action';
import { isUuid } from '@/lib/catalog';
import { vnd, dt } from '@/lib/format';
import { LEGAL } from '@/lib/legal';
import Flash from '@/components/Flash';

// Module Kế toán thuế (spec 04_FRONTEND_PAGES.md): VAT 8%, TNDN 20%, hóa đơn điện tử > 10 triệu, sổ sách cho MISA/FAST.
const INVOICE_THRESHOLD = 10_000_000;

async function saveInvoice(fd: FormData) {
  'use server';
  const u = await requireUser('orders.payment');
  await runAction('/quan-tri/ke-toan', async () => {
    const id = String(fd.get('id'));
    const no = String(fd.get('invoice_no') ?? '').trim().slice(0, 50);
    if (!isUuid(id) || !no) throw new UserError('Cần số hóa đơn.');
    const r = await q("UPDATE wholesale_orders SET invoice_no=$2, invoice_at=now() WHERE id=$1 AND payment_status='DA_NHAN' RETURNING code", [id, no]);
    if (!r.length) throw new UserError('Chỉ ghi hóa đơn cho đơn đã nhận tiền.');
    await audit(actorOf(u), 'invoice.record', 'order', id, { code: r[0].code, invoice_no: no });
    return `Đã ghi hóa đơn ${no} cho đơn ${r[0].code}.`;
  });
}

export default async function Accounting({ searchParams }: { searchParams: { ok?: string; loi?: string; nam?: string } }) {
  const u = await requireUser('finance.view');
  const year = Math.min(2100, Math.max(2020, Number(searchParams.nam) || new Date().getFullYear()));
  const months = await q(`SELECT extract(month FROM paid_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::int AS m, count(*)::int AS n,
      sum(tong_dt)::bigint AS dt, sum(vat_8)::bigint AS vat_ra, sum(vat_dau_vao)::bigint AS vat_vao, sum(phi_kenh)::bigint AS phi_kenh,
      sum(phi_mb_1)::bigint AS phi_nh, sum(ln_truoc_tndn)::bigint AS ln_truoc, sum(thue_tndn_20)::bigint AS tndn, sum(ln_rong_sau_thue)::bigint AS ln_rong,
      sum(ship_fee)::bigint AS ship
    FROM wholesale_orders WHERE payment_status='DA_NHAN' AND trade_assurance_status <> 'REFUND'
      AND extract(year FROM paid_at AT TIME ZONE 'Asia/Ho_Chi_Minh') = $1 GROUP BY 1 ORDER BY 1`, [year]);
  const opex = await q(`SELECT extract(month FROM paid_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::int AS m, sum(amount)::bigint AS chi
    FROM payouts WHERE status='DA_CHI' AND extract(year FROM paid_at AT TIME ZONE 'Asia/Ho_Chi_Minh') = $1 GROUP BY 1`, [year]);
  const chi: Record<number, number> = Object.fromEntries(opex.map((r) => [r.m, Number(r.chi)]));
  const needInvoice = await q(`SELECT o.id, o.code, o.tong_dt, o.paid_at, cu.name, cu.tax_code FROM wholesale_orders o JOIN customers cu ON cu.id=o.customer_id
    WHERE o.payment_status='DA_NHAN' AND o.invoice_no IS NULL AND o.trade_assurance_status <> 'REFUND' ORDER BY (o.tong_dt >= $1) DESC, o.paid_at`, [INVOICE_THRESHOLD]);
  const sum = (k: string) => months.reduce((a, r) => a + Number(r[k] ?? 0), 0);
  const rows: [string, string, boolean?][] = [
    ['n', 'Số đơn đã thu tiền'], ['dt', 'Doanh thu (gồm VAT)'], ['vat_ra', 'VAT đầu ra 8%'], ['vat_vao', 'VAT đầu vào được trừ'],
    ['vat_nop', 'VAT phải nộp', true], ['phi_kenh', 'Phí sàn / kênh'], ['phi_nh', 'Phí ngân hàng 1%'], ['ln_truoc', 'LN trước TNDN'],
    ['tndn', 'TNDN 20% (tạm tính theo đơn)', true], ['ln_rong', 'LN ròng sau thuế'], ['chi', 'Chi vận hành đã chi (Chi tiền)'], ['ship', 'Phí vận chuyển thu hộ (quốc tế)'],
  ];
  const val = (r: any, k: string) => (k === 'vat_nop' ? Number(r.vat_ra) - Number(r.vat_vao) : k === 'chi' ? chi[r.m] ?? 0 : Number(r[k] ?? 0));
  const total = (k: string) => (k === 'vat_nop' ? sum('vat_ra') - sum('vat_vao') : k === 'chi' ? Object.values(chi).reduce((a, b) => a + b, 0) : sum(k));

  return (
    <div className="stack">
      <h1>Kế toán & thuế</h1>
      <Flash sp={searchParams} />
      <p className="muted small">
        {LEGAL.name} · MST {LEGAL.taxCode}. Số liệu lấy từ đơn đã nhận tiền (trừ đơn hoàn tiền), theo ngày nhận tiền. VAT = giá × 8/108; TNDN tính tạm
        trên từng đơn có lãi, quyết toán năm do kế toán làm. Chưa nối API MISA / FAST / VNPT Invoice: tải sổ bán hàng CSV để nhập.
      </p>
      <div className="row" style={{ gap: 8 }}>
        <form className="row" style={{ gap: 6 }}><label className="small">Năm <input name="nam" type="number" defaultValue={year} style={{ width: 90 }} /></label><button className="btn secondary sm">Xem</button></form>
        <a className="btn sm" href={`/api/ke-toan/so-ban-hang.csv?nam=${year}`}>Tải sổ bán hàng CSV ({year})</a>
      </div>
      <div className="table-wrap"><table className="small">
        <thead><tr><th>Khoản</th>{months.map((r) => <th key={r.m} className="num">T{r.m}</th>)}<th className="num">Cả năm</th></tr></thead>
        <tbody>{rows.map(([k, label, bold]) => (
          <tr key={k}><td>{bold ? <b>{label}</b> : label}</td>
            {months.map((r) => <td key={r.m} className="num">{k === 'n' ? r.n : vnd(val(r, k))}</td>)}
            <td className="num"><b>{k === 'n' ? total('n') : vnd(total(k))}</b></td></tr>
        ))}</tbody>
      </table></div>
      {months.length === 0 && <p className="muted">Chưa có đơn nào nhận tiền trong năm {year}.</p>}

      <h2>Hóa đơn điện tử cần xuất ({needInvoice.length})</h2>
      <p className="muted small">Đơn từ {vnd(INVOICE_THRESHOLD)} trở lên bắt buộc xuất hóa đơn (CEO quyết định theo spec); đơn nhỏ hơn xuất khi khách yêu cầu. Ghi số hóa đơn sau khi xuất trên VNPT Invoice / Viettel S-Invoice.</p>
      <div className="table-wrap"><table className="small">
        <thead><tr><th>Đơn</th><th>Khách</th><th>MST khách</th><th className="num">Tổng</th><th>Nhận tiền</th><th>Số hóa đơn</th></tr></thead>
        <tbody>{needInvoice.map((o) => (
          <tr key={o.id}>
            <td><Link href={`/quan-tri/don-hang/${o.id}`}>{o.code}</Link>{Number(o.tong_dt) >= INVOICE_THRESHOLD && <span className="badge bad" style={{ marginLeft: 6 }}>bắt buộc</span>}</td>
            <td>{o.name}</td><td className="mono">{o.tax_code ?? '—'}</td><td className="num">{vnd(o.tong_dt)}</td><td>{dt(o.paid_at)}</td>
            <td>{can(u, 'orders.payment') ? (
              <form action={saveInvoice} className="row" style={{ gap: 6 }}><input type="hidden" name="id" value={o.id} />
                <input name="invoice_no" placeholder="Số HĐ" required style={{ width: 120 }} /><button className="btn sm">Ghi</button></form>
            ) : '—'}</td>
          </tr>
        ))}</tbody>
      </table></div>
    </div>
  );
}
