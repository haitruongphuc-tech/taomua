// PostgreSQL chạy ngay trong thư mục dự án (không cần cài vào máy). Dữ liệu ở .pgdata/.
// Dùng: npm run db:local   (để cửa sổ này mở; Ctrl+C để dừng)
// Tạo sẵn database taomua và taomua_test, khớp DATABASE_URL mặc định trong .env.example.
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import EmbeddedPostgres from 'embedded-postgres';

const dir = path.resolve('.pgdata');
const port = Number(process.env.PGPORT_LOCAL || 5432);
const db = new EmbeddedPostgres({
  databaseDir: dir, user: 'taomua', password: 'taomua_dev', port, persistent: true,
  initdbFlags: ['--encoding=UTF8', '--locale=C'],
  onLog: () => {}, onError: (e) => console.error(String(e).trim()),
});

if (!fs.existsSync(path.join(dir, 'PG_VERSION'))) {
  console.log('Khởi tạo database lần đầu ở .pgdata/ …');
  await db.initialise();
}
await db.start();

const admin = new pg.Client({ connectionString: `postgres://taomua:taomua_dev@localhost:${port}/postgres` });
await admin.connect();
for (const name of ['taomua', 'taomua_test']) {
  const r = await admin.query('SELECT 1 FROM pg_database WHERE datname=$1', [name]);
  if (!r.rowCount) { await admin.query(`CREATE DATABASE ${name}`); console.log(`Đã tạo database ${name}.`); }
}
await admin.end();
console.log(`PostgreSQL đang chạy ở localhost:${port} (user taomua). Ctrl+C để dừng.`);

let stopping = false;
const stop = async () => {
  if (stopping) return; stopping = true;
  await db.stop();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
setInterval(() => {}, 1 << 30);
