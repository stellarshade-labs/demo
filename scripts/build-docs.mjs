#!/usr/bin/env node
/**
 * Static docs generator: landing/docs-src/*.mdx  ->  landing/docs/<slug>/index.html
 *
 * Renders the protocol docs in the landing's own design language (graphite +
 * copper, JetBrains Mono, Archivo display) so /, /docs and /app read as one
 * product. MDX is close enough to markdown that we only need to strip imports
 * and translate <Callout> blocks; everything else is plain GFM via `marked`.
 *
 * Run: node scripts/build-docs.mjs   (also invoked by `npm run build:site`)
 */
import { marked } from 'marked';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'landing', 'docs-src');
const OUT = path.join(ROOT, 'landing', 'docs');

/* ——— nav structure from meta.json ("---Group---" separators) ——— */
const meta = JSON.parse(readFileSync(path.join(SRC, 'meta.json'), 'utf8'));
const groups = [];
for (const entry of meta.pages) {
  const m = entry.match(/^---(.+)---$/);
  if (m) groups.push({ label: m[1], slugs: [] });
  else groups.at(-1).slugs.push(entry);
}
const order = groups.flatMap((g) => g.slugs);

/* ——— markdown setup ——— */
const slugCounts = new Map();
function slugify(text) {
  const base = text
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
  const n = slugCounts.get(base) ?? 0;
  slugCounts.set(base, n + 1);
  return n === 0 ? base : `${base}-${n}`;
}
const esc = (s) =>
  s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

marked.use({
  gfm: true,
  renderer: {
    heading({ tokens, depth }) {
      const html = this.parser.parseInline(tokens);
      const id = slugify(html);
      if (depth === 1) return `<h1>${html}</h1>`;
      return `<h${depth} id="${id}"><a class="anchor" href="#${id}" aria-label="Link to section">${html}</a></h${depth}>`;
    },
    code({ text, lang }) {
      const label = (lang || '').trim();
      return `<div class="codeblock">${label ? `<span class="codelang">${esc(label)}</span>` : ''}<pre><code>${esc(text)}</code></pre></div>`;
    },
  },
});

/* ——— per-file pipeline ——— */
function parseFrontmatter(src) {
  const m = src.match(/^---\n([\s\S]*?)\n---\n/);
  const fm = {};
  if (m) {
    for (const line of m[1].split('\n')) {
      const kv = line.match(/^(\w+):\s*(.*)$/);
      if (kv) fm[kv[1]] = kv[2].replace(/^"(.*)"$/, '$1');
    }
  }
  return { fm, body: m ? src.slice(m[0].length) : src };
}

function mdxToMd(body) {
  return body
    .replace(/^\{\/\*[\s\S]*?\*\/\}\s*$/gm, '') // MDX comments
    .replace(/^import\s.*$/gm, '') // component imports
    .replace(
      /<Callout(?:\s+type="(\w+)")?(?:\s+title="([^"]*)")?\s*>/g,
      (_, type = 'info', title = '') => `\n<!--CO:${type}:${title}-->\n`,
    )
    .replace(/<\/Callout>/g, '\n<!--/CO-->\n');
}

function postHtml(html) {
  return html
    .replace(
      /<!--CO:(\w+):([^>]*?)-->/g,
      (_, type, title) =>
        `<aside class="callout ${type}">${title ? `<p class="co-t">${title}</p>` : ''}`,
    )
    .replace(/<!--\/CO-->/g, '</aside>')
    .replace(/<table>/g, '<div class="tablewrap"><table>')
    .replace(/<\/table>/g, '</table></div>');
}

/* ——— page shell ——— */
const MARK = `<svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><rect x="2.5" y="2.5" width="10" height="10" fill="var(--copper-500)"/><rect x="7.5" y="7.5" width="10" height="10" fill="none" stroke="var(--copper-500)" stroke-width="1.4" opacity="0.55"/></svg>`;

function sidebar(activeSlug) {
  return groups
    .map(
      (g) => `<div class="sb-group"><div class="sb-label">${g.label}</div>${g.slugs
        .map((s) => {
          const t = pages.get(s).title;
          const href = s === 'index' ? '/docs/' : `/docs/${s}/`;
          return `<a class="sb-link${s === activeSlug ? ' on' : ''}" href="${href}"${s === activeSlug ? ' aria-current="page"' : ''}>${t}</a>`;
        })
        .join('')}</div>`,
    )
    .join('');
}

function pageHtml(slug, { title, description, html }) {
  const i = order.indexOf(slug);
  const prev = i > 0 ? order[i - 1] : null;
  const next = i < order.length - 1 ? order[i + 1] : null;
  const pn = (s, dir) =>
    s
      ? `<a class="pn ${dir}" href="${s === 'index' ? '/docs/' : `/docs/${s}/`}"><span class="pn-k">${dir === 'prev' ? '← Previous' : 'Next →'}</span><span class="pn-t">${pages.get(s).title}</span></a>`
      : '<span></span>';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} — Shade docs</title>
<meta name="description" content="${esc(description || '')}">
<meta name="theme-color" content="#0b0c0e">
<link rel="icon" type="image/svg+xml" href='data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="%230b0c0e"/><g transform="translate(96 96) scale(16)"><rect x="2.5" y="2.5" width="10" height="10" fill="%23c8763c"/><rect x="7.5" y="7.5" width="10" height="10" fill="none" stroke="%23c8763c" stroke-width="1.4" opacity="0.55"/></g></svg>'>
<link rel="stylesheet" href="/docs/docs.css">
</head>
<body>
<header class="hdr">
  <a class="lockup" href="/">${MARK}<span class="word">Shade</span></a>
  <nav class="nav" aria-label="Main">
    <a class="lnk" href="/">Home</a>
    <a class="lnk on" href="/docs/" aria-current="true">Docs</a>
    <a class="lnk" href="https://github.com/stellarshade-labs/demo" target="_blank" rel="noopener">GitHub</a>
    <a class="btn" href="/app/">Launch app</a>
  </nav>
</header>
<div class="wrap">
  <nav class="sb" aria-label="Documentation">${sidebar(slug)}</nav>
  <main class="doc">
    <p class="crumb">Docs · ${groups.find((g) => g.slugs.includes(slug)).label}</p>
    <h1>${title}</h1>
    ${description ? `<p class="lead">${esc(description)}</p>` : ''}
    <article class="prose">${html}</article>
    <nav class="pnrow" aria-label="Pagination">${pn(prev, 'prev')}${pn(next, 'next')}</nav>
  </main>
</div>
<footer class="foot">Shade — stealth addresses on Stellar · testnet · cryptography pending external audit</footer>
</body>
</html>`;
}

/* ——— docs.css (emitted once) ——— */
const CSS = `/* Shade docs — generated by scripts/build-docs.mjs; edit there. */
@font-face{font-family:'Archivo';src:url('/fonts/archivo-expanded.woff2') format('woff2');font-weight:600 900;font-stretch:125%;font-display:swap}
@font-face{font-family:'Inter';src:url('/fonts/inter.woff2') format('woff2');font-weight:400 700;font-display:swap}
@font-face{font-family:'JetBrains Mono';src:url('/fonts/jetbrains-mono.woff2') format('woff2');font-weight:400 600;font-display:swap}
:root{--void:#08090b;--ink-950:#0b0c0e;--ink-900:#101216;--ink-850:#141619;--ink-700:#232830;
--ink-600:#333a45;--ink-400:#6b7480;--ink-300:#8d97a4;--ink-100:#d6dae0;--ink-50:#f0f2f5;
--copper-600:#a75c2b;--copper-500:#c8763c;--copper-400:#dd9057;--copper-300:#e8ab7c;--wait:#c9973f;
--display:'Archivo',ui-sans-serif,system-ui,sans-serif;--sans:'Inter',ui-sans-serif,system-ui,sans-serif;
--mono:'JetBrains Mono',ui-monospace,monospace}
*{margin:0;padding:0;box-sizing:border-box}
html{color-scheme:dark}
body{background:var(--ink-950);color:var(--ink-100);font-family:var(--sans);font-size:15px;line-height:1.7;-webkit-font-smoothing:antialiased}
::selection{background:var(--copper-500);color:#0b0c0e}
a{color:inherit;text-decoration:none}
:focus-visible{outline:2px solid var(--copper-400);outline-offset:2px;border-radius:2px}
.hdr{position:sticky;top:0;z-index:40;height:60px;display:flex;align-items:center;justify-content:space-between;
padding:0 clamp(16px,3vw,32px);background:rgba(11,12,14,.85);backdrop-filter:blur(10px);border-bottom:1px solid var(--ink-700)}
.lockup{display:flex;align-items:center;gap:10px}
.lockup .word{font-family:var(--display);font-stretch:125%;font-weight:700;font-size:14px;letter-spacing:.14em;text-transform:uppercase;color:var(--ink-50)}
.nav{display:flex;align-items:center;gap:clamp(12px,2vw,26px)}
.nav .lnk{font-family:var(--mono);font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-300);transition:color .2s}
.nav .lnk:hover{color:var(--ink-50)}.nav .lnk.on{color:var(--copper-400)}
.nav .btn{font-family:var(--mono);font-size:11.5px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;
background:var(--copper-500);color:#0b0c0e;padding:9px 15px;border-radius:4px;transition:background .2s}
.nav .btn:hover{background:var(--copper-400)}
.wrap{display:grid;grid-template-columns:230px minmax(0,1fr);gap:clamp(24px,4vw,64px);max-width:1120px;margin:0 auto;padding:0 clamp(16px,3vw,32px)}
.sb{position:sticky;top:60px;align-self:start;height:calc(100vh - 60px);overflow-y:auto;padding:34px 0 40px;border-right:1px solid var(--ink-700)}
.sb-group{margin-bottom:26px}
.sb-label{font-family:var(--mono);font-size:10px;font-weight:600;letter-spacing:.24em;text-transform:uppercase;color:var(--copper-400);margin-bottom:10px}
.sb-link{display:block;font-size:13.5px;color:var(--ink-300);padding:5px 12px 5px 0;position:relative;transition:color .15s}
.sb-link:hover{color:var(--ink-50)}
.sb-link.on{color:var(--ink-50)}
.sb-link.on::before{content:'';position:absolute;left:-16px;top:50%;transform:translateY(-50%);height:16px;width:2px;background:var(--copper-500)}
.doc{padding:40px 0 80px;max-width:760px}
.crumb{font-family:var(--mono);font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:var(--copper-400);margin-bottom:14px}
.doc h1{font-family:var(--display);font-stretch:125%;font-weight:800;font-size:clamp(26px,3.4vw,38px);line-height:1.06;letter-spacing:-.01em;text-transform:uppercase;color:var(--ink-50);margin-bottom:12px}
.lead{color:var(--ink-300);font-size:16px;margin-bottom:8px}
.prose{margin-top:26px}
.prose h2{font-family:var(--display);font-stretch:125%;font-weight:700;font-size:20px;letter-spacing:.02em;text-transform:uppercase;color:var(--ink-50);
margin:44px 0 14px;padding-top:22px;border-top:1px solid var(--ink-700)}
.prose h3{font-size:16px;font-weight:600;color:var(--ink-50);margin:28px 0 10px}
.prose h2 .anchor,.prose h3 .anchor{color:inherit;border-bottom:0}
.prose hr+h2{border-top:0;padding-top:0}
.prose h2 .anchor:hover::after,.prose h3 .anchor:hover::after{content:' ¶';color:var(--copper-500)}
.prose p{margin:0 0 14px;color:var(--ink-100)}
.prose li{margin:0 0 8px;color:var(--ink-100)}
.prose ul,.prose ol{padding-left:22px;margin:0 0 16px}
.prose a{color:var(--copper-300);border-bottom:1px solid rgba(200,118,60,.35);transition:border-color .15s}
.prose a:hover{border-color:var(--copper-400)}
.prose strong{color:var(--ink-50)}
.prose em{color:var(--ink-100)}
.prose code{font-family:var(--mono);font-size:.88em;background:var(--ink-900);border:1px solid var(--ink-700);border-radius:3px;padding:.1em .4em;color:var(--copper-300)}
.prose hr{border:0;border-top:1px solid var(--ink-700);margin:36px 0}
.codeblock{position:relative;margin:18px 0;border:1px solid var(--ink-700);border-radius:4px;background:var(--void);overflow:hidden}
.codeblock pre{padding:16px 18px;overflow-x:auto}
.codeblock code{font-family:var(--mono);font-size:13px;line-height:1.65;color:var(--ink-100);background:none;border:0;padding:0}
.codelang{position:absolute;top:8px;right:10px;font-family:var(--mono);font-size:9.5px;letter-spacing:.2em;text-transform:uppercase;color:var(--ink-400)}
.callout{border:1px solid var(--ink-700);border-left:2px solid var(--copper-500);background:rgba(200,118,60,.05);border-radius:0 4px 4px 0;padding:14px 18px;margin:18px 0}
.callout.warn{border-left-color:var(--wait);background:rgba(201,151,63,.05)}
.callout .co-t{font-family:var(--mono);font-size:11px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:var(--copper-400);margin-bottom:6px}
.callout.warn .co-t{color:var(--wait)}
.callout p:last-child{margin-bottom:0}
.tablewrap{overflow-x:auto;margin:18px 0;border:1px solid var(--ink-700);border-radius:4px}
.prose table{border-collapse:collapse;width:100%;font-size:13.5px}
.prose th{font-family:var(--mono);font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--ink-400);text-align:left;
background:var(--ink-900);padding:10px 14px;border-bottom:1px solid var(--ink-700)}
.prose td{padding:10px 14px;border-bottom:1px solid var(--ink-700);vertical-align:top}
.prose tr:last-child td{border-bottom:0}
.pnrow{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:56px}
.pn{border:1px solid var(--ink-700);border-radius:4px;padding:14px 18px;display:flex;flex-direction:column;gap:5px;transition:border-color .2s;background:var(--ink-900)}
.pn:hover{border-color:var(--copper-500)}
.pn.next{text-align:right}
.pn-k{font-family:var(--mono);font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:var(--ink-400)}
.pn-t{font-size:14px;font-weight:600;color:var(--ink-50)}
.foot{border-top:1px solid var(--ink-700);padding:26px clamp(16px,3vw,32px);font-family:var(--mono);font-size:11px;color:var(--ink-400);text-align:center}
@media(max-width:860px){
.wrap{grid-template-columns:1fr}
.sb{position:relative;top:0;height:auto;border-right:0;border-bottom:1px solid var(--ink-700);display:flex;gap:26px;overflow-x:auto;padding:16px 0}
.sb-group{margin:0;flex:none}
.sb-link{padding:4px 0;white-space:nowrap}
.sb-link.on::before{display:none}
.sb-link.on{color:var(--copper-300)}
}`;

/* ——— build ——— */
const pages = new Map();
for (const f of readdirSync(SRC).filter((f) => f.endsWith('.mdx'))) {
  const slug = f.replace(/\.mdx$/, '');
  const { fm, body } = parseFrontmatter(readFileSync(path.join(SRC, f), 'utf8'));
  pages.set(slug, { title: fm.title || slug, description: fm.description || '', body });
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
writeFileSync(path.join(OUT, 'docs.css'), CSS);

for (const [slug, page] of pages) {
  slugCounts.clear();
  const html = postHtml(marked.parse(mdxToMd(page.body)));
  const dir = slug === 'index' ? OUT : path.join(OUT, slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'index.html'), pageHtml(slug, { ...page, html }));
}
console.log(`docs: ${pages.size} pages -> ${path.relative(ROOT, OUT)}/`);
