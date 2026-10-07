// Falling Sand Painter — simulation core + UI wiring.
(function () {
  'use strict';

  const W = 480, H = 320;
  const canvas = document.getElementById('sim');
  const ctx = canvas.getContext('2d');

  // ---------- Grid ----------
  class Grid {
    constructor(w, h) {
      this.w = w; this.h = h;
      this.cells = new Uint8Array(w * h);
      this.life = new Uint8Array(w * h);
      this.updated = new Uint8Array(w * h);
      this.shade = new Uint8Array(w * h); // per-cell color variance
      for (let i = 0; i < w * h; i++) this.shade[i] = Math.random() * 24 | 0;
    }
    idx(x, y) { return y * this.w + x; }
    inBounds(x, y) { return x >= 0 && x < this.w && y >= 0 && y < this.h; }
    get(x, y) { return this.inBounds(x, y) ? this.cells[this.idx(x, y)] : 3; /* treat OOB as stone */ }
    set(x, y, v) { if (this.inBounds(x, y)) this.cells[this.idx(x, y)] = v; }
    getLife(x, y) { return this.life[this.idx(x, y)]; }
    setLife(x, y, v) { if (this.inBounds(x, y)) this.life[this.idx(x, y)] = v; }
    clear() { this.cells.fill(0); this.life.fill(0); }
  }

  const grid = new Grid(W, H);

  // ---------- Rendering ----------
  const img = ctx.createImageData(W, H);

  function colorFor(id, shade) {
    const el = BY_ID.get(id);
    if (!el) return [0, 0, 0];
    let l = 55;
    if (el.kind === 'powder') l = 52 + (shade % 14);
    else if (el.kind === 'liquid') l = 48 + (shade % 10);
    else if (el.kind === 'static') l = 45 + (shade % 8);
    else l = 50 + (shade % 25);
    // fire/smoke fade with life
    if (el.kind === 'energy' || el.kind === 'gas') {
      const lifeFrac = grid.getLife(0, 0); // not used directly; see below
    }
    return hslToRgb(el.hue, el.sat, l);
  }

  function hslToRgb(h, s, l) {
    s /= 100; l /= 100;
    const k = n => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return [f(0) * 255 | 0, f(8) * 255 | 0, f(4) * 255 | 0];
  }

  const colorCache = new Map(); // id -> [r,g,b][variant]
  function cellColor(id, i) {
    const el = BY_ID.get(id);
    const variant = grid.shade[i];
    let cache = colorCache.get(id);
    if (!cache) { cache = []; colorCache.set(id, cache); }
    if (!cache[variant]) {
      let l = 50;
      if (el.kind === 'powder') l = 52 + (variant % 14);
      else if (el.kind === 'liquid') l = 48 + (variant % 10);
      else if (el.kind === 'static') l = 45 + (variant % 8);
      else l = 50 + (variant % 25);
      // fade fire & smoke by remaining life
      if (el.kind === 'energy' || el.kind === 'gas') {
        const lf = grid.life[i] / el.life;
        l = 30 + 40 * lf + (variant % 12);
        cache[variant] = hslToRgb(el.hue, el.sat, Math.min(90, l));
      } else {
        cache[variant] = hslToRgb(el.hue, el.sat, l);
      }
    }
    // fire/smoke need live fade — recompute cheaply each frame for them
    if (el.kind === 'energy' || el.kind === 'gas') {
      const lf = Math.min(1, grid.life[i] / el.life);
      return hslToRgb(el.hue, el.sat, Math.min(90, 30 + 40 * lf + (variant % 12)));
    }
    return cache[variant];
  }

  function render() {
    const d = img.data;
    for (let i = 0; i < W * H; i++) {
      const id = grid.cells[i];
      const p = i * 4;
      if (id === 0) { d[p] = 8; d[p + 1] = 9; d[p + 2] = 12; d[p + 3] = 255; continue; }
      const [r, g, b] = cellColor(id, i);
      d[p] = r; d[p + 1] = g; d[p + 2] = b; d[p + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }

  // ---------- Simulation step ----------
  const slow = new Set([KEY_TO_ID.get('lava')]); // liquids that move every other frame

  function step() {
    grid.updated.fill(0);
    // bottom-up so falling cells don't double-move
    for (let y = H - 1; y >= 0; y--) {
      const leftFirst = frame % 2 === 0;
      for (let xi = 0; xi < W; xi++) {
        const x = leftFirst ? xi : W - 1 - xi;
        const i = grid.idx(x, y);
        const id = grid.cells[i];
        if (id === 0 || grid.updated[i]) continue;
        const el = BY_ID.get(id);
        if (!el || !el.update) continue;
        if (slow.has(id) && (frame % 3 !== 0)) continue;
        const before = grid.cells[i];
        el.update(x, y, grid);
        // if it moved (swapped), mark the destination so it isn't re-processed this frame
        // (update functions use swap which handles positions; mark source cell as done)
        grid.updated[grid.idx(x, y)] = 1;
        // find where id went and mark it too
        if (grid.cells[i] !== before) {
          // it moved INTO (x,y) from elsewhere or away — conservative marking is fine
        }
      }
    }
    // decay smoke even when not moving
    const smokeId = KEY_TO_ID.get('smoke');
    for (let i = 0; i < W * H; i++) {
      if (grid.cells[i] === smokeId && grid.life[i] > 0) {
        grid.life[i]--;
        if (grid.life[i] === 0) grid.cells[i] = 0;
      }
    }
  }

  // ---------- Input ----------
  let currentId = 1;
  let brushSize = 6;
  let paused = false;
  let mouseDown = false;
  let mouseX = -1, mouseY = -1;
  let frame = 0;

  function canvasPos(e) {
    const r = canvas.getBoundingClientRect();
    const cx = (e.touches ? e.touches[0].clientX : e.clientX) - r.left;
    const cy = (e.touches ? e.touches[0].clientY : e.clientY) - r.top;
    return [Math.floor(cx / r.width * W), Math.floor(cy / r.height * H)];
  }

  function paint(cx, cy) {
    for (let dy = -brushSize; dy <= brushSize; dy++) {
      for (let dx = -brushSize; dx <= brushSize; dx++) {
        if (dx * dx + dy * dy > brushSize * brushSize) continue;
        const x = cx + dx, y = cy + dy;
        if (!grid.inBounds(x, y)) continue;
        // sparse painting for powders/liquids feels more natural
        const el = BY_ID.get(currentId);
        const sparse = el.kind === 'powder' || el.kind === 'liquid' || el.kind === 'gas' || el.kind === 'energy';
        if (sparse && Math.random() > 0.5) continue;
        grid.set(x, y, currentId);
        if (el.life) grid.setLife(x, y, el.life);
      }
    }
  }

  canvas.addEventListener('pointerdown', e => { mouseDown = true; [mouseX, mouseY] = canvasPos(e); paint(mouseX, mouseY); });
  window.addEventListener('pointerup', () => { mouseDown = false; });
  canvas.addEventListener('pointermove', e => {
    [mouseX, mouseY] = canvasPos(e);
    if (mouseDown) paint(mouseX, mouseY);
    const id = grid.get(mouseX, mouseY);
    document.getElementById('hoverInfo').textContent =
      `(${mouseX}, ${mouseY}) — ${id === 0 ? 'empty' : BY_ID.get(id).label}`;
  });

  // ---------- UI ----------
  const palette = document.getElementById('palette');
  ELEMENTS.forEach((el, n) => {
    const btn = document.createElement('button');
    btn.className = 'el-btn' + (el.id === currentId ? ' active' : '');
    btn.style.background = `hsl(${el.hue}, ${el.sat}%, 45%)`;
    btn.textContent = `${el.emoji} ${el.label}`;
    btn.title = n < 10 ? `Key ${n === 9 ? 0 : n + 1}` : '';
    btn.addEventListener('click', () => selectElement(el.id));
    btn.dataset.id = el.id;
    palette.appendChild(btn);
  });

  function selectElement(id) {
    currentId = id;
    document.querySelectorAll('.el-btn').forEach(b =>
      b.classList.toggle('active', +b.dataset.id === id));
  }

  const brushInput = document.getElementById('brushSize');
  brushInput.addEventListener('input', () => {
    brushSize = +brushInput.value;
    document.getElementById('brushVal').textContent = brushSize;
  });
  const speedInput = document.getElementById('speed');
  speedInput.addEventListener('input', () => {
    document.getElementById('speedVal').textContent = speedInput.value;
  });

  document.getElementById('pauseBtn').addEventListener('click', function () {
    paused = !paused;
    this.textContent = paused ? '▶ Play' : '⏸ Pause';
  });
  document.getElementById('clearBtn').addEventListener('click', () => grid.clear());
  document.getElementById('saveBtn').addEventListener('click', () => {
    const a = document.createElement('a');
    a.download = 'falling-sand-painter.png';
    a.href = canvas.toDataURL('image/png');
    a.click();
  });

  window.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT') return;
    if (e.key === '[') { brushInput.value = Math.max(1, brushSize - 2); brushInput.dispatchEvent(new Event('input')); }
    if (e.key === ']') { brushInput.value = Math.min(30, brushSize + 2); brushInput.dispatchEvent(new Event('input')); }
    if (e.key === ' ') { e.preventDefault(); document.getElementById('pauseBtn').click(); }
    if (e.key.toLowerCase() === 'c') grid.clear();
    if (/^[0-9]$/.test(e.key)) {
      const n = e.key === '0' ? 10 : +e.key;
      if (n >= 1 && n <= ELEMENTS.length) selectElement(ELEMENTS[n - 1].id);
    }
  });

  // ---------- Main loop ----------
  let acc = 0, last = performance.now();
  function loop(now) {
    const dt = now - last; last = now;
    if (!paused) {
      acc += dt;
      const interval = 40 / +speedInput.value; // speed 1-4
      let steps = 0;
      while (acc >= interval && steps < 4) { acc -= interval; step(); steps++; frame++; }
    } else {
      frame++;
    }
    if (mouseDown && mouseX >= 0) paint(mouseX, mouseY);
    render();
    // rAF is throttled/paused in hidden tabs — setTimeout keeps the sim alive everywhere
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      setTimeout(() => loop(performance.now()), 16);
    } else {
      requestAnimationFrame(loop);
    }
  }

  // Starter scene: a little demo so the first paint isn't empty
  function seed() {
    for (let x = W / 2 - 60; x < W / 2 + 60; x++) {
      grid.set(x, H - 1, KEY_TO_ID.get('stone'));
      grid.set(x, H - 2, KEY_TO_ID.get('stone'));
    }
    for (let i = 0; i < 400; i++) {
      const x = W / 2 - 50 + Math.random() * 100 | 0;
      grid.set(x, Math.random() * 40 | 0, KEY_TO_ID.get('sand'));
    }
    for (let i = 0; i < 200; i++) {
      grid.set(W / 2 - 70 + Math.random() * 20 | 0, H - 4, 0);
    }
    // a wood cabin + plant corner
    for (let x = 60; x < 110; x++) grid.set(x, H - 3, KEY_TO_ID.get('wood'));
    for (let y = H - 20; y < H - 3; y++) { grid.set(60, y, KEY_TO_ID.get('wood')); grid.set(109, y, KEY_TO_ID.get('wood')); }
    for (let y = H - 25; y < H - 20; y++) for (let x = 60 + (y - (H - 25)); x < 110 - (y - (H - 25)); x++) grid.set(x, y, KEY_TO_ID.get('wood'));
    for (let i = 0; i < 150; i++) grid.set(150 + Math.random() * 60 | 0, 20 + Math.random() * 30 | 0, KEY_TO_ID.get('water'));
  }
  seed();
  // start with setTimeout so the loop also runs in hidden/throttled tabs (rAF never fires there)
  setTimeout(() => loop(performance.now()), 16);
})();
