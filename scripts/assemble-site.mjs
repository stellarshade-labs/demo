#!/usr/bin/env node
/**
 * Assembles the deployable site from its three parts:
 *
 *   site/            <- landing (index.html + vendor/ + fonts/)
 *   site/docs/       <- generated docs (scripts/build-docs.mjs)
 *   site/app/        <- the dapp (vite build output in dist/, base '/app/')
 *
 * Run via `npm run build:site`. Deploy the `site/` directory (vercel.json
 * points Vercel at it and adds the /app SPA rewrite).
 */
import { cpSync, rmSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = path.join(ROOT, 'site');

for (const req of ['dist', 'landing/docs']) {
  if (!existsSync(path.join(ROOT, req))) {
    console.error(`missing ${req} — run \`npm run build:site\` (not this script directly)`);
    process.exit(1);
  }
}

rmSync(SITE, { recursive: true, force: true });
mkdirSync(SITE, { recursive: true });

cpSync(path.join(ROOT, 'landing/index.html'), path.join(SITE, 'index.html'));
cpSync(path.join(ROOT, 'landing/vendor'), path.join(SITE, 'vendor'), { recursive: true });
cpSync(path.join(ROOT, 'landing/fonts'), path.join(SITE, 'fonts'), { recursive: true });
cpSync(path.join(ROOT, 'landing/docs'), path.join(SITE, 'docs'), { recursive: true });
cpSync(path.join(ROOT, 'dist'), path.join(SITE, 'app'), { recursive: true });

console.log('site/ assembled: / (landing) + /docs + /app');
