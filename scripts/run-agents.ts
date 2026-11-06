// Chạy 7 AI agent một lần (dùng cho Windows Task Scheduler / cron nếu không dùng n8n).
// Dùng: npm run agents
// @ts-expect-error: module .mjs không có khai báo kiểu
import { loadEnv } from './env.mjs';
loadEnv();

async function main() {
  const { runAgents } = await import('../lib/agents');
  const { pool } = await import('../lib/db');
  const r = await runAgents('LICH', { id: null, label: 'Lịch chạy tự động' });
  console.log(JSON.stringify(r, null, 2));
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
