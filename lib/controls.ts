import type { PoolClient } from 'pg';
import { pool } from './db';
import { DEFAULT_CONTROLS, isControlKey, type Controls } from './payouts';

/** Trạng thái các nút Tắt/Mở; nút chưa từng chỉnh lấy giá trị mặc định. */
export async function loadControls(c?: PoolClient): Promise<Controls> {
  const rows = (await (c ?? pool).query('SELECT key, enabled FROM payment_controls')).rows as { key: string; enabled: boolean }[];
  const ctl = { ...DEFAULT_CONTROLS };
  for (const r of rows) if (isControlKey(r.key)) ctl[r.key] = r.enabled;
  return ctl;
}
