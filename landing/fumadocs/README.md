# Vendored docs build

Prebuilt Fumadocs output from `stellarshade-labs/website-dev`, re-themed from
slate to the copper/graphite palette (see `theme-copper.patch` — apply it to
website-dev's `src/styles/` and rebuild to regenerate).

To refresh: in website-dev run `npm install && npm run build`, then copy
`dist/docs`, `dist/_astro`, `dist/api`, `dist/brand` over the same names here.
`scripts/assemble-site.mjs` places them at the site root.
