'use strict';
/*
 * Settings merging and migration. Runs on plain node, no test framework.
 *
 * save() applies a patch on top of what is stored. Break that and saving from the
 * settings window starts reverting unrelated values, like the duck's position.
 */
const Module = require('module');
const fs = require('fs');
const os = require('os');
const path = require('path');

const USERDATA = path.join(os.tmpdir(), 'rdd-config-test-' + Date.now());
fs.mkdirSync(USERDATA, { recursive: true });

const origLoad = Module._load;
Module._load = function (request) {
  if (request === 'electron') return { app: { getPath: () => USERDATA } };
  return origLoad.apply(this, arguments);
};

const config = require('../src/config.js');
const CONFIG_FILE = path.join(USERDATA, 'config.json');

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra !== undefined ? '  ' + JSON.stringify(extra) : '')); }
}
const writeRaw = (obj) => fs.writeFileSync(CONFIG_FILE, JSON.stringify(obj), 'utf-8');
const reset = () => fs.rmSync(CONFIG_FILE, { force: true });

console.log('\n[1] defaults');
{
  reset();
  const cfg = config.load();
  check('no hotkeys out of the box', Array.isArray(cfg.hotkeys) && cfg.hotkeys.length === 0, cfg.hotkeys);
  check('bobbing is on', cfg.idleBob === true);
  check('launch at login is off', cfg.launchAtLogin === false);
  check('no saved position', cfg.position === null);
  check('no active skin', cfg.activeSkin === null);
}

console.log('\n[2] save() patches what is already stored');
{
  reset();
  config.save({ position: { x: 10, y: 20 } });
  config.save({ alwaysOnTop: false }); // a save that says nothing about position
  const cfg = config.load();
  check('position survives', cfg.position && cfg.position.x === 10 && cfg.position.y === 20, cfg.position);
  check('the changed value took', cfg.alwaysOnTop === false);

  config.save({ activeSkin: 'pinky-duck' });
  config.save({ idleBob: false });
  check('active skin survives', config.load().activeSkin === 'pinky-duck');
  check('active skin can be cleared with null', config.save({ activeSkin: null }).activeSkin === null);
}

console.log('\n[3] a partial save leaves everything else alone (settings window)');
{
  reset();
  config.save({ position: { x: 5, y: 5 }, activeSkin: 'skin-a' });
  // exactly what the settings window sends: only the values it owns
  config.save({
    character: { type: 'emoji', emoji: '🐤', imagePath: null, size: 150 },
    phrases: ['one line'],
    sound: { type: 'synth', filePath: null, volume: 0.3 },
    hotkeys: [{ accel: 'Alt+Q', action: 'quack' }],
    idleChatter: { enabled: false, minSec: 10, maxSec: 20, sound: true },
    alwaysOnTop: true, idleBob: true, launchAtLogin: false
  });
  const cfg = config.load();
  check('position still there', cfg.position && cfg.position.x === 5, cfg.position);
  check('active skin still there', cfg.activeSkin === 'skin-a', cfg.activeSkin);
  check('character applied', cfg.character.emoji === '🐤' && cfg.character.size === 150);
  check('arrays are replaced, not merged', cfg.phrases.length === 1 && cfg.hotkeys.length === 1);
}

console.log('\n[4] survives a damaged config file');
{
  fs.writeFileSync(CONFIG_FILE, '{ this is not json', 'utf-8');
  check('broken json falls back to defaults', config.load().idleBob === true);

  writeRaw({ character: null, sound: null }); // a null here used to crash the main process
  const cfg = config.load();
  check('character default kept', cfg.character && typeof cfg.character === 'object', cfg.character);
  check('sound default kept', cfg.sound && typeof cfg.sound.volume === 'number', cfg.sound);
}

console.log('\n[5] migrating the old single hotkey to the hotkeys array');
{
  writeRaw({ hotkey: 'CommandOrControl+Alt+Q', character: { emoji: 'X' } });
  const cfg = config.load();
  check('turned into an array', cfg.hotkeys.length === 1 && cfg.hotkeys[0].accel === 'CommandOrControl+Alt+Q', cfg.hotkeys);
  check('defaults to the quack action', cfg.hotkeys[0].action === 'quack');
  check('old key removed', !('hotkey' in cfg));
  check('other values preserved', cfg.character.emoji === 'X');

  writeRaw({ hotkey: '' }); // empty means nothing registered
  check('empty hotkey becomes an empty array', config.load().hotkeys.length === 0);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
fs.rmSync(USERDATA, { recursive: true, force: true });
process.exit(fail === 0 ? 0 : 1);
