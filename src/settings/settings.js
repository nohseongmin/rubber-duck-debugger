'use strict';

const $ = (id) => document.getElementById(id);
let current = null;
let hotkeyAccel = '';       // 저장용 Electron accelerator 문자열
let capturingHotkey = false;

// 표시용: 'CommandOrControl' → 'Ctrl'
function accelLabel(accel) {
  return accel ? accel.replace('CommandOrControl', 'Ctrl') : '';
}

function fill(cfg) {
  current = cfg;
  const ch = cfg.character || {};
  const charType = ['default', 'emoji', 'image'].includes(ch.type) ? ch.type : 'default';
  document.querySelector(`input[name=charType][value=${charType}]`).checked = true;
  $('emoji').value = ch.emoji || '🦆';
  $('imagePath').value = ch.imagePath || '';
  $('size').value = ch.size || 110;
  $('sizeVal').textContent = $('size').value + 'px';

  $('phrases').value = (cfg.phrases || []).join('\n');
  $('bubbleDuration').value = cfg.bubbleDuration || 2200;

  const s = cfg.sound || {};
  const soundType = s.type === 'file' ? 'file' : 'synth';
  document.querySelector(`input[name=soundType][value=${soundType}]`).checked = true;
  $('soundPath').value = s.filePath || '';
  const vol = typeof s.volume === 'number' ? s.volume : 0.6;
  $('volume').value = vol;
  $('volVal').textContent = Math.round(vol * 100) + '%';

  $('alwaysOnTop').checked = cfg.alwaysOnTop !== false;

  hotkeyAccel = cfg.hotkey || '';
  $('hotkey').value = accelLabel(hotkeyAccel);
  capturingHotkey = false;
  $('hotkey').classList.remove('capturing');

  renderPreview();
}

function renderPreview() {
  const type = document.querySelector('input[name=charType]:checked').value;
  const size = $('size').value;
  const p = $('preview');
  if (type === 'image' && $('imagePath').value) {
    const src = 'file://' + $('imagePath').value.replace(/\\/g, '/');
    p.innerHTML = `<img src="${src}" style="width:${size}px">`;
  } else if (type === 'emoji') {
    const emoji = $('emoji').value || '🦆';
    p.innerHTML = `<span style="font-size:${size}px">${emoji}</span>`;
  } else {
    // 'default' → 내장 오리 이미지 (settings 문서는 src/settings/)
    p.innerHTML = `<img src="../../assets/duck.png" style="width:${size}px">`;
  }
}

function collect() {
  const type = document.querySelector('input[name=charType]:checked').value;
  const soundType = document.querySelector('input[name=soundType]:checked').value;
  return {
    ...(current || {}),
    character: {
      type,
      emoji: $('emoji').value || '🦆',
      imagePath: $('imagePath').value || null,
      size: parseInt($('size').value, 10) || 110
    },
    phrases: $('phrases').value.split('\n').map((s) => s.trim()).filter(Boolean),
    bubbleDuration: parseInt($('bubbleDuration').value, 10) || 2200,
    sound: {
      type: soundType,
      filePath: $('soundPath').value || null,
      volume: parseFloat($('volume').value)
    },
    hotkey: hotkeyAccel || null,
    alwaysOnTop: $('alwaysOnTop').checked
  };
}

// ---- 단축키 캡처 ----
function keyName(e) {
  const k = e.key;
  if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(k)) return null;
  if (k === ' ') return 'Space';
  if (k.startsWith('Arrow')) return k.slice(5); // Up/Down/Left/Right
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(k)) return k; // F1~F24
  if (k.length === 1) return k.toUpperCase();
  const named = ['Home', 'End', 'PageUp', 'PageDown', 'Insert', 'Delete', 'Backspace', 'Tab', 'Plus'];
  if (k === 'Enter') return 'Return';
  if (named.includes(k)) return k;
  return null;
}

function endCapture(accel) {
  capturingHotkey = false;
  hotkeyAccel = accel;
  $('hotkey').classList.remove('capturing');
  $('hotkey').value = accelLabel(accel);
}

$('hotkeySet').addEventListener('click', () => {
  capturingHotkey = true;
  $('hotkey').classList.add('capturing');
  $('hotkey').value = '키 조합을 누르세요…';
});
$('hotkeyClear').addEventListener('click', () => endCapture(''));

window.addEventListener('keydown', (e) => {
  if (!capturingHotkey) return;
  e.preventDefault();
  e.stopPropagation();
  if (e.key === 'Escape') { endCapture(hotkeyAccel); return; } // 취소: 이전 값 유지
  const mods = [];
  if (e.ctrlKey || e.metaKey) mods.push('CommandOrControl');
  if (e.altKey) mods.push('Alt');
  if (e.shiftKey) mods.push('Shift');
  const name = keyName(e);
  if (!name) return;                                   // 아직 수식키만 눌림 → 대기
  if (mods.length === 0 && name.length === 1) return;  // 단일 문자키는 수식키 필요
  endCapture([...mods, name].join('+'));
}, true);

// ---- 라이브 프리뷰 갱신 ----
['input', 'change'].forEach((ev) => {
  ['emoji', 'size', 'imagePath'].forEach((id) => $(id).addEventListener(ev, renderPreview));
  document.querySelectorAll('input[name=charType]')
    .forEach((el) => el.addEventListener(ev, renderPreview));
});
$('size').addEventListener('input', () => { $('sizeVal').textContent = $('size').value + 'px'; });
$('volume').addEventListener('input', () => {
  $('volVal').textContent = Math.round($('volume').value * 100) + '%';
});

// ---- 파일 선택 ----
$('pickImage').addEventListener('click', async () => {
  const p = await window.api.pickFile('image');
  if (p) {
    $('imagePath').value = p;
    document.querySelector('input[name=charType][value=image]').checked = true;
    renderPreview();
  }
});
$('pickSound').addEventListener('click', async () => {
  const p = await window.api.pickFile('sound');
  if (p) {
    $('soundPath').value = p;
    document.querySelector('input[name=soundType][value=file]').checked = true;
  }
});

// ---- 저장 / 테스트 ----
async function doSave() {
  current = await window.api.saveConfig(collect());
  toast('저장됐어 꽥!');
}
$('save').addEventListener('click', doSave);
$('test').addEventListener('click', async () => {
  await doSave();
  window.api.testQuack();
});

let toastTimer = null;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 1500);
}

window.api.getConfig().then(fill);
