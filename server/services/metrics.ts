import type { FastifyInstance } from 'fastify';

const counters = {
  http: new Map<string, number>(),
  jobs: new Map<string, number>(),
  emails: new Map<string, number>(),
  push: new Map<string, number>(),
  ai: new Map<string, number>(),
};

function bump(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

export const metrics = {
  http(status: number) {
    bump(counters.http, `${Math.floor(status / 100)}xx`);
  },
  job(kind: string, result: 'done' | 'failed') {
    bump(counters.jobs, `${kind}|${result}`);
  },
  email(status: string) {
    bump(counters.emails, status);
  },
  push(result: string) {
    bump(counters.push, result);
  },
  ai(feature: string, status: string) {
    bump(counters.ai, `${feature}|${status}`);
  },
};

export function renderMetrics(app: FastifyInstance): string {
  const lines: string[] = [];
  for (const [key, value] of counters.http)
    lines.push(`tuesday_http_requests_total{status_class="${key}"} ${value}`);
  for (const [key, value] of counters.jobs) {
    const [kind, result] = key.split('|');
    lines.push(`tuesday_jobs_total{kind="${kind}",result="${result}"} ${value}`);
  }
  for (const [status, value] of counters.emails)
    lines.push(`tuesday_emails_total{status="${status}"} ${value}`);
  for (const [result, value] of counters.push)
    lines.push(`tuesday_push_total{result="${result}"} ${value}`);
  for (const [key, value] of counters.ai) {
    const [feature, status] = key.split('|');
    lines.push(`tuesday_ai_calls_total{feature="${feature}",status="${status}"} ${value}`);
  }
  const month = `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, '0')}`;
  const cost = app.db
    .prepare('SELECT coalesce(sum(cost_usd),0) AS c FROM ai_usage WHERE substr(created_at,1,7) = ?')
    .get(month) as { c: number };
  const sse = (app as unknown as { sseConnections?: number }).sseConnections ?? 0;
  const active = app.db
    .prepare('SELECT count(DISTINCT user_id) AS n FROM sessions WHERE expires_at > ?')
    .get(new Date().toISOString()) as { n: number };
  const dbSize = app.db.prepare('PRAGMA page_count').get() as { page_count: number };
  const pageSize = app.db.prepare('PRAGMA page_size').get() as { page_size: number };
  const queue = app.db.prepare("SELECT count(*) AS n FROM jobs WHERE status = 'queued'").get() as {
    n: number;
  };
  lines.push(`tuesday_ai_cost_usd_month ${cost.c.toFixed(6)}`);
  lines.push(`tuesday_sse_connections ${sse}`);
  lines.push(`tuesday_active_users_7d ${active.n}`);
  lines.push(`tuesday_db_size_bytes ${dbSize.page_count * pageSize.page_size}`);
  lines.push(`tuesday_queue_depth ${queue.n}`);
  lines.push('tuesday_up 1');
  return `${lines.join('\n')}\n`;
}
