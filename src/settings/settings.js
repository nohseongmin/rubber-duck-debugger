'use strict';

// This renderer can reach IPC through the preload bridge, and it displays strings
// that came out of someone else's skin pack (name, author). So it builds the DOM
// with the DOM API and never touches innerHTML.

const $ = (id) => document.getElementById(id);

// Main always sends a merged config; these mirror config.js DEFAULTS as a safety net.
const FALLBACK = {
  size: 120,
  emoji: '🦆',
  bubbleMs: 2200,
  volume: 0.6,
  chatterMinSec: 30,
  chatterMaxSec: 75
};

const HK_ACTIONS = [
  { value: 'quack', label: 'Quack' },
  { value: 'next-skin', label: 'Next skin' },
  { value: 'toggle-hide', label: 'Hide / show' },
  { value: 'open-settings', label: 'Open settings' }
];

const CHAR_TYPES = ['default', 'emoji', 'image'];

let hotkeys = [];       // [{ accel, action }]
let capturingRow = -1;  // index of the row waiting for a key press (-1 = none)
let toastTimer = null;

function makeEl(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text != null) el.textContent = text;
  return el;
}

function checkRadio(name, value) {
  document.querySelector(`input[name=${name}][value=${value}]`).checked = true;
}

function checkedValue(name) {
  return document.querySelector(`input[name=${name}]:checked`).value;
}

function toFileUrl(p) {
  return 'file://' + String(p).replace(/\\/g, '/');
}

// For display: 'CommandOrControl' -> 'Ctrl'
function accelLabel(accel) {
  return accel ? accel.replace('CommandOrControl', 'Ctrl') : '';
}

function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 1500);
}

// ---- Settings into the form ----
function fill(cfg) {
  const ch = cfg.character || {};
  checkRadio('charType', CHAR_TYPES.includes(ch.type) ? ch.type : 'default');
  $('emoji').value = ch.emoji || FALLBACK.emoji;
  $('imagePath').value = ch.imagePath || '';
  $('size').value = ch.size || FALLBACK.size;
  $('sizeVal').textContent = $('size').value + 'px';

  $('phrases').value = (cfg.phrases || []).join('\n');
  $('bubbleDuration').value = cfg.bubbleDuration || FALLBACK.bubbleMs;

  const sound = cfg.sound || {};
  checkRadio('soundType', sound.type === 'file' ? 'file' : 'synth');
  $('soundPath').value = sound.filePath || '';
  const volume = typeof sound.volume === 'number' ? sound.volume : FALLBACK.volume;
  $('volume').value = volume;
  $('volVal').textContent = Math.round(volume * 100) + '%';

  $('alwaysOnTop').checked = cfg.alwaysOnTop !== false;
  $('idleBob').checked = cfg.idleBob !== false;
  $('launchAtLogin').checked = !!cfg.launchAtLogin;

  const idle = cfg.idleChatter || {};
  $('chatterEnabled').checked = idle.enabled !== false;
  $('chatterMin').value = idle.minSec || FALLBACK.chatterMinSec;
  $('chatterMax').value = idle.maxSec || FALLBACK.chatterMaxSec;
  $('chatterSound').checked = !!idle.sound;

  hotkeys = (Array.isArray(cfg.hotkeys) ? cfg.hotkeys : [])
    .filter((hk) => hk && hk.accel)
    .map((hk) => ({ accel: hk.accel, action: hk.action || 'quack' }));
  capturingRow = -1;
  renderHotkeys();

  renderPreview();
}

// ---- The form back into settings ----
// Only the values this window owns. Main merges them onto what is stored, so moving
// the duck while this window is open won't get undone by pressing Save.
function collect() {
  // Guard against NaN, but keep a real 0 (dragging the slider to 0% mutes the duck).
  const volume = parseFloat($('volume').value);
  return {
    character: {
      type: checkedValue('charType'),
      emoji: $('emoji').value || FALLBACK.emoji,
      imagePath: $('imagePath').value || null,
      size: parseInt($('size').value, 10) || FALLBACK.size
    },
    phrases: $('phrases').value.split('\n').map((s) => s.trim()).filter(Boolean),
    bubbleDuration: parseInt($('bubbleDuration').value, 10) || FALLBACK.bubbleMs,
    sound: {
      type: checkedValue('soundType'),
      filePath: $('soundPath').value || null,
      volume: Number.isFinite(volume) ? volume : FALLBACK.volume
    },
    hotkeys: hotkeys.filter((hk) => hk.accel),
    idleChatter: {
      enabled: $('chatterEnabled').checked,
      minSec: parseInt($('chatterMin').value, 10) || FALLBACK.chatterMinSec,
      maxSec: parseInt($('chatterMax').value, 10) || FALLBACK.chatterMaxSec,
      sound: $('chatterSound').checked
    },
    alwaysOnTop: $('alwaysOnTop').checked,
    idleBob: $('idleBob').checked,
    launchAtLogin: $('launchAtLogin').checked
  };
}

function renderPreview() {
  const type = checkedValue('charType');
  const size = parseInt($('size').value, 10) || FALLBACK.size;
  const box = $('preview');
  box.textContent = '';

  if (type === 'emoji') {
    const span = makeEl('span', null, $('emoji').value || FALLBACK.emoji);
    span.style.fontSize = size + 'px';
    box.appendChild(span);
    return;
  }
  const img = document.createElement('img');
  img.style.width = size + 'px';
  img.src = (type === 'image' && $('imagePath').value)
    ? toFileUrl($('imagePath').value)
    : '../../assets/duck.png';
  box.appendChild(img);
}

// ---- Hotkeys (key combo -> action) ----
function keyName(e) {
  const k = e.key;
  if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(k)) return null;
  if (k === ' ') return 'Space';
  if (k.startsWith('Arrow')) return k.slice(5); // Up/Down/Left/Right
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(k)) return k; // F1~F24
  if (k === '+') return 'Plus'; // Electron accelerators use 'Plus' since '+' is the modifier separator
  if (k.length === 1) return k.toUpperCase();
  if (k === 'Enter') return 'Return';
  const named = ['Home', 'End', 'PageUp', 'PageDown', 'Insert', 'Delete', 'Backspace', 'Tab'];
  return named.includes(k) ? k : null;
}

function hotkeyRow(hk, index) {
  const row = makeEl('div', 'hotkey-row');
  row.dataset.i = String(index);

  const select = makeEl('select', 'hk-action');
  for (const action of HK_ACTIONS) {
    select.appendChild(new Option(action.label, action.value));
  }
  select.value = hk.action;
  select.addEventListener('change', () => { hotkeys[index].action = select.value; });

  const capturing = capturingRow === index;
  const key = makeEl('div', capturing ? 'hk-key capturing' : 'hk-key',
    capturing ? 'Press a key combination…' : (accelLabel(hk.accel) || 'Not set'));
  key.title = 'Click to set a key';
  key.addEventListener('click', () => {
    capturingRow = capturing ? -1 : index;
    renderHotkeys();
  });

  const remove = makeEl('button', 'hk-del', '×');
  remove.type = 'button';
  remove.title = 'Remove';
  remove.addEventListener('click', () => {
    hotkeys.splice(index, 1);
    if (capturingRow === index) capturingRow = -1;
    renderHotkeys();
  });

  row.append(select, key, remove);
  return row;
}

function renderHotkeys() {
  const list = $('hotkeyList');
  list.textContent = '';
  hotkeys.forEach((hk, i) => list.appendChild(hotkeyRow(hk, i)));
}

$('hotkeyAdd').addEventListener('click', () => {
  hotkeys.push({ accel: '', action: 'quack' });
  capturingRow = hotkeys.length - 1; // the new row waits for a key straight away
  renderHotkeys();
});

window.addEventListener('keydown', (e) => {
  if (capturingRow < 0) return;
  e.preventDefault();
  e.stopPropagation();
  if (e.key === 'Escape') { capturingRow = -1; renderHotkeys(); return; }

  const mods = [];
  if (e.ctrlKey || e.metaKey) mods.push('CommandOrControl');
  if (e.altKey) mods.push('Alt');
  if (e.shiftKey) mods.push('Shift');

  const name = keyName(e);
  if (!name) return;                                   // modifiers only, keep waiting
  if (mods.length === 0 && name.length === 1) return;  // a bare letter needs a modifier
  if (hotkeys[capturingRow]) hotkeys[capturingRow].accel = [...mods, name].join('+');
  capturingRow = -1;
  renderHotkeys();
}, true);

// ---- Skins ----
function skinCard(skin, activeSkin, refresh) {
  const card = makeEl('div', skin.id === activeSkin ? 'skin-card active' : 'skin-card');
  card.title = skin.name;
  card.addEventListener('click', async () => {
    await window.api.setActiveSkin(skin.id);
    await refresh();
    toast('Skin applied. Quack!');
  });

  const remove = makeEl('button', 'sdel', '×');
  remove.type = 'button';
  remove.title = 'Remove';
  remove.addEventListener('click', async (e) => {
    e.stopPropagation(); // don't also trigger the card's apply-on-click
    await window.api.deleteSkin(skin.id);
    await refresh();
    toast('Skin removed.');
  });

  const thumb = makeEl('img', 'thumb');
  thumb.src = toFileUrl(skin.imagePath);
  thumb.alt = '';

  card.append(remove, thumb, makeEl('div', 'sname', skin.name), makeEl('div', 'sauth', skin.author || ''));
  return card;
}

async function renderSkins() {
  const { skins, activeSkin } = await window.api.getSkins();

  const active = skins.find((s) => s.id === activeSkin);
  const banner = $('skinBanner');
  banner.hidden = !active;
  if (active) banner.textContent = `Skin "${active.name}" is active. The character, sound and phrase settings below are ignored.`;

  const grid = $('skinGrid');
  grid.textContent = '';
  if (!skins.length) {
    grid.appendChild(makeEl('div', 'skin-empty',
      'No skins installed yet. Use "Import skin pack" to add a .rduck file.'));
    return;
  }
  for (const skin of skins) grid.appendChild(skinCard(skin, activeSkin, renderSkins));
}

$('skinImport').addEventListener('click', async () => {
  const res = await window.api.importSkin();
  if (res.canceled) return;
  if (!res.ok) { toast('Import failed: ' + (res.error || 'unknown error')); return; }
  await renderSkins();
  toast(`Added skin "${res.name}". Quack!`);
});

$('skinNone').addEventListener('click', async () => {
  await window.api.setActiveSkin(null);
  await renderSkins();
  toast('Back to your own settings.');
});

// ---- Reacting to input ----
['input', 'change'].forEach((ev) => {
  ['emoji', 'size', 'imagePath'].forEach((id) => $(id).addEventListener(ev, renderPreview));
  document.querySelectorAll('input[name=charType]').forEach((el) => el.addEventListener(ev, renderPreview));
});
$('size').addEventListener('input', () => { $('sizeVal').textContent = $('size').value + 'px'; });
$('volume').addEventListener('input', () => {
  $('volVal').textContent = Math.round($('volume').value * 100) + '%';
});

$('pickImage').addEventListener('click', async () => {
  const file = await window.api.pickFile('image');
  if (!file) return;
  $('imagePath').value = file;
  checkRadio('charType', 'image');
  renderPreview();
});

$('pickSound').addEventListener('click', async () => {
  const file = await window.api.pickFile('sound');
  if (!file) return;
  $('soundPath').value = file;
  checkRadio('soundType', 'file');
});

// ---- Save and test ----
async function save() {
  await window.api.saveConfig(collect());
  toast('Saved. Quack!');
}

$('save').addEventListener('click', save);
$('test').addEventListener('click', async () => {
  await save();
  window.api.testQuack();
});

window.api.getConfig().then(async (cfg) => {
  fill(cfg);
  await renderSkins();
});
