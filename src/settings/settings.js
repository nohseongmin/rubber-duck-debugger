'use strict';

const $ = (id) => document.getElementById(id);
let current = null;

function fill(cfg) {
  current = cfg;
  const ch = cfg.character || {};
  document.querySelector(
    `input[name=charType][value=${ch.type === 'image' ? 'image' : 'emoji'}]`
  ).checked = true;
  $('emoji').value = ch.emoji || '🦆';
  $('imagePath').value = ch.imagePath || '';
  $('size').value = ch.size || 110;
  $('sizeVal').textContent = $('size').value + 'px';

  $('phrases').value = (cfg.phrases || []).join('\n');
  $('bubbleDuration').value = cfg.bubbleDuration || 2200;

  const s = cfg.sound || {};
  document.querySelector(
    `input[name=soundType][value=${s.type === 'file' ? 'file' : 'synth'}]`
  ).checked = true;
  $('soundPath').value = s.filePath || '';
  const vol = typeof s.volume === 'number' ? s.volume : 0.6;
  $('volume').value = vol;
  $('volVal').textContent = Math.round(vol * 100) + '%';

  $('alwaysOnTop').checked = cfg.alwaysOnTop !== false;
  renderPreview();
}

function renderPreview() {
  const type = document.querySelector('input[name=charType]:checked').value;
  const size = $('size').value;
  const p = $('preview');
  if (type === 'image' && $('imagePath').value) {
    const src = 'file://' + $('imagePath').value.replace(/\\/g, '/');
    p.innerHTML = `<img src="${src}" style="width:${size}px">`;
  } else {
    const emoji = $('emoji').value || '🦆';
    p.innerHTML = `<span style="font-size:${size}px">${emoji}</span>`;
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
    alwaysOnTop: $('alwaysOnTop').checked
  };
}

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
