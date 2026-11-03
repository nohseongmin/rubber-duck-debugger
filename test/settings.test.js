'use strict';
/*
 * Hotkey capture and skin deletion. Runs on plain node, no test framework.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '../src/settings/settings.js'), 'utf-8');

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name); }
}

function createElement() {
  return {
    children: [],
    dataset: {},
    listeners: {},
    classList: { add() {}, remove() {} },
    addEventListener(event, listener) { this.listeners[event] = listener; },
    append(...children) { this.children.push(...children); },
    appendChild(child) { this.children.push(child); return child; },
    set textContent(value) { this.text = value; this.children = []; },
    get textContent() { return this.text || ''; }
  };
}

console.log('\n[1] removing hotkey rows preserves the capture target');
for (const scenario of [
  { name: 'removing an earlier row keeps capture on the middle row', capture: 1, remove: 0, expected: 0 },
  { name: 'removing an earlier row keeps capture on the last row', capture: 2, remove: 0, expected: 1 },
  { name: 'removing the captured row cancels capture', capture: 1, remove: 1, expected: -1 },
  { name: 'removing a later row leaves capture unchanged', capture: 0, remove: 2, expected: 0 },
  { name: 'removing a row does not start capture', capture: -1, remove: 0, expected: -1 }
]) {
  const elements = new Map();
  const listeners = {};
  const document = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, createElement());
      return elements.get(id);
    },
    createElement,
    querySelectorAll: () => []
  };
  const window = {
    addEventListener(event, listener) { listeners[event] = listener; },
    // Leave loading pending; add and edit rows through their UI event handlers.
    api: { getConfig: () => new Promise(() => {}) }
  };
  vm.runInNewContext(source, {
    document, window,
    Option: function (text, value) { this.text = text; this.value = value; }
  });

  const add = elements.get('hotkeyAdd');
  const list = elements.get('hotkeyList');
  for (let i = 0; i < 3; i++) add.listeners.click();
  listeners.keydown({ key: 'Escape', preventDefault() {}, stopPropagation() {} });
  if (scenario.capture >= 0) list.children[scenario.capture].children[1].listeners.click();

  list.children[scenario.remove].children[2].listeners.click();
  listeners.keydown({ key: 'q', ctrlKey: true, preventDefault() {}, stopPropagation() {} });

  check(scenario.name, list.children.length === 2 && list.children.every((row, index) =>
    row.children[1].textContent === (index === scenario.expected ? 'Ctrl+Q' : 'Not set')));
}

async function testSkinDeletion() {
  console.log('\n[2] skin deletion respects the result from disk');
  const mainSource = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf-8');
  for (const ok of [false, true]) {
    for (const activeSkin of ['test-skin', 'other-skin']) {
      const handlers = {};
      const cfg = { activeSkin };
      let deletedId = null;
      let saves = 0;
      vm.runInNewContext(mainSource, {
        __dirname: path.join(__dirname, '../src'),
        require(request) {
          if (request === 'electron') return {
            app: { requestSingleInstanceLock: () => false, quit() {} },
            ipcMain: { handle(name, handler) { handlers[name] = handler; }, on() {} }
          };
          if (request === './config') return {
            load: () => cfg,
            save(patch) { saves++; return Object.assign(cfg, patch); }
          };
          if (request === './skins') return {
            deleteSkin(id) { deletedId = id; return ok; }
          };
          return require(request);
        }
      });

      const elements = new Map();
      let refreshes = 0;
      const context = {
        document: {
          getElementById(id) {
            if (!elements.has(id)) elements.set(id, createElement());
            return elements.get(id);
          },
          createElement,
          querySelectorAll: () => []
        },
        window: {
          addEventListener() {},
          api: {
            getConfig: () => new Promise(() => {}),
            toFileUrl: () => 'file:///test-skin.png',
            deleteSkin: (id) => handlers['delete-skin'](null, id)
          }
        },
        setTimeout: () => 1,
        clearTimeout() {}
      };
      vm.runInNewContext(source, context);
      const card = context.skinCard({ id: 'test-skin', name: 'Test' }, activeSkin,
        async () => { refreshes++; });
      await card.children[0].listeners.click({ stopPropagation() {} });

      const label = `delete ${ok ? 'succeeds' : 'fails'}, active skin is ${activeSkin}: `;
      const shouldClear = ok && activeSkin === 'test-skin';
      check(label + 'requests the selected skin', deletedId === 'test-skin');
      check(label + 'clears only a successfully deleted active skin',
        cfg.activeSkin === (shouldClear ? null : activeSkin) && saves === (shouldClear ? 1 : 0));
      check(label + 'refreshes only after success', refreshes === (ok ? 1 : 0));
      check(label + 'shows the actual result',
        elements.get('toast').textContent === (ok ? 'Skin removed.' : 'Could not remove skin.'));
    }
  }
}

testSkinDeletion().then(() => {
  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
}).catch((e) => {
  console.error(e);
  process.exit(1);
});
