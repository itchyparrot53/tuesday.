import type { FastifyRequest } from 'fastify';
import type { Db } from '../db/db';
import type { AuditEntry, User } from '../../shared/types';
import { parseJson } from '../lib/json';

export function audit(
  db: Db,
  req: FastifyRequest | null,
  input: {
    action: string;
    actor?: User | null;
    targetKind?: string | null;
    targetId?: number | null;
    targetLabel?: string;
    data?: Record<string, unknown>;
  },
): void {
  const actor = input.actor ?? req?.user ?? null;
  const label = actor ? `${actor.name} (${actor.email})` : 'System';
  db.prepare(
    `INSERT INTO audit_log
      (actor_id, actor_label, action, target_kind, target_id, target_label, ip, user_agent, data, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    actor?.id ?? null,
    label,
    input.action,
    input.targetKind ?? null,
    input.targetId ?? null,
    input.targetLabel ?? '',
    req?.ip ?? '',
    String(req?.headers['user-agent'] ?? '').slice(0, 200),
    JSON.stringify(input.data ?? {}),
    new Date().toISOString(),
  );
}

export function toAuditEntry(row: {
  id: number;
  actor_id: number | null;
  actor_label: string;
  action: string;
  target_kind: string | null;
  target_id: number | null;
  target_label: string;
  ip: string;
  user_agent: string;
  data: string;
  created_at: string;
}): AuditEntry {
  return {
    id: row.id,
    actorId: row.actor_id,
    actorLabel: row.actor_label,
    action: row.action,
    targetKind: row.target_kind,
    targetId: row.target_id,
    targetLabel: row.target_label,
    ip: row.ip,
    userAgent: row.user_agent,
    data: parseJson<Record<string, unknown>>(row.data, {}),
    createdAt: row.created_at,
  };
}
