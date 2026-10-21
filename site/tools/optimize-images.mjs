#!/usr/bin/env node
// Generate the responsive hero and WebP product screenshots.
// Usage: npm i --no-save sharp && node site/tools/optimize-images.mjs
import { mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const here = path.dirname(fileURLToPath(import.meta.url));
const site = path.resolve(here, "..");
const repo = path.resolve(site, "..");
const shotsSource = path.join(repo, "docs", "screenshots");
const shotsTarget = path.join(site, "assets", "shots");
const heroSource = path.join(site, "assets", "hero.webp");

await mkdir(shotsTarget, { recursive: true });

for (const width of [900, 1600]) {
  await sharp(heroSource)
    .resize({ width, withoutEnlargement: true })
    .webp({ quality: 82 })
    .toFile(path.join(site, "assets", `hero-${width}.webp`));
}

const names = (await readdir(shotsSource))
  .filter((name) => name.toLowerCase().endsWith(".png"))
  .sort();

for (const name of names) {
  const target = path.join(shotsTarget, name.replace(/\.png$/i, ".webp"));
  await sharp(path.join(shotsSource, name))
    .resize({ width: 1600, withoutEnlargement: true })
    .webp({ quality: 80 })
    .toFile(target);
}

console.log(`Wrote 2 hero sizes and ${names.length} screenshots.`);
