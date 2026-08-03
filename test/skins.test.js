'use strict';
/*
 * Skin pack import. Runs on plain node, no test framework.
 *
 * Importing a pack means opening a file someone else made, so most of this is
 * about what the importer refuses to do.
 */
const Module = require('module');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const AdmZip = require('adm-zip');

const TEST_USERDATA = path.join(os.tmpdir(), 'rdd-skins-test-' + Date.now());
fs.mkdirSync(TEST_USERDATA, { recursive: true });

// stub out electron's app.getPath('userData')
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
const PNG = Buffer.from('89504e470d0a1a0a', 'hex'); // a PNG header; the contents don't matter

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

// adm-zip strips '../' in addFile, so a real zip-slip payload needs the local headers written by hand.
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

// zlib.crc32 needs node 20.12+, so keep a fallback
function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1));
  }
  return ~c >>> 0;
}

console.log('\n[1] a well-formed pack');
{
  const p = makeZip([['skin.json', manifest({
    phrases: ['Squeak!', 'line by line'], bubble: { textColor: '#111111', bgColor: '#ffe3f1' }
  })], ['char.png', PNG]], 'good.rduck');
  const r = skins.importSkin(p);
  check('imports', r.ok === true, r);
  const m = skins.getSkin('test-skin');
  check('metadata reads back', !!m);
  check('the image really landed on disk', m && fs.existsSync(m.imagePath));
  check('no sound means null, so the synth quack is used', m && m.soundPath === null);
  check('phrases came through', m && m.phrases && m.phrases.length === 2);
  check('bubble colour accepted', m && m.bubble && m.bubble.bgColor === '#ffe3f1');
  check('shows up in listSkins', skins.listSkins().some((s) => s.id === 'test-skin'));
}

console.log('\n[2] rejects zip slip (paths that escape the folder)');
{
  const p1 = makeSlipZip('../../../evil.png', 'slip1.rduck');
  const r1 = skins.importSkin(p1);
  check('refuses ../', r1.ok === false, r1);
  check('nothing was written outside', !fs.existsSync(path.resolve(TEST_USERDATA, '../../../evil.png')));

  const p2 = makeSlipZip('/abs/evil2.png', 'slip2.rduck');
  const r2 = skins.importSkin(p2);
  check('refuses absolute paths', r2.ok === false, r2);
}

console.log('\n[3] never unpacks executables or scripts');
{
  const p = makeZip([['skin.json', manifest()], ['char.png', PNG],
    ['evil.exe', 'MZ'], ['payload.js', 'alert(1)'], ['page.html', '<script>']], 'exe.rduck');
  const r = skins.importSkin(p);
  check('import still succeeds, skipping what it will not take', r.ok === true, r);
  const dir = path.join(TEST_USERDATA, 'skins', 'test-skin');
  check('.exe not written', !fs.existsSync(path.join(dir, 'evil.exe')));
  check('.js not written', !fs.existsSync(path.join(dir, 'payload.js')));
  check('.html not written', !fs.existsSync(path.join(dir, 'page.html')));
  check('the image is written', fs.existsSync(path.join(dir, 'char.png')));
}

console.log('\n[4] rejects oversized payloads');
{
  const big = Buffer.alloc(11 * 1024 * 1024, 0);
  const p = makeZip([['skin.json', manifest()], ['char.png', PNG], ['big.png', big]], 'bomb.rduck');
  check('a file over the per-file limit is refused', skins.importSkin(p).ok === false);
}

console.log('\n[5] manifest validation');
{
  check('missing skin.json', skins.importSkin(makeZip([['char.png', PNG]], 'noman.rduck')).ok === false);
  check('bad id', skins.importSkin(makeZip([['skin.json', manifest({ id: '../evil' })], ['char.png', PNG]], 'badid.rduck')).ok === false);
  check('manifest points at a file that is not there', skins.importSkin(makeZip([['skin.json', manifest({ character: { image: 'nope.png' } })], ['char.png', PNG]], 'miss.rduck')).ok === false);

  const p = makeZip([['skin.json', manifest({ bubble: { bgColor: 'red; background:url(evil)' } })], ['char.png', PNG]], 'css.rduck');
  const r = skins.importSkin(p);
  const m = r.ok ? skins.getSkin('test-skin') : null;
  check('a colour that is really css gets dropped', r.ok && (!m.bubble || !m.bubble.bgColor), m && m.bubble);
}

console.log('\n[6] deleting');
{
  check('deleteSkin', skins.deleteSkin('test-skin') === true);
  check('gone from the list afterwards', !skins.listSkins().some((s) => s.id === 'test-skin'));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
fs.rmSync(TEST_USERDATA, { recursive: true, force: true });
process.exit(fail === 0 ? 0 : 1);
