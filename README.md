# ⚡ Falling Sand Painter

A cellular-automaton falling-sand physics toy that runs entirely in the browser — no build step, no dependencies, no backend.

## Concept

Paint elements onto a 480×320 cell grid and watch them obey simple per-cell rules every frame:

- **Sand / Stone / Wood / Wall** — powders and static solids
- **Water / Oil / Lava / Acid** — liquids that flow, with density (oil floats on water, lava flows slowly)
- **Fire / Smoke** — short-lived elements that rise and fade
- **Reactions**: fire ignites wood & oil, water extinguishes fire, lava + water → stone + smoke, acid dissolves stone/wood, plants grow when watered

## Run

Open `index.html` in any browser (or `python3 -m http.server` and visit http://localhost:8000).

Optional: `node test.js` runs headless physics checks (sand falls, oil floats, fire ignites wood, lava+water→stone, smoke decays).

## Controls

- Draw with mouse/touch; pick an element from the palette (hotkeys `1`–`9`, `0` for Smoke)
- `[` / `]` — brush size · `Space` — pause · `C` — clear
- Sliders for brush size and simulation speed; 💾 exports the canvas as PNG

## Tech

Plain JavaScript + Canvas `ImageData` rendering (one `putImageData` per frame), typed-array grid, bottom-up update pass with alternating scan direction to avoid directional bias.
