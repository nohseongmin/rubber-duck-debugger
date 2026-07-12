'use strict';

// 내장 기본 캐릭터 이미지(투명 배경 고무오리). 문서 위치(src/duck/) 기준 상대경로.
const BUILTIN_DUCK = '../../assets/duck.png';

let cfg = null;
let audioCtx = null;
let bubbleTimer = null;

const duckEl = document.getElementById('duck');
const duckScaleEl = document.getElementById('duck-scale');
const imgEl = document.getElementById('duck-img');
const emojiEl = document.getElementById('duck-emoji');
const bubbleEl = document.getElementById('bubble');
const hotzone = document.getElementById('hotzone');

// ---- 설정 적용 ----
function applyConfig(c) {
  cfg = c || {};
  const ch = cfg.character || {};
  const size = ch.size || 120;
  if (ch.type === 'emoji') {
    emojiEl.textContent = ch.emoji || '🦆';
    emojiEl.style.fontSize = size + 'px';
    emojiEl.style.display = 'block';
    imgEl.style.display = 'none';
  } else {
    // 'image'(사용자 파일) 또는 'default'(내장 오리)
    const useCustom = ch.type === 'image' && ch.imagePath;
    imgEl.src = useCustom
      ? 'file://' + String(ch.imagePath).replace(/\\/g, '/') + '?t=' + Date.now()
      : BUILTIN_DUCK;
    imgEl.style.width = size + 'px';
    imgEl.style.display = 'block';
    emojiEl.style.display = 'none';
  }
}

window.api.onConfig(applyConfig);
window.api.getConfig().then(applyConfig);
window.api.onQuack(() => quack());

// ---- 소리 ----
function playSynthQuack(volume) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const ctx = audioCtx;
    if (ctx.state === 'suspended') ctx.resume();
    const now = ctx.currentTime;
    const dur = 0.2;

    const osc = ctx.createOscillator();
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(500, now);
    osc.frequency.exponentialRampToValueAtTime(210, now + dur);

    // 비브라토 → 오리 특유의 "꽥" 버즈감
    lfo.type = 'sine';
    lfo.frequency.value = 32;
    lfoGain.gain.value = 45;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);

    filter.type = 'bandpass';
    filter.frequency.value = 950;
    filter.Q.value = 5;

    const v = Math.max(0.0001, Math.min(1, volume));
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(v, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now); osc.stop(now + dur);
    lfo.start(now); lfo.stop(now + dur);
  } catch (e) {
    console.error('synth quack failed', e);
  }
}

function playCustomSound(filePath, volume) {
  try {
    const a = new Audio('file://' + String(filePath).replace(/\\/g, '/'));
    a.volume = Math.max(0, Math.min(1, volume));
    a.play().catch((err) => {
      console.error('custom sound failed, fallback to synth', err);
      playSynthQuack(volume);
    });
  } catch (e) {
    playSynthQuack(volume);
  }
}

// ---- 말풍선 + 꽥 ----
function showBubble() {
  const phrases = (cfg && Array.isArray(cfg.phrases) && cfg.phrases.length)
    ? cfg.phrases : ['꽥!'];
  bubbleEl.textContent = phrases[Math.floor(Math.random() * phrases.length)];
  bubbleEl.classList.add('show');
  if (bubbleTimer) clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(
    () => bubbleEl.classList.remove('show'),
    (cfg && cfg.bubbleDuration) || 2200
  );
}

function quack() {
  const s = (cfg && cfg.sound) || {};
  const vol = typeof s.volume === 'number' ? s.volume : 0.6;
  if (s.type === 'file' && s.filePath) playCustomSound(s.filePath, vol);
  else playSynthQuack(vol);

  showBubble();
  duckScaleEl.classList.remove('squish');
  void duckScaleEl.offsetWidth; // 리플로우 강제 → 애니메이션 재시작
  duckScaleEl.classList.add('squish');
}

// ---- 상호작용: 좌클릭=꽥 · 우클릭=메뉴 · 이동모드=드래그 ----
const moveDoneBtn = document.getElementById('move-done');

let moveMode = false;
let dragging = false;
let startSX = 0, startSY = 0;
let winX = 0, winY = 0;

// 네이티브 이미지 드래그(유체이탈 고스트) 완전 차단
window.addEventListener('dragstart', (e) => e.preventDefault());

// 일반 모드: 오리 좌클릭 → 꽥
duckEl.addEventListener('click', () => { if (!moveMode) quack(); });

// 우클릭 → 메인의 네이티브 컨텍스트 메뉴 (위치 이동 / 설정 / 닫기)
window.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  window.api.showDuckMenu();
});

// 이동 모드 진입/해제는 메인이 알려줌
window.api.onMoveMode((on) => {
  moveMode = on;
  document.body.classList.toggle('move-mode', on);
});

// 이동 모드: 완료 버튼 / Esc 로 빠져나오기
moveDoneBtn.addEventListener('click', () => window.api.exitMoveMode());
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && moveMode) window.api.exitMoveMode();
});

// 이동 모드: 아무 데나 잡고 드래그하면 창이 따라옴
window.addEventListener('mousedown', async (e) => {
  if (!moveMode || e.button !== 0) return;
  dragging = true;
  startSX = e.screenX;
  startSY = e.screenY;
  try {
    const pos = await window.api.getWindowPos();
    winX = pos[0];
    winY = pos[1];
  } catch (_) { /* noop */ }
  e.preventDefault();
});

window.addEventListener('mousemove', (e) => {
  if (moveMode) {
    if (dragging) {
      window.api.moveWindow(winX + (e.screenX - startSX), winY + (e.screenY - startSY));
    }
    return; // 이동 모드에서는 투과 토글하지 않음(창 전체가 잡힘)
  }
  // 일반 모드: 오리(hotzone) 위에서만 클릭 가능, 그 외엔 클릭 투과
  const el = document.elementFromPoint(e.clientX, e.clientY);
  const over = !!(el && el.closest('#hotzone'));
  window.api.setMouseThrough(!over);
});

window.addEventListener('mouseup', async () => {
  if (!moveMode || !dragging) return;
  dragging = false;
  try {
    const pos = await window.api.getWindowPos();
    window.api.savePosition(pos[0], pos[1]);
  } catch (_) { /* noop */ }
});
