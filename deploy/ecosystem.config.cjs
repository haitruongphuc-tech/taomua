// pm2: web taomua.com + vòng AI 24/7. Dùng: pm2 startOrReload deploy/ecosystem.config.cjs
// Web chỉ nghe ở 127.0.0.1 (Nginx đứng trước, lo HTTPS), không lộ cổng ra Internet.
const path = require('node:path');
const fs = require('node:fs');

const cwd = path.join(__dirname, '..');
// Lấy PORT từ .env nếu có (mặc định 3000)
let port = '3000';
try {
  const m = fs.readFileSync(path.join(cwd, '.env'), 'utf8').match(/^PORT=(\d+)\s*$/m);
  if (m) port = m[1];
} catch {}

module.exports = {
  apps: [
    {
      name: 'taomua-web',
      cwd,
      script: 'node_modules/next/dist/bin/next',
      args: `start -H 127.0.0.1 -p ${port}`,
      env: { NODE_ENV: 'production' },
      max_memory_restart: '1G',
    },
    {
      name: 'taomua-ai',
      cwd,
      script: 'node_modules/tsx/dist/cli.mjs',
      args: 'scripts/ai-247.ts',
      env: { NODE_ENV: 'production' },
      restart_delay: 10000,
    },
  ],
};
