'use client';
import { useFormState, useFormStatus } from 'react-dom';
import { lookup, confirmReceived, simGatewayPay, type TrackState } from './actions';

const fmt = (n: number) => Number(n).toLocaleString('vi-VN') + ' đ';
const LABEL: Record<string, string> = {
  CHO_DUYET: 'Đang chờ xác nhận', CHO_THANH_TOAN: 'Chờ thanh toán', DANG_CHUAN_BI: 'Đang chuẩn bị hàng', DANG_GIAO: 'Đang giao',
  DA_GIAO: 'Đã giao', HOAN_TAT: 'Hoàn tất', TU_CHOI: 'Không nhận được đơn', HUY: 'Đã hủy',
  NONE: 'Chưa thanh toán', HOLD: 'taomua đang giữ tiền', RELEASED: 'Đã chuyển tiền cho xưởng', REFUND: 'Đã hoàn tiền',
};

function Submit({ children, className = 'btn' }: { children: React.ReactNode; className?: string }) {
  const { pending } = useFormStatus();
  return <button className={className} disabled={pending}>{pending ? 'Đang xử lý…' : children}</button>;
}

export default function TrackForm({ initialCode }: { initialCode: string }) {
  const [s, look] = useFormState<TrackState, FormData>(lookup, { code: initialCode });
  const [s2, confirm] = useFormState<TrackState, FormData>(confirmReceived, {});
  const [s3, pay] = useFormState<TrackState, FormData>(simGatewayPay, {});
  const st = s3.order ? s3 : s2.order ? s2 : s;
  const o = st.order;
  return (
    <div className="stack">
      <form action={look} className="card form-grid">
        <label className="field">Mã đơn<input name="code" required defaultValue={st.code ?? initialCode} /></label>
        <label className="field">Số điện thoại đặt hàng<input name="phone" required inputMode="tel" defaultValue={st.phone ?? ''} /></label>
        <div style={{ alignSelf: 'end' }}><Submit>Tra cứu</Submit></div>
      </form>
      {st.error && <div className="alert bad">{st.error}</div>}
      {st.message && <div className="alert ok">{st.message}</div>}
      {o && (
        <section className="card stack">
          <div className="row spread">
            <h2 style={{ margin: 0 }}>Đơn {o.code}</h2>
            <span className="badge">{LABEL[o.status] ?? o.status}</span>
          </div>
          <div className="muted small">Kênh: {o.channel_name} · Đặt lúc {new Date(o.created_at).toLocaleString('vi-VN')}</div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Sản phẩm</th><th className="num">SL</th><th className="num">Đơn giá</th></tr></thead>
              <tbody>{(st.items ?? []).map((i, k) => (
                <tr key={k}><td>{i.product_name}</td><td className="num">{i.quantity}</td><td className="num">{fmt(i.unit_price)}</td></tr>
              ))}</tbody>
            </table>
          </div>
          <div className="row spread"><span>Tiền hàng (đã gồm VAT) / Goods</span><span className="mono">{fmt(o.tong_dt)}</span></div>
          {(Number(o.ship_fee) > 0 || o.ship_country !== 'VN') && <div className="row spread"><span>Phí vận chuyển / Shipping{o.ship_country !== 'VN' ? ` (${o.ship_country})` : ''}</span><span className="mono">{Number(o.ship_fee) > 0 ? fmt(o.ship_fee) : 'đang báo giá / pending'}</span></div>}
          <div className="row spread"><strong>Cần thanh toán / Total due</strong><strong className="mono">{fmt(o.amount_due)}{st.usd ? ` ≈ ${st.usd}` : ''}</strong></div>
          <div>Thanh toán: <span className="badge">{LABEL[o.trade_assurance_status] ?? o.trade_assurance_status}</span></div>
          {o.status === 'CHO_THANH_TOAN' && (st.payment
            ? <div className="alert info">Chuyển khoản / Bank transfer <b>{fmt(o.amount_due)}</b> tới {st.payment.bank} · STK <b className="mono">{st.payment.no}</b> · {st.payment.name}{st.payment.swift ? <> · SWIFT <b className="mono">{st.payment.swift}</b></> : null}. Nội dung / Reference: <b className="mono">{o.code}</b>. Chuyển đúng số tiền để hệ thống tự khớp. / Send the exact amount.</div>
            : <div className="alert warn">taomua sẽ liên hệ để gửi thông tin thanh toán.</div>)}
          {st.qr && (
            <div className="row" style={{ gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              {st.qr.mode === 'THAT'
                ? <img src={st.qr.img} alt="QR chuyển khoản VietQR" width={180} height={180} />
                : <div style={{ width: 180 }} dangerouslySetInnerHTML={{ __html: st.qr.svg ?? '' }} />}
              <div className="small">Quét QR bằng app ngân hàng: số tiền và nội dung <b className="mono">{o.code}</b> điền sẵn.
                {st.qr.mode === 'GIA_LAP' && <div><span className="badge warn">GIẢ LẬP</span> chưa có tài khoản nhận tiền thật — không chuyển tiền vào QR này.</div>}</div>
            </div>
          )}
          {st.simPay && (
            <form action={pay} className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
              <input type="hidden" name="code" value={o.code} /><input type="hidden" name="phone" value={st.phone ?? ''} />
              <span className="small">Cổng thanh toán <span className="badge warn">GIẢ LẬP</span>:</span>
              {['9PAY', 'VNPAY', 'MOMO', 'ALIPAY'].map((m) => <button key={m} className="btn secondary sm" name="method" value={m}>{m}</button>)}
            </form>
          )}
          {o.carrier && <div>Vận chuyển: {o.carrier} · mã vận đơn <span className="mono">{o.tracking_no}</span></div>}
          {o.trade_assurance_status === 'HOLD' && ['DANG_GIAO', 'DA_GIAO'].includes(o.status) && (
            <form action={confirm} className="stack">
              <input type="hidden" name="code" value={o.code} />
              <input type="hidden" name="phone" value={st.phone ?? ''} />
              <p>Đã nhận và kiểm tra hàng đúng như đơn? Khi bạn xác nhận, taomua sẽ chuyển tiền cho xưởng. Nếu hàng lỗi, đừng xác nhận và hãy liên hệ taomua để được hoàn tiền.</p>
              <Submit>Tôi đã nhận hàng đúng đơn</Submit>
            </form>
          )}
          {o.released_by_label && <div className="muted small">{o.released_by_label}</div>}
        </section>
      )}
    </div>
  );
}
