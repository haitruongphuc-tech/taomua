import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { setupItems, STATUS_TEXT, type SetupStatus } from '@/lib/setup-status';

export default async function PendingInfo() {
  await requireUser();
  const items = await setupItems();
  const groups = [...new Set(items.map((i) => i.group))];
  const count = (s: SetupStatus) => items.filter((i) => i.status === s).length;
  return (
    <div className="stack">
      <h1>Thông tin cần nhập</h1>
      <p className="muted">
        Hệ thống tự kiểm tra mỗi lần mở trang. Khóa API và mật khẩu chỉ ghi vào file <code>.env</code> trên máy chủ, không gửi qua chat hay email.
      </p>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        {(['THIEU', 'GIA_LAP', 'CHUA_LAM', 'OK'] as SetupStatus[]).map((s) => (
          <span key={s} className={`badge ${STATUS_TEXT[s][1]}`}>{STATUS_TEXT[s][0]}: {count(s)}</span>
        ))}
      </div>
      {groups.map((g) => (
        <div key={g} className="stack">
          <h2>{g}</h2>
          <div className="table-wrap"><table>
            <thead><tr><th>Mục</th><th>Tình trạng</th><th>Chi tiết</th><th>Nhập ở đâu</th></tr></thead>
            <tbody>{items.filter((i) => i.group === g).map((i) => (
              <tr key={i.label}>
                <td><b>{i.label}</b></td>
                <td><span className={`badge ${STATUS_TEXT[i.status][1]}`}>{STATUS_TEXT[i.status][0]}</span></td>
                <td className="small">{i.detail}</td>
                <td className="small">{i.href ? <Link href={i.href}>{i.where}</Link> : <code>{i.where}</code>}</td>
              </tr>
            ))}</tbody>
          </table></div>
        </div>
      ))}
    </div>
  );
}
