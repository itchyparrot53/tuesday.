import { promises as dns } from 'node:dns';
import type { EmailDnsReport, EmailDnsRow } from '../../shared/types';

export interface DnsResolver {
  resolveTxt(name: string): Promise<string[][]>;
  resolveMx(name: string): Promise<{ exchange: string; priority: number }[]>;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : 'DNS lookup failed';
}

async function txt(
  resolver: DnsResolver,
  name: string,
): Promise<{ records: string[]; error?: string }> {
  try {
    const rows = await resolver.resolveTxt(name);
    return { records: rows.map((chunks) => chunks.join('')) };
  } catch (error) {
    return { records: [], error: message(error) };
  }
}

export async function checkEmailDns(
  domain: string | null,
  resolver: DnsResolver = dns,
): Promise<EmailDnsReport> {
  if (!domain) {
    return {
      domain: null,
      error: 'MAIL_FROM does not contain an email address. Set MAIL_FROM in .env.',
      spf: {
        status: 'missing',
        value: null,
        fix: 'Set MAIL_FROM to an address at your sending domain.',
        purelymail: false,
      },
      dmarc: { status: 'missing', value: null, policy: null, fix: 'Set MAIL_FROM first.' },
      mx: { status: 'missing', value: null, fix: 'Set MAIL_FROM first.' },
      dkim: {
        status: 'external',
        value: null,
        fix: 'Set MAIL_FROM first, then publish the DKIM selector from Purelymail.',
      },
    };
  }

  const [spfTxt, dmarcTxt] = await Promise.all([
    txt(resolver, domain),
    txt(resolver, `_dmarc.${domain}`),
  ]);
  let mx: { exchange: string; priority: number }[] = [];
  let mxError: string | undefined;
  try {
    mx = (await resolver.resolveMx(domain)).sort((a, b) => a.priority - b.priority);
  } catch (error) {
    mxError = message(error);
  }

  const spfRecord = spfTxt.records.find((record) => /^v=spf1\b/i.test(record.trim()));
  const spf: EmailDnsReport['spf'] = {
    status: spfRecord ? 'found' : 'missing',
    value: spfRecord ?? null,
    purelymail: Boolean(spfRecord && /purelymail/i.test(spfRecord)),
    fix: spfRecord
      ? spfRecord && /purelymail/i.test(spfRecord)
        ? 'SPF is present and mentions Purelymail.'
        : 'SPF is present but does not mention Purelymail. Add include:purelymail.com if Purelymail sends for this domain.'
      : 'Add a TXT record starting v=spf1 that includes Purelymail, for example: v=spf1 include:purelymail.com ~all.',
    ...(spfTxt.error ? { error: spfTxt.error } : {}),
  };

  const dmarcRecord = dmarcTxt.records.find((record) => /^v=DMARC1\b/i.test(record.trim()));
  const policy = dmarcRecord?.match(/\bp=([^;\s]+)/i)?.[1]?.toLowerCase() ?? null;
  const dmarc: EmailDnsReport['dmarc'] = {
    status: dmarcRecord ? 'found' : 'missing',
    value: dmarcRecord ?? null,
    policy,
    fix: dmarcRecord
      ? `DMARC is present with policy ${policy ?? 'unspecified'}.`
      : 'Add a TXT record at _dmarc.{domain} starting v=DMARC1, for example: v=DMARC1; p=quarantine; rua=mailto:dmarc@your-domain.',
    ...(dmarcTxt.error ? { error: dmarcTxt.error } : {}),
  };

  const mxRow: EmailDnsRow = {
    status: mx.length ? 'found' : 'missing',
    value: mx.length
      ? mx.map((record) => `${record.priority} ${record.exchange}`).join(', ')
      : null,
    fix: mx.length
      ? 'MX records are present.'
      : 'Add the MX record Purelymail gives you for this domain, or confirm this domain only sends mail and does not receive it.',
    ...(mxError ? { error: mxError } : {}),
  };

  return {
    domain,
    spf,
    dmarc,
    mx: mxRow,
    dkim: {
      status: 'external',
      value: null,
      fix: 'Publish the DKIM selector and key from your Purelymail dashboard. Tuesday cannot read DKIM keys.',
    },
  };
}
