import type { PoolClient } from 'pg';
import { pool } from './db';

export type Actor = { id?: string | null; label: string };

export async function audit(
  actor: Actor, action: string, entity: string, entityId: string | null,
  detail: Record<string, unknown> = {}, c?: PoolClient,
) {
  await (c ?? pool).query(
    'INSERT INTO audit_log(user_id, actor, action, entity, entity_id, detail) VALUES ($1,$2,$3,$4,$5,$6)',
    [actor.id ?? null, actor.label, action, entity, entityId, JSON.stringify(detail)],
  );
}
