#!/usr/bin/env node
/**
 * Local preview for the assembled site/ directory, mimicking vercel.json:
 * static files first, and any missing /app/* path falls back to the SPA's
 * /app/index.html (so deep links like /app/send survive a refresh).
 *
 *   npm run build:site
 *   npm run preview:site   ->  http://localhost:8787
 */
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'site');
const PORT = Number(process.env.PORT || 8787);

if (!existsSync(ROOT)) {
  console.error('site/ not found — run `npm run build:site` first.');
  process.exit(1);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
  '.json': 'application/json',
};

createServer((req, res) => {
  let p = decodeURIComponent((req.url ?? '/').split('?')[0]);
  let file = path.normalize(path.join(ROOT, p));
  if (!file.startsWith(ROOT)) {
    res.writeHead(403);
    return res.end();
  }
  if (existsSync(file) && statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!existsSync(file)) {
    if (p.startsWith('/app')) file = path.join(ROOT, 'app', 'index.html');
    else {
      res.writeHead(404, { 'content-type': 'text/plain' });
      return res.end(`404 ${p}`);
    }
  }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
}).listen(PORT, () => {
  console.log(`site preview: http://localhost:${PORT}`);
  console.log('  /       landing');
  console.log('  /docs   documentation');
  console.log('  /app    dapp (deep links fall back to the SPA)');
});
