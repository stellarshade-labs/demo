# Shade landing — THE UNLINKING

Cinematic scroll-film landing page for Shade. One continuous shot: a payment's
trail is drawn, severed, scanned, detected by the view key, and gone.

Fully self-contained — GSAP/Lenis and fonts are vendored, no external requests.

```bash
cd landing
python3 -m http.server 8734
# open http://127.0.0.1:8734
```

Dev contract: `?jump=<scrollY>` lands pre-scrolled for screenshots; `window.__ready`
fires when settled. Respects `prefers-reduced-motion`.
