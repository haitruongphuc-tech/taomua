import { requireUser, actorOf, can } from '@/lib/auth';
import { q } from '@/lib/db';
import { trustScore, TRUST_WEIGHTS } from '@/lib/trust';
import { audit } from '@/lib/audit';
import { runAction, UserError } from '@/lib/action';
import { isUuid } from '@/lib/catalog';
import Flash from '@/components/Flash';

const SOURCES = ['1688', 'AMAZON', 'WALMART', 'VN_FACTORY', 'OEM'];

async function save(fd: FormData) {
  'use server';
  const u = await requireUser('suppliers.edit');
  await runAction('/quan-tri/xuong', async () => {
    const id = String(fd.get('id') ?? '');
    const d = {
      name: String(fd.get('name') ?? '').trim().slice(0, 200),
      source: String(fd.get('source')),
      country: String(fd.get('country') ?? 'VN').slice(0, 4),
      years_active: Math.max(0, Math.round(Number(fd.get('years_active')) || 0)),
      contact: String(fd.get('contact') ?? '').slice(0, 200) || null,
      response_time_sec: Math.max(1, Math.round(Number(fd.get('response_time_sec')) || 3600)),
      defect_rate: Math.min(1, Math.max(0, Number(fd.get('defect_pct')) / 100 || 0)),
      on_time_rate: Math.min(1, Math.max(0, Number(fd.get('on_time_pct')) / 100 || 0)),
      verified_cert: fd.get('verified_cert') === 'on',
      inventory_sync: fd.get('inventory_sync') === 'on',
      moq: Math.max(1, Math.round(Number(fd.get('moq')) || 10)),
    };
    if (!d.name) throw new UserError('Cần tên xưởng.');
    if (!SOURCES.includes(d.source)) throw new UserError('Nguồn không hợp lệ.');
    const score = trustScore(d).score;
    const cols = [...Object.keys(d), 'trust_score'];
    const vals = [...Object.values(d), score];
    if (id) {
      if (!isUuid(id)) throw new UserError('Xưởng không hợp lệ.');
      await q(`UPDATE suppliers SET ${cols.map((c, i) => `${c}=$${i + 2}`).join(', ')} WHERE id=$1`, [id, ...vals]);
    } else {
      await q(`INSERT INTO suppliers(${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')})`, vals);
    }
    await audit(actorOf(u), id ? 'supplier.update' : 'supplier.create', 'supplier', id || null, { name: d.name, trust: score });
    return `Đã lưu xưởng. TrustScore ${score}.`;
  });
}

function SupplierFields({ s }: { s?: any }) {
  return (
    <>
      {s && <input type="hidden" name="id" value={s.id} />}
      <label className="field">Tên xưởng<input name="name" required defaultValue={s?.name} /></label>
      <label className="field">Nguồn<select name="source" defaultValue={s?.source ?? 'VN_FACTORY'}>{SOURCES.map((x) => <option key={x}>{x}</option>)}</select></label>
      <label className="field">Quốc gia<input name="country" defaultValue={s?.country ?? 'VN'} /></label>
      <label className="field">Số năm<input name="years_active" type="number" min={0} defaultValue={s?.years_active ?? 0} /></label>
      <label className="field">Liên hệ<input name="contact" defaultValue={s?.contact ?? ''} /></label>
      <label className="field">Phản hồi (giây)<input name="response_time_sec" type="number" min={1} defaultValue={s?.response_time_sec ?? 3600} /></label>
      <label className="field">Tỷ lệ lỗi (%)<input name="defect_pct" type="number" step="0.1" min={0} defaultValue={s ? (s.defect_rate * 100).toFixed(1) : 2} /></label>
      <label className="field">Giao đúng hạn (%)<input name="on_time_pct" type="number" step="0.1" min={0} max={100} defaultValue={s ? (s.on_time_rate * 100).toFixed(1) : 90} /></label>
      <label className="field">MOQ<input name="moq" type="number" min={1} defaultValue={s?.moq ?? 10} /></label>
      <label className="row"><input type="checkbox" name="verified_cert" defaultChecked={s?.verified_cert} /> Có chứng nhận đã xác minh</label>
      <label className="row"><input type="checkbox" name="inventory_sync" defaultChecked={s?.inventory_sync} /> Đồng bộ tồn kho</label>
    </>
  );
}

export default async function Suppliers({ searchParams }: { searchParams: { ok?: string; loi?: string } }) {
  const u = await requireUser('orders.view');
  const rows = await q(`SELECT s.*, (SELECT count(*)::int FROM products p WHERE p.supplier_id=s.id) AS n_products FROM suppliers s ORDER BY trust_score DESC`);
  const edit = can(u, 'suppliers.edit');
  return (
    <div className="stack">
      <h1>Xưởng</h1>
      <Flash sp={searchParams} />
      <div className="alert info small">TrustScore đang tạm tính 5 yếu tố: phản hồi ≤ 90 giây ({TRUST_WEIGHTS.response}), chứng nhận ({TRUST_WEIGHTS.cert}), tỷ lệ lỗi ({TRUST_WEIGHTS.defect}), đúng hạn ({TRUST_WEIGHTS.onTime}), đồng bộ tồn kho ({TRUST_WEIGHTS.inventory}). Chờ danh sách 19 yếu tố từ chủ dự án.</div>
      <div className="table-wrap"><table>
        <thead><tr><th>Xưởng</th><th>Nguồn</th><th className="num">TrustScore</th><th className="num">Phản hồi</th><th className="num">Lỗi</th><th className="num">Đúng hạn</th><th className="num">Sản phẩm</th></tr></thead>
        <tbody>{rows.map((s) => (
          <tr key={s.id}>
            <td>{s.name}<div className="small muted">{s.country} · {s.years_active} năm{s.verified_cert ? ' · đã xác minh' : ''}{s.is_simulated ? ' · giả lập' : ''}</div></td>
            <td>{s.source}</td><td className="num"><b>{s.trust_score}</b></td><td className="num">{s.response_time_sec}s</td>
            <td className="num">{(s.defect_rate * 100).toFixed(1)}%</td><td className="num">{(s.on_time_rate * 100).toFixed(0)}%</td><td className="num">{s.n_products}</td>
          </tr>
        ))}</tbody>
      </table></div>
      {edit && (
        <>
          <details className="card"><summary><b>Thêm xưởng</b></summary>
            <form action={save} className="form-grid" style={{ marginTop: 12 }}><SupplierFields /><div style={{ alignSelf: 'end' }}><button className="btn">Lưu</button></div></form>
          </details>
          {rows.map((s) => (
            <details key={s.id} className="card"><summary>Sửa: {s.name}</summary>
              <form action={save} className="form-grid" style={{ marginTop: 12 }}><SupplierFields s={s} /><div style={{ alignSelf: 'end' }}><button className="btn">Lưu</button></div></form>
            </details>
          ))}
        </>
      )}
    </div>
  );
}
