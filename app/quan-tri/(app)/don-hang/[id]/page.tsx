import { notFound } from 'next/navigation';
import { requireUser, actorOf, can } from '@/lib/auth';
import { q, one } from '@/lib/db';
import { isUuid } from '@/lib/catalog';
import { markPaid, shipOrder, markDelivered, releaseEscrow, refundOrder, cancelOrder, setShipFee } from '@/lib/orders';
import { countryName } from '@/lib/countries';
import { cheapest, guessZone } from '@/lib/logistics';
import { vnd, pct, dt, label } from '@/lib/format';
import { runAction } from '@/lib/action';
import Flash from '@/components/Flash';

async function act(fd: FormData) {
  'use server';
  const id = String(fd.get('id'));
  const op = String(fd.get('op'));
  const back = `/quan-tri/don-hang/${id}`;
  const perm = ({ paid: 'orders.payment', ship: 'orders.fulfil', delivered: 'orders.fulfil', release: 'escrow.release', refund: 'escrow.release', cancel: 'orders.fulfil', shipfee: 'orders.fulfil' } as const)[op as 'paid'];
  if (!perm) return;
  const u = await requireUser();
  await runAction(back, async () => {
    if (!can(u, perm)) throw new Error('Bạn không có quyền làm việc này.');
    const a = actorOf(u);
    switch (op) {
      case 'paid': await markPaid(id, a); return 'Đã ghi nhận tiền. Tiền đang được giữ đến khi khách hoặc CEO xác nhận.';
      case 'ship': await shipOrder(id, a, String(fd.get('carrier') ?? ''), String(fd.get('tracking') ?? ''), String(fd.get('wfs') ?? 'DROPSHIP')); return 'Đã chuyển sang đang giao.';
      case 'delivered': await markDelivered(id, a); return 'Đã đánh dấu giao xong. Chờ khách xác nhận để giải ngân.';
      case 'release': await releaseEscrow(id, { kind: 'CEO', actor: a }); return 'Đã giải ngân tiền đang giữ.';
      case 'refund': await refundOrder(id, a, String(fd.get('reason') ?? '')); return 'Đã ghi nhận hoàn tiền. Nhớ thực hiện chuyển khoản hoàn cho khách.';
      case 'cancel': await cancelOrder(id, a, String(fd.get('reason') ?? '')); return 'Đã hủy đơn.';
      case 'shipfee': await setShipFee(id, Number(fd.get('ship_fee')), a); return 'Đã lưu phí vận chuyển. Gửi email báo khách tổng cần thanh toán.';
    }
  });
}

export default async function OrderDetail({ params, searchParams }: { params: { id: string }; searchParams: { ok?: string; loi?: string } }) {
  const u = await requireUser('orders.view');
  if (!isUuid(params.id)) notFound();
  const o = await one(`SELECT o.*, ch.name AS channel_name, ch.fee_pct, cu.name AS customer_name, cu.phone, cu.email FROM wholesale_orders o
    JOIN sales_channels ch ON ch.id=o.channel_id JOIN customers cu ON cu.id=o.customer_id WHERE o.id=$1`, [params.id]);
  if (!o) notFound();
  const items = await q('SELECT * FROM order_items WHERE order_id=$1', [o.id]);
  // RYN-LOGI: hãng rẻ nhất theo vùng và khối lượng.
  const grams = (await one('SELECT COALESCE(sum(i.quantity * p.weight_grams),0)::bigint AS g FROM order_items i JOIN products p ON p.id=i.product_id WHERE i.order_id=$1', [o.id])).g;
  const carriers = cheapest(await q('SELECT * FROM shipping_rates WHERE active'), guessZone(o.ship_address, o.ship_country), Number(grams));
  const carrierNames = [...new Set(['GHN', 'GHTK', 'J&T', ...carriers.map((x) => x.carrier), 'Khác'])];
  const approvals = await q('SELECT * FROM approvals WHERE order_id=$1 ORDER BY decided_at', [o.id]);
  const H = ({ op, children }: { op: string; children: React.ReactNode }) => (<><input type="hidden" name="id" value={o.id} /><input type="hidden" name="op" value={op} />{children}</>);
  return (
    <div className="stack">
      <div className="row spread">
        <h1 style={{ margin: 0 }}>Đơn {o.code}</h1>
        <div className="row"><span className="badge">{label(o.status)}</span><span className="badge orange">Cấp {o.cap_duyet}</span><span className="badge">{label(o.trade_assurance_status)}</span></div>
      </div>
      <Flash sp={searchParams} />
      <div className="grid cols-2">
        <section className="card stack small">
          <h2>Khách và giao hàng</h2>
          <div>{o.customer_name} · {o.phone}{(o.customer_email ?? o.email) ? ` · ${o.customer_email ?? o.email}` : ''}</div>
          <div>Giao tới: <b>{countryName(o.ship_country)}</b>{o.ship_country !== 'VN' && <span className="badge orange" style={{ marginLeft: 6 }}>Quốc tế</span>}</div>
          <div>{o.ship_address}</div>
          {o.note && <div className="muted">Ghi chú: {o.note}</div>}
          <div>Kênh: <b>{o.channel_name}</b>{o.external_ref ? ` · mã kênh ${o.external_ref}` : ''}</div>
          <div>Giao: {label(o.wfs_status)}{o.carrier ? ` · ${o.carrier} ${o.tracking_no}` : ''}</div>
          <div>Tạo lúc {dt(o.created_at)}</div>
          <div>Phí vận chuyển thu thêm: <b>{vnd(o.ship_fee)}</b> · Khách cần trả: <b>{vnd(Number(o.tong_dt) + Number(o.ship_fee))}</b></div>
          {['CHO_DUYET', 'CHO_THANH_TOAN'].includes(o.status) && o.payment_status !== 'DA_NHAN' && can(u, 'orders.fulfil') && (
            <form action={act} className="row"><H op="shipfee"><input name="ship_fee" type="number" min={0} defaultValue={Number(o.ship_fee)} style={{ width: 140 }} /><button className="btn sm secondary">Lưu phí vận chuyển</button></H></form>
          )}
        </section>
        <section className="card stack small">
          <h2>Biên ròng sau thuế, phí</h2>
          <table><tbody>
            <tr><td>Doanh thu (gồm VAT)</td><td className="num">{vnd(o.tong_dt)}</td></tr>
            <tr><td>Chi phí trước thuế</td><td className="num">−{vnd(o.tong_chi_phi_truoc_thue)}</td></tr>
            <tr><td>Phí kênh ({pct(o.fee_pct)})</td><td className="num">−{vnd(o.phi_kenh)}</td></tr>
            <tr><td>VAT đầu vào được trừ</td><td className="num">+{vnd(o.vat_dau_vao)}</td></tr>
            <tr><td>VAT đầu ra (giá × 8/108)</td><td className="num">−{vnd(o.vat_8)}</td></tr>
            <tr><td>Phí ngân hàng 1%</td><td className="num">−{vnd(o.phi_mb_1)}</td></tr>
            <tr><td>LN trước TNDN</td><td className="num">{vnd(o.ln_truoc_tndn)}</td></tr>
            <tr><td>TNDN 20%</td><td className="num">−{vnd(o.thue_tndn_20)}</td></tr>
            <tr><td><b>LN ròng sau thuế</b></td><td className="num"><b>{vnd(o.ln_rong_sau_thue)}</b></td></tr>
            <tr><td>Biên / chi phí · / doanh thu</td><td className="num">{pct(o.bien_rong_tren_chi_phi)} · {pct(o.bien_rong_tren_dt)}</td></tr>
          </tbody></table>
          <div className="muted">{o.cap_ly_do}</div>
        </section>
      </div>
      <div className="table-wrap"><table>
        <thead><tr><th>Sản phẩm</th><th className="num">SL</th><th>Bậc</th><th className="num">Giá bán</th><th className="num">Chi phí/cái</th><th className="num">Thành tiền</th></tr></thead>
        <tbody>{items.map((i) => (
          <tr key={i.id}><td>{i.product_name}</td><td className="num">{i.quantity}</td><td>{i.tier || 'Giá kênh'}</td><td className="num">{vnd(i.unit_price)}</td><td className="num">{vnd(i.unit_cost)}</td><td className="num">{vnd(i.unit_price * i.quantity)}</td></tr>
        ))}</tbody>
      </table></div>

      <section className="card stack">
        <h2>Xử lý đơn</h2>
        {o.status === 'CHO_DUYET' && <p>Đơn đang chờ duyệt ở mục Chờ duyệt.</p>}
        {o.status === 'CHO_THANH_TOAN' && can(u, 'orders.payment') && (
          <form action={act} className="row"><H op="paid"><span>Đã đối chiếu tiền {vnd(Number(o.tong_dt) + Number(o.ship_fee))} vào tài khoản?</span><button className="btn">Ghi nhận đã nhận tiền</button></H></form>
        )}
        {o.status === 'DANG_CHUAN_BI' && can(u, 'orders.fulfil') && (
          <form action={act} className="form-grid"><H op="ship">
            <label className="field">Hãng vận chuyển<select name="carrier" defaultValue={carriers[0]?.carrier ?? 'GHN'}>{carrierNames.map((c) => <option key={c}>{c}</option>)}</select>
              {carriers[0] && <span className="small muted">AI chọn {carriers[0].carrier} {vnd(carriers[0].fee)} ({(Number(grams) / 1000).toLocaleString('vi-VN')} kg){carriers.length > 1 ? ` · ${carriers.slice(1).map((x) => `${x.carrier} ${vnd(x.fee)}`).join(' · ')}` : ''}</span>}</label>
            <label className="field">Mã vận đơn<input name="tracking" required /></label>
            <label className="field">Hình thức<select name="wfs"><option value="DROPSHIP">Giao thẳng từ xưởng</option><option value="WFS_FULFILLMENT">Kho taomua</option><option value="SAME_DAY_30MIN">Giao 30 phút (HCM)</option></select></label>
            <div style={{ alignSelf: 'end' }}><button className="btn">Gửi hàng</button></div>
          </H></form>
        )}
        {o.status === 'DANG_GIAO' && can(u, 'orders.fulfil') && <form action={act}><H op="delivered"><button className="btn secondary">Đánh dấu đã giao</button></H></form>}
        {o.trade_assurance_status === 'HOLD' && can(u, 'escrow.release') && (
          <div className="grid cols-2">
            <form action={act} className="stack"><H op="release"><p className="small">Giải ngân khi khách đã nhận hàng nhưng chưa tự xác nhận.</p><button className="btn">CEO xác nhận giải ngân</button></H></form>
            <form action={act} className="stack"><H op="refund"><input name="reason" required placeholder="Lý do hoàn tiền" /><button className="btn danger">Hoàn tiền cho khách</button></H></form>
          </div>
        )}
        {['CHO_DUYET', 'CHO_THANH_TOAN'].includes(o.status) && o.payment_status !== 'DA_NHAN' && can(u, 'orders.fulfil') && (
          <form action={act} className="row"><H op="cancel"><input name="reason" required placeholder="Lý do hủy" style={{ flex: 1 }} /><button className="btn secondary">Hủy đơn</button></H></form>
        )}
        {o.released_by_label && <div className="muted small">{o.released_by_label} · {dt(o.released_at)}</div>}
      </section>

      <section className="card stack small">
        <h2>Lịch sử duyệt</h2>
        {approvals.length === 0 ? <p className="muted">Chưa có.</p> : approvals.map((a) => (
          <div key={a.id}>{dt(a.decided_at)} · Cấp {a.level} · <b>{label(a.decision)}</b> bởi {a.decided_by_label} ({a.via}){a.note ? ` · ${a.note}` : ''}</div>
        ))}
      </section>
    </div>
  );
}
