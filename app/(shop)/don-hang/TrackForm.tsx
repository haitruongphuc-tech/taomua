'use client';
import { useFormState, useFormStatus } from 'react-dom';
import { lookup, confirmReceived, type TrackState } from './actions';

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
  const st = s2.order ? s2 : s;
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
          <div className="row spread"><strong>Tổng tiền</strong><strong className="mono">{fmt(o.tong_dt)}</strong></div>
          <div>Thanh toán: <span className="badge">{LABEL[o.trade_assurance_status] ?? o.trade_assurance_status}</span></div>
          {o.status === 'CHO_THANH_TOAN' && (st.payment
            ? <div className="alert info">Chuyển khoản {fmt(o.tong_dt)} tới {st.payment.bank} · STK <b className="mono">{st.payment.no}</b> · {st.payment.name}. Nội dung: <b className="mono">{o.code}</b>.</div>
            : <div className="alert warn">taomua sẽ liên hệ để gửi thông tin thanh toán.</div>)}
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
