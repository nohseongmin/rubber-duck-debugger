'use strict';
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const DEFAULTS = {
  character: { type: 'default', emoji: '🦆', imagePath: null, size: 120 },
  phrases: [
    'Quack!',
    'Quack quack!',
    'Walk me through it, line by line.',
    'So what is that variable, exactly?',
    'Is that really the value there?',
    'You just spotted it, didn\'t you?'
  ],
  sound: { type: 'synth', filePath: null, volume: 0.6 },
  idleChatter: { enabled: true, minSec: 30, maxSec: 75, sound: false }, // the duck speaks up on its own now and then (silent by default)
  idleBob: true,        // gentle bobbing while idle
  bubbleDuration: 2200,
  alwaysOnTop: true,
  launchAtLogin: false, // start with the OS (off by default)
  // Global hotkeys: key combo -> action (quack/next-skin/toggle-hide/open-settings).
  // Empty by default so the app never steals a shortcut the user already relies on.
  hotkeys: [],
  activeSkin: null, // id of the active skin (null = the user's own settings)
  position: null // {x, y}, or null for the default bottom-right spot
};

function configPath() {
  return path.join(app.getPath('userData'), 'config.json');
}

const isPlainObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

// Merge the stored settings onto the defaults (arrays are replaced wholesale).
function deepMerge(base, over) {
  if (over === null || over === undefined) return clone(base);
  if (!isPlainObject(base)) return over;

  const out = { ...base };
  for (const k of Object.keys(over)) {
    const value = over[k];
    if (value === undefined) continue;
    if (isPlainObject(value) && isPlainObject(base[k])) out[k] = deepMerge(base[k], value);
    // A null must not wipe out an object default like character or sound, or the
    // code reading it later would crash. Fields whose default is itself null
    // (position, activeSkin) have a non-object base, so they fall through.
    else if (value === null && isPlainObject(base[k])) continue;
    else out[k] = value;
  }
  return out;
}

function clone(v) {
  return JSON.parse(JSON.stringify(v));
}

// Migrate old configs: a single `hotkey` string became a `hotkeys` array.
function migrate(p) {
  if (!p || typeof p !== 'object') return p;
  if (!Array.isArray(p.hotkeys) && typeof p.hotkey === 'string') {
    p.hotkeys = p.hotkey ? [{ accel: p.hotkey, action: 'quack' }] : [];
  }
  if ('hotkey' in p) delete p.hotkey;
  return p;
}

function load() {
  try {
    const parsed = migrate(JSON.parse(fs.readFileSync(configPath(), 'utf-8')));
    return deepMerge(DEFAULTS, parsed);
  } catch (e) {
    return clone(DEFAULTS);
  }
}

// Apply a patch on top of what is stored. Callers send only the fields they mean
// to change, so a save can't clobber something edited elsewhere in the meantime
// (the window position, for example, while the settings window was open).
function save(patch) {
  const merged = deepMerge(load(), patch || {});
  try {
    fs.writeFileSync(configPath(), JSON.stringify(merged, null, 2), 'utf-8');
  } catch (e) {
    console.error('config save failed', e);
  }
  return merged;
}

module.exports = { DEFAULTS, load, save };
