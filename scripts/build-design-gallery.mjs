import { readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';

const dir = 'e2e/screenshots/design';
mkdirSync(dir, { recursive: true });
const files = existsSync(dir) ? readdirSync(dir).filter((file) => file.endsWith('.png')) : [];
const names = [...new Set(files.map((file) => file.replace(/-(light|dark)-(1440|375)\.png$/, '')))];
const cards = names
  .map((name) => {
    const shots = ['light', 'dark'].flatMap((theme) =>
      ['1440', '375'].map((width) => {
        const file = `${name}-${theme}-${width}.png`;
        return files.includes(file)
          ? `<figure><img src="${file}" alt="${name} ${theme} ${width}" loading="lazy"><figcaption>${name} · ${theme} · ${width}px</figcaption></figure>`
          : '';
      }),
    );
    return `<section><h2>${name}</h2><div class="grid">${shots.join('')}</div></section>`;
  })
  .join('\n');
writeFileSync(
  path.join(dir, 'index.html'),
  `<!doctype html><html><head><meta charset="utf-8"><title>Tuesday design gallery</title>
<style>
:root{color-scheme:light}body{margin:0;background:#f6f2f5;color:#2b2130;font:14px/1.45 system-ui,sans-serif;padding:32px}
h1{font-size:26px;margin:0 0 8px}h2{font-size:18px;margin:32px 0 12px}
p{color:#6e6272}.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px}
figure{margin:0;background:#fff;border:1px solid #ebe4ea;border-radius:12px;overflow:hidden}
img{display:block;width:100%;height:auto}figcaption{padding:8px 10px;color:#6e6272;font-size:12px}
</style></head><body><h1>Tuesday design gallery</h1><p>${names.length} screens · light/dark · 1440/375px</p>${cards}</body></html>`,
);
console.log(`Wrote ${path.join(dir, 'index.html')} for ${names.length} screens.`);
