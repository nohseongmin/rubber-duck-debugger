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
  idleChatter: { enabled: true, minSec: 30, maxSec: 75, sound: false }, // 가끔 스스로 꽥(기본 소리 없음)
  idleBob: true,        // 대기 중 둥실둥실 부유
  bubbleDuration: 2200,
  alwaysOnTop: true,
  launchAtLogin: false, // PC 시작 시 자동 실행(기본 꺼짐)
  // 전역 단축키: 키 조합 ↔ 액션(quack/next-skin/toggle-hide/open-settings).
  // 기본은 없음 — 다른 프로그램 단축키를 뺏지 않도록 사용자가 직접 추가한다.
  hotkeys: [],
  activeSkin: null, // 적용 중인 스킨 id (null = 직접 설정)
  position: null // {x, y} 또는 null(=우하단 기본 위치)
};

function configPath() {
  return path.join(app.getPath('userData'), 'config.json');
}

const isPlainObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

// 기본값 위에 사용자 설정을 병합한다 (배열은 통째로 교체)
function deepMerge(base, over) {
  if (over === null || over === undefined) return clone(base);
  if (!isPlainObject(base)) return over;

  const out = { ...base };
  for (const k of Object.keys(over)) {
    const value = over[k];
    if (value === undefined) continue;
    if (isPlainObject(value) && isPlainObject(base[k])) out[k] = deepMerge(base[k], value);
    // null 로 character·sound 같은 객체 기본값을 지우면 이후 접근이 터진다.
    // position·activeSkin 처럼 기본값이 null 인 필드는 이 조건에 걸리지 않는다.
    else if (value === null && isPlainObject(base[k])) continue;
    else out[k] = value;
  }
  return out;
}

function clone(v) {
  return JSON.parse(JSON.stringify(v));
}

// 구버전 마이그레이션(단일 hotkey 문자열 → hotkeys 배열)
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

// 저장된 설정 위에 patch 를 덮는다. 호출자가 바꾸려는 필드만 보내면 되고,
// 그 사이 다른 곳에서 바뀐 값(예: 드래그로 옮긴 위치)을 덮어쓰지 않는다.
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
