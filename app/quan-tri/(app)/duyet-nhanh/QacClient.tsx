'use client';
// Quick Approve Center: tự cập nhật mỗi 10 giây, báo popup trình duyệt khi có việc mới, duyệt 1 chạm.
import { useCallback, useEffect, useRef, useState } from 'react';

type Item = {
  approval_id: string; type: 'ORDER' | 'PAYOUT' | 'AI'; title: string; detail: string; amount: number | null; margin: number | null;
  level: number; level_label: string; deadline: string | null; overdue: boolean; created_at: string; can_decide: boolean;
  needs_password: boolean; reject_needs_note: boolean; link: string; severity: 'INFO' | 'WARN' | 'DANGER';
};
const TYPE: Record<Item['type'], string> = { ORDER: 'Đơn hàng', PAYOUT: 'Khoản chi', AI: 'Đề xuất AI' };
const vnd = (n: number) => n.toLocaleString('vi-VN') + ' đ';

export default function QacClient() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [onlyMine, setOnlyMine] = useState(true);
  const [perm, setPerm] = useState<string>('default');
  const seen = useRef<Set<string> | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/v1/approval/queue', { cache: 'no-store' });
      if (!r.ok) return;
      const j = await r.json();
      const list: Item[] = j.items;
      // Popup cho việc mới mình duyệt được (sau lần tải đầu).
      if (seen.current && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        for (const it of list) if (it.can_decide && !seen.current.has(it.approval_id)) {
          new Notification(`[TAOMUA ${it.level_label}] ${TYPE[it.type]}`, { body: `${it.title}${it.amount ? ` · ${vnd(it.amount)}` : ''}`, tag: it.approval_id });
        }
      }
      seen.current = new Set(list.map((i) => i.approval_id));
      setItems(list);
      document.title = `${list.filter((i) => i.can_decide).length ? `(${list.filter((i) => i.can_decide).length}) ` : ''}Duyệt nhanh · taomua`;
    } catch { /* mất mạng: lần sau thử lại */ }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 10_000);
    if (typeof Notification !== 'undefined') setPerm(Notification.permission);
    return () => clearInterval(t);
  }, [load]);

  async function decide(it: Item, action: 'APPROVED' | 'REJECTED') {
    let note = '';
    let password = '';
    if (action === 'REJECTED' && it.reject_needs_note) {
      note = window.prompt('Lý do từ chối (khách sẽ không thấy):') ?? '';
      if (!note.trim()) return;
    }
    if (action === 'APPROVED' && it.needs_password) {
      password = window.prompt('Khoản từ 10 triệu: nhập mật khẩu của bạn để duyệt') ?? '';
      if (!password) return;
    }
    setBusy(it.approval_id); setMsg(null);
    try {
      const r = await fetch('/api/v1/approval/approve', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ approval_id: it.approval_id, action, note, password }) });
      const j = await r.json();
      setMsg({ ok: r.ok, text: r.ok ? j.message : j.error || 'Không duyệt được.' });
      await load();
    } catch { setMsg({ ok: false, text: 'Mất kết nối, thử lại.' }); } finally { setBusy(null); }
  }

  if (!items) return <p className="muted">Đang tải…</p>;
  const shown = onlyMine ? items.filter((i) => i.can_decide) : items;
  return (
    <div className="stack">
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <span className="badge orange">Bạn duyệt được: {items.filter((i) => i.can_decide).length}</span>
        <span className="badge">Tất cả đang chờ: {items.length}</span>
        <label className="row small"><input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} /> Chỉ việc của tôi</label>
        {perm !== 'granted' && typeof Notification !== 'undefined' && (
          <button className="btn secondary sm" onClick={async () => setPerm(await Notification.requestPermission())}>Bật thông báo popup</button>
        )}
        <span className="small muted">Tự cập nhật mỗi 10 giây</span>
      </div>
      {msg && <div className={`alert ${msg.ok ? 'ok' : 'bad'}`}>{msg.text}</div>}
      {shown.length === 0 && <div className="card">Không có việc nào chờ bạn duyệt. 🎉</div>}
      {shown.map((it) => (
        <section key={it.approval_id} className="card stack" style={{ borderLeft: `6px solid var(--${it.severity === 'DANGER' ? 'bad' : it.overdue ? 'warn' : 'blue'})` }}>
          <div className="row" style={{ justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <span className="small"><span className="badge">{TYPE[it.type]}</span> <span className="badge orange">{it.level_label}</span>
              {it.overdue && <span className="badge bad"> quá hạn</span>}</span>
            {it.amount != null && <b className="mono" style={{ fontSize: '1.15rem' }}>{vnd(it.amount)}</b>}
          </div>
          <div style={{ fontWeight: 600 }}>{it.title}</div>
          {it.detail && <div className="small muted">{it.detail}</div>}
          {it.margin != null && <div className="small">Biên ròng / chi phí: <b>{Number(it.margin).toLocaleString('vi-VN')}%</b></div>}
          {it.can_decide ? (
            <div className="row" style={{ gap: 10 }}>
              <button className="btn" style={{ flex: 1, padding: '14px 0', fontSize: '1.05rem', background: 'var(--ok)' }} disabled={busy === it.approval_id}
                onClick={() => decide(it, 'APPROVED')}>DUYỆT</button>
              <button className="btn danger" style={{ flex: 1, padding: '14px 0', fontSize: '1.05rem' }} disabled={busy === it.approval_id}
                onClick={() => decide(it, 'REJECTED')}>TỪ CHỐI</button>
            </div>
          ) : <div className="small muted">Chờ người có quyền {it.level_label} duyệt.</div>}
          <a className="small" href={it.link}>Mở chi tiết</a>
        </section>
      ))}
    </div>
  );
}
