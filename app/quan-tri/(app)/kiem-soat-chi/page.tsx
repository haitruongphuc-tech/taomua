import Link from 'next/link';
import { requireUser, actorOf, can } from '@/lib/auth';
import { q } from '@/lib/db';
import { audit } from '@/lib/audit';
import { runAction, UserError } from '@/lib/action';
import { vnd } from '@/lib/format';
import { LEVELS, type Level } from '@/lib/approval';
import { loadControls } from '@/lib/controls';
import {
  CONTROLS, PAYOUT_CATEGORIES as CAT, type PayoutCategory, isControlKey, payoutBlock, REAUTH_THRESHOLD, TRADE_ASSURANCE_NOTE,
} from '@/lib/payouts';
import Flash from '@/components/Flash';

async function toggle(fd: FormData) {
  'use server';
  const u = await requireUser('payout.controls');
  await runAction('/quan-tri/kiem-soat-chi', async () => {
    const key = String(fd.get('key'));
    const enabled = String(fd.get('enabled')) === '1';
    if (!isControlKey(key)) throw new UserError('Nút không hợp lệ.');
    await q(`INSERT INTO payment_controls(key, enabled, updated_by, updated_at) VALUES ($1,$2,$3,now())
      ON CONFLICT (key) DO UPDATE SET enabled=EXCLUDED.enabled, updated_by=EXCLUDED.updated_by, updated_at=now()`, [key, enabled, u.id]);
    await audit(actorOf(u), 'controls.set', 'payment_control', key, { enabled });
    const c = CONTROLS.find((x) => x.key === key)!;
    return `${c.label}: ${enabled ? 'BẬT' : 'TẮT'}.`;
  });
}

const RANGES: [Level, string, string][] = [
  [1, 'Dưới 5 triệu', 'Tự động khi nút tổng bật; nếu tắt: Trưởng nhóm hoặc CEO'],
  [2, '5 – 20 triệu', 'Trưởng nhóm hoặc CEO (không tự duyệt khoản mình đề xuất)'],
  [3, '20 – 50 triệu', 'CEO'],
  [4, '50 – 200 triệu', 'CEO'],
  [5, 'Trên 200 triệu', 'CEO (spec yêu cầu thêm nhà đầu tư: duyệt ngoài hệ thống)'],
];

export default async function PaymentControls({ searchParams }: { searchParams: { ok?: string; loi?: string } }) {
  const u = await requireUser();
  const ctl = await loadControls();
  const meta = await q(`SELECT pc.key, pc.updated_at, us.name FROM payment_controls pc LEFT JOIN users us ON us.id=pc.updated_by`);
  const by = Object.fromEntries(meta.map((m) => [m.key, m]));
  const spend = await q(`SELECT category,
      COALESCE(SUM(amount) FILTER (WHERE status='DA_CHI'),0)::bigint AS paid,
      COALESCE(SUM(amount) FILTER (WHERE status IN ('DE_XUAT','DA_DUYET')),0)::bigint AS pending
    FROM payouts WHERE created_at >= date_trunc('month', now()) GROUP BY category`);
  const sp = Object.fromEntries(spend.map((s) => [s.category, s]));
  const editable = can(u, 'payout.controls');

  return (
    <div className="stack">
      <h1>Kiểm soát chi</h1>
      <Flash sp={searchParams} />
      <p className="muted">
        Nút Tắt/Mở để chặn rủi ro. Tắt một loại chi thì không đề xuất, duyệt hay ghi nhận chi loại đó được nữa, kể cả khoản đã duyệt.
        Mọi thay đổi ghi vào Nhật ký. {editable ? 'Chỉ CEO đổi được.' : 'Bạn chỉ xem; CEO mới đổi được.'} <Link href="/quan-tri/chi-tien">Chi tiền</Link>
      </p>

      <div className="table-wrap"><table>
        <thead><tr><th>Nút</th><th>Trạng thái</th><th>Tác dụng</th><th>Khi nào dùng</th><th>Đổi lần cuối</th><th></th></tr></thead>
        <tbody>
          {CONTROLS.map((c) => {
            const on = ctl[c.key];
            const danger = c.key === 'KHOA_NHAP_MOI' ? on : !on;
            const m = by[c.key];
            return (
              <tr key={c.key}>
                <td><b>{c.label}</b></td>
                <td><span className={`badge ${danger ? 'bad' : 'ok'}`}>{on ? 'BẬT' : 'TẮT'}</span></td>
                <td className="small">{on ? c.on : c.off}</td>
                <td className="small muted">{c.when}</td>
                <td className="small muted">{m ? `${m.name ?? '—'} · ${new Date(m.updated_at).toLocaleString('vi-VN')}` : 'Mặc định'}</td>
                <td>{editable && (
                  <form action={toggle}><input type="hidden" name="key" value={c.key} /><input type="hidden" name="enabled" value={on ? '0' : '1'} />
                    <button className={`btn sm ${on ? 'danger' : ''}`}>{on ? 'Tắt' : 'Bật'}</button></form>
                )}</td>
              </tr>
            );
          })}
          <tr>
            <td><b>Trade Assurance (giữ tiền khách)</b></td><td><span className="badge ok">LUÔN BẬT</span></td>
            <td className="small" colSpan={4}>{TRADE_ASSURANCE_NOTE}</td>
          </tr>
        </tbody>
      </table></div>

      <h2>Ai duyệt khoản chi</h2>
      <div className="table-wrap"><table>
        <thead><tr><th>Cấp</th><th>Số tiền</th><th>Người duyệt</th><th>Xác nhận thêm</th></tr></thead>
        <tbody>{RANGES.map(([lv, range, who]) => (
          <tr key={lv}><td>{LEVELS[lv].label}</td><td>{range}</td><td>{who}</td>
            <td className="small">{lv >= 3 ? 'Nhập lại mật khẩu' : lv === 2 ? `Nhập lại mật khẩu nếu từ ${vnd(REAUTH_THRESHOLD)}` : '—'}</td></tr>
        ))}</tbody>
      </table></div>
      <p className="small muted">
        Spec gốc dùng PIN 9999 cho khoản lớn. PIN này đã công khai trong tài liệu nên hệ thống dùng mật khẩu riêng của người duyệt thay thế.
        Xác thực 2 lớp (2FA) chưa có.
      </p>

      <h2>Chi trong tháng này</h2>
      <div className="table-wrap"><table>
        <thead><tr><th>Loại chi</th><th>Trạng thái</th><th className="num">Đã chi</th><th className="num">Đang chờ</th></tr></thead>
        <tbody>{(Object.keys(CAT) as PayoutCategory[]).map((k) => {
          const blocked = payoutBlock(k, ctl);
          return (
            <tr key={k}><td>{CAT[k]}</td>
              <td>{blocked ? <span className="badge bad">Đang khóa</span> : <span className="badge ok">Được chi</span>}</td>
              <td className="num">{vnd(Number(sp[k]?.paid ?? 0))}</td><td className="num">{vnd(Number(sp[k]?.pending ?? 0))}</td></tr>
          );
        })}</tbody>
      </table></div>
    </div>
  );
}
