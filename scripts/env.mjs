import fs from 'node:fs';

/** Đọc .env (nếu có) cho các script chạy ngoài Next.js. Không ghi đè biến đã có. */
export function loadEnv(file = '.env') {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}
