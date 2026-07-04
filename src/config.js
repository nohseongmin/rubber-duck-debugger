'use strict';
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const DEFAULTS = {
  character: { type: 'emoji', emoji: '🦆', imagePath: null, size: 110 },
  phrases: [
    '꽥!',
    '꽥꽥!',
    '한 줄씩 설명해봐',
    '그래서 그 변수가 뭐라고?',
    '거기서 진짜 그 값이 맞아?',
    '버그… 방금 찾았지?'
  ],
  sound: { type: 'synth', filePath: null, volume: 0.6 },
  bubbleDuration: 2200,
  alwaysOnTop: true,
  position: null // {x, y} 또는 null(=우하단 기본 위치)
};

function configPath() {
  return path.join(app.getPath('userData'), 'config.json');
}

// 기본값 위에 사용자 설정을 얕게/깊게 병합 (배열은 통째로 교체)
function deepMerge(base, over) {
  if (over === null || over === undefined) return clone(base);
  if (Array.isArray(base) || typeof base !== 'object') {
    return over;
  }
  const out = { ...base };
  for (const k of Object.keys(over)) {
    if (
      over[k] && typeof over[k] === 'object' && !Array.isArray(over[k]) &&
      base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])
    ) {
      out[k] = deepMerge(base[k], over[k]);
    } else if (over[k] !== undefined) {
      out[k] = over[k];
    }
  }
  return out;
}

function clone(v) {
  return JSON.parse(JSON.stringify(v));
}

function load() {
  try {
    const raw = fs.readFileSync(configPath(), 'utf-8');
    return deepMerge(DEFAULTS, JSON.parse(raw));
  } catch (e) {
    return clone(DEFAULTS);
  }
}

function save(cfg) {
  const merged = deepMerge(DEFAULTS, cfg || {});
  try {
    fs.writeFileSync(configPath(), JSON.stringify(merged, null, 2), 'utf-8');
  } catch (e) {
    console.error('config save failed', e);
  }
  return merged;
}

module.exports = { DEFAULTS, load, save, configPath };
