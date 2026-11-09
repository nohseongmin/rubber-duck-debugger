'use strict';
/*
 * Dragging waits for the window position and ignores replies from canceled drags.
 * Runs on plain node, no test framework.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '../src/duck/duck.js'), 'utf-8');

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name); }
}

function createDrag() {
  const listeners = {};
  const reads = [];
  const moves = [];
  const saved = [];
  const errors = [];
  vm.runInNewContext(source, {
    document: {
      getElementById: () => ({ addEventListener() {} }),
      body: { classList: { toggle() {} } }
    },
    window: {
      addEventListener(event, listener) { listeners[event] = listener; },
      api: {
        onConfig() {}, onQuack() {},
        onMoveMode(listener) { listeners.moveMode = listener; },
        getWindowPos: () => new Promise((resolve, reject) => reads.push({ resolve, reject })),
        moveWindow: (x, y) => moves.push([x, y]),
        savePosition: (x, y) => saved.push([x, y])
      }
    },
    console: { error: (...args) => errors.push(args) }
  });
  listeners.moveMode(true);
  return { listeners, reads, moves, saved, errors };
}

async function testDragging() {
  console.log('\n[1] dragging waits for the initial window position');
  {
    const { listeners, reads, moves, saved } = createDrag();
    let prevented = false;
    const start = listeners.mousedown({
      button: 0, screenX: 300, screenY: 400,
      preventDefault() { prevented = true; }
    });
    listeners.mousemove({ screenX: 320, screenY: 430 });
    check('prevents the native drag before awaiting IPC', prevented);
    check('does not move using an unknown origin', moves.length === 0);
    reads[0].resolve([100, 200]);
    await start;
    listeners.mousemove({ screenX: 320, screenY: 430 });
    check('moves relative to the returned origin',
      moves.length === 1 && moves[0][0] === 120 && moves[0][1] === 230);
    const stop = listeners.mouseup();
    reads[1].resolve([120, 230]);
    await stop;
    listeners.mousemove({ screenX: 350, screenY: 450 });
    check('release saves the position and stops moving',
      saved.length === 1 && saved[0][0] === 120 && saved[0][1] === 230 && moves.length === 1);
  }

  console.log('\n[2] canceled and superseded position replies are ignored');
  for (const cancellation of ['release', 'move-mode', 'new-drag']) {
    const { listeners, reads, moves, saved } = createDrag();
    const start = listeners.mousedown({ button: 0, screenX: 300, screenY: 400, preventDefault() {} });
    if (cancellation === 'move-mode') {
      listeners.moveMode(false);
      listeners.moveMode(true);
    } else {
      const stop = listeners.mouseup();
      if (reads.length === 2) reads[1].resolve([100, 200]);
      await stop;
      if (cancellation === 'new-drag') {
        const next = listeners.mousedown({ button: 0, screenX: 500, screenY: 600, preventDefault() {} });
        reads[reads.length - 1].resolve([700, 800]);
        await next;
      }
    }
    reads[0].resolve([100, 200]);
    await start;
    listeners.mousemove({ screenX: 520, screenY: 630 });
    check(cancellation + ' ignores the stale origin', cancellation === 'new-drag'
      ? moves.length === 1 && moves[0][0] === 720 && moves[0][1] === 830
      : moves.length === 0);
    check(cancellation + ' does not save an unstarted drag', saved.length === 0);
  }

  console.log('\n[3] failed position reads skip the drag');
  {
    const { listeners, reads, moves, saved, errors } = createDrag();
    const start = listeners.mousedown({ button: 0, screenX: 300, screenY: 400, preventDefault() {} });
    const error = new Error('position unavailable');
    reads[0].reject(error);
    await start;
    listeners.mousemove({ screenX: 320, screenY: 430 });
    const stop = listeners.mouseup();
    if (reads.length === 2) reads[1].resolve([100, 200]);
    await stop;
    check('does not move or save after a failed read', moves.length === 0 && saved.length === 0);
    check('reports the read failure', errors.length === 1 && errors[0][1] === error);
  }
}

let isComplete = false;
// An unresolved mocked IPC promise must fail instead of silently exiting with 0.
process.once('beforeExit', () => {
  if (!isComplete) check('drag tests finish without pending position reads', false);
  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exitCode = fail === 0 ? 0 : 1;
});

testDragging().then(() => {
  isComplete = true;
}).catch((e) => {
  isComplete = true;
  check('drag tests finish without unexpected errors', false);
  console.error(e);
});
