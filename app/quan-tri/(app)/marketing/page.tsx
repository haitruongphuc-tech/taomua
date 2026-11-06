import { requireUser, actorOf, can } from '@/lib/auth';
import { q, tx } from '@/lib/db';
import { audit } from '@/lib/audit';
import { runAction, UserError } from '@/lib/action';
import { isUuid } from '@/lib/catalog';
import { vnd, pct } from '@/lib/format';
import { adDecision, adMetrics, parseAdCsv, ROAS_STOP, CTR_STOP, CTR_SCALE } from '@/lib/marketing';
import { loadControls } from '@/lib/controls';
import Flash from '@/components/Flash';

// Module Marketing & Kinh doanh (spec): chiến dịch TikTok / Facebook / Google Ads, ROAS, CTR, CPA; RYN-SALES tự dừng / đề xuất tăng ngân sách.
const BACK = '/quan-tri/marketing';
const PLATFORMS = ['TIKTOK', 'FACEBOOK', 'GOOGLE', 'ZALO', 'KHAC'];
const ST: Record<string, [string, string]> = { DANG_CHAY: ['Đang chạy', 'ok'], TAM_DUNG: ['Tạm dừng', 'warn'], KET_THUC: ['Kết thúc', ''] };

async function act(fd: FormData) {
  'use server';
  const u = await requireUser('marketing.edit');
  await runAction(BACK, async () => {
    const op = String(fd.get('op'));
    const a = actorOf(u);
    if (op === 'create') {
      const platform = String(fd.get('platform'));
      const name = String(fd.get('name') ?? '').trim().slice(0, 200);
      const budget = Math.round(Number(fd.get('daily_budget')));
      const roas = Number(fd.get('roas_target')) || ROAS_STOP;
      const pid = String(fd.get('product_id') ?? '');
      if (!PLATFORMS.includes(platform) || !name || !(budget > 0)) throw new UserError('Cần nền tảng, tên và ngân sách/ngày.');
      if (!(await loadControls()).NAP_ADS) throw new UserError('CEO đang khóa chi quảng cáo ở Kiểm soát chi.');
      const r = await q(`INSERT INTO ad_campaigns(platform, name, product_id, daily_budget, roas_target, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [platform, name, isUuid(pid) ? pid : null, budget, Math.max(1, roas), u.id]);
      await audit(a, 'ad.create', 'ad_campaign', r[0].id, { platform, name, budget });
      return 'Đã tạo chiến dịch. Nhập số liệu hằng ngày để AI theo dõi ROAS / CTR.';
    }
    const id = String(fd.get('id'));
    if (!isUuid(id)) throw new UserError('Chiến dịch không hợp lệ.');
    if (op === 'status') {
      const to = String(fd.get('to'));
      if (!ST[to]) throw new UserError('Trạng thái không hợp lệ.');
      if (to === 'DANG_CHAY' && !(await loadControls()).NAP_ADS) throw new UserError('CEO đang khóa chi quảng cáo ở Kiểm soát chi.');
      await q('UPDATE ad_campaigns SET status=$2 WHERE id=$1', [id, to]);
      await audit(a, 'ad.status', 'ad_campaign', id, { to });
      return `Đã chuyển sang ${ST[to][0]}.`;
    }
    if (op === 'stats') {
      const { rows, errors } = parseAdCsv(String(fd.get('csv') ?? ''));
      if (!rows.length) throw new UserError(errors[0] ?? 'Không có dòng hợp lệ.');
      await tx(async (c) => {
        for (const r of rows) {
          await c.query(`INSERT INTO ad_stats(campaign_id, day, spend, impressions, clicks, orders, revenue) VALUES ($1,$2,$3,$4,$5,$6,$7)
            ON CONFLICT (campaign_id, day) DO UPDATE SET spend=EXCLUDED.spend, impressions=EXCLUDED.impressions, clicks=EXCLUDED.clicks, orders=EXCLUDED.orders, revenue=EXCLUDED.revenue`,
            [id, r.day, r.spend, r.impressions, r.clicks, r.orders, r.revenue]);
        }
        await audit(a, 'ad.stats', 'ad_campaign', id, { rows: rows.length, errors: errors.length }, c);
      });
      return `Đã lưu ${rows.length} ngày số liệu${errors.length ? `, bỏ ${errors.length} dòng sai` : ''}.`;
    }
    throw new UserError('Thao tác không hợp lệ.');
  });
}

export default async function Marketing({ searchParams }: { searchParams: { ok?: string; loi?: string } }) {
  const u = await requireUser('orders.view');
  const edit = can(u, 'marketing.edit');
  const [rows, prods, ctl] = await Promise.all([
    q(`SELECT c.*, p.name AS product_name,
        count(s.day) FILTER (WHERE s.day >= CURRENT_DATE - 7)::int AS days,
        COALESCE(sum(s.spend) FILTER (WHERE s.day >= CURRENT_DATE - 7),0)::bigint AS spend,
        COALESCE(sum(s.impressions) FILTER (WHERE s.day >= CURRENT_DATE - 7),0)::bigint AS impressions,
        COALESCE(sum(s.clicks) FILTER (WHERE s.day >= CURRENT_DATE - 7),0)::bigint AS clicks,
        COALESCE(sum(s.orders) FILTER (WHERE s.day >= CURRENT_DATE - 7),0)::bigint AS orders,
        COALESCE(sum(s.revenue) FILTER (WHERE s.day >= CURRENT_DATE - 7),0)::bigint AS revenue,
        COALESCE(sum(s.spend),0)::bigint AS spend_all, COALESCE(sum(s.revenue),0)::bigint AS revenue_all
      FROM ad_campaigns c LEFT JOIN products p ON p.id=c.product_id LEFT JOIN ad_stats s ON s.campaign_id=c.id
      GROUP BY c.id, p.name ORDER BY CASE c.status WHEN 'DANG_CHAY' THEN 0 WHEN 'TAM_DUNG' THEN 1 ELSE 2 END, c.created_at DESC`),
    q('SELECT id, name FROM products ORDER BY name'),
    loadControls(),
  ]);
  const tot = rows.reduce((s, r) => ({ spend: s.spend + Number(r.spend), revenue: s.revenue + Number(r.revenue), budget: s.budget + (r.status === 'DANG_CHAY' ? Number(r.daily_budget) : 0) }), { spend: 0, revenue: 0, budget: 0 });

  return (
    <div className="stack">
      <h1>Marketing & quảng cáo</h1>
      <Flash sp={searchParams} />
      <p className="muted small">
        RYN-SALES xem 7 ngày gần nhất: ROAS &lt; {ROAS_STOP} hoặc CTR &lt; {CTR_STOP}% → tự tạm dừng; CTR &gt; {CTR_SCALE}% và ROAS đạt mục tiêu → đề xuất tăng 20% ngân sách
        (duyệt ở Duyệt nhanh). Chưa nối API TikTok / Facebook / Google Ads: nhập số liệu bằng CSV, và bật / tắt chiến dịch trên nền tảng theo trạng thái ở đây.
        {!ctl.NAP_ADS && <b style={{ color: 'var(--bad)' }}> CEO đang khóa chi quảng cáo.</b>}
      </p>
      <div className="grid cols-4">
        <div className="card"><div className="muted small">Ngân sách/ngày đang chạy</div><b>{vnd(tot.budget)}</b><div className="small muted">≈ {vnd(tot.budget * 30)}/tháng (spec 20–120 triệu)</div></div>
        <div className="card"><div className="muted small">Chi 7 ngày</div><b>{vnd(tot.spend)}</b></div>
        <div className="card"><div className="muted small">Doanh thu từ quảng cáo 7 ngày</div><b>{vnd(tot.revenue)}</b></div>
        <div className="card"><div className="muted small">ROAS 7 ngày</div><b>{tot.spend ? (tot.revenue / tot.spend).toFixed(2) : '—'}</b></div>
      </div>

      {edit && (
        <details className="card"><summary><b>Tạo chiến dịch</b></summary>
          <form action={act} className="form-grid" style={{ marginTop: 12 }}>
            <input type="hidden" name="op" value="create" />
            <label className="field">Nền tảng<select name="platform">{PLATFORMS.map((p) => <option key={p}>{p}</option>)}</select></label>
            <label className="field">Tên chiến dịch<input name="name" required /></label>
            <label className="field">Sản phẩm<select name="product_id" defaultValue=""><option value="">—</option>{prods.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
            <label className="field">Ngân sách/ngày (đ)<input name="daily_budget" type="number" min={1000} required /></label>
            <label className="field">ROAS mục tiêu<input name="roas_target" type="number" step="0.1" min={1} defaultValue={2.5} /></label>
            <div style={{ alignSelf: 'end' }}><button className="btn">Tạo</button></div>
          </form>
        </details>
      )}

      {rows.length === 0 && <p className="muted">Chưa có chiến dịch.</p>}
      {rows.map((r) => {
        const totals = { days: r.days, spend: Number(r.spend), impressions: Number(r.impressions), clicks: Number(r.clicks), orders: Number(r.orders), revenue: Number(r.revenue) };
        const m = adMetrics(totals);
        const d = adDecision(totals, Number(r.roas_target));
        return (
          <section key={r.id} className="card stack small">
            <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <div><b>{r.platform}</b> · {r.name}{r.product_name ? ` · ${r.product_name}` : ''} <span className={`badge ${ST[r.status][1]}`}>{ST[r.status][0]}</span></div>
              <div>Ngân sách {vnd(r.daily_budget)}/ngày · ROAS mục tiêu {Number(r.roas_target)}</div>
            </div>
            <div className="grid cols-4">
              <div>Chi 7 ngày<br /><b>{vnd(totals.spend)}</b></div>
              <div>CTR<br /><b>{m.ctr != null ? pct(m.ctr) : '—'}</b> ({totals.clicks.toLocaleString('vi-VN')} / {totals.impressions.toLocaleString('vi-VN')})</div>
              <div>ROAS<br /><b>{m.roas ?? '—'}</b> · CPA {m.cpa != null ? vnd(m.cpa) : '—'}</div>
              <div>AI: <b>{d.action === 'STOP' ? 'Nên dừng' : d.action === 'SCALE' ? 'Nên tăng 20%' : 'Giữ'}</b><br /><span className="muted">{d.reason}</span></div>
            </div>
            <div className="muted">Từ đầu: chi {vnd(r.spend_all)}, doanh thu {vnd(r.revenue_all)}</div>
            {edit && (
              <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                <form action={act} className="row" style={{ gap: 6 }}><input type="hidden" name="op" value="status" /><input type="hidden" name="id" value={r.id} />
                  {r.status !== 'DANG_CHAY' && <button className="btn sm" name="to" value="DANG_CHAY">Chạy</button>}
                  {r.status === 'DANG_CHAY' && <button className="btn secondary sm" name="to" value="TAM_DUNG">Tạm dừng</button>}
                  {r.status !== 'KET_THUC' && <button className="btn secondary sm" name="to" value="KET_THUC">Kết thúc</button>}
                </form>
                <details style={{ flex: 1, minWidth: 260 }}><summary>Nhập số liệu (CSV)</summary>
                  <form action={act} className="stack" style={{ marginTop: 6 }}><input type="hidden" name="op" value="stats" /><input type="hidden" name="id" value={r.id} />
                    <textarea name="csv" rows={4} className="mono" defaultValue={'ngay,chi_phi,hien_thi,click,don,doanh_thu\n'} />
                    <button className="btn sm">Lưu số liệu</button></form>
                </details>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
