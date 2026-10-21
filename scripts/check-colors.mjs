import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const roots = ['web/src'];
const allowed = (file) => file.endsWith('styles.css') || file.endsWith('lib/labelColors.ts');
const patterns = [
  /#[0-9a-fA-F]{3,8}\b/g,
  /\brgb\(/g,
  /\bhsl\(/g,
  /\b(bg|text|border|ring|fill|stroke)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/g,
  /-\[#/g,
];

function walk(dir) {
  const files = [];
  for (const name of readdirSync(dir)) {
    const file = path.join(dir, name);
    if (statSync(file).isDirectory()) files.push(...walk(file));
    else if (/\.(tsx?|css)$/.test(name)) files.push(file);
  }
  return files;
}

let violations = 0;
for (const root of roots) {
  for (const file of walk(root)) {
    if (allowed(file)) continue;
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, index) => {
      for (const pattern of patterns) {
        pattern.lastIndex = 0;
        if (pattern.test(line)) {
          console.log(`${file}:${index + 1}: ${line.trim()}`);
          violations++;
        }
      }
    });
  }
}
if (violations) {
  console.error(`\n${violations} hard-coded colour violation(s). Use tokens or labelStyle().`);
  process.exit(1);
}
console.log('No hard-coded colours found.');
