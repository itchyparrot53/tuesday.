export interface Config {
  port: number;
  databasePath: string;
  appUrl: string;
  cookieSecure: boolean;
  logLevel: string;
  isProduction: boolean;
  openrouterApiKey: string | undefined;
  defaultModel: string;
  fastModel: string;
  aiFake: boolean;
  uploadsDir: string;
  maxUploadMb: number;
  backupDir: string;
  backupKeep: number;
  backupHour: number;
  webhooksAllowPrivate: boolean;
  smtp: {
    host: string;
    port: number;
    secure: boolean;
    fallbackPort: number;
    user: string;
    pass: string;
  } | null;
  mailFrom: string;
  mailFake: boolean;
  vapidSubject: string | null;
  oidc: {
    issuer: string;
    clientId: string;
    clientSecret: string;
    buttonLabel: string;
    allowedDomains: string[];
    defaultRole: 'member' | 'viewer';
    only: boolean;
  } | null;
  trustProxy: boolean;
  push: { publicKey: string; privateKey: string; subject: string } | null;
  pushFake: boolean;
  offsite: {
    endpoint: string;
    region: string;
    bucket: string;
    accessKeyId: string;
    secretAccessKey: string;
    prefix: string;
    keep: number;
  } | null;
  offsiteFake: boolean;
  backupEncryptionKey: string | null;
  healthToken: string | null;
}

export function loadConfig(): Config {
  if (process.env.NODE_ENV !== 'test' && process.env.TUESDAY_NO_DOTENV !== '1') {
    try {
      process.loadEnvFile('.env');
    } catch {}
  }
  const smtpHost = process.env.SMTP_HOST?.trim();
  const smtpUser = process.env.SMTP_USER?.trim();
  const smtpPass = process.env.SMTP_PASS;
  const smtpPort = Number(process.env.SMTP_PORT ?? 465);
  const smtp =
    smtpHost && smtpUser && smtpPass
      ? {
          host: smtpHost,
          port: smtpPort,
          secure:
            process.env.SMTP_SECURE === undefined
              ? smtpPort === 465
              : process.env.SMTP_SECURE === 'true',
          fallbackPort: Number(process.env.SMTP_FALLBACK_PORT ?? 587),
          user: smtpUser,
          pass: smtpPass,
        }
      : null;
  const oidcIssuer = process.env.OIDC_ISSUER?.trim();
  const oidcClientId = process.env.OIDC_CLIENT_ID?.trim();
  const oidcClientSecret = process.env.OIDC_CLIENT_SECRET;
  const oidc =
    oidcIssuer && oidcClientId && oidcClientSecret
      ? {
          issuer: oidcIssuer,
          clientId: oidcClientId,
          clientSecret: oidcClientSecret,
          buttonLabel: process.env.OIDC_BUTTON_LABEL?.trim() || 'Sign in with SSO',
          allowedDomains: (process.env.OIDC_ALLOWED_DOMAINS ?? '')
            .split(',')
            .map((domain) => domain.trim().toLowerCase())
            .filter(Boolean),
          defaultRole: (process.env.OIDC_DEFAULT_ROLE === 'viewer' ? 'viewer' : 'member') as
            'member' | 'viewer',
          only: process.env.OIDC_ONLY === 'true',
        }
      : null;
  const pushPublic = process.env.VAPID_PUBLIC_KEY?.trim();
  const pushPrivate = process.env.VAPID_PRIVATE_KEY?.trim();
  const mailFromAddress = (process.env.MAIL_FROM ?? '').match(/[^<\s]+@[^>\s]+/)?.[0];
  const pushSubject =
    process.env.VAPID_SUBJECT?.trim() ||
    (mailFromAddress ? `mailto:${mailFromAddress}` : 'mailto:admin@localhost');
  const push =
    pushPublic && pushPrivate
      ? { publicKey: pushPublic, privateKey: pushPrivate, subject: pushSubject }
      : null;
  const s3Endpoint = process.env.BACKUP_S3_ENDPOINT?.trim();
  const s3Bucket = process.env.BACKUP_S3_BUCKET?.trim();
  const s3Access = process.env.BACKUP_S3_ACCESS_KEY_ID?.trim();
  const s3Secret = process.env.BACKUP_S3_SECRET_ACCESS_KEY?.trim();
  const offsiteFake = process.env.BACKUP_S3_FAKE === 'true';
  const offsite = offsiteFake
    ? {
        endpoint: 'fake://local',
        region: 'auto',
        bucket: 'fake',
        accessKeyId: 'fake',
        secretAccessKey: 'fake',
        prefix: process.env.BACKUP_S3_PREFIX ?? 'tuesday/',
        keep: Number(process.env.BACKUP_S3_KEEP ?? 30),
      }
    : s3Endpoint && s3Bucket && s3Access && s3Secret
      ? {
          endpoint: s3Endpoint,
          region: process.env.BACKUP_S3_REGION ?? 'auto',
          bucket: s3Bucket,
          accessKeyId: s3Access,
          secretAccessKey: s3Secret,
          prefix: process.env.BACKUP_S3_PREFIX ?? 'tuesday/',
          keep: Number(process.env.BACKUP_S3_KEEP ?? 30),
        }
      : null;
  const backupEncryptionKey = process.env.BACKUP_ENCRYPTION_KEY?.trim() || null;
  if (backupEncryptionKey && backupEncryptionKey.length < 32) {
    throw new Error('BACKUP_ENCRYPTION_KEY must be at least 32 characters');
  }
  return {
    port: Number(process.env.PORT ?? 3000),
    databasePath: process.env.DATABASE_PATH ?? './data/tuesday.db',
    appUrl: process.env.APP_URL ?? 'http://localhost:3000',
    cookieSecure: process.env.COOKIE_SECURE === 'true',
    logLevel: process.env.LOG_LEVEL ?? 'info',
    isProduction: process.env.NODE_ENV === 'production',
    openrouterApiKey: process.env.OPENROUTER_API_KEY || undefined,
    defaultModel: process.env.OPENROUTER_DEFAULT_MODEL ?? 'deepseek/deepseek-v4.1-flash-1017',
    fastModel: process.env.OPENROUTER_FAST_MODEL ?? 'deepseek/deepseek-v4.1-flash-1017',
    aiFake: process.env.AI_FAKE === 'true',
    uploadsDir: process.env.UPLOADS_DIR ?? './data/uploads',
    maxUploadMb: Number(process.env.MAX_UPLOAD_MB ?? 25),
    backupDir: process.env.BACKUP_DIR ?? './data/backups',
    backupKeep: Number(process.env.BACKUP_KEEP ?? 7),
    backupHour: Number(process.env.BACKUP_HOUR ?? 3),
    webhooksAllowPrivate: process.env.WEBHOOKS_ALLOW_PRIVATE === 'true',
    smtp,
    mailFrom: process.env.MAIL_FROM || (smtp ? `Tuesday <${smtp.user}>` : ''),
    mailFake: process.env.MAIL_FAKE === 'true',
    vapidSubject: process.env.VAPID_SUBJECT?.trim() || null,
    oidc,
    trustProxy: process.env.TRUST_PROXY === 'true',
    push,
    pushFake: process.env.PUSH_FAKE === 'true',
    offsite,
    offsiteFake,
    backupEncryptionKey,
    healthToken: process.env.HEALTH_TOKEN?.trim() || null,
  };
}

const TWO_LEVEL_SUFFIXES = new Set([
  'co.uk',
  'org.uk',
  'ac.uk',
  'gov.uk',
  'com.au',
  'net.au',
  'co.nz',
  'co.za',
  'co.jp',
  'com.br',
]);

/** Best-effort registrable family for a hostname, without pulling in a PSL dependency. */
export function domainFamily(host: string): string {
  const clean = host.toLowerCase().replace(/\.$/, '');
  const labels = clean.split('.');
  if (labels.length <= 2) return clean;
  const suffix = labels.slice(-2).join('.');
  return TWO_LEVEL_SUFFIXES.has(suffix) ? labels.slice(-3).join('.') : suffix;
}

export function startupWarnings(
  config: Pick<Config, 'appUrl' | 'cookieSecure' | 'smtp' | 'mailFrom'>,
): string[] {
  const warnings: string[] = [];
  let appUrl: URL | null = null;
  try {
    appUrl = new URL(config.appUrl);
  } catch {
    warnings.push(`APP_URL is not a valid URL: ${config.appUrl}`);
  }
  if (appUrl) {
    const local = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(appUrl.hostname);
    if (appUrl.protocol === 'http:' && !local) {
      warnings.push(
        `APP_URL uses http on a non-local host (${config.appUrl}). Use https and set COOKIE_SECURE=true before inviting users.`,
      );
    }
    if (appUrl.protocol === 'https:' && !config.cookieSecure) {
      warnings.push(
        'APP_URL is https but COOKIE_SECURE is not true. Set COOKIE_SECURE=true so session cookies are not sent over plain HTTP.',
      );
    }
    if (config.smtp && config.mailFrom) {
      const mailDomain = config.mailFrom.match(/@([^>\s]+)/)?.[1]?.toLowerCase();
      if (mailDomain) {
        const appFamily = domainFamily(appUrl.hostname);
        const mailFamily = domainFamily(mailDomain);
        if (appFamily !== mailFamily) {
          warnings.push(
            `SMTP is configured, but MAIL_FROM (${mailDomain}) is outside the APP_URL family (${appFamily}). Mail may look untrusted; check the sender domain.`,
          );
        }
      }
    }
  }
  return warnings;
}
