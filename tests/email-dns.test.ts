import { describe, expect, test } from 'vitest';
import { checkEmailDns, type DnsResolver } from '../server/services/email-dns';

function resolver(
  records: Record<string, string[][]>,
  mx: { exchange: string; priority: number }[] = [],
): DnsResolver {
  return {
    async resolveTxt(name) {
      if (!records[name]) throw new Error('ENOTFOUND');
      return records[name];
    },
    async resolveMx() {
      if (!mx.length) throw new Error('ENOTFOUND');
      return mx;
    },
  };
}

describe('email domain check', () => {
  test('reports SPF, DMARC, MX and the external DKIM check', async () => {
    const report = await checkEmailDns(
      'example.com',
      resolver(
        {
          'example.com': [['v=spf1 include:purelymail.com ~all']],
          '_dmarc.example.com': [['v=DMARC1; p=quarantine; rua=mailto:dmarc@example.com']],
        },
        [{ exchange: 'mail.purelymail.com', priority: 10 }],
      ),
    );
    expect(report.domain).toBe('example.com');
    expect(report.spf).toMatchObject({ status: 'found', purelymail: true });
    expect(report.dmarc).toMatchObject({ status: 'found', policy: 'quarantine' });
    expect(report.mx.status).toBe('found');
    expect(report.mx.value).toContain('mail.purelymail.com');
    expect(report.dkim.status).toBe('external');
  });

  test('never throws on DNS failures', async () => {
    const report = await checkEmailDns('example.com', resolver({}));
    expect(report.spf.status).toBe('missing');
    expect(report.dmarc.status).toBe('missing');
    expect(report.mx.status).toBe('missing');
    expect(report.spf.error).toBeTruthy();
    expect(report.spf.fix).toContain('v=spf1');
  });

  test('warns when SPF does not mention Purelymail', async () => {
    const report = await checkEmailDns(
      'example.com',
      resolver({ 'example.com': [['v=spf1 include:other.example ~all']] }),
    );
    expect(report.spf.status).toBe('found');
    expect(report.spf.purelymail).toBe(false);
    expect(report.spf.fix).toContain('Purelymail');
  });

  test('returns an actionable report when MAIL_FROM has no domain', async () => {
    const report = await checkEmailDns(null);
    expect(report.domain).toBeNull();
    expect(report.error).toContain('MAIL_FROM');
    expect(report.dkim.status).toBe('external');
  });
});
