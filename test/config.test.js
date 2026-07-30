'use strict';
/*
 * 설정 병합/마이그레이션 테스트 (의존성 없이 node 로 실행)
 * save() 는 저장본 위에 patch 를 덮는다 — 이걸 깨면 설정창 저장이
 * 오리 위치 같은 다른 값을 되돌려 버린다.
 */
const Module = require('module');
const fs = require('fs');
const os = require('os');
const path = require('path');

const USERDATA = path.join(os.tmpdir(), 'rdd-config-test-' + Date.now());
fs.mkdirSync(USERDATA, { recursive: true });

const origLoad = Module._load;
Module._load = function (request) {
  if (request === 'electron') return { app: { getPath: () => USERDATA } };
  return origLoad.apply(this, arguments);
};

const config = require('../src/config.js');
const CONFIG_FILE = path.join(USERDATA, 'config.json');

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra !== undefined ? '  ' + JSON.stringify(extra) : '')); }
}
const writeRaw = (obj) => fs.writeFileSync(CONFIG_FILE, JSON.stringify(obj), 'utf-8');
const reset = () => fs.rmSync(CONFIG_FILE, { force: true });

console.log('\n[1] 기본값');
{
  reset();
  const cfg = config.load();
  check('단축키 기본 없음', Array.isArray(cfg.hotkeys) && cfg.hotkeys.length === 0, cfg.hotkeys);
  check('부유 기본 켜짐', cfg.idleBob === true);
  check('자동 실행 기본 꺼짐', cfg.launchAtLogin === false);
  check('위치 기본 없음', cfg.position === null);
  check('활성 스킨 없음', cfg.activeSkin === null);
}

console.log('\n[2] save() 는 저장본 위에 patch 를 덮는다');
{
  reset();
  config.save({ position: { x: 10, y: 20 } });
  config.save({ alwaysOnTop: false }); // 위치를 건드리지 않는 저장
  const cfg = config.load();
  check('위치 유지', cfg.position && cfg.position.x === 10 && cfg.position.y === 20, cfg.position);
  check('바뀐 값 반영', cfg.alwaysOnTop === false);

  config.save({ activeSkin: 'pinky-duck' });
  config.save({ idleBob: false });
  check('활성 스킨 유지', config.load().activeSkin === 'pinky-duck');
  check('활성 스킨 해제 가능(null)', config.save({ activeSkin: null }).activeSkin === null);
}

console.log('\n[3] 부분 저장이 다른 필드를 지우지 않는다 (설정창 저장 시나리오)');
{
  reset();
  config.save({ position: { x: 5, y: 5 }, activeSkin: 'skin-a' });
  // 설정창이 보내는 payload(자기가 다루는 값만)
  config.save({
    character: { type: 'emoji', emoji: '🐤', imagePath: null, size: 150 },
    phrases: ['하나'],
    sound: { type: 'synth', filePath: null, volume: 0.3 },
    hotkeys: [{ accel: 'Alt+Q', action: 'quack' }],
    idleChatter: { enabled: false, minSec: 10, maxSec: 20, sound: true },
    alwaysOnTop: true, idleBob: true, launchAtLogin: false
  });
  const cfg = config.load();
  check('위치 살아있음', cfg.position && cfg.position.x === 5, cfg.position);
  check('활성 스킨 살아있음', cfg.activeSkin === 'skin-a', cfg.activeSkin);
  check('캐릭터 반영', cfg.character.emoji === '🐤' && cfg.character.size === 150);
  check('배열은 통째로 교체', cfg.phrases.length === 1 && cfg.hotkeys.length === 1);
}

console.log('\n[4] 손상된 설정 파일에서도 살아남는다');
{
  fs.writeFileSync(CONFIG_FILE, '{ 이건 JSON 이 아니다', 'utf-8');
  check('깨진 JSON → 기본값', config.load().idleBob === true);

  writeRaw({ character: null, sound: null }); // null 이 객체 기본값을 지우면 메인이 터진다
  const cfg = config.load();
  check('character 기본값 유지', cfg.character && typeof cfg.character === 'object', cfg.character);
  check('sound 기본값 유지', cfg.sound && typeof cfg.sound.volume === 'number', cfg.sound);
}

console.log('\n[5] 구버전 마이그레이션 (hotkey → hotkeys)');
{
  writeRaw({ hotkey: 'CommandOrControl+Alt+Q', character: { emoji: 'X' } });
  const cfg = config.load();
  check('배열로 변환', cfg.hotkeys.length === 1 && cfg.hotkeys[0].accel === 'CommandOrControl+Alt+Q', cfg.hotkeys);
  check('액션 기본 quack', cfg.hotkeys[0].action === 'quack');
  check('옛 키 제거', !('hotkey' in cfg));
  check('다른 값 보존', cfg.character.emoji === 'X');

  writeRaw({ hotkey: '' }); // 빈 문자열이면 등록 없음
  check('빈 hotkey → 빈 배열', config.load().hotkeys.length === 0);
}

console.log(`\n결과: ${pass} pass / ${fail} fail\n`);
fs.rmSync(USERDATA, { recursive: true, force: true });
process.exit(fail === 0 ? 0 : 1);
