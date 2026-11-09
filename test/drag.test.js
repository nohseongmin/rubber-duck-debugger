'use strict';
/* Drag events with delayed IPC replies. Runs on plain node, no Electron window. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '../src/duck/duck.js'), 'utf-8');
let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra !== undefined ? '  ' + JSON.stringify(extra) : '')); }
}

function setup() {
  const listeners = {};
  const requests = [], moves = [], saves = [], errors = [];
  let setMoveMode;
  const element = { addEventListener() {}, classList: { toggle() {} } };
  const window = {
    addEventListener: (name, cb) => { listeners[name] = cb; },
    api: {
      onConfig() {}, onQuack() {},
      onMoveMode: (cb) => { setMoveMode = cb; },
      getWindowPos: () => new Promise((resolve, reject) => requests.push({ resolve, reject })),
      moveWindow: (x, y) => moves.push([x, y]),
      savePosition: (x, y) => saves.push([x, y]),
      setMouseThrough() {}
    }
  };
  vm.runInNewContext(source, {
    window,
    document: { getElementById: () => element, body: element, elementFromPoint: () => null },
    console: { error: (...args) => errors.push(args) }
  });
  setMoveMode(true);
  return { listeners, requests, moves, saves, errors, setMoveMode };
}

function down(test, x = 10, y = 20) {
  const event = { button: 0, screenX: x, screenY: y, preventDefault() { this.defaultPrevented = true; } };
  return { event, done: test.listeners.mousedown(event) };
}

async function run() {
  console.log('\n[1] wait for the starting position, then use the mouse-down origin');
  {
    const t = setup();
    const press = down(t);
    check('default prevented before the IPC reply', press.event.defaultPrevented === true);
    t.listeners.mousemove({ screenX: 25, screenY: 50 });
    check('no movement before the IPC reply', t.moves.length === 0, t.moves);
    t.requests[0].resolve([400, 300]);
    await press.done;
    t.listeners.mousemove({ screenX: 25, screenY: 50 });
    check('moves from the actual window position', JSON.stringify(t.moves.at(-1)) === '[415,330]', t.moves);
    const release = t.listeners.mouseup({ button: 0 });
    t.requests.at(-1).resolve([415, 330]);
    await release;
    check('saves the final native position', JSON.stringify(t.saves) === '[[415,330]]', t.saves);
    t.listeners.mousemove({ screenX: 90, screenY: 90 });
    check('movement stops after release', t.moves.length === 1, t.moves);
  }

  console.log('\n[2] releasing before initialization cancels the drag');
  {
    const t = setup();
    const press = down(t);
    const release = t.listeners.mouseup({ button: 0 });
    check('no save lookup for an uninitialized drag', t.requests.length === 1, t.requests.length);
    for (const request of t.requests) request.resolve([400, 300]);
    await Promise.all([press.done, release]);
    t.listeners.mousemove({ screenX: 25, screenY: 50 });
    check('late reply cannot restart the drag', t.moves.length === 0, t.moves);
    check('canceled drag is not saved', t.saves.length === 0, t.saves);
  }

  console.log('\n[3] an older reply cannot overwrite a newer drag');
  {
    const t = setup();
    const first = down(t);
    const release = t.listeners.mouseup({ button: 0 });
    const second = down(t, 50, 60);
    t.requests.at(-1).resolve([800, 600]);
    await second.done;
    for (const request of t.requests) request.resolve([100, 100]);
    await Promise.all([first.done, release]);
    t.listeners.mousemove({ screenX: 55, screenY: 70 });
    check('new drag keeps its own origin', JSON.stringify(t.moves) === '[[805,610]]', t.moves);
  }

  console.log('\n[4] leaving move mode invalidates pending and active drags');
  for (const ready of [false, true]) {
    const t = setup();
    const press = down(t);
    if (ready) { t.requests[0].resolve([400, 300]); await press.done; }
    t.setMoveMode(false);
    t.setMoveMode(true);
    t.requests[0].resolve([400, 300]);
    await press.done;
    t.listeners.mousemove({ screenX: 25, screenY: 50 });
    check('mode re-entry requires a new press (ready=' + ready + ')', t.moves.length === 0, t.moves);
  }

  console.log('\n[5] a failed position lookup cancels only its own drag');
  {
    const t = setup();
    const first = down(t);
    t.requests[0].reject(new Error('IPC unavailable'));
    await first.done;
    t.listeners.mousemove({ screenX: 25, screenY: 50 });
    check('failed lookup cannot move the window', t.moves.length === 0, t.moves);
    check('failed lookup is reported', t.errors.length === 1, t.errors);
    const stale = down(t);
    const current = down(t, 50, 60);
    t.requests.at(-1).resolve([800, 600]);
    await current.done;
    t.requests[1].reject(new Error('old request failed'));
    await stale.done;
    t.listeners.mousemove({ screenX: 55, screenY: 70 });
    check('old failure leaves the current drag active', JSON.stringify(t.moves) === '[[805,610]]', t.moves);
  }

  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exitCode = fail === 0 ? 0 : 1;
}

run().catch((err) => { console.error(err); process.exitCode = 1; });
