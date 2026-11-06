// AI taomua làm việc 24/7: chạy 7 agent theo vòng (mặc định 60 phút), làm mới mô hình AI LOCAL, ghi nhịp tim để trang quản trị biết AI còn sống.
// Khung chat khách hàng và chat agent luôn trả lời ngay trong web, không phụ thuộc vòng này.
// Dùng: npm run ai:247   (giữ chạy nền bằng pm2: `pm2 start npm --name taomua-ai -- run ai:247`, hoặc Windows Task Scheduler lúc khởi động máy)
// @ts-expect-error: module .mjs không có khai báo kiểu
import { loadEnv } from './env.mjs';
loadEnv();

const minutes = Math.max(5, Number(process.env.AI_247_INTERVAL_MIN) || 60);
let stop = false;
let wake: (() => void) | null = null;
for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => { stop = true; wake?.(); });

async function main() {
  const { runAgents } = await import('../lib/agents');
  const { resetLocalAi, intentModel } = await import('../lib/lessons');
  const { q, pool } = await import('../lib/db');
  const { logError } = await import('../lib/errors');
  console.log(`AI taomua 24/7: chạy 7 agent mỗi ${minutes} phút. Ctrl+C để dừng.`);
  let round = 0;
  while (!stop) {
    round++;
    const t0 = Date.now();
    let info: Record<string, unknown> = { round, interval_min: minutes };
    try {
      const r = await runAgents('LICH', { id: null, label: 'AI 24/7' });
      resetLocalAi();
      const m = await intentModel();
      info = { ...info, ok: true, run_id: r.run_id, summary: r.summary, mau_hoc: m.n, ms: Date.now() - t0 };
      console.log(new Date().toISOString(), `vòng ${round}: xong trong ${Date.now() - t0} ms, AI LOCAL học ${m.n} câu mẫu`);
    } catch (e: any) {
      info = { ...info, ok: false, error: String(e?.message ?? e).slice(0, 300) };
      console.error(new Date().toISOString(), `vòng ${round} lỗi:`, e);
      await logError('ai-247', e).catch(() => {});
    }
    await q(`INSERT INTO ai_heartbeat(worker, beat_at, info) VALUES ('ai-247', now(), $1)
      ON CONFLICT (worker) DO UPDATE SET beat_at=now(), info=EXCLUDED.info`, [JSON.stringify(info)]).catch(() => {});
    if (stop) break;
    await new Promise<void>((res) => { wake = res; setTimeout(res, minutes * 60_000); });
  }
  await pool.end();
  console.log('Đã dừng AI 24/7.');
}
main().catch((e) => { console.error(e); process.exit(1); });
