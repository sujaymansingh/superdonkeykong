# Super Donkey Kong

A browser game built with [Kontra.js](https://github.com/straker/kontra) (v10.0.2). Kontra docs: https://straker.github.io/kontra/

## Layout

- `index.html` — entry point; holds the `<canvas id="game">` (448×512, portrait like the arcade) and loads scripts.
- `js/lib/kontra.min.js` — vendored Kontra build. Do not edit. It is the **global** build: it defines `window.kontra`, so use `const { Sprite, ... } = kontra;` rather than `import`.
- `js/game.js` — game code.
- `assets/` — images, sprite sheets, audio, tile maps.
  - `assets/mario.png` — generated; do not hand-edit. 9 frames of 48×48, all facing right, body centred, feet on the bottom row: 0 idle, 1–2 walk, 3–4 climb, 5 hammer up, 6 hammer down, 7 jump (rising), 8 fall. Draw with `anchor: {x: 0.5, y: 1}` and flip with negative `scaleX`.
- `tools/build_mario_sheet.py` — cuts `assets/mario.png` from the SMW sprite rip (not in the repo; kept in `~/Downloads/smw_mario_sheet.png`). Frame list is the `FRAMES` table at the top. Run: `python3 -I tools/build_mario_sheet.py ~/Downloads/smw_mario_sheet.png assets/mario.png [preview.png]`.

## Game

Donkey Kong clone; the rules are in `kong`. Controls: ←/→ walk, Space jump, ↑/↓ climb (at a ladder), Enter restart.
Level layout (`PLATFORMS`, `LADDERS`, `HAMMER_SPOTS`, `GORILLA`) and tuning constants are at the top of `js/game.js`. Keep ladders away from platform gaps, or barrels drop onto the top of them.

## Running

No build step, no dependencies. Serve the directory over HTTP (asset loading fails under `file://`):

```sh
python3 -m http.server
```

Then open http://localhost:8000.

## Conventions

- Plain JavaScript loaded via `<script>` tags. When adding new JS files, add a matching `<script>` tag in `index.html` after `kontra.min.js` and before any file that depends on them.
- Pixel-art style: the canvas uses `image-rendering: pixelated`; keep sprite sizes in multiples of 8/16 px.
- To upgrade Kontra, re-download from `https://unpkg.com/kontra@<version>/kontra.min.js` into `js/lib/` and update the version noted above.
