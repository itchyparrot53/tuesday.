import { describe, expect, test } from 'vitest';
import { domainFamily, startupWarnings } from '../server/config';

const smtp = {
  host: 'smtp.example.com',
  port: 465,
  secure: true,
  fallbackPort: 587,
  user: 'u',
  pass: 'p',
};

function config(overrides: Partial<Parameters<typeof startupWarnings>[0]>) {
  const base: Parameters<typeof startupWarnings>[0] = {
    appUrl: 'https://app.example.com',
    cookieSecure: true,
    smtp: null,
    mailFrom: 'Tuesday <tuesday@example.com>',
  };
  return startupWarnings({ ...base, ...overrides });
}

describe('startup safety warnings', () => {
  test('warns about plain http on a public host', () => {
    expect(config({ appUrl: 'http://tuesday.example.com' })).toEqual([
      expect.stringContaining('APP_URL uses http on a non-local host'),
    ]);
  });

  test('does not warn about http on localhost', () => {
    expect(config({ appUrl: 'http://localhost:3000' })).toEqual([]);
  });

  test('warns when https is configured without secure cookies', () => {
    expect(config({ cookieSecure: false })).toEqual([
      expect.stringContaining('COOKIE_SECURE is not true'),
    ]);
  });

  test('warns when the mail sender is outside the app domain family', () => {
    expect(config({ smtp, mailFrom: 'Tuesday <hello@other.example>' })).toEqual([
      expect.stringContaining('outside the APP_URL family'),
    ]);
  });

  test('accepts a subdomain as the same family', () => {
    expect(config({ smtp, mailFrom: 'Tuesday <tuesday@mail.example.com>' })).toEqual([]);
  });

  test('reports an invalid APP_URL', () => {
    expect(config({ appUrl: 'not a url' })).toEqual([
      expect.stringContaining('APP_URL is not a valid URL'),
    ]);
  });

  test('families handle common two-level suffixes', () => {
    expect(domainFamily('app.example.com')).toBe('example.com');
    expect(domainFamily('mail.example.co.uk')).toBe('example.co.uk');
    expect(domainFamily('localhost')).toBe('localhost');
  });
});
