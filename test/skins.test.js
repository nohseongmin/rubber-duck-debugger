'use strict';
/*
 * 스킨팩 임포트 보안 테스트 (의존성 없이 node로 실행: npm test)
 * 스킨은 남이 만든 파일을 여는 기능이라 보안 검증이 핵심이다.
 */
const Module = require('module');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const AdmZip = require('adm-zip');

const TEST_USERDATA = path.join(os.tmpdir(), 'rdd-skins-test-' + Date.now());
fs.mkdirSync(TEST_USERDATA, { recursive: true });

// electron 스텁(app.getPath('userData'))
const origLoad = Module._load;
Module._load = function (request) {
  if (request === 'electron') return { app: { getPath: () => TEST_USERDATA } };
  return origLoad.apply(this, arguments);
};

const skins = require('../src/skins.js');

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra !== undefined ? '  ' + JSON.stringify(extra) : '')); }
}

const tmp = (n) => path.join(TEST_USERDATA, n);
const PNG = Buffer.from('89504e470d0a1a0a', 'hex'); // PNG 시그니처(내용은 중요치 않음)

function manifest(over) {
  return JSON.stringify(Object.assign({
    formatVersion: 1, id: 'test-skin', name: 'Test', author: 'a', version: '1.0.0',
    character: { image: 'char.png', size: 130 }
  }, over || {}));
}

function makeZip(entries, file) {
  const z = new AdmZip();
  for (const [name, data] of entries) z.addFile(name, Buffer.isBuffer(data) ? data : Buffer.from(data));
  const p = tmp(file);
  z.writeZip(p);
  return p;
}

// adm-zip은 addFile 시 '../'를 벗겨내므로, 진짜 zip slip 페이로드는 로컬헤더를 직접 쓴다.
function makeSlipZip(evilName, file) {
  const files = [
    { name: 'skin.json', data: Buffer.from(manifest()) },
    { name: 'char.png', data: PNG },
    { name: evilName, data: Buffer.from('pwned') }
  ];
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const f of files) {
    const nameBuf = Buffer.from(f.name, 'utf8');
    const comp = zlib.deflateRawSync(f.data);
    const crc = zlib.crc32 ? zlib.crc32(f.data) : crc32(f.data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0, 6);
    lh.writeUInt16LE(8, 8); lh.writeUInt16LE(0, 10); lh.writeUInt16LE(0, 12);
    lh.writeUInt32LE(crc >>> 0, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(f.data.length, 22);
    lh.writeUInt16LE(nameBuf.length, 26); lh.writeUInt16LE(0, 28);
    chunks.push(lh, nameBuf, comp);
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(20, 4); cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0, 8); cd.writeUInt16LE(8, 10); cd.writeUInt16LE(0, 12); cd.writeUInt16LE(0, 14);
    cd.writeUInt32LE(crc >>> 0, 16); cd.writeUInt32LE(comp.length, 20); cd.writeUInt32LE(f.data.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28); cd.writeUInt16LE(0, 30); cd.writeUInt16LE(0, 32);
    cd.writeUInt16LE(0, 34); cd.writeUInt16LE(0, 36); cd.writeUInt32LE(0, 38); cd.writeUInt32LE(offset, 42);
    central.push(Buffer.concat([cd, nameBuf]));
    offset += lh.length + nameBuf.length + comp.length;
  }
  const cdBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8); eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(cdBuf.length, 12); eocd.writeUInt32LE(offset, 16);
  const p = tmp(file);
  fs.writeFileSync(p, Buffer.concat([...chunks, cdBuf, eocd]));
  return p;
}

// zlib.crc32은 node 20.12+ / 폴백
function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1));
  }
  return ~c >>> 0;
}

console.log('\n[1] 정상 스킨팩');
{
  const p = makeZip([['skin.json', manifest({
    phrases: ['삑!', '한 줄씩'], bubble: { textColor: '#111111', bgColor: '#ffe3f1' }
  })], ['char.png', PNG]], 'good.rduck');
  const r = skins.importSkin(p);
  check('임포트 성공', r.ok === true, r);
  const m = skins.getSkin('test-skin');
  check('메타 조회', !!m);
  check('이미지 실제 존재', m && fs.existsSync(m.imagePath));
  check('사운드 없음 → null(합성음 폴백)', m && m.soundPath === null);
  check('문구 반영', m && m.phrases && m.phrases.length === 2);
  check('말풍선 색 통과', m && m.bubble && m.bubble.bgColor === '#ffe3f1');
  check('listSkins 포함', skins.listSkins().some((s) => s.id === 'test-skin'));
}

console.log('\n[2] zip slip (경로 탈출) 거부');
{
  const p1 = makeSlipZip('../../../evil.png', 'slip1.rduck');
  const r1 = skins.importSkin(p1);
  check('상위경로(../) 거부', r1.ok === false, r1);
  check('탈출 파일 미생성', !fs.existsSync(path.resolve(TEST_USERDATA, '../../../evil.png')));

  const p2 = makeSlipZip('/abs/evil2.png', 'slip2.rduck');
  const r2 = skins.importSkin(p2);
  check('절대경로 거부', r2.ok === false, r2);
}

console.log('\n[3] 실행/스크립트 파일은 추출 안 됨');
{
  const p = makeZip([['skin.json', manifest()], ['char.png', PNG],
    ['evil.exe', 'MZ'], ['payload.js', 'alert(1)'], ['page.html', '<script>']], 'exe.rduck');
  const r = skins.importSkin(p);
  check('임포트는 성공(미허용은 스킵)', r.ok === true, r);
  const dir = path.join(TEST_USERDATA, 'skins', 'test-skin');
  check('.exe 미추출', !fs.existsSync(path.join(dir, 'evil.exe')));
  check('.js 미추출', !fs.existsSync(path.join(dir, 'payload.js')));
  check('.html 미추출', !fs.existsSync(path.join(dir, 'page.html')));
  check('이미지는 추출됨', fs.existsSync(path.join(dir, 'char.png')));
}

console.log('\n[4] 용량 폭탄 거부');
{
  const big = Buffer.alloc(11 * 1024 * 1024, 0);
  const p = makeZip([['skin.json', manifest()], ['char.png', PNG], ['big.png', big]], 'bomb.rduck');
  check('파일당 상한 초과 거부', skins.importSkin(p).ok === false);
}

console.log('\n[5] 매니페스트 검증');
{
  check('skin.json 없음 거부', skins.importSkin(makeZip([['char.png', PNG]], 'noman.rduck')).ok === false);
  check('불량 id 거부', skins.importSkin(makeZip([['skin.json', manifest({ id: '../evil' })], ['char.png', PNG]], 'badid.rduck')).ok === false);
  check('없는 이미지 참조 거부', skins.importSkin(makeZip([['skin.json', manifest({ character: { image: 'nope.png' } })], ['char.png', PNG]], 'miss.rduck')).ok === false);

  const p = makeZip([['skin.json', manifest({ bubble: { bgColor: 'red; background:url(evil)' } })], ['char.png', PNG]], 'css.rduck');
  const r = skins.importSkin(p);
  const m = r.ok ? skins.getSkin('test-skin') : null;
  check('CSS 인젝션 색상 제거', r.ok && (!m.bubble || !m.bubble.bgColor), m && m.bubble);
}

console.log('\n[6] 삭제');
{
  check('deleteSkin', skins.deleteSkin('test-skin') === true);
  check('삭제 후 목록에서 사라짐', !skins.listSkins().some((s) => s.id === 'test-skin'));
}

console.log(`\n결과: ${pass} pass / ${fail} fail\n`);
fs.rmSync(TEST_USERDATA, { recursive: true, force: true });
process.exit(fail === 0 ? 0 : 1);
