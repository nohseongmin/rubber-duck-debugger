'use strict';

// 내장 기본 캐릭터 이미지(투명 배경 고무오리). 문서 위치(src/duck/) 기준 상대경로.
const BUILTIN_DUCK = '../../assets/duck.png';

// 메인이 항상 병합된 설정을 내려주므로 아래 값은 방어용 폴백이다.
const FALLBACK = {
  size: 120,
  emoji: '🦆',
  phrase: '꽥!',
  bubbleMs: 2200,
  volume: 0.6,
  bubbleBg: '#ffffff',
  bubbleText: '#222222'
};

// 자동 혼잣말 간격(초). 사용자가 더 짧게 넣어도 MIN_SEC 아래로는 내려가지 않는다.
const CHATTER = { minSec: 30, maxSec: 75, floorSec: 5 };

// 합성 "꽥" 파라미터 — 톱니파를 밴드패스로 깎고 비브라토로 오리 특유의 버즈감을 만든다.
const QUACK = {
  durSec: 0.2,
  startHz: 500,
  endHz: 210,
  vibratoHz: 32,
  vibratoDepth: 45,
  filterHz: 950,
  filterQ: 5,
  attackSec: 0.02,
  silence: 0.0001 // exponentialRamp 는 0 을 못 쓰므로 무음 대용값
};

const duckEl = document.getElementById('duck');
const duckScaleEl = document.getElementById('duck-scale');
const imgEl = document.getElementById('duck-img');
const emojiEl = document.getElementById('duck-emoji');
const bubbleEl = document.getElementById('bubble');
const moveDoneBtn = document.getElementById('move-done');

let cfg = null;
let audioCtx = null;
let bubbleTimer = null;
let chatterTimer = null;

let moveMode = false;
let dragging = false;
let startSX = 0, startSY = 0;
let winX = 0, winY = 0;

function toFileUrl(p) {
  return 'file://' + String(p).replace(/\\/g, '/');
}

// ---- 설정 적용 ----
function applyConfig(c) {
  cfg = c || {};
  const ch = cfg.character || {};
  const size = ch.size || FALLBACK.size;

  if (ch.type === 'emoji') {
    emojiEl.textContent = ch.emoji || FALLBACK.emoji;
    emojiEl.style.fontSize = size + 'px';
    emojiEl.style.display = 'block';
    imgEl.style.display = 'none';
  } else {
    // 'image'(사용자 파일/스킨) 또는 'default'(내장 오리)
    const custom = ch.type === 'image' && ch.imagePath;
    // 같은 경로로 파일만 바뀌는 경우가 있어 캐시버스터를 붙인다
    imgEl.src = custom ? toFileUrl(ch.imagePath) + '?t=' + Date.now() : BUILTIN_DUCK;
    imgEl.style.width = size + 'px';
    imgEl.style.display = 'block';
    emojiEl.style.display = 'none';
  }

  document.body.classList.toggle('no-bob', cfg.idleBob === false);

  const bubble = cfg.bubble || {};
  bubbleEl.style.setProperty('--bubble-bg', bubble.bgColor || FALLBACK.bubbleBg);
  bubbleEl.style.color = bubble.textColor || FALLBACK.bubbleText;

  scheduleChatter(); // 설정이 바뀌면 혼잣말 주기도 다시 잡는다
}

// ---- 소리 ----
function playSynthQuack(volume) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const ctx = audioCtx;
    if (ctx.state === 'suspended') ctx.resume();

    const now = ctx.currentTime;
    const end = now + QUACK.durSec;
    const osc = ctx.createOscillator();
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(QUACK.startHz, now);
    osc.frequency.exponentialRampToValueAtTime(QUACK.endHz, end);

    lfo.type = 'sine';
    lfo.frequency.value = QUACK.vibratoHz;
    lfoGain.gain.value = QUACK.vibratoDepth;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);

    filter.type = 'bandpass';
    filter.frequency.value = QUACK.filterHz;
    filter.Q.value = QUACK.filterQ;

    const peak = Math.max(QUACK.silence, Math.min(1, volume));
    gain.gain.setValueAtTime(QUACK.silence, now);
    gain.gain.exponentialRampToValueAtTime(peak, now + QUACK.attackSec);
    gain.gain.exponentialRampToValueAtTime(QUACK.silence, end);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now); osc.stop(end);
    lfo.start(now); lfo.stop(end);
  } catch (e) {
    console.error('synth quack failed', e);
  }
}

function playCustomSound(filePath, volume) {
  try {
    const audio = new Audio(toFileUrl(filePath));
    audio.volume = Math.max(0, Math.min(1, volume));
    audio.play().catch((err) => {
      console.error('custom sound failed, fallback to synth', err);
      playSynthQuack(volume);
    });
  } catch (e) {
    playSynthQuack(volume);
  }
}

function playQuackSound() {
  const sound = (cfg && cfg.sound) || {};
  const volume = typeof sound.volume === 'number' ? sound.volume : FALLBACK.volume;
  if (sound.type === 'file' && sound.filePath) playCustomSound(sound.filePath, volume);
  else playSynthQuack(volume);
}

// ---- 말풍선 + 꽥 ----
function showBubble() {
  const phrases = (cfg && Array.isArray(cfg.phrases) && cfg.phrases.length)
    ? cfg.phrases
    : [FALLBACK.phrase];
  bubbleEl.textContent = phrases[Math.floor(Math.random() * phrases.length)];
  bubbleEl.classList.add('show');
  if (bubbleTimer) clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(
    () => bubbleEl.classList.remove('show'),
    (cfg && cfg.bubbleDuration) || FALLBACK.bubbleMs
  );
}

function playSquish() {
  duckScaleEl.classList.remove('squish');
  void duckScaleEl.offsetWidth; // 리플로우 강제 → 애니메이션 재시작
  duckScaleEl.classList.add('squish');
}

// opts.silent = true 면 소리 없이 말풍선만(자동 혼잣말 기본 동작)
function quack(opts) {
  if (!(opts && opts.silent)) playQuackSound();
  showBubble();
  playSquish();
  scheduleChatter(); // 방금 말했으니 다음 혼잣말까지 다시 센다
}

// ---- 자동 혼잣말: 가끔 스스로 꽥 ----
function scheduleChatter() {
  if (chatterTimer) { clearTimeout(chatterTimer); chatterTimer = null; }
  const idle = (cfg && cfg.idleChatter) || {};
  if (!idle.enabled) return;

  const min = Math.max(CHATTER.floorSec, idle.minSec || CHATTER.minSec);
  const max = Math.max(min, idle.maxSec || CHATTER.maxSec);
  const delayMs = (min + Math.random() * (max - min)) * 1000;

  chatterTimer = setTimeout(() => {
    if (moveMode) { scheduleChatter(); return; } // 이동 중엔 건너뛴다
    quack({ silent: !idle.sound });
  }, delayMs);
}

// ---- 메인 → 렌더러 ----
window.api.onConfig(applyConfig); // 활성 스킨이 반영된 effective config
window.api.onQuack(() => quack());
window.api.onMoveMode((on) => {
  moveMode = on;
  document.body.classList.toggle('move-mode', on);
});

// ---- 상호작용: 좌클릭=꽥 · 우클릭=메뉴 · 이동모드=드래그 ----

// 네이티브 이미지 드래그(반투명 고스트가 따라붙는 현상) 차단
window.addEventListener('dragstart', (e) => e.preventDefault());

duckEl.addEventListener('click', () => { if (!moveMode) quack(); });

window.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  window.api.showDuckMenu();
});

moveDoneBtn.addEventListener('click', () => window.api.exitMoveMode());
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && moveMode) window.api.exitMoveMode();
});

window.addEventListener('mousedown', async (e) => {
  if (!moveMode || e.button !== 0) return;
  dragging = true;
  startSX = e.screenX;
  startSY = e.screenY;
  try {
    const pos = await window.api.getWindowPos();
    winX = pos[0];
    winY = pos[1];
  } catch (_) { /* 위치를 못 읽으면 이번 드래그만 포기 */ }
  e.preventDefault();
});

window.addEventListener('mousemove', (e) => {
  if (moveMode) {
    // 이동 모드에선 창 전체가 잡히므로 투과 토글을 하지 않는다
    if (dragging) window.api.moveWindow(winX + (e.screenX - startSX), winY + (e.screenY - startSY));
    return;
  }
  // 평소엔 오리 위에서만 클릭을 받고, 나머지 영역은 바탕화면으로 통과시킨다
  const el = document.elementFromPoint(e.clientX, e.clientY);
  window.api.setMouseThrough(!(el && el.closest('#hotzone')));
});

window.addEventListener('mouseup', async () => {
  if (!moveMode || !dragging) return;
  dragging = false;
  try {
    const pos = await window.api.getWindowPos();
    window.api.savePosition(pos[0], pos[1]);
  } catch (_) { /* 저장 실패해도 화면상 위치는 그대로 */ }
});
