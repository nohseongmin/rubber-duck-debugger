'use strict';

// 이 렌더러는 preload 로 IPC(saveConfig 등)에 닿는다. 스킨 이름·작성자처럼 외부에서
// 들어온 문자열이 섞이므로 innerHTML 을 쓰지 않고 DOM API 로만 화면을 만든다.

const $ = (id) => document.getElementById(id);

// 메인이 항상 병합된 설정을 주므로 아래는 방어용 폴백(값은 config.js DEFAULTS 와 맞춤)
const FALLBACK = {
  size: 120,
  emoji: '🦆',
  bubbleMs: 2200,
  volume: 0.6,
  chatterMinSec: 30,
  chatterMaxSec: 75
};

const HK_ACTIONS = [
  { value: 'quack', label: '꽥' },
  { value: 'next-skin', label: '다음 스킨' },
  { value: 'toggle-hide', label: '숨기기/보이기' },
  { value: 'open-settings', label: '설정 열기' }
];

const CHAR_TYPES = ['default', 'emoji', 'image'];

let current = null;
let hotkeys = [];       // [{ accel, action }]
let capturingRow = -1;  // 키 캡처 중인 행 index (-1 = 없음)
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

// 표시용: 'CommandOrControl' → 'Ctrl'
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

// ---- 설정 → 화면 ----
function fill(cfg) {
  current = cfg;

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

// ---- 화면 → 설정 ----
function collect() {
  return {
    ...(current || {}),
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
      volume: parseFloat($('volume').value)
    },
    hotkeys: hotkeys.filter((hk) => hk.accel),
    idleChatter: {
      enabled: $('chatterEnabled').checked,
      minSec: parseInt($('chatterMin').value, 10) || FALLBACK.chatterMinSec,
      maxSec: parseInt($('chatterMax').value, 10) || FALLBACK.chatterMaxSec,
      sound: $('chatterSound').checked
    },
    alwaysOnTop: $('alwaysOnTop').checked
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

// ---- 단축키(키 ↔ 액션) ----
function keyName(e) {
  const k = e.key;
  if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(k)) return null;
  if (k === ' ') return 'Space';
  if (k.startsWith('Arrow')) return k.slice(5); // Up/Down/Left/Right
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(k)) return k; // F1~F24
  if (k.length === 1) return k.toUpperCase();
  if (k === 'Enter') return 'Return';
  const named = ['Home', 'End', 'PageUp', 'PageDown', 'Insert', 'Delete', 'Backspace', 'Tab', 'Plus'];
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
    capturing ? '키 조합을 누르세요…' : (accelLabel(hk.accel) || '미지정'));
  key.title = '클릭해서 키 지정';
  key.addEventListener('click', () => {
    capturingRow = capturing ? -1 : index;
    renderHotkeys();
  });

  const remove = makeEl('button', 'hk-del', '×');
  remove.type = 'button';
  remove.title = '삭제';
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
  capturingRow = hotkeys.length - 1; // 새 행은 바로 캡처 대기
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
  if (!name) return;                                   // 수식키만 눌림 → 계속 대기
  if (mods.length === 0 && name.length === 1) return;  // 단일 문자키는 수식키 필요
  if (hotkeys[capturingRow]) hotkeys[capturingRow].accel = [...mods, name].join('+');
  capturingRow = -1;
  renderHotkeys();
}, true);

// ---- 스킨 ----
function skinCard(skin, activeSkin, refresh) {
  const card = makeEl('div', skin.id === activeSkin ? 'skin-card active' : 'skin-card');
  card.title = skin.name;
  card.addEventListener('click', async () => {
    const now = await window.api.setActiveSkin(skin.id);
    if (current) current.activeSkin = now;
    await refresh();
    toast('스킨 적용됨 꽥!');
  });

  const remove = makeEl('button', 'sdel', '×');
  remove.type = 'button';
  remove.title = '삭제';
  remove.addEventListener('click', async (e) => {
    e.stopPropagation(); // 카드 클릭(적용)과 겹치지 않게
    await window.api.deleteSkin(skin.id);
    await refresh();
    toast('스킨 삭제됨');
  });

  const thumb = makeEl('img', 'thumb');
  thumb.src = toFileUrl(skin.imagePath);
  thumb.alt = '';

  card.append(remove, thumb, makeEl('div', 'sname', skin.name), makeEl('div', 'sauth', skin.author || ''));
  return card;
}

async function renderSkins() {
  const { skins, activeSkin } = await window.api.getSkins();
  if (current) current.activeSkin = activeSkin; // 저장 시 덮어쓰지 않도록 동기화

  const active = skins.find((s) => s.id === activeSkin);
  const banner = $('skinBanner');
  banner.hidden = !active;
  if (active) banner.textContent = `스킨 "${active.name}" 적용 중 — 아래 캐릭터/소리/문구 설정은 무시됩니다.`;

  const grid = $('skinGrid');
  grid.textContent = '';
  if (!skins.length) {
    grid.appendChild(makeEl('div', 'skin-empty',
      '설치된 스킨이 없습니다. "스킨팩 가져오기"로 .rduck 파일을 추가하세요.'));
    return;
  }
  for (const skin of skins) grid.appendChild(skinCard(skin, activeSkin, renderSkins));
}

$('skinImport').addEventListener('click', async () => {
  const res = await window.api.importSkin();
  if (res.canceled) return;
  if (!res.ok) { toast('가져오기 실패: ' + (res.error || '알 수 없음')); return; }
  await renderSkins();
  toast(`"${res.name}" 스킨 추가됨 꽥!`);
});

$('skinNone').addEventListener('click', async () => {
  const now = await window.api.setActiveSkin(null);
  if (current) current.activeSkin = now;
  await renderSkins();
  toast('직접 설정으로 전환');
});

// ---- 입력 반응 ----
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

// ---- 저장 / 테스트 ----
async function save() {
  current = await window.api.saveConfig(collect());
  toast('저장됐어 꽥!');
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
