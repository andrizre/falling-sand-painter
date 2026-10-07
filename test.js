// Headless test: load elements.js in Node, run a mini-grid, check sand falls,
// water sinks below oil, fire ignites wood, lava+water -> stone.
const fs = require('fs');
const vm = require('vm');
const ctx = {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(__dirname + '/elements.js', 'utf8') +
  ';this.KEY_TO_ID = KEY_TO_ID; this.ELEMENTS = ELEMENTS;', ctx);
const { KEY_TO_ID } = ctx;

// minimal grid
function makeGrid(w, h) {
  return {
    w, h, cells: new Uint8Array(w * h), life: new Uint8Array(w * h),
    idx: (x, y) => y * w + x,
    inBounds: (x, y) => x >= 0 && x < w && y >= 0 && y < h,
    get(x, y) { return this.inBounds(x, y) ? this.cells[this.idx(x, y)] : 3; },
    set(x, y, v) { if (this.inBounds(x, y)) this.cells[this.idx(x, y)] = v; },
    getLife(x, y) { return this.life[this.idx(x, y)]; },
    setLife(x, y, v) { if (this.inBounds(x, y)) this.life[this.idx(x, y)] = v; },
    clear() { this.cells.fill(0); this.life.fill(0); },
  };
}

let pass = 0, fail = 0;
function check(name, cond) { cond ? pass++ : (fail++, console.log('FAIL: ' + name)); }

// 1. sand falls
let g = makeGrid(10, 10);
g.set(5, 2, KEY_TO_ID.get('sand'));
for (let i = 0; i < 20; i++) ctx.ELEMENTS[0].update(5, 2 - 0, g); // update cell; may move
// simpler: run powder manually on whatever position it's at
g.clear(); g.set(5, 2, KEY_TO_ID.get('sand'));
let found = -1;
for (let t = 0; t < 20; t++) {
  found = -1;
  for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) if (g.get(x, y) === KEY_TO_ID.get('sand')) found = g.idx(x, y);
  if (found >= 0) ctx.ELEMENTS[0].update(found % 10, (found / 10) | 0, g);
}
check('sand rests at bottom', g.get(5, 9) === KEY_TO_ID.get('sand'));

// 2. oil rises through water when submerged (in a walled container)
g.clear();
for (let y = 2; y <= 9; y++) { g.set(3, y, KEY_TO_ID.get('stone')); g.set(7, y, KEY_TO_ID.get('stone')); }
for (let y = 3; y <= 8; y++) for (let x = 4; x <= 6; x++) g.set(x, y, KEY_TO_ID.get('water'));
g.set(5, 5, KEY_TO_ID.get('oil')); // submerged mid-tank
for (let t = 0; t < 100; t++) {
  for (let y = 9; y >= 0; y--) for (let x = 0; x < 10; x++) {
    const id = g.get(x, y);
    if (id === KEY_TO_ID.get('oil')) ctx.ELEMENTS[6].update(x, y, g);
    else if (id === KEY_TO_ID.get('water')) ctx.ELEMENTS[1].update(x, y, g);
  }
}
// correct iff no water cell has an oil cell directly below it (oil fully surfaced)
let bad = false;
for (let y = 0; y < 9; y++) for (let x = 0; x < 10; x++) {
  if (g.get(x, y) === KEY_TO_ID.get('water') && g.get(x, y + 1) === KEY_TO_ID.get('oil')) bad = true;
}
check('oil floats above water in tank', !bad);

// 3. fire ignites wood
g.clear();
g.set(5, 5, KEY_TO_ID.get('wood'));
g.set(6, 5, KEY_TO_ID.get('fire'));
g.setLife(6, 5, 40);
let ignited = false;
for (let t = 0; t < 400 && !ignited; t++) {
  ctx.ELEMENTS[4].update(6, 5, g);
  ignited = g.get(5, 5) === KEY_TO_ID.get('fire') || g.get(5, 5) === 0 || g.get(5, 5) === KEY_TO_ID.get('smoke');
}
check('fire ignites/consumes wood', ignited);

// 4. lava + water -> stone
g.clear();
g.set(5, 5, KEY_TO_ID.get('lava'));
g.set(5, 4, KEY_TO_ID.get('water'));
ctx.ELEMENTS[9].update(5, 5, g);
check('lava+water -> stone+smoke', g.get(5, 5) === KEY_TO_ID.get('stone') && g.get(5, 4) === KEY_TO_ID.get('smoke'));

// 5. smoke rises and decays
g.clear();
g.set(5, 8, KEY_TO_ID.get('smoke'));
g.setLife(5, 8, 1);
ctx.ELEMENTS[7].update(5, 8, g);
check('smoke decay clears cell', g.get(5, 8) === 0);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
