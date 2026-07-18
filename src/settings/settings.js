'use strict';

const $ = (id) => document.getElementById(id);
let current = null;
let hotkeys = [];           // [{ accel, action }]
let capturingRow = -1;      // 키 캡처 중인 행 index (-1 = 없음)

const HK_ACTIONS = [
  { v: 'quack', label: '꽥' },
  { v: 'next-skin', label: '다음 스킨' },
  { v: 'toggle-hide', label: '숨기기/보이기' },
  { v: 'open-settings', label: '설정 열기' }
];

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

  const ic = cfg.idleChatter || {};
  $('chatterEnabled').checked = ic.enabled !== false;
  $('chatterMin').value = ic.minSec || 30;
  $('chatterMax').value = ic.maxSec || 75;
  $('chatterSound').checked = !!ic.sound;

  hotkeys = (Array.isArray(cfg.hotkeys) ? cfg.hotkeys : [])
    .filter((h) => h && h.accel)
    .map((h) => ({ accel: h.accel, action: h.action || 'quack' }));
  capturingRow = -1;
  renderHotkeys();

  renderPreview();
}

function renderPreview() {
  const type = document.querySelector('input[name=charType]:checked').value;
  const size = parseInt($('size').value, 10) || 110;
  const p = $('preview');
  // 사용자 입력(emoji 문구·이미지 경로)을 innerHTML 로 넣으면 렌더러 XSS — 이 렌더러는
  // preload 로 IPC(api.quit/saveConfig 등)에 접근하므로 특히 위험. DOM API 로만 구성한다.
  p.textContent = '';
  if (type === 'emoji') {
    const span = document.createElement('span');
    span.style.fontSize = size + 'px';
    span.textContent = $('emoji').value || '🦆';
    p.appendChild(span);
  } else {
    // 'image'(사용자 파일) 또는 'default'(내장 오리)
    const img = document.createElement('img');
    img.style.width = size + 'px';
    img.src = (type === 'image' && $('imagePath').value)
      ? 'file://' + $('imagePath').value.replace(/\\/g, '/')
      : '../../assets/duck.png';
    p.appendChild(img);
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
    hotkeys: hotkeys.filter((h) => h.accel),
    idleChatter: {
      enabled: $('chatterEnabled').checked,
      minSec: parseInt($('chatterMin').value, 10) || 30,
      maxSec: parseInt($('chatterMax').value, 10) || 75,
      sound: $('chatterSound').checked
    },
    alwaysOnTop: $('alwaysOnTop').checked
  };
}

// ---- 단축키 리스트(키 ↔ 액션) ----
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

function renderHotkeys() {
  const list = $('hotkeyList');
  const opts = HK_ACTIONS.map((a) => `<option value="${a.v}">${a.label}</option>`).join('');
  list.innerHTML = hotkeys.map((h, i) => {
    const keyText = capturingRow === i ? '키 조합을 누르세요…' : (accelLabel(h.accel) || '미지정');
    const cls = capturingRow === i ? 'hk-key capturing' : 'hk-key';
    return `<div class="hotkey-row" data-i="${i}">
      <select class="hk-action">${opts}</select>
      <div class="${cls}" title="클릭해서 키 지정">${keyText}</div>
      <button class="hk-del" type="button" title="삭제">×</button>
    </div>`;
  }).join('');

  list.querySelectorAll('.hotkey-row').forEach((row) => {
    const i = parseInt(row.dataset.i, 10);
    row.querySelector('.hk-action').value = hotkeys[i].action;
    row.querySelector('.hk-action').addEventListener('change', (e) => { hotkeys[i].action = e.target.value; });
    row.querySelector('.hk-key').addEventListener('click', () => {
      capturingRow = capturingRow === i ? -1 : i;
      renderHotkeys();
    });
    row.querySelector('.hk-del').addEventListener('click', () => {
      hotkeys.splice(i, 1);
      if (capturingRow === i) capturingRow = -1;
      renderHotkeys();
    });
  });
}

$('hotkeyAdd').addEventListener('click', () => {
  hotkeys.push({ accel: '', action: 'quack' });
  capturingRow = hotkeys.length - 1; // 새 행 바로 캡처 대기
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
  if (!name) return;                                   // 수식키만 → 대기
  if (mods.length === 0 && name.length === 1) return;  // 단일 문자키는 수식키 필요
  if (hotkeys[capturingRow]) hotkeys[capturingRow].accel = [...mods, name].join('+');
  capturingRow = -1;
  renderHotkeys();
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

// ---- 스킨 ----
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

async function renderSkins() {
  const { skins, activeSkin } = await window.api.getSkins();
  if (current) current.activeSkin = activeSkin; // 저장 시 덮어쓰지 않도록 동기화

  const banner = $('skinBanner');
  const active = skins.find((s) => s.id === activeSkin);
  if (active) {
    banner.textContent = `스킨 "${active.name}" 적용 중 — 아래 캐릭터/소리/문구 설정은 무시됩니다.`;
    banner.hidden = false;
  } else {
    banner.hidden = true;
  }

  const grid = $('skinGrid');
  if (!skins.length) {
    grid.innerHTML = '<div class="skin-empty">설치된 스킨이 없습니다. "스킨팩 가져오기"로 .rduck 파일을 추가하세요.</div>';
    return;
  }
  grid.innerHTML = skins.map((s) => {
    const src = 'file://' + String(s.imagePath).replace(/\\/g, '/');
    const cls = s.id === activeSkin ? 'skin-card active' : 'skin-card';
    return `<div class="${cls}" data-id="${esc(s.id)}" title="${esc(s.name)}">
      <button class="sdel" data-del="${esc(s.id)}" title="삭제">×</button>
      <img class="thumb" src="${esc(src)}" alt="">
      <div class="sname">${esc(s.name)}</div>
      <div class="sauth">${esc(s.author || '')}</div>
    </div>`;
  }).join('');

  grid.querySelectorAll('.skin-card').forEach((card) => {
    card.addEventListener('click', async (e) => {
      if (e.target.classList.contains('sdel')) return; // 삭제 버튼은 별도 처리
      const id = card.dataset.id;
      const now = await window.api.setActiveSkin(id);
      if (current) current.activeSkin = now;
      await renderSkins();
      toast('스킨 적용됨 꽥!');
    });
  });
  grid.querySelectorAll('.sdel').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.dataset.del;
      await window.api.deleteSkin(id);
      await renderSkins();
      toast('스킨 삭제됨');
    });
  });
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

window.api.getConfig().then(async (cfg) => {
  fill(cfg);
  await renderSkins();
});
