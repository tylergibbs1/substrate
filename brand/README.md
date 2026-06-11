# Substrate brand assets

The Substrate mark: a circular **aperture** ring (image generation) split by a
double-pointed **compass needle** (precision / direction), the negative space
reading as an **“S”**. White on near-black (`#0a0a0a`) — the xAI-inspired system
from `DESIGN.md`. Geometric and reproducible (see `gen-logo.mjs`).

## Files

| File | Use |
|------|-----|
| `substrate-mark.svg` | Bare mark, **white** on transparent — the primary symbol |
| `substrate-mark-black.svg` | Bare mark, **black** on transparent — for light surfaces |
| `substrate-icon.svg` | Mark on a rounded near-black tile — **app / favicon** source |
| `substrate-wordmark.svg` | Mark + “substrate” lockup (Inter Medium, the UI font) |
| `substrate-icon-512.png` | 512px app icon (PNG) |
| `apple-touch-icon.png` | 180px iOS/web home-screen icon |
| `favicon-32.png`, `favicon-16.png` | Raster favicons |
| `favicon.svg` | Vector favicon (copy of `substrate-icon.svg`) |
| `substrate-logo-1.png`, `-2.png` | The original GPT Image 2 explorations (raster, 1024px) |

`gen-logo.mjs` regenerates every SVG from one set of parameters — tweak `R`/`r`
(ring), `gap` (crescent gaps), `halfW`/`reach` (needle) and re-run `node gen-logo.mjs`,
then re-rasterize with `rsvg-convert`.

## Wired into the app

`favicon.svg`, `favicon-32.png`, and `apple-touch-icon.png` are copied to
`apps/web/public/` and linked from `apps/web/index.html` (plus a `#0a0a0a`
`theme-color`).

## Clear space & color

- Keep clear space ≥ the needle’s half-length around the mark.
- Mark color is pure white `#ffffff` or pure tile `#0a0a0a`; avoid recoloring.
- The accent (`#ff7a17`) is **not** part of the mark — keep the logo monochrome.
