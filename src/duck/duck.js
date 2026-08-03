'use strict';

// The bundled character, relative to this document (src/duck/).
const BUILTIN_DUCK = '../../assets/duck.png';

// Main always sends a fully merged config, so these are just a safety net.
const FALLBACK = {
  size: 120,
  emoji: '🦆',
  phrase: 'Quack!',
  bubbleMs: 2200,
  volume: 0.6,
  bubbleBg: '#ffffff',
  bubbleText: '#222222'
};

// Idle chatter interval in seconds; never faster than floorSec.
const CHATTER = { minSec: 30, maxSec: 75, floorSec: 5 };

// The synthesized quack: a sawtooth through a bandpass, with vibrato for the buzz.
const QUACK = {
  durSec: 0.2,
  startHz: 500,
  endHz: 210,
  vibratoHz: 32,
  vibratoDepth: 45,
  filterHz: 950,
  filterQ: 5,
  attackSec: 0.02,
  silence: 0.0001 // exponentialRamp can't take 0, so this stands in for silence
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

// ---- Applying settings ----
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
    // 'image' (a file or skin) or 'default' (the bundled duck)
    const custom = ch.type === 'image' && ch.imagePath;
    // the file can change while the path stays the same, hence the cache buster
    imgEl.src = custom ? toFileUrl(ch.imagePath) + '?t=' + Date.now() : BUILTIN_DUCK;
    imgEl.style.width = size + 'px';
    imgEl.style.display = 'block';
    emojiEl.style.display = 'none';
  }

  document.body.classList.toggle('no-bob', cfg.idleBob === false);

  const bubble = cfg.bubble || {};
  bubbleEl.style.setProperty('--bubble-bg', bubble.bgColor || FALLBACK.bubbleBg);
  bubbleEl.style.color = bubble.textColor || FALLBACK.bubbleText;

  scheduleChatter(); // settings changed, so re-time the next remark
}

// ---- Sound ----
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

// ---- Bubble and quack ----
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
  void duckScaleEl.offsetWidth; // force a reflow so the animation restarts
  duckScaleEl.classList.add('squish');
}

// opts.silent skips the sound and only shows the bubble (idle chatter does this)
function quack(opts) {
  if (!(opts && opts.silent)) playQuackSound();
  showBubble();
  playSquish();
  scheduleChatter(); // it just spoke, so start counting again
}

// ---- Idle chatter ----
function scheduleChatter() {
  if (chatterTimer) { clearTimeout(chatterTimer); chatterTimer = null; }
  const idle = (cfg && cfg.idleChatter) || {};
  if (!idle.enabled) return;

  const min = Math.max(CHATTER.floorSec, idle.minSec || CHATTER.minSec);
  const max = Math.max(min, idle.maxSec || CHATTER.maxSec);
  const delayMs = (min + Math.random() * (max - min)) * 1000;

  chatterTimer = setTimeout(() => {
    if (moveMode) { scheduleChatter(); return; } // not while it's being moved
    quack({ silent: !idle.sound });
  }, delayMs);
}

// ---- From the main process ----
window.api.onConfig(applyConfig); // config with the active skin already applied
window.api.onQuack(() => quack());
window.api.onMoveMode((on) => {
  moveMode = on;
  document.body.classList.toggle('move-mode', on);
});

// ---- Interaction: left-click quacks, right-click opens the menu, move mode drags ----

// Block the browser's native image drag (it leaves a ghost trailing the cursor)
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
  } catch (_) { /* couldn't read the position; skip this drag */ }
  e.preventDefault();
});

window.addEventListener('mousemove', (e) => {
  if (moveMode) {
    // in move mode the whole window is grabbable, so leave click-through alone
    if (dragging) window.api.moveWindow(winX + (e.screenX - startSX), winY + (e.screenY - startSY));
    return;
  }
  // otherwise only the duck takes clicks; everything else falls through to the desktop
  const el = document.elementFromPoint(e.clientX, e.clientY);
  window.api.setMouseThrough(!(el && el.closest('#hotzone')));
});

window.addEventListener('mouseup', async () => {
  if (!moveMode || !dragging) return;
  dragging = false;
  try {
    const pos = await window.api.getWindowPos();
    window.api.savePosition(pos[0], pos[1]);
  } catch (_) { /* failed to save; the on-screen position is still fine */ }
});
