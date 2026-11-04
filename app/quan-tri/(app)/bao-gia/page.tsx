import { requireUser, actorOf, can } from '@/lib/auth';
import { q } from '@/lib/db';
import { audit } from '@/lib/audit';
import { runAction, UserError } from '@/lib/action';
import { vnd, dt } from '@/lib/format';
import Flash from '@/components/Flash';

const ST: Record<string, string> = { MOI: 'Mới', DANG_TIM_XUONG: 'Đang tìm xưởng', DA_BAO_GIA: 'Đã báo giá', DONG: 'Đã đóng' };

async function update(fd: FormData) {
  'use server';
  const u = await requireUser('rfq.edit');
  await runAction('/quan-tri/bao-gia', async () => {
    const status = String(fd.get('status'));
    if (!ST[status]) throw new UserError('Trạng thái không hợp lệ.');
    const price = fd.get('quote_price') ? Math.round(Number(fd.get('quote_price'))) : null;
    if (status === 'DA_BAO_GIA' && !(price && price > 0)) throw new UserError('Đã báo giá thì cần giá báo.');
    await q('UPDATE rfqs SET status=$2, quote_price=$3, quote_note=$4 WHERE id=$1', [String(fd.get('id')), status, price, String(fd.get('quote_note') ?? '').slice(0, 2000)]);
    await audit(actorOf(u), 'rfq.update', 'rfq', String(fd.get('id')), { status, price });
    return 'Đã cập nhật yêu cầu báo giá.';
  });
}

export default async function Rfqs({ searchParams }: { searchParams: { ok?: string; loi?: string } }) {
  const u = await requireUser('orders.view');
  const rows = await q('SELECT * FROM rfqs ORDER BY created_at DESC LIMIT 200');
  return (
    <div className="stack">
      <h1>Yêu cầu báo giá</h1>
      <Flash sp={searchParams} />
      {rows.length === 0 && <div className="card">Chưa có yêu cầu nào.</div>}
      {rows.map((r) => (
        <section key={r.id} className="card stack">
          <div className="row spread"><b>{r.code}</b><span className="badge">{ST[r.status]}</span></div>
          <div>{r.product_text}</div>
          <div className="small muted">{r.contact_name} · {r.phone}{r.email ? ` · ${r.email}` : ''} · SL {r.quantity}{r.target_price ? ` · mong muốn ${vnd(r.target_price)}/cái` : ''} · {dt(r.created_at)}</div>
          {can(u, 'rfq.edit') && (
            <form action={update} className="form-grid">
              <input type="hidden" name="id" value={r.id} />
              <label className="field">Trạng thái<select name="status" defaultValue={r.status}>{Object.entries(ST).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
              <label className="field">Giá báo mỗi cái (đ)<input name="quote_price" type="number" min={1} defaultValue={r.quote_price ?? ''} /></label>
              <label className="field">Ghi chú báo giá<input name="quote_note" defaultValue={r.quote_note} /></label>
              <div style={{ alignSelf: 'end' }}><button className="btn sm">Lưu</button></div>
            </form>
          )}
        </section>
      ))}
    </div>
  );
}
