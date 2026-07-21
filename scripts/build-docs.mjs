#!/usr/bin/env node
/**
 * Builds the Fumadocs (Astro) docs site and refreshes the vendored output.
 *
 *   docs-site/            <- in-house Astro + Fumadocs source (docs-only, copper theme)
 *   docs-site/dist/       <- `astro build` output: docs/, _astro/, api/
 *   landing/fumadocs/     <- vendored output consumed by scripts/assemble-site.mjs
 *
 * Run via `npm run build:docs`. It runs the Astro build in docs-site/ (installing
 * its deps if node_modules is missing) then copies dist/{docs,_astro,api} over
 * landing/fumadocs/{docs,_astro,api}. The docs-only build never emits a marketing
 * index.html, so the demo repo keeps ownership of `/`.
 */
import { cpSync, rmSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOCS_SITE = path.join(ROOT, 'docs-site');
const DIST = path.join(DOCS_SITE, 'dist');
const VENDORED = path.join(ROOT, 'landing/fumadocs');

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const run = (args) =>
  execFileSync(npm, args, { cwd: DOCS_SITE, stdio: 'inherit' });

if (!existsSync(path.join(DOCS_SITE, 'node_modules'))) {
  console.log('docs-site/node_modules missing — running npm install');
  run(['install']);
}

console.log('building docs-site (astro build)…');
run(['run', 'build']);

for (const dir of ['docs', '_astro', 'api']) {
  const src = path.join(DIST, dir);
  if (!existsSync(src)) {
    console.error(`build produced no dist/${dir} — aborting`);
    process.exit(1);
  }
  const dest = path.join(VENDORED, dir);
  rmSync(dest, { recursive: true, force: true });
  cpSync(src, dest, { recursive: true });
}

console.log('landing/fumadocs refreshed: docs/ + _astro/ + api/');
