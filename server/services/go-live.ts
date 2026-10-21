import type { FastifyInstance } from 'fastify';
import type { GoLiveCheck, GoLiveReport } from '../../shared/types';
import { getSetting } from './settings';
import { listBackups } from './backups';
import { checkEmailDns } from './email-dns';

function appHttps(app: FastifyInstance): GoLiveCheck {
  let url: URL | null = null;
  try {
    url = new URL(app.config.appUrl);
  } catch {}
  if (url?.protocol === 'https:') {
    return {
      id: 'https',
      label: 'HTTPS APP_URL',
      status: 'pass',
      detail: `APP_URL is ${app.config.appUrl}.`,
      href: '/release',
    };
  }
  const local = url?.hostname === 'localhost' || url?.hostname === '127.0.0.1';
  return {
    id: 'https',
    label: 'HTTPS APP_URL',
    status: local ? 'warn' : 'fail',
    detail: local
      ? 'APP_URL is localhost; email and invite links only work on this machine.'
      : 'APP_URL is not HTTPS. Set it to the public HTTPS origin.',
    href: '/release',
  };
}

function cookieCheck(app: FastifyInstance): GoLiveCheck {
  return {
    id: 'cookies',
    label: 'Secure cookies',
    status: app.config.cookieSecure
      ? 'pass'
      : app.config.appUrl.startsWith('https:')
        ? 'fail'
        : 'warn',
    detail: app.config.cookieSecure
      ? 'Session cookies are Secure.'
      : 'COOKIE_SECURE is false. Set it to true when the public site uses HTTPS.',
    href: '/release',
  };
}

function smtpCheck(app: FastifyInstance): GoLiveCheck {
  if (!app.config.smtp) {
    return {
      id: 'smtp',
      label: 'SMTP configured',
      status: 'fail',
      detail: 'No SMTP host, user and password are configured.',
      href: '/admin?tab=email',
    };
  }
  const sent = app.db
    .prepare("SELECT 1 AS ok FROM email_log WHERE kind = 'test' AND status = 'sent' LIMIT 1")
    .get() as { ok: number } | undefined;
  return {
    id: 'smtp',
    label: 'SMTP configured and tested',
    status: sent ? 'pass' : 'warn',
    detail: sent
      ? `A test email was sent successfully via ${app.config.smtp.host}.`
      : 'SMTP is configured, but no successful test email is logged yet.',
    href: '/admin?tab=email',
  };
}

async function emailDnsCheck(app: FastifyInstance): Promise<GoLiveCheck> {
  const domain = app.config.mailFrom.match(/@([^>\s]+)/)?.[1]?.toLowerCase() ?? null;
  if (!domain) {
    return {
      id: 'dns',
      label: 'SPF and DMARC',
      status: 'fail',
      detail: 'MAIL_FROM is not set, so there is no sender domain to check.',
      href: '/admin?tab=email',
    };
  }
  const report = await checkEmailDns(domain);
  const missing = [
    report.spf.status !== 'found' ? 'SPF' : '',
    report.dmarc.status !== 'found' ? 'DMARC' : '',
  ].filter(Boolean);
  return {
    id: 'dns',
    label: 'SPF and DMARC',
    status: missing.length === 0 ? 'pass' : missing.length === 2 ? 'fail' : 'warn',
    detail:
      missing.length === 0
        ? `SPF and DMARC are published for ${domain}.`
        : `${missing.join(' and ')} not found for ${domain}.`,
    href: '/admin?tab=email',
  };
}

function backupCheck(app: FastifyInstance): GoLiveCheck {
  if (!app.config.offsite) {
    return {
      id: 'backups',
      label: 'Off-site backups',
      status: 'fail',
      detail: 'No off-site S3-compatible target is configured.',
      href: '/admin?tab=data',
    };
  }
  const latest = listBackups(app.config)[0];
  if (!latest) {
    return {
      id: 'backups',
      label: 'Off-site backups',
      status: 'warn',
      detail: 'Off-site is configured, but no local backup exists yet.',
      href: '/admin?tab=data',
    };
  }
  const age = Date.now() - new Date(latest.createdAt).getTime();
  return {
    id: 'backups',
    label: 'Off-site backups',
    status: age < 36 * 3600_000 ? 'pass' : 'warn',
    detail:
      age < 36 * 3600_000
        ? `Latest backup is ${Math.round(age / 3600_000)}h old.`
        : `Latest backup is ${Math.round(age / 3600_000)}h old; make a fresh one.`,
    href: '/admin?tab=data',
  };
}

function restoreCheck(app: FastifyInstance): GoLiveCheck {
  const done = getSetting(app.db, 'goLive:restoreDrillDone', false);
  return {
    id: 'restore',
    label: 'Restore drill done',
    status: done ? 'pass' : 'warn',
    detail: done
      ? 'The owner has confirmed a restore drill.'
      : 'Try a restore on a throwaway instance, then tick this.',
    href: '/release',
  };
}

function pushCheck(app: FastifyInstance): GoLiveCheck {
  return {
    id: 'push',
    label: 'VAPID_SUBJECT',
    status: app.config.vapidSubject ? 'pass' : 'warn',
    detail: app.config.vapidSubject
      ? 'VAPID_SUBJECT is set.'
      : 'VAPID_SUBJECT is not set; push notifications use a fallback contact.',
    href: '/profile?tab=notifications',
  };
}

function aiCheck(app: FastifyInstance): GoLiveCheck {
  const row = app.db
    .prepare('SELECT count(*) AS n FROM ai_budgets WHERE monthly_usd > 0')
    .get() as { n: number };
  return {
    id: 'ai',
    label: 'AI budget',
    status: row.n > 0 ? 'pass' : 'warn',
    detail:
      row.n > 0
        ? `${row.n} AI budget(s) configured.`
        : 'No AI budget is set; add one before relying on AI.',
    href: '/admin?tab=ai',
  };
}

export async function goLiveReport(app: FastifyInstance): Promise<GoLiveReport> {
  const checks = [
    appHttps(app),
    cookieCheck(app),
    smtpCheck(app),
    await emailDnsCheck(app),
    backupCheck(app),
    restoreCheck(app),
    pushCheck(app),
    aiCheck(app),
  ];
  return {
    checks,
    restoreDrillDone: getSetting(app.db, 'goLive:restoreDrillDone', false),
    checkedAt: new Date().toISOString(),
  };
}
