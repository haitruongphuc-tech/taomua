import { Pool, PoolClient, QueryResultRow, types } from 'pg';

// BIGINT và NUMERIC trả về dạng chuỗi; đổi sang số (tiền VND nằm trong giới hạn an toàn của Number).
types.setTypeParser(20, (v) => Number(v));
types.setTypeParser(1700, (v) => Number(v));

const g = globalThis as unknown as { __pool?: Pool };
export const pool = g.__pool ?? new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
if (process.env.NODE_ENV !== 'production') g.__pool = pool;

export async function q<T extends QueryResultRow = any>(sql: string, params: unknown[] = []): Promise<T[]> {
  const r = await pool.query<T>(sql, params);
  return r.rows;
}
export async function one<T extends QueryResultRow = any>(sql: string, params: unknown[] = []): Promise<T | null> {
  const r = await pool.query<T>(sql, params);
  return r.rows[0] ?? null;
}
export async function tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const out = await fn(c);
    await c.query('COMMIT');
    return out;
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}
