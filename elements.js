// Element definitions for the Falling Sand Painter.
// Each element: id, label, color base (HSL hue/sat), category, update behavior.
// Grid values are element ids; 0 = empty.

const EMPTY = 0;

// id order also defines the hotkey (1-9, 0).
const ELEMENTS = [
  {
    id: 1, key: 'sand', label: 'Sand', emoji: '🟡',
    hue: 45, sat: 70, kind: 'powder',
    update: (x, y, g) => powder(x, y, g),
  },
  {
    id: 2, key: 'water', label: 'Water', emoji: '🔵',
    hue: 205, sat: 85, kind: 'liquid',
    update: (x, y, g) => liquid(x, y, g),
  },
  {
    id: 3, key: 'stone', label: 'Stone', emoji: '⬜',
    hue: 220, sat: 5, kind: 'static',
    update: null,
  },
  {
    id: 4, key: 'plant', label: 'Plant', emoji: '🟢',
    hue: 110, sat: 60, kind: 'static',
    // Grows upward when touching water.
    update: (x, y, g) => plant(x, y, g),
  },
  {
    id: 5, key: 'fire', label: 'Fire', emoji: '🔥',
    hue: 25, sat: 100, kind: 'energy',
    life: 40,
    update: (x, y, g) => fire(x, y, g),
  },
  {
    id: 6, key: 'wood', label: 'Wood', emoji: '🟤',
    hue: 25, sat: 45, kind: 'static',
    flammable: true,
    update: null,
  },
  {
    id: 7, key: 'oil', label: 'Oil', emoji: '🟫',
    hue: 60, sat: 30, kind: 'liquid',
    flammable: true,
    update: (x, y, g) => liquid(x, y, g),
  },
  {
    id: 8, key: 'smoke', label: 'Smoke', emoji: '💨',
    hue: 0, sat: 0, kind: 'gas',
    life: 90,
    update: (x, y, g) => gas(x, y, g),
  },
  {
    id: 9, key: 'acid', label: 'Acid', emoji: '🧪',
    hue: 90, sat: 100, kind: 'liquid',
    update: (x, y, g) => acid(x, y, g),
  },
  {
    id: 10, key: 'lava', label: 'Lava', emoji: '🟠',
    hue: 15, sat: 100, kind: 'liquid',
    update: (x, y, g) => lava(x, y, g),
  },
  {
    id: 11, key: 'wall', label: 'Wall', emoji: '🧱',
    hue: 350, sat: 30, kind: 'static',
    update: null,
  },
];

const BY_ID = new Map(ELEMENTS.map(e => [e.id, e]));
const KEY_TO_ID = new Map([
  ['sand', 1], ['water', 2], ['stone', 3], ['plant', 4], ['fire', 5],
  ['wood', 6], ['oil', 7], ['smoke', 8], ['acid', 9], ['lava', 10], ['wall', 11],
]);

// ---------- shared movement helpers ----------
// Each returns true if the cell moved (so the sim stops updating it this frame).

function densityOf(id) {
  if (id === 0) return 0;
  const e = BY_ID.get(id);
  if (!e) return 0;
  if (e.kind === 'powder') return 5;
  if (id === 7) return 3;   // oil floats on water
  if (e.kind === 'liquid') return 4;
  if (e.kind === 'gas') return 1;
  return 9; // static
}

function canDisplace(mover, target) {
  if (target === 0) return true;
  const md = densityOf(mover), td = densityOf(target);
  return md > td && td > 0; // heavier sinks through lighter fluids
}

function swap(x1, y1, x2, y2, g) {
  if (!g.inBounds(x2, y2)) return;
  const t = g.get(x1, y1);
  g.set(x1, y1, g.get(x2, y2));
  g.set(x2, y2, t);
}

function powder(x, y, g) {
  const id = g.get(x, y);
  // down
  if (g.inBounds(x, y + 1) && canDisplace(id, g.get(x, y + 1))) {
    swap(x, y, x, y + 1, g); return true;
  }
  // diagonal down
  const dirs = Math.random() < 0.5 ? [-1, 1] : [1, -1];
  for (const d of dirs) {
    if (g.inBounds(x + d, y + 1) && canDisplace(id, g.get(x + d, y + 1))
        && g.get(x + d, y) !== 0 ? true : false) {
      if (canDisplace(id, g.get(x + d, y + 1))) { swap(x, y, x + d, y + 1, g); return true; }
    }
  }
  return false;
}

function liquid(x, y, g) {
  if (powder(x, y, g)) return true;
  const id = g.get(x, y);
  // buoyancy: heavier liquid sitting above rises-swap (light liquid floats up)
  if (g.inBounds(x, y - 1) && g.get(x, y - 1) !== 0 && densityOf(g.get(x, y - 1)) > densityOf(id)) {
    swap(x, y, x, y - 1, g); return true;
  }
  const dirs = Math.random() < 0.5 ? [-1, 1] : [1, -1];
  for (const d of dirs) {
    if (g.inBounds(x + d, y) && canDisplace(id, g.get(x + d, y))) {
      swap(x, y, x + d, y, g); return true;
    }
  }
  return false;
}

function gas(x, y, g) {
  const id = g.get(x, y);
  // rises, wobbles; decays with life
  const dx = (Math.random() * 3 | 0) - 1;
  const up = g.inBounds(x + dx, y - 1) && canDisplace(id, g.get(x + dx, y - 1));
  if (up) { swap(x, y, x + dx, y - 1, g); return true; }
  const side = g.inBounds(x + dx, y) && canDisplace(id, g.get(x + dx, y));
  if (side) { swap(x, y, x + dx, y, g); return true; }
  return false;
}

// ---------- reactions ----------

function neighbors4(x, y, g) {
  return [g.get(x, y - 1), g.get(x + 1, y), g.get(x, y + 1), g.get(x - 1, y)];
}

function fire(x, y, g) {
  const id = g.get(x, y);
  // ignite / consume flammables around
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const n = g.get(x + dx, y + dy);
      if (n === 0) continue;
      const el = BY_ID.get(n);
      if (el && el.flammable && Math.random() < 0.06) {
        g.set(x + dx, y + dy, KEY_TO_ID.get('fire'));
        g.setLife(x + dx, y + dy, 40);
        continue;
      }
      // water extinguishes fire and turns to smoke
      if (n === KEY_TO_ID.get('water')) {
        g.set(x, y, KEY_TO_ID.get('smoke'));
        g.setLife(x, y, 60);
        g.set(x + dx, y + dy, KEY_TO_ID.get('smoke'));
        g.setLife(x + dx, y + dy, 60);
        return;
      }
    }
  }
  // short-lived: decays into smoke
  const life = g.getLife(x, y);
  if (life <= 1) {
    if (Math.random() < 0.5) { g.set(x, y, KEY_TO_ID.get('smoke')); g.setLife(x, y, 80); }
    else g.set(x, y, 0);
    return;
  }
  g.setLife(x, y, life - 1);
  // fire flickers upward like a light gas
  if (Math.random() < 0.4) gas(x, y, g);
}

function plant(x, y, g) {
  // grows into empty cells above when watered
  const waterId = KEY_TO_ID.get('water');
  const below = g.get(x, y + 1);
  const wet = neighbors4(x, y, g).includes(waterId);
  if (wet && below === 0 && Math.random() < 0.004) {
    g.set(x, y + 1, KEY_TO_ID.get('plant'));
  } else if (wet && Math.random() < 0.002) {
    const d = (Math.random() * 3 | 0) - 1;
    if (g.inBounds(x + d, y) && g.get(x + d, y) === 0) {
      g.set(x + d, y, KEY_TO_ID.get('plant'));
    }
  }
  // plants burn
}

function acid(x, y, g) {
  const id = g.get(x, y);
  if (liquid(x, y, g)) return;
  // dissolve static neighbors
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const n = g.get(x + dx, y + dy);
    const el = n !== 0 && BY_ID.get(n);
    if (el && el.kind === 'static' && Math.random() < 0.05) {
      g.set(x + dx, y + dy, 0);
      if (Math.random() < 0.25) { g.set(x, y, 0); return; } // acid gets used up
    }
  }
}

function lava(x, y, g) {
  const id = g.get(x, y);
  // lava + water -> stone + smoke
  for (const [dx, dy] of [[0, -1], [1, 0], [-1, 0], [0, 1]]) {
    if (g.get(x + dx, y + dy) === KEY_TO_ID.get('water')) {
      g.set(x, y, KEY_TO_ID.get('stone'));
      g.set(x + dx, y + dy, KEY_TO_ID.get('smoke'));
      g.setLife(x + dx, y + dy, 70);
      return;
    }
  }
  // ignites flammables, emits fire above
  if (g.get(x, y - 1) === 0 && Math.random() < 0.01) {
    g.set(x, y - 1, KEY_TO_ID.get('fire'));
    g.setLife(x, y - 1, 30);
  }
  liquid(x, y, g); // lava flows slowly (handled via speed in sim)
}
