import Link from 'next/link';
import { requireUser, actorOf, can } from '@/lib/auth';
import { q } from '@/lib/db';
import { runAction, UserError } from '@/lib/action';
import { dt, vnd } from '@/lib/format';
import { LEVELS, canApprove, type Level } from '@/lib/approval';
import { loadControls } from '@/lib/controls';
import { aiEnabled, aiConfig, LANG_LABEL, type Lang } from '@/lib/ai';
import { AGENTS, runAgents, type AgentCode } from '@/lib/agents';
import { decideAgentAction } from '@/lib/agents/decide';
import Flash from '@/components/Flash';

async function run() {
  'use server';
  const u = await requireUser('agents.run');
  await runAction('/quan-tri/ai', async () => {
    const r = await runAgents('TAY', actorOf(u));
    const s = Object.values(r.summary);
    const sum = (k: 'moi' | 'tu_dong' | 'de_xuat') => s.reduce((a, x) => a + x[k], 0);
    const err = Object.entries(r.summary).filter(([, x]) => x.loi).map(([k]) => k);
    return `Đã chạy 7 agent: ${sum('moi')} mục mới, AI tự làm ${sum('tu_dong')}, chờ duyệt ${sum('de_xuat')}.${err.length ? ` Lỗi: ${err.join(', ')}.` : ''}`;
  });
}

async function decide(fd: FormData) {
  'use server';
  const u = await requireUser();
  await runAction('/quan-tri/ai', async () => {
    const op = String(fd.get('op'));
    if (!['approve', 'reject', 'seen'].includes(op)) throw new UserError('Thao tác không hợp lệ.');
    const a = actorOf(u);
    return decideAgentAction(String(fd.get('id')), { id: u.id, role: u.role, label: a.label }, op as 'approve' | 'reject' | 'seen');
  });
}

const SEV: Record<string, string> = { INFO: '', WARN: 'warn', DANGER: 'bad' };
const KIND: Record<string, string> = {
  PRICE_CHANGE: 'Đổi giá', SWITCH_SUPPLIER: 'Đổi xưởng', PRODUCT_STATUS: 'Trạng thái SP', CONTROL_SET: 'Kiểm soát chi',
  RFQ_QUOTE: 'Báo giá', SUPPLIER_TRUST: 'TrustScore', TRANSLATE: 'Dịch 7 ngôn ngữ', NOTE: 'Tin',
};
const ST: Record<string, [string, string]> = {
  TU_DONG: ['AI tự làm', 'ok'], DA_DUYET: ['Đã duyệt', 'ok'], TU_CHOI: ['Từ chối', 'bad'], LOI: ['Không áp dụng được', 'bad'], DA_XEM: ['Đã xem', ''],
};

function Detail({ a }: { a: any }) {
  const d = a.detail ?? {};
  if (a.kind === 'PRICE_CHANGE') {
    return (
      <table className="small"><tbody>
        <tr><td>Bậc</td>{[10, 50, 100, 500].map((t) => <td key={t} className="num">{t}+</td>)}</tr>
        <tr><td>Hiện</td>{[10, 50, 100, 500].map((t) => <td key={t} className="num">{vnd(d.from?.[t])}</td>)}</tr>
        <tr><td>Mới</td>{[10, 50, 100, 500].map((t) => <td key={t} className="num"><b>{vnd(d.to?.[t])}</b></td>)}</tr>
      </tbody></table>
    );
  }
  if (Array.isArray(d.top)) {
    return (
      <ol className="small">{d.top.map((r: any) => <li key={r.sku}>{r.name} — điểm {r.score} (trend {r.trend}, bán 7 ngày {r.ban_7_ngay}{r.ctr ? `, CTR ${r.ctr}%` : ''})</li>)}
        <div className="muted">{d.nguon}{d.gia_lap ? ' Sản phẩm là dữ liệu giả lập.' : ''}</div></ol>
    );
  }
  if (Array.isArray(d.san_pham) && d.san_pham[0]?.kich_ban) {
    return (
      <div className="small stack">
        <div className="muted">Tỷ giá {d.ty_gia} đ/tệ{d.ty_gia_tam ? ' (tạm, cần nhập CNY_VND_RATE)' : ''}. {d.luu_y}</div>
        {d.san_pham.map((p: any) => (
          <details key={p.sku}><summary>{p.name} · {p.xuong} · {p.gia_hien_tai_cny} ¥ → mục tiêu {p.muc_tieu_cny} ¥</summary>
            {p.kich_ban.map((k: any) => <div key={k.ten} style={{ margin: '6px 0' }}><b>{k.ten}:</b> <span lang="zh">{k.zh}</span><br /><span className="muted">{k.vi}</span></div>)}
          </details>
        ))}
      </div>
    );
  }
  if (Array.isArray(d.san_pham)) return <div className="small">{d.san_pham.map((p: any) => `${p.name} (${p.qc}%)`).join(', ')}</div>;
  if (d.names) return <div className="small">{Object.entries(d.names).map(([l, n]) => `${LANG_LABEL[l as Lang] ?? l}: ${n}`).join(' · ')}</div>;
  if (d.note) return <div className="small">{d.note}</div>;
  if (d.error) return <div className="small" style={{ color: 'var(--bad)' }}>{d.error}</div>;
  return null;
}

export default async function AiCenter({ searchParams }: { searchParams: { ok?: string; loi?: string } }) {
  const u = await requireUser();
  const ctl = await loadControls();
  const [queue, feed, done, runs, perAgent] = await Promise.all([
    q("SELECT * FROM agent_actions WHERE status='DE_XUAT' ORDER BY level DESC NULLS LAST, created_at"),
    q("SELECT * FROM agent_actions WHERE status='TIN' ORDER BY CASE severity WHEN 'DANGER' THEN 0 WHEN 'WARN' THEN 1 ELSE 2 END, created_at DESC LIMIT 100"),
    q("SELECT * FROM agent_actions WHERE status IN ('TU_DONG','DA_DUYET','TU_CHOI','LOI','DA_XEM') ORDER BY COALESCE(decided_at, created_at) DESC LIMIT 30"),
    q('SELECT * FROM agent_runs ORDER BY started_at DESC LIMIT 5'),
    q(`SELECT agent, count(*) FILTER (WHERE status='DE_XUAT')::int AS cho, count(*) FILTER (WHERE status='TIN')::int AS tin,
        count(*) FILTER (WHERE status='TU_DONG' AND created_at > now() - interval '7 days')::int AS tu_dong FROM agent_actions GROUP BY agent`),
  ]);
  const stat = Object.fromEntries(perAgent.map((r) => [r.agent, r]));
  const last = runs[0];
  const cfg = aiConfig();

  return (
    <div className="stack">
      <h1>AI tự động</h1>
      <Flash sp={searchParams} />
      <p className="muted">
        7 agent đọc dữ liệu thật trong hệ thống, tự làm việc an toàn và đưa việc cần người vào hàng đợi One-Tap. Không agent nào chuyển tiền.
        Lịch: n8n gọi <code>POST /api/v1/agents/run</code> mỗi 6 giờ (hoặc <code>npm run agents</code>).
      </p>
      <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
        <span className={`badge ${ctl.AI_AUTO ? 'ok' : 'bad'}`}>Tự duyệt Cấp 1: {ctl.AI_AUTO ? 'BẬT' : 'TẮT'}</span>
        <span className={`badge ${aiEnabled() ? 'ok' : 'warn'}`}>AI ngôn ngữ: {aiEnabled() ? `${cfg.model}` : 'chưa có khóa (chạy bằng quy tắc)'}</span>
        <span className="badge">Lần chạy gần nhất: {last ? `${dt(last.started_at)} · ${last.status === 'XONG' ? 'xong' : last.status === 'LOI' ? 'có lỗi' : 'đang chạy'}` : 'chưa chạy'}</span>
        {can(u, 'agents.run') && <form action={run}><button className="btn sm">Chạy 7 agent ngay</button></form>}
        <Link className="small" href="/quan-tri/can-nhap">Thông tin cần nhập</Link>
      </div>

      <div className="grid cols-4">
        {(Object.keys(AGENTS) as AgentCode[]).map((k) => (
          <div key={k} className="card small">
            <b>{k}</b> · {AGENTS[k].name}
            <div className="muted" style={{ margin: '4px 0' }}>{AGENTS[k].job}</div>
            <div>Chờ duyệt <b>{stat[k]?.cho ?? 0}</b> · Tin <b>{stat[k]?.tin ?? 0}</b> · Tự làm 7 ngày <b>{stat[k]?.tu_dong ?? 0}</b></div>
            {last?.summary?.[k]?.loi && <div style={{ color: 'var(--bad)' }}>Lỗi: {last.summary[k].loi}</div>}
          </div>
        ))}
      </div>

      <h2>Chờ duyệt ({queue.length})</h2>
      {queue.length === 0 ? <p className="muted">Không có đề xuất nào chờ duyệt.</p> : (
        <div className="table-wrap"><table>
          <thead><tr><th>Agent</th><th>Việc</th><th>Cấp</th><th>Đề xuất</th><th></th></tr></thead>
          <tbody>{queue.map((a) => {
            const mine = canApprove(u.role, (a.level ?? 2) as Level);
            return (
              <tr key={a.id}>
                <td className="small">{a.agent}<div className="muted">{dt(a.created_at)}</div></td>
                <td><span className={`badge ${SEV[a.severity]}`}>{KIND[a.kind] ?? a.kind}</span></td>
                <td className="small">{LEVELS[(a.level ?? 2) as Level].label}</td>
                <td>{a.title}<Detail a={a} /></td>
                <td>{mine ? (
                  <form action={decide} className="row"><input type="hidden" name="id" value={a.id} />
                    <button className="btn sm" name="op" value="approve">Duyệt</button>
                    <button className="btn danger sm" name="op" value="reject">Từ chối</button></form>
                ) : <span className="small muted">Chờ {(a.level ?? 2) >= 3 ? 'CEO' : 'Trưởng nhóm / CEO'}</span>}</td>
              </tr>
            );
          })}</tbody>
        </table></div>
      )}

      <h2>Tin và cảnh báo ({feed.length})</h2>
      {feed.length === 0 ? <p className="muted">Không có tin mới.</p> : (
        <div className="stack">{feed.map((a) => (
          <div key={a.id} className={`card ${a.severity === 'DANGER' ? 'alert bad' : a.severity === 'WARN' ? 'alert warn' : ''}`}>
            <div className="row" style={{ justifyContent: 'space-between', gap: 8 }}>
              <div><span className="small muted">{a.agent} · {dt(a.created_at)}</span><div><b>{a.title}</b></div></div>
              <form action={decide}><input type="hidden" name="id" value={a.id} /><button className="btn secondary sm" name="op" value="seen">Đã xem</button></form>
            </div>
            <Detail a={a} />
          </div>
        ))}</div>
      )}

      <h2>Đã làm gần đây</h2>
      <div className="table-wrap"><table>
        <thead><tr><th>Lúc</th><th>Agent</th><th>Việc</th><th>Kết quả</th><th>Người</th></tr></thead>
        <tbody>{done.map((a) => (
          <tr key={a.id}><td className="small">{dt(a.decided_at ?? a.created_at)}</td><td className="small">{a.agent}</td>
            <td>{a.title}{a.status === 'LOI' && <Detail a={a} />}</td>
            <td><span className={`badge ${ST[a.status]?.[1] ?? ''}`}>{ST[a.status]?.[0] ?? a.status}</span></td><td className="small">{a.decided_label ?? '—'}</td></tr>
        ))}</tbody>
      </table></div>

      <h2>API cho n8n và đối tác</h2>
      <div className="table-wrap"><table>
        <thead><tr><th>Endpoint</th><th>Việc</th><th>Tình trạng</th></tr></thead>
        <tbody>{APIS.map(([e, d, s]) => (
          <tr key={e}><td className="mono small">{e}</td><td>{d}</td><td><span className={`badge ${s === 'Chạy được' ? 'ok' : 'warn'}`}>{s}</span></td></tr>
        ))}</tbody>
      </table></div>
      <p className="muted small">API nhận phiên đăng nhập quản trị, hoặc header <code>x-api-key</code> bằng INTERNAL_API_KEY. Quy trình n8n mới: <code>n8n/taomua_7_agents_6h.json</code>.</p>
    </div>
  );
}

const APIS: [string, string, string][] = [
  // 14 endpoint theo 03_API_SPEC.md (đúng thứ tự spec)
  ['POST /api/v1/trend-hunter/scan', '#1 Hàng hot {source, limit} → {trends} (RYN-TREND; nguồn ngoài khi có khóa)', 'Chạy được'],
  ['POST /api/v1/supplier-brain/find', '#2 Tìm 50 xưởng + 3 dự phòng {product_name, category}', 'Chạy được'],
  ['POST /api/v1/supplier-brain/trust-score', '#3 TrustScore + factors (5 yếu tố tạm, chờ đủ 17/19 yếu tố)', 'Chạy được'],
  ['POST /api/v1/pricing-engine/calculate', '#4 Đề xuất 4 bậc giá, biên sau thuế phí, cấp duyệt, vốn 30% + 15%', 'Chạy được'],
  ['POST /api/v1/approval/queue', '#5 n8n gửi việc cần duyệt; GET ?id= hỏi trạng thái (thay Telegram)', 'Chạy được'],
  ['POST /api/v1/approval/approve', '#6 Duyệt 1 chạm (người đăng nhập)', 'Chạy được'],
  ['GET|POST /api/v1/agent-gateway/shop-md', '#7 Danh mục cho AI agent; POST {query} → sản phẩm + link giỏ hàng', 'Chạy được'],
  ['POST /api/v1/agent-gateway/profiles', '#8 Agent Profiles 10/50/100 triệu/tháng → {limit, spent, remaining}', 'Chạy được'],
  ['POST /api/v1/wfs/fulfillment', '#9 DROPSHIP / WFS / SAME_DAY_30MIN', 'Chạy được'],
  ['POST /api/v1/trade-assurance/hold', '#10 HOLD / RELEASED / REFUND (giải ngân, hoàn tiền: CEO)', 'Chạy được'],
  ['POST /api/v1/rynn-brain/check', '#11 QC: nhận kết quả kiểm {checked, defects}; ảnh khi có khóa camera', 'Chạy được'],
  ['POST /api/v1/latr/test', '#12 Bán thử 50–100 cái → TESTING / SCALING / STOPPED', 'Chạy được'],
  ['POST /api/v1/scintilla/analytics', '#13 Doanh số, ROAS, CTR, biên, vốn, vòng quay', 'Chạy được'],
  ['POST /api/v1/working-capital/calculate', '#14 Vốn 30% + 15% = 45%, vòng quay, biên an toàn', 'Chạy được'],
  // Bổ sung ngoài 14 endpoint
  ['POST /api/v1/agents/run', 'Chạy 7 agent (n8n gọi 6 giờ/lần)', 'Chạy được'],
  ['POST /api/v1/canvas/edit', 'Canvas: sửa nội dung cửa hàng {key, value} hoặc bằng lời (cần AI)', 'Chạy được'],
];
