import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { pwaManifest } from '../web/pwa-manifest';

function pngSize(path: string): { width: number; height: number } {
  const buffer = readFileSync(path);
  expect(buffer.slice(1, 4).toString()).toBe('PNG');
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

describe('PWA manifest', () => {
  test('has the required fields, shortcuts and share target', () => {
    expect(pwaManifest.name).toBe('Tuesday');
    expect(pwaManifest.display).toBe('standalone');
    expect(pwaManifest.theme_color).toBe('#C9356C');
    expect(pwaManifest.icons.some((icon) => icon.purpose === 'maskable')).toBe(true);
    expect(pwaManifest.shortcuts).toHaveLength(4);
    expect(pwaManifest.share_target).toMatchObject({ action: '/share', method: 'GET' });
    expect(pwaManifest.screenshots).toHaveLength(2);
  });

  test('every icon and screenshot exists with matching dimensions', () => {
    for (const icon of pwaManifest.icons) {
      const path = `web/public/${icon.src}`;
      expect(existsSync(path), path).toBe(true);
      const [width, height] = icon.sizes.split('x').map(Number);
      expect(pngSize(path)).toEqual({ width, height });
    }
    for (const shot of pwaManifest.screenshots) {
      const path = `web/public/${shot.src}`;
      expect(existsSync(path), path).toBe(true);
      const [width, height] = shot.sizes.split('x').map(Number);
      expect(pngSize(path)).toEqual({ width, height });
    }
    expect(existsSync('web/public/badge-96.png')).toBe(true);
    expect(pngSize('web/public/badge-96.png')).toEqual({ width: 96, height: 96 });
  });
});

describe('operations runbook', () => {
  test('every env var in .env.example is documented', () => {
    const env = readFileSync('.env.example', 'utf8');
    const docs = readFileSync('docs/OPERATIONS.md', 'utf8');
    const names = [...env.matchAll(/^([A-Z][A-Z0-9_]+)=/gm)].map((match) => match[1]);
    expect(names.length).toBeGreaterThan(20);
    for (const name of names) expect(docs, name).toContain(`\`${name}\``);
  });
});
