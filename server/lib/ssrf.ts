import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { badRequest } from './errors';

function ipv6Groups(ip: string): number[] | null {
  const clean = ip.split('%')[0].toLowerCase();
  let value = clean;
  if (value.includes('.')) {
    const lastColon = value.lastIndexOf(':');
    const dotted = value.slice(lastColon + 1);
    const parts = dotted.split('.').map(Number);
    if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return null;
    value = `${value.slice(0, lastColon)}:${((parts[0] << 8) | parts[1]).toString(16)}:${((parts[2] << 8) | parts[3]).toString(16)}`;
  }
  const halves = value.split('::');
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - left.length - right.length;
  if (halves.length === 1 && missing !== 0) return null;
  if (missing < 0) return null;
  const groups = [...left, ...Array.from({ length: missing }, () => '0'), ...right].map((group) =>
    parseInt(group || '0', 16),
  );
  if (groups.length !== 8 || groups.some((group) => !Number.isInteger(group))) return null;
  return groups;
}

function privateIpv6(ip: string): boolean {
  const groups = ipv6Groups(ip);
  if (!groups) return true;
  if (groups.every((group) => group === 0)) return true;
  if (groups.slice(0, 7).every((group) => group === 0) && groups[7] === 1) return true;
  if ((groups[0] & 0xfe00) === 0xfe80) return true;
  if ((groups[0] & 0xfe00) === 0xfc00) return true;
  if ((groups[0] & 0xff00) === 0xff00) return true;
  const embedded = (high: number, low: number) =>
    privateIp(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`);
  if (groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff) {
    return embedded(groups[6], groups[7]);
  }
  // IPv4-compatible (::/96) and IPv4-translated (::ffff:0:0/96) addresses.
  if (groups.slice(0, 6).every((group) => group === 0)) return embedded(groups[6], groups[7]);
  if (groups.slice(0, 4).every((group) => group === 0) && groups[4] === 0xffff && groups[5] === 0) {
    return embedded(groups[6], groups[7]);
  }
  // NAT64 well-known prefix 64:ff9b::/96.
  if (groups[0] === 0x64 && groups[1] === 0xff9b && groups.slice(2, 6).every((g) => g === 0)) {
    return embedded(groups[6], groups[7]);
  }
  // 6to4 (2002::/16) embeds the IPv4 address in groups 1-2.
  if (groups[0] === 0x2002) return embedded(groups[1], groups[2]);
  // Teredo (2001::/32) encodes the address in a form we do not need to allow.
  if (groups[0] === 0x2001 && groups[1] === 0) return true;
  return false;
}

function privateIp(ip: string): boolean {
  if (ip.includes(':')) return privateIpv6(ip);
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4) return true;
  if (parts[0] === 10 || parts[0] === 127 || parts[0] === 0) return true;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  if (parts[0] === 192 && parts[1] === 168) return true;
  if (parts[0] === 169 && parts[1] === 254) return true;
  if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return true;
  if (parts[0] >= 224) return true;
  return false;
}

export async function resolvePublic(
  url: string,
  allowPrivate = false,
  lookupFn: (
    hostname: string,
    options: { all: true },
  ) => Promise<{ address: string; family: number }[]> = lookup as never,
): Promise<{ url: URL; address: string; family: 4 | 6 }> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw badRequest('Invalid URL');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw badRequest('URL must be http or https');
  if (parsed.username || parsed.password) throw badRequest('URL cannot contain credentials');
  const port = parsed.port ? Number(parsed.port) : parsed.protocol === 'https:' ? 443 : 80;
  if (port !== 80 && port !== 443 && port < 1024) throw badRequest('Port is not allowed');
  const host = parsed.hostname.replace(/^\[|\]$/g, '');
  if (isIP(host)) {
    const family = isIP(host) as 4 | 6;
    if (!allowPrivate && privateIp(host)) {
      throw badRequest('Private addresses are not allowed');
    }
    return { url: parsed, address: host, family };
  }
  let addresses: { address: string; family: number }[];
  try {
    addresses = await lookupFn(host, { all: true });
  } catch {
    throw badRequest('Could not resolve host');
  }
  if (!addresses.length) throw badRequest('Could not resolve host');
  if (!allowPrivate && addresses.some((entry) => privateIp(entry.address))) {
    throw badRequest('Private addresses are not allowed');
  }
  const chosen = addresses.find((entry) => entry.family === 4) ?? addresses[0];
  return {
    url: parsed,
    address: chosen.address,
    family: chosen.family === 6 ? 6 : 4,
  };
}

export async function assertPublicUrl(url: string, allowPrivate = false): Promise<void> {
  await resolvePublic(url, allowPrivate);
}
