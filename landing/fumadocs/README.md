# Vendored docs build

Prebuilt Fumadocs output, consumed by `scripts/assemble-site.mjs` which places
`docs/`, `_astro/`, and `api/` at the site root.

The source lives in-house at `docs-site/` (Astro + Fumadocs, copper/graphite
theme, Shade square lockup in the nav). To refresh after editing content or
styles there, run `npm run build:docs` from the repo root — it builds
`docs-site/` (installing its deps on first run) and copies the output here.

`theme-copper.patch` is the historical recolor diff from the original
`stellarshade-labs/website-dev` vendoring, kept for reference.
