import { redirect } from 'next/navigation';
import { requireUser, actorOf } from '@/lib/auth';
import { q } from '@/lib/db';
import { parseOrderCsv, importChannelOrders, type ChannelOrderRow } from '@/lib/channels';
import { notifyOrderPending } from '@/lib/notify';
import Flash from '@/components/Flash';

async function doImport(fd: FormData) {
  'use server';
  const u = await requireUser('orders.create');
  const channel = String(fd.get('channel'));
  let rows: ChannelOrderRow[] = [];
  let errors: string[] = [];
  if (fd.get('mode') === 'csv') {
    const file = fd.get('file');
    let text = String(fd.get('csv') ?? '');
    if (file && typeof file === 'object' && 'text' in file && file.size > 0) {
      if (file.size > 2_000_000) redirect('/quan-tri/kenh-ban/nhap-don?loi=' + encodeURIComponent('File quá 2 MB.'));
      text = await file.text();
    }
    ({ rows, errors } = parseOrderCsv(text));
  } else {
    rows = [{
      externalRef: String(fd.get('ref') ?? '').trim(), name: String(fd.get('name') ?? ''), phone: String(fd.get('phone') ?? ''),
      address: String(fd.get('address') ?? ''), sku: String(fd.get('sku') ?? ''), quantity: Number(fd.get('qty')), unitPrice: Number(fd.get('price')),
    }];
    if (!rows[0].externalRef) errors.push('Cần mã đơn trên kênh.');
  }
  const res = rows.length && !(fd.get('mode') !== 'csv' && errors.length) ? await importChannelOrders(channel, rows, actorOf(u)) : { created: [], errors: [] };
  for (const o of res.created) if (o.pending) await notifyOrderPending({ id: o.id, code: o.code, tong_dt: o.tong_dt, bien_rong_tren_chi_phi: o.bien, cap_duyet: o.level }).catch(() => null);
  const all = [...errors, ...res.errors];
  const ok = res.created.length ? `Đã tạo ${res.created.length} đơn: ${res.created.map((o) => `${o.code} (Cấp ${o.level}${o.pending ? ', chờ duyệt' : ''})`).join(', ')}.` : '';
  const p = new URLSearchParams();
  if (ok) p.set('ok', ok);
  if (all.length) p.set('loi', all.slice(0, 10).join(' · '));
  if (!ok && !all.length) p.set('loi', 'Không có dòng nào để nhập.');
  redirect(`/quan-tri/kenh-ban/nhap-don?${p}`);
}

export default async function ImportOrders({ searchParams }: { searchParams: { ok?: string; loi?: string } }) {
  await requireUser('orders.create');
  const channels = await q("SELECT code, name FROM sales_channels WHERE active AND kind <> 'OWN' ORDER BY name");
  const products = await q('SELECT sku, name FROM products ORDER BY name');
  const ChannelSelect = () => <label className="field">Kênh<select name="channel">{channels.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}</select></label>;
  return (
    <div className="stack">
      <h1>Nhập đơn từ kênh khác</h1>
      <Flash sp={searchParams} />
      <p className="muted">Các kênh chưa có kết nối API, nên đơn được nhập tay hoặc bằng CSV xuất từ trang người bán. Giá là giá thực bán trên kênh; phí kênh được trừ khi tính biên.</p>
      <form action={doImport} className="card stack">
        <input type="hidden" name="mode" value="one" />
        <h2>Nhập một đơn</h2>
        <div className="form-grid">
          <ChannelSelect />
          <label className="field">Mã đơn trên kênh<input name="ref" required /></label>
          <label className="field">Tên khách<input name="name" required /></label>
          <label className="field">SĐT<input name="phone" required /></label>
        </div>
        <label className="field">Địa chỉ<input name="address" required /></label>
        <div className="form-grid">
          <label className="field">Sản phẩm<select name="sku">{products.map((p) => <option key={p.sku} value={p.sku}>{p.name} ({p.sku})</option>)}</select></label>
          <label className="field">Số lượng<input name="qty" type="number" min={1} required /></label>
          <label className="field">Giá bán mỗi cái (đ)<input name="price" type="number" min={1} required /></label>
          <div style={{ alignSelf: 'end' }}><button className="btn">Tạo đơn</button></div>
        </div>
      </form>
      <form action={doImport} className="card stack">
        <input type="hidden" name="mode" value="csv" />
        <h2>Nhập nhiều đơn bằng CSV</h2>
        <p className="small muted">Cột: <code>ma_don_kenh,ten_khach,sdt,dia_chi,sku,so_luong,don_gia</code>. Nhiều dòng cùng mã đơn sẽ gộp thành một đơn. Đơn đã nhập trước đó (trùng mã đơn kênh) sẽ bị bỏ qua.</p>
        <div className="form-grid"><ChannelSelect /><label className="field">File CSV<input type="file" name="file" accept=".csv,text/csv" /></label></div>
        <label className="field">Hoặc dán nội dung CSV<textarea name="csv" rows={6} placeholder={'ma_don_kenh,ten_khach,sdt,dia_chi,sku,so_luong,don_gia\nSP-1001,Nguyễn A,0901234567,"12 Lê Lợi, Q1",AO-3D,2,75000'} /></label>
        <div><button className="btn">Nhập CSV</button></div>
      </form>
    </div>
  );
}
