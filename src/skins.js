'use strict';
/*
 * 스킨팩(.rduck/.zip) 임포트·검증·관리.
 * 스킨은 "순수 애셋"이다 — 코드 실행 없음. zip에서 화이트리스트 파일만,
 * 크기/경로/매니페스트를 검증한 뒤 userData/skins/<id>/ 로 추출한다.
 */
const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const AdmZip = require('adm-zip');

// ---- 보안 한계값 ----
const MAX_ENTRIES = 60;
const MAX_FILE_BYTES = 10 * 1024 * 1024;   // 파일당 10MB
const MAX_TOTAL_BYTES = 30 * 1024 * 1024;  // 총합 30MB
const IMAGE_EXT = ['png', 'gif', 'apng', 'webp', 'jpg', 'jpeg', 'bmp'];
const AUDIO_EXT = ['mp3', 'wav', 'ogg', 'm4a', 'flac'];
const ALLOWED_EXT = new Set([...IMAGE_EXT, ...AUDIO_EXT, 'json']);

function skinsDir() {
  const d = path.join(app.getPath('userData'), 'skins');
  fs.mkdirSync(d, { recursive: true });
  return d;
}

function ext(name) {
  const i = name.lastIndexOf('.');
  return i < 0 ? '' : name.slice(i + 1).toLowerCase();
}

// zip 엔트리명 정규화 + 경로 탈출 차단
function safeRelPath(entryName) {
  const norm = entryName.replace(/\\/g, '/');
  if (norm.startsWith('/') || /^[a-zA-Z]:/.test(norm)) return null; // 절대경로 거부
  const parts = norm.split('/').filter((p) => p && p !== '.');
  if (parts.some((p) => p === '..')) return null;                    // 상위 탈출 거부
  return parts.join('/');
}

function sanitizeColor(c) {
  if (typeof c !== 'string') return null;
  if (/^#[0-9a-fA-F]{3}$/.test(c) || /^#[0-9a-fA-F]{6}$/.test(c)) return c;
  if (/^rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)$/.test(c)) return c;
  return null;
}

function normalizeManifest(m) {
  if (!m || typeof m !== 'object') throw new Error('skin.json 형식 오류');
  const id = String(m.id || '').toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(id)) throw new Error('id는 소문자/숫자/하이픈(1~64자)만 허용');
  const ch = m.character || {};
  if (!ch.image || typeof ch.image !== 'string') throw new Error('character.image 필수');
  const out = {
    formatVersion: 1,
    id,
    name: String(m.name || id).slice(0, 60),
    author: String(m.author || '').slice(0, 60),
    version: String(m.version || '1.0.0').slice(0, 20),
    character: { image: ch.image, size: clampInt(ch.size, 60, 400, 120) }
  };
  if (m.sound && typeof m.sound === 'object' && m.sound.file) {
    out.sound = { file: String(m.sound.file), volume: clampNum(m.sound.volume, 0, 1, 0.6) };
  }
  if (Array.isArray(m.phrases)) {
    const ph = m.phrases.map((s) => String(s).slice(0, 120)).filter(Boolean).slice(0, 50);
    if (ph.length) out.phrases = ph;
  }
  if (m.bubble && typeof m.bubble === 'object') {
    const b = {};
    const tc = sanitizeColor(m.bubble.textColor);
    const bg = sanitizeColor(m.bubble.bgColor);
    if (tc) b.textColor = tc;
    if (bg) b.bgColor = bg;
    if (Object.keys(b).length) out.bubble = b;
  }
  return out;
}

function clampInt(v, lo, hi, dflt) {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return dflt;
  return Math.min(hi, Math.max(lo, n));
}
function clampNum(v, lo, hi, dflt) {
  const n = parseFloat(v);
  if (!Number.isFinite(n)) return dflt;
  return Math.min(hi, Math.max(lo, n));
}

// zip 경로 → 실제 저장 파일 경로(스킨 폴더 밖으로 못 나가게 검증)
function resolveInside(baseDir, rel) {
  const target = path.resolve(baseDir, rel);
  const baseResolved = path.resolve(baseDir) + path.sep;
  if (target !== path.resolve(baseDir) && !target.startsWith(baseResolved)) return null;
  return target;
}

/** .rduck/.zip 임포트. 성공 시 {ok, id, name}, 실패 시 {ok:false, error} */
function importSkin(zipPath) {
  let zip;
  try {
    zip = new AdmZip(zipPath);
  } catch (e) {
    return { ok: false, error: '압축 파일을 열 수 없습니다.' };
  }
  const entries = zip.getEntries();
  if (entries.length === 0) return { ok: false, error: '빈 파일입니다.' };
  if (entries.length > MAX_ENTRIES) return { ok: false, error: '파일이 너무 많습니다.' };

  // 1) 매니페스트 찾기(루트 skin.json)
  const manEntry = entries.find((e) => !e.isDirectory && safeRelPath(e.entryName) === 'skin.json');
  if (!manEntry) return { ok: false, error: 'skin.json이 없습니다.' };
  let manifest;
  try {
    manifest = normalizeManifest(JSON.parse(manEntry.getData().toString('utf-8')));
  } catch (e) {
    return { ok: false, error: '매니페스트 오류: ' + e.message };
  }

  // 2) 추출할 파일 선별(화이트리스트/경로/크기 검증). 실행/미허용 파일은 스킵.
  let total = 0;
  const toWrite = []; // { rel, data }
  for (const e of entries) {
    if (e.isDirectory) continue;
    const rel = safeRelPath(e.entryName);
    if (rel === null) return { ok: false, error: '허용되지 않는 경로가 있습니다.' };
    if (!ALLOWED_EXT.has(ext(rel))) continue; // 미허용 확장자는 무시(실행파일 등)
    const size = e.header.size;
    if (size > MAX_FILE_BYTES) return { ok: false, error: '파일이 너무 큽니다: ' + rel };
    total += size;
    if (total > MAX_TOTAL_BYTES) return { ok: false, error: '전체 용량이 너무 큽니다.' };
    toWrite.push({ rel, data: e.getData() });
  }

  // 3) 매니페스트가 가리키는 애셋이 실제 추출 대상에 있는지
  const relSet = new Set(toWrite.map((w) => w.rel));
  const imgRel = safeRelPath(manifest.character.image);
  if (!imgRel || !relSet.has(imgRel) || !IMAGE_EXT.includes(ext(imgRel))) {
    return { ok: false, error: 'character.image 파일을 찾을 수 없습니다.' };
  }
  if (manifest.sound) {
    const sRel = safeRelPath(manifest.sound.file);
    if (!sRel || !relSet.has(sRel) || !AUDIO_EXT.includes(ext(sRel))) {
      return { ok: false, error: 'sound.file 파일을 찾을 수 없습니다.' };
    }
  }

  // 4) 대상 폴더 준비(기존 동일 id 덮어쓰기)
  const dir = path.join(skinsDir(), manifest.id);
  try {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    for (const w of toWrite) {
      const target = resolveInside(dir, w.rel);
      if (!target) return { ok: false, error: '경로 검증 실패: ' + w.rel };
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, w.data);
    }
    // 정규화된 매니페스트를 저장(원본 신뢰 안 함)
    fs.writeFileSync(path.join(dir, 'skin.json'), JSON.stringify(manifest, null, 2), 'utf-8');
  } catch (e) {
    return { ok: false, error: '설치 실패: ' + e.message };
  }
  return { ok: true, id: manifest.id, name: manifest.name };
}

/** 스킨 하나의 메타(절대경로 포함). 없으면 null */
function getSkin(id) {
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(String(id || ''))) return null;
  const dir = path.join(skinsDir(), id);
  const manPath = path.join(dir, 'skin.json');
  if (!fs.existsSync(manPath)) return null;
  let m;
  try {
    m = normalizeManifest(JSON.parse(fs.readFileSync(manPath, 'utf-8')));
  } catch (e) {
    return null;
  }
  const imgRel = safeRelPath(m.character.image);
  const meta = {
    id: m.id,
    name: m.name,
    author: m.author,
    version: m.version,
    size: m.character.size,
    imagePath: imgRel ? path.join(dir, imgRel) : null,
    soundPath: m.sound ? path.join(dir, safeRelPath(m.sound.file)) : null,
    volume: m.sound ? m.sound.volume : null,
    phrases: m.phrases || null,
    bubble: m.bubble || null
  };
  if (!meta.imagePath || !fs.existsSync(meta.imagePath)) return null;
  return meta;
}

function listSkins() {
  const base = skinsDir();
  let dirs = [];
  try {
    dirs = fs.readdirSync(base, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  } catch (e) { /* noop */ }
  return dirs.map(getSkin).filter(Boolean);
}

function deleteSkin(id) {
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(String(id || ''))) return false;
  try {
    fs.rmSync(path.join(skinsDir(), id), { recursive: true, force: true });
    return true;
  } catch (e) {
    return false;
  }
}

module.exports = { importSkin, listSkins, getSkin, deleteSkin, skinsDir };
