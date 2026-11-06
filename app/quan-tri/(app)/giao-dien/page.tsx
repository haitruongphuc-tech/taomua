import { requireUser, actorOf } from '@/lib/auth';
import { q } from '@/lib/db';
import { audit } from '@/lib/audit';
import { runAction, UserError } from '@/lib/action';
import { SITE_FIELDS, isSiteKey, siteContent, canvasCommand } from '@/lib/site';
import { aiEnabled } from '@/lib/ai';
import Flash from '@/components/Flash';

// Canvas: sửa chữ trên cửa hàng ngay tại đây, hoặc ra lệnh bằng lời cho AI (Sidekick).
async function save(fd: FormData) {
  'use server';
  const u = await requireUser('channels.edit');
  await runAction('/quan-tri/giao-dien', async () => {
    let changes: [string, string][] = [];
    const cmd = String(fd.get('command') ?? '').trim();
    if (cmd) {
      const r = await canvasCommand(cmd, await siteContent());
      if (!r) throw new UserError(aiEnabled() ? 'AI chưa hiểu lệnh, hãy nói rõ ô cần sửa.' : 'Cần AI_API_KEY để sửa bằng lời. Hãy sửa trực tiếp các ô bên dưới.');
      changes = [[r.key, r.value]];
    } else {
      changes = Object.keys(SITE_FIELDS).map((k) => [k, String(fd.get(k) ?? '')]);
    }
    for (const [k, v] of changes) {
      if (!isSiteKey(k)) continue;
      await q(`INSERT INTO site_content(key, value, updated_by, updated_at) VALUES ($1,$2,$3,now())
        ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_by=EXCLUDED.updated_by, updated_at=now()`, [k, v.trim().slice(0, SITE_FIELDS[k].max), u.id]);
    }
    await audit(actorOf(u), 'canvas.edit', 'site_content', null, { keys: changes.map((c) => c[0]), command: cmd || undefined });
    return cmd ? `AI đã sửa "${SITE_FIELDS[changes[0][0] as keyof typeof SITE_FIELDS].label}".` : 'Đã lưu giao diện.';
  });
}

export default async function Canvas({ searchParams }: { searchParams: { ok?: string; loi?: string } }) {
  await requireUser('channels.edit');
  const c = await siteContent();
  return (
    <div className="stack" style={{ maxWidth: 820 }}>
      <h1>Giao diện cửa hàng <span className="muted small">Canvas</span></h1>
      <Flash sp={searchParams} />
      <form action={save} className="card row" style={{ gap: 8 }}>
        <input name="command" placeholder='Sửa bằng lời, ví dụ: "đổi tiêu đề trang chủ thành Sỉ tận xưởng, giá tận gốc"' style={{ flex: 1 }} />
        <button className="btn">AI sửa</button>
      </form>
      <form action={save} className="card stack">
        {(Object.keys(SITE_FIELDS) as (keyof typeof SITE_FIELDS)[]).map((k) => (
          <label key={k} className="field">{SITE_FIELDS[k].label} <span className="muted small">(tối đa {SITE_FIELDS[k].max} ký tự)</span>
            {SITE_FIELDS[k].max > 150 ? <textarea name={k} defaultValue={c[k]} maxLength={SITE_FIELDS[k].max} rows={3} /> : <input name={k} defaultValue={c[k]} maxLength={SITE_FIELDS[k].max} />}
          </label>
        ))}
        <div className="row" style={{ gap: 8 }}><button className="btn">Lưu</button><a className="btn secondary" href="/" target="_blank" rel="noreferrer">Xem cửa hàng ↗</a></div>
      </form>
      <section className="card stack">
        <div className="muted small">Xem trước</div>
        {c.announcement && <div className="announce">{c.announcement}</div>}
        <div className="hero"><h2 style={{ margin: 0 }}>{c.hero_title}</h2><p>{c.hero_text}</p><span className="btn">{c.hero_cta}</span></div>
      </section>
    </div>
  );
}
