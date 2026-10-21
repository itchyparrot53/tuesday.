#!/usr/bin/env node
// Design lint for the redesign. Usage: node scripts/check-design.mjs [files...]  (no args = all of web/src)
// A line may opt out with a trailing comment `// design-ok: <reason>`; every opt-out is listed in the output.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const walk = (d) => readdirSync(d).flatMap((n) => {
  const p = join(d, n);
  return statSync(p).isDirectory() ? walk(p) : /\.(tsx|ts)$/.test(n) ? [p] : [];
});
const args = process.argv.slice(2);
const files = (args.length ? args.flatMap((a) => (statSync(a).isDirectory() ? walk(a) : [a])) : walk('web/src')).map((f) => f.replace(/\\/g, '/'));
const isUi = (f) => f.includes('web/src/components/ui/');
const NEEDS_HEADER = /web\/src\/pages\/(Workspace|MyWork|Inbox|Trash|Profile|Admin|Dashboard|Doc)Page\.tsx$/;
const NEEDS_DRAWER = /web\/src\/(board\/(ItemPanel|AutomationsPanel|FormBuilder)|ai\/AssistantPanel)\.tsx$/;
const RULES = [
  { id: 'font-size', re: /\btext-\[\d+(\.\d+)?px\]/, ui: false, msg: 'arbitrary font size: use .t-display/.t-title/.t-section/.t-label/.t-meta or inherit the base size' },
  { id: 'shadow', re: /\bshadow(?:-(?:sm|md|lg|xl|2xl|inner)|-\[[^\]]*\])?(?![-\w])/, ui: true, msg: 'only shadow-pop / shadow-drawer (floating layers) are allowed' },
  { id: 'radius', re: /\brounded(?:-(?:sm|md|lg|xl|2xl|3xl))?(?![-\w])/, ui: true, msg: 'use rounded-sheet/-dialog/-pop/-control/-chip or rounded-full' },
  { id: 'uppercase', re: /\buppercase\b/, ui: true, msg: 'no all-caps text' },
  { id: 'overlay', re: /\bfixed inset-0\b/, ui: false, msg: 'custom overlay: use Dialog or Drawer from components/ui' },
];
const findings = [];
const optOuts = [];
for (const f of files) {
  const text = readFileSync(f, 'utf8');
  text.split('\n').forEach((line, i) => {
    for (const r of RULES) {
      if (!r.ui && isUi(f)) continue;
      if (!r.re.test(line)) continue;
      const ok = line.match(/design-ok:\s*(.+)$/);
      if (ok) optOuts.push(`${f}:${i + 1} [${r.id}] ${ok[1].trim()}`);
      else findings.push(`${f}:${i + 1} [${r.id}] ${r.msg}`);
    }
  });
  if (NEEDS_HEADER.test(f) && !text.includes('PageHeader')) findings.push(`${f} [page-header] page must render PageHeader`);
  if (NEEDS_DRAWER.test(f) && !text.includes('Drawer')) findings.push(`${f} [drawer] panel must use Drawer from components/ui/Dialog`);
}
// UX-015 guard: native <select> elements are allowed only at the recorded counts.
// Migrating one to the shared Select must update the allowlist downward.
const allowlist = JSON.parse(readFileSync('scripts/select-allowlist.json', 'utf8'));
const selectCounts = {};
for (const f of walk('web/src').filter((file) => file.endsWith('.tsx'))) {
  const count = (readFileSync(f, 'utf8').match(/<select\b/g) ?? []).length;
  if (count > 0) selectCounts[f.replace(/\\/g, '/')] = count;
}
let selectTotal = 0;
for (const [file, count] of Object.entries(selectCounts)) {
  selectTotal += count;
  const allowed = allowlist.files[file];
  if (allowed === undefined) {
    findings.push(`${file} [native-select] new native <select>; use components/ui/Select or extend the allowlist deliberately`);
  } else if (count > allowed) {
    findings.push(`${file} [native-select] ${count} native <select> (allowlist ${allowed}); migrate new ones to components/ui/Select`);
  } else if (count < allowed) {
    findings.push(`${file} [native-select] allowlist is stale (${allowed} -> ${count}); shrink scripts/select-allowlist.json`);
  }
}
for (const file of Object.keys(allowlist.files)) {
  if (!(file in selectCounts)) {
    findings.push(`${file} [native-select] allowlist is stale (${allowlist.files[file]} -> 0); remove it`);
  }
}
if (selectTotal > allowlist.total) {
  findings.push(`[native-select] ${selectTotal} native <select> (allowlist ${allowlist.total}); migrate new ones`);
} else if (selectTotal < allowlist.total) {
  findings.push(`[native-select] allowlist is stale (${allowlist.total} -> ${selectTotal}); shrink scripts/select-allowlist.json`);
}

for (const o of optOuts) console.log(`OPT-OUT ${o}`);
for (const x of findings) console.log(x);
console.log(`${findings.length} design finding(s), ${optOuts.length} opt-out(s) in ${files.length} file(s)`);
process.exit(findings.length ? 1 : 0);
