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

  writeRaw([1, 2, 3]); // valid json, but an array is not a config object
  check('a non-object config falls back to defaults', config.load().idleBob === true);
  check('array indices do not leak in as config keys', !('0' in config.load()), Object.keys(config.load()));

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

console.log('\n[6] array settings reject non-array values');
{
  for (const value of [null, false, 42, 'invalid', {}]) {
    writeRaw({ hotkeys: value, phrases: value, idleBob: false });
    const cfg = config.load();
    check('invalid hotkeys fall back to an empty array', Array.isArray(cfg.hotkeys) && cfg.hotkeys.length === 0, value);
    check('invalid phrases fall back to defaults', JSON.stringify(cfg.phrases) === JSON.stringify(config.DEFAULTS.phrases), value);
    check('unrelated settings survive', cfg.idleBob === false);

    writeRaw({ hotkeys: [{ accel: 'Alt+Q', action: 'quack' }], phrases: ['Keep me'] });
    config.save({ hotkeys: value, phrases: value });
    const saved = config.load();
    check('invalid patch preserves hotkeys', saved.hotkeys.length === 1 && saved.hotkeys[0].accel === 'Alt+Q', value);
    check('invalid patch preserves phrases', saved.phrases.length === 1 && saved.phrases[0] === 'Keep me', value);
  }
  config.save({ hotkeys: [], phrases: [] });
  const cfg = config.load();
  check('empty arrays still clear the settings', cfg.hotkeys.length === 0 && cfg.phrases.length === 0);
}

console.log('\n[7] reports a failed save');
{
  const originalWriteFileSync = fs.writeFileSync;
  fs.writeFileSync = () => { throw new Error('disk full'); };
  let error;
  try {
    config.save({ idleBob: false });
  } catch (e) {
    error = e;
  } finally {
    fs.writeFileSync = originalWriteFileSync;
  }
  check('save throws the write error', error && error.message === 'disk full', error);
}

console.log('\n[8] object settings reject non-object values');
{
  const keys = ['character', 'sound', 'idleChatter'];
  for (const value of [null, false, true, 42, 'invalid', []]) {
    writeRaw({ character: value, sound: value, idleChatter: value, idleBob: false });
    const cfg = config.load();
    for (const key of keys) {
      check('invalid ' + key + ' falls back to defaults',
        JSON.stringify(cfg[key]) === JSON.stringify(config.DEFAULTS[key]), value);
    }
    check('unrelated settings survive', cfg.idleBob === false);

    writeRaw({ character: { emoji: 'X' }, sound: { volume: 0 }, idleChatter: { enabled: false } });
    const before = config.load();
    const saved = config.save({ character: value, sound: value, idleChatter: value, alwaysOnTop: false });
    const loaded = config.load();
    for (const key of keys) {
      check('invalid patch preserves ' + key,
        JSON.stringify(saved[key]) === JSON.stringify(before[key]), value);
      check('preserved ' + key + ' survives reload',
        JSON.stringify(loaded[key]) === JSON.stringify(before[key]), value);
    }
    check('unrelated patch still applies', loaded.alwaysOnTop === false);
  }
}

console.log('\n[9] failed saves preserve the last saved settings');
{
  const originalWriteFileSync = fs.writeFileSync;
  const originalRenameSync = fs.renameSync;
  for (const stage of ['write', 'rename']) {
    writeRaw({ idleBob: false, position: { x: 10, y: 20 } });
    const before = fs.readFileSync(CONFIG_FILE);
    const expectedError = new Error(stage + ' failed');
    fs.writeFileSync = function (file, ...args) {
      if (stage === 'write') {
        originalWriteFileSync(file, '{ incomplete', 'utf-8');
        throw expectedError;
      }
      return originalWriteFileSync(file, ...args);
    };
    fs.renameSync = () => { throw expectedError; };
    let error;
    try {
      config.save({ idleBob: true });
    } catch (e) {
      error = e;
    } finally {
      fs.writeFileSync = originalWriteFileSync;
      fs.renameSync = originalRenameSync;
    }
    check(stage + ' failure throws the original error', error === expectedError);
    check(stage + ' failure preserves the file byte for byte', fs.readFileSync(CONFIG_FILE).equals(before));
    const cfg = config.load();
    check(stage + ' failure keeps the saved settings readable',
      cfg.idleBob === false && cfg.position.x === 10 && cfg.position.y === 20);
    check(stage + ' failure cleans up the temporary file', !fs.existsSync(CONFIG_FILE + '.tmp'));
  }
}

console.log('\n[10] boolean settings reject non-boolean values');
{
  const keys = ['alwaysOnTop', 'idleBob', 'launchAtLogin'];
  for (const value of [null, 0, 1, '', 'false', [], {}]) {
    const patch = {
      alwaysOnTop: value, idleBob: value, launchAtLogin: value,
      idleChatter: { enabled: value, sound: value }
    };
    writeRaw({ ...patch, character: { emoji: 'X' } });
    const cfg = config.load();
    for (const key of keys) {
      check('invalid ' + key + ' falls back to its default', cfg[key] === config.DEFAULTS[key], value);
    }
    check('invalid nested booleans fall back to defaults',
      cfg.idleChatter.enabled === true && cfg.idleChatter.sound === false, value);
    check('unrelated settings survive', cfg.character.emoji === 'X');

    writeRaw({ alwaysOnTop: false, idleBob: false, launchAtLogin: true,
      idleChatter: { enabled: false, sound: true } });
    const before = config.load();
    const saved = config.save({ ...patch, character: { emoji: 'Y' } });
    const loaded = config.load();
    for (const key of keys) {
      check('invalid patch preserves ' + key, saved[key] === before[key] && loaded[key] === before[key], value);
    }
    check('invalid patch preserves nested booleans',
      saved.idleChatter.enabled === false && saved.idleChatter.sound === true &&
      loaded.idleChatter.enabled === false && loaded.idleChatter.sound === true, value);
    check('unrelated patch still applies', loaded.character.emoji === 'Y');
  }
  for (const value of [false, true]) {
    config.save({ alwaysOnTop: value, idleBob: value, launchAtLogin: value,
      idleChatter: { enabled: value, sound: value } });
    const cfg = config.load();
    check('valid booleans still update every setting',
      keys.every((key) => cfg[key] === value) &&
      cfg.idleChatter.enabled === value && cfg.idleChatter.sound === value, value);
  }
}

console.log('\n[11] numeric settings reject non-finite and non-number values');
{
  for (const value of [null, false, true, '', '150', [], {}]) {
    writeRaw({ character: { size: value }, sound: { volume: value }, bubbleDuration: value,
      idleChatter: { minSec: value, maxSec: value }, idleBob: false });
    const cfg = config.load();
    check('invalid numbers fall back to defaults',
      cfg.character.size === config.DEFAULTS.character.size && cfg.sound.volume === config.DEFAULTS.sound.volume &&
      cfg.bubbleDuration === config.DEFAULTS.bubbleDuration &&
      cfg.idleChatter.minSec === config.DEFAULTS.idleChatter.minSec &&
      cfg.idleChatter.maxSec === config.DEFAULTS.idleChatter.maxSec, value);
    check('unrelated settings survive', cfg.idleBob === false);
  }
  for (const value of [null, false, true, '', '150', [], {}, NaN, Infinity, -Infinity]) {
    writeRaw({ character: { size: 150 }, sound: { volume: 0 }, bubbleDuration: 3000,
      idleChatter: { minSec: 0, maxSec: 90 } });
    const saved = config.save({ character: { size: value }, sound: { volume: value }, bubbleDuration: value,
      idleChatter: { minSec: value, maxSec: value }, idleBob: false });
    const loaded = config.load();
    for (const cfg of [saved, loaded]) {
      check('invalid numeric patch preserves saved numbers',
        cfg.character.size === 150 && cfg.sound.volume === 0 && cfg.bubbleDuration === 3000 &&
        cfg.idleChatter.minSec === 0 && cfg.idleChatter.maxSec === 90, value);
      check('unrelated patch still applies', cfg.idleBob === false);
    }
  }
  config.save({ character: { size: 180 }, sound: { volume: 0.25 }, bubbleDuration: 4000,
    idleChatter: { minSec: 0, maxSec: 100 } });
  const cfg = config.load();
  check('valid numbers including zero still update every setting',
    cfg.character.size === 180 && cfg.sound.volume === 0.25 && cfg.bubbleDuration === 4000 &&
    cfg.idleChatter.minSec === 0 && cfg.idleChatter.maxSec === 100);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
fs.rmSync(USERDATA, { recursive: true, force: true });
process.exit(fail === 0 ? 0 : 1);
