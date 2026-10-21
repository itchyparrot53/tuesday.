import { build } from 'esbuild';
import { cp, rm, readFile } from 'node:fs/promises';

const pkg = JSON.parse(await readFile('package.json', 'utf8'));
await rm('dist/server', { recursive: true, force: true });
await build({
  entryPoints: ['server/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'esm',
  outfile: 'dist/server/index.js',
  sourcemap: true,
  external: Object.keys(pkg.dependencies ?? {}),
});
await cp('server/db/migrations', 'dist/server/migrations', { recursive: true }).catch(() => {});
console.log('server built');
