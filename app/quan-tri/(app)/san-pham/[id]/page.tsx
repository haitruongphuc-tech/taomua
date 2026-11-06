import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { requireUser, actorOf, can } from '@/lib/auth';
import { q, one } from '@/lib/db';
import { isUuid } from '@/lib/catalog';
import { saveProduct } from '@/lib/products';
import { audit } from '@/lib/audit';
import { UserError, runAction } from '@/lib/action';
import { vnd, dt } from '@/lib/format';
import ProductForm from '../ProductForm';
import TraceQr from '@/components/TraceQr';
import { recordQc } from '@/lib/qc';
import Flash from '@/components/Flash';

async function update(fd: FormData) {
  'use server';
  const u = await requireUser('products.edit');
  const id = String(fd.get('id'));
  let r;
  try { r = await saveProduct(fd, actorOf(u)); } catch (e) {
    if (e instanceof UserError) redirect(`/quan-tri/san-pham/${id}?loi=${encodeURIComponent(e.message)}`);
    throw e;
  }
  const msg = r.warnings.length ? `Đã lưu, có cảnh báo: ${r.warnings.join(' ')}` : 'Đã lưu sản phẩm.';
  redirect(`/quan-tri/san-pham/${r.id}?${r.warnings.length ? 'loi' : 'ok'}=${encodeURIComponent(msg)}`);
}

async function comparison(fd: FormData) {
  'use server';
  const u = await requireUser('products.edit');
  const pid = String(fd.get('product_id'));
  await runAction(`/quan-tri/san-pham/${pid}`, async () => {
    if (fd.get('op') === 'del') {
      await q('DELETE FROM price_comparisons WHERE id=$1 AND product_id=$2', [String(fd.get('id')), pid]);
      await audit(actorOf(u), 'comparison.delete', 'product', pid);
      return 'Đã xóa giá đối chiếu.';
    }
    if (fd.get('op') === 'recheck') {
      await q('UPDATE price_comparisons SET checked_at=now(), checked_by=$3 WHERE id=$1 AND product_id=$2', [String(fd.get('id')), pid, u.id]);
      await audit(actorOf(u), 'comparison.recheck', 'product', pid);
      return 'Đã ghi nhận kiểm tra lại.';
    }
    const url = String(fd.get('source_url') ?? '').trim();
    const price = Math.round(Number(fd.get('price')));
    const qty = Math.max(1, Math.round(Number(fd.get('qty_basis')) || 1));
    const platform = String(fd.get('platform') ?? '').trim().slice(0, 80);
    if (!/^https?:\/\//.test(url)) throw new UserError('Cần đường dẫn nguồn bắt đầu bằng http(s)://');
    if (!platform || !(price > 0)) throw new UserError('Cần tên nơi bán và giá.');
    await q('INSERT INTO price_comparisons(product_id, platform, price, qty_basis, source_url, checked_by) VALUES ($1,$2,$3,$4,$5,$6)', [pid, platform, price, qty, url.slice(0, 1000), u.id]);
    await audit(actorOf(u), 'comparison.add', 'product', pid, { platform, price, url });
    return 'Đã thêm giá đối chiếu.';
  });
}

async function qc(fd: FormData) {
  'use server';
  const u = await requireUser('orders.fulfil');
  const id = String(fd.get('id'));
  await runAction(`/quan-tri/san-pham/${id}`, async () => {
    const r = await recordQc(id, { checked: Number(fd.get('checked')) || undefined, defects: Number(fd.get('defects')) || 0, imageUrl: String(fd.get('image_url') ?? '') || undefined }, actorOf(u));
    return `QC ${r.qc_pass}% (lỗi ${r.defect_rate}%): ${r.passed ? 'ĐẠT' : 'KHÔNG ĐẠT'}${r.gia_lap ? ' — camera GIẢ LẬP' : ''}.`;
  });
}

export default async function EditProduct({ params, searchParams }: { params: { id: string }; searchParams: { ok?: string; loi?: string } }) {
  const u = await requireUser('orders.view');
  if (!isUuid(params.id)) notFound();
  const p = await one('SELECT * FROM products WHERE id=$1', [params.id]);
  if (!p) notFound();
  const suppliers = await q('SELECT id, name, trust_score FROM suppliers ORDER BY name');
  const comps = await q(`SELECT c.*, u.name AS checker, c.checked_at > now() - interval '30 days' AS visible FROM price_comparisons c LEFT JOIN users u ON u.id=c.checked_by WHERE product_id=$1 ORDER BY checked_at DESC`, [p.id]);
  const listings = await q('SELECT l.*, ch.name AS channel_name FROM channel_listings l JOIN sales_channels ch ON ch.id=l.channel_id WHERE product_id=$1', [p.id]);
  const edit = can(u, 'products.edit');
  return (
    <div className="stack">
      <div className="row spread"><h1 style={{ margin: 0 }}>{p.image_emoji} {p.name}</h1>{p.published && <Link href={`/san-pham/${p.id}`} className="small">Xem trên cửa hàng →</Link>}</div>
      <Flash sp={searchParams} />
      {edit ? <ProductForm p={p} suppliers={suppliers} action={update} /> : <p className="muted">Bạn chỉ có quyền xem.</p>}
      <section className="card stack small">
        <h2 style={{ margin: 0 }}>Kiểm chất lượng (RynnBrain QC) · hiện {p.rynn_brain_pass != null ? `${p.rynn_brain_pass}%` : 'chưa kiểm'}</h2>
        <form action={qc} className="form-grid"><input type="hidden" name="id" value={p.id} />
          <label className="field">Số đã kiểm<input name="checked" type="number" min={1} /></label>
          <label className="field">Số lỗi<input name="defects" type="number" min={0} /></label>
          <label className="field">Hoặc link ảnh lô hàng (camera AI)<input name="image_url" type="url" placeholder="https://..." /></label>
          <div style={{ alignSelf: 'end' }}><button className="btn sm">Ghi QC</button></div>
        </form>
        <div className="muted">Đạt khi lỗi ≤ 2%. Chưa có khóa camera thì chấm ảnh ở chế độ GIẢ LẬP.</div>
      </section>
      {p.published && (
        <section className="card row" style={{ gap: 16, alignItems: 'center' }}>
          <TraceQr sku={p.sku} size={120} />
          <div className="small muted">QR truy xuất nguồn gốc (RYN-TRACE): in lên bao bì / tem sản phẩm. Khách quét ra trang 7 ngôn ngữ theo ngôn ngữ máy của họ:
            xưởng, quốc gia, TrustScore, tỉ lệ QC, giá sỉ. Không hiện giá vốn và biên.</div>
        </section>
      )}

      <section className="card stack">
        <h2>Giá trên nền tảng khác (bảng so sánh cho khách)</h2>
        <div className="table-wrap"><table>
          <thead><tr><th>Nơi bán</th><th className="num">Giá</th><th className="num">Cho số lượng</th><th>Nguồn</th><th>Kiểm tra</th><th></th></tr></thead>
          <tbody>{comps.map((c) => (
            <tr key={c.id}>
              <td>{c.platform}</td><td className="num">{vnd(c.price)}</td><td className="num">{c.qty_basis}</td>
              <td className="small"><a href={c.source_url} target="_blank" rel="noopener noreferrer nofollow">link</a></td>
              <td className="small">{dt(c.checked_at)} · {c.checker ?? '—'} {c.visible ? <span className="badge ok">đang hiện</span> : <span className="badge warn">đã ẩn (quá 30 ngày)</span>}</td>
              <td>{edit && <form action={comparison} className="row"><input type="hidden" name="product_id" value={p.id} /><input type="hidden" name="id" value={c.id} />
                <button className="btn secondary sm" name="op" value="recheck">Đã kiểm tra lại</button><button className="btn secondary sm" name="op" value="del">Xóa</button></form>}</td>
            </tr>
          ))}</tbody>
        </table></div>
        {edit && (
          <form action={comparison} className="form-grid">
            <input type="hidden" name="product_id" value={p.id} />
            <label className="field">Nơi bán<input name="platform" required placeholder="Ví dụ: Shopee - shop X" /></label>
            <label className="field">Giá (đ)<input name="price" type="number" min={1} required /></label>
            <label className="field">Cho số lượng<input name="qty_basis" type="number" min={1} defaultValue={1} /></label>
            <label className="field">Đường dẫn nguồn<input name="source_url" type="url" required /></label>
            <div style={{ alignSelf: 'end' }}><button className="btn sm">Thêm giá</button></div>
          </form>
        )}
        <p className="muted small">Chỉ nhập giá đã tự kiểm tra, kèm link nguồn. Nên hỏi luật sư về quy định quảng cáo so sánh trước khi chạy thật.</p>
      </section>

      <section className="card stack">
        <h2>Đang đăng trên các kênh</h2>
        {listings.length === 0 ? <p className="muted">Chưa đăng kênh nào. <Link href="/quan-tri/kenh-ban">Đăng lên kênh</Link></p> : (
          <ul>{listings.map((l) => <li key={l.id}>{l.channel_name}: {vnd(l.price)} · {l.status}</li>)}</ul>
        )}
      </section>
    </div>
  );
}
