'use strict';
/*
 * Importing, validating and managing skin packs (.rduck / .zip).
 *
 * A skin is pure assets — nothing inside a pack is ever executed. We only unpack
 * allowlisted files, after checking their paths, sizes and the manifest, into
 * userData/skins/<id>/.
 */
const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const AdmZip = require('adm-zip');

// ---- Limits that keep a hostile archive in check ----
const MAX_ENTRIES = 60;
const MAX_FILE_BYTES = 10 * 1024 * 1024;   // per file
const MAX_TOTAL_BYTES = 30 * 1024 * 1024;  // per pack
const IMAGE_EXT = ['png', 'gif', 'apng', 'webp', 'jpg', 'jpeg', 'bmp'];
const AUDIO_EXT = ['mp3', 'wav', 'ogg', 'm4a', 'flac'];
const ALLOWED_EXT = new Set([...IMAGE_EXT, ...AUDIO_EXT, 'json']);
const SKIN_ID = /^[a-z0-9][a-z0-9-]{0,63}$/; // used as a folder name, so keep it to safe characters

function skinsDir() {
  const d = path.join(app.getPath('userData'), 'skins');
  fs.mkdirSync(d, { recursive: true });
  return d;
}

function ext(name) {
  const i = name.lastIndexOf('.');
  return i < 0 ? '' : name.slice(i + 1).toLowerCase();
}

// Normalise a zip entry name and refuse anything that escapes the target folder.
function safeRelPath(entryName) {
  const norm = entryName.replace(/\\/g, '/');
  if (norm.startsWith('/') || /^[a-zA-Z]:/.test(norm)) return null; // no absolute paths
  const parts = norm.split('/').filter((p) => p && p !== '.');
  if (parts.some((p) => p === '..')) return null;                    // no climbing out with ..
  return parts.join('/');
}

// Fall back to the default when the value isn't a number. Packs come from other
// people, so every number gets clamped to a range we can live with.
function clamp(v, lo, hi, dflt) {
  const n = Number(v);
  if (v === null || v === undefined || v === '' || !Number.isFinite(n)) return dflt;
  return Math.min(hi, Math.max(lo, n));
}

function sanitizeColor(c) {
  if (typeof c !== 'string') return null;
  if (/^#[0-9a-fA-F]{3}$/.test(c) || /^#[0-9a-fA-F]{6}$/.test(c)) return c;
  if (/^rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)$/.test(c)) return c;
  return null;
}

function normalizeManifest(m) {
  if (!m || typeof m !== 'object') throw new Error('skin.json is not a valid object');
  const id = String(m.id || '').toLowerCase();
  if (!SKIN_ID.test(id)) throw new Error('id must be 1-64 chars of lowercase letters, digits or hyphens');
  const ch = m.character || {};
  if (!ch.image || typeof ch.image !== 'string') throw new Error('character.image is required');
  const out = {
    formatVersion: 1,
    id,
    name: String(m.name || id).slice(0, 60),
    author: String(m.author || '').slice(0, 60),
    version: String(m.version || '1.0.0').slice(0, 20),
    character: { image: ch.image, size: Math.round(clamp(ch.size, 60, 400, 120)) }
  };
  if (m.sound && typeof m.sound === 'object' && m.sound.file) {
    out.sound = { file: String(m.sound.file), volume: clamp(m.sound.volume, 0, 1, 0.6) };
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

/** Import a .rduck/.zip. Returns {ok, id, name} or {ok:false, error}. */
function importSkin(zipPath) {
  let zip;
  try {
    zip = new AdmZip(zipPath);
  } catch (e) {
    return { ok: false, error: 'could not open the archive' };
  }
  const entries = zip.getEntries();
  if (entries.length === 0) return { ok: false, error: 'the archive is empty' };
  if (entries.length > MAX_ENTRIES) return { ok: false, error: 'too many files in the archive' };

  // 1) find the manifest (skin.json at the root)
  const manEntry = entries.find((e) => !e.isDirectory && safeRelPath(e.entryName) === 'skin.json');
  if (!manEntry) return { ok: false, error: 'skin.json is missing' };
  let manifest;
  try {
    manifest = normalizeManifest(JSON.parse(manEntry.getData().toString('utf-8')));
  } catch (e) {
    return { ok: false, error: 'bad manifest — ' + e.message };
  }

  // 2) pick what to unpack, checking path, extension and size. Anything else
  //    (executables, scripts, ...) is silently skipped.
  let total = 0;
  const toWrite = []; // { rel, data }
  for (const e of entries) {
    if (e.isDirectory) continue;
    const rel = safeRelPath(e.entryName);
    if (rel === null) return { ok: false, error: 'the archive contains an unsafe path' };
    if (!ALLOWED_EXT.has(ext(rel))) continue; // not an allowed extension
    const size = e.header.size;
    if (size > MAX_FILE_BYTES) return { ok: false, error: 'file is too large: ' + rel };
    total += size;
    if (total > MAX_TOTAL_BYTES) return { ok: false, error: 'the pack is too large overall' };
    toWrite.push({ rel, data: e.getData() });
  }

  // 3) the files the manifest points at must actually be in the pack
  const relSet = new Set(toWrite.map((w) => w.rel));
  const imgRel = safeRelPath(manifest.character.image);
  if (!imgRel || !relSet.has(imgRel) || !IMAGE_EXT.includes(ext(imgRel))) {
    return { ok: false, error: 'character.image was not found in the pack' };
  }
  if (manifest.sound) {
    const sRel = safeRelPath(manifest.sound.file);
    if (!sRel || !relSet.has(sRel) || !AUDIO_EXT.includes(ext(sRel))) {
      return { ok: false, error: 'sound.file was not found in the pack' };
    }
  }

  // 4) write it out, replacing any existing pack with the same id
  const dir = path.join(skinsDir(), manifest.id);
  try {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    for (const w of toWrite) {
      const target = path.resolve(dir, w.rel);
      // safeRelPath already covers this, but we check once more right before writing
      if (!target.startsWith(path.resolve(dir) + path.sep)) {
        return { ok: false, error: 'unsafe path: ' + w.rel };
      }
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, w.data);
    }
    // store the normalised manifest rather than trusting the original
    fs.writeFileSync(path.join(dir, 'skin.json'), JSON.stringify(manifest, null, 2), 'utf-8');
  } catch (e) {
    return { ok: false, error: 'install failed — ' + e.message };
  }
  return { ok: true, id: manifest.id, name: manifest.name };
}

/** Read a folder as a skin. Returns null if it isn't a valid pack. */
function readSkinFolder(dir, overrideId) {
  const manPath = path.join(dir, 'skin.json');
  if (!fs.existsSync(manPath)) return null;
  let m;
  try {
    m = normalizeManifest(JSON.parse(fs.readFileSync(manPath, 'utf-8')));
  } catch (e) {
    return null;
  }
  const imgRel = safeRelPath(m.character.image);
  const soundRel = m.sound ? safeRelPath(m.sound.file) : null;
  const imagePath = imgRel ? path.join(dir, imgRel) : null;
  if (!imagePath || !fs.existsSync(imagePath)) return null;

  return {
    id: overrideId || m.id,
    name: m.name,
    author: m.author,
    version: m.version,
    size: m.character.size,
    dir,
    imagePath,
    soundPath: soundRel ? path.join(dir, soundRel) : null,
    volume: m.sound ? m.sound.volume : null,
    phrases: m.phrases || null,
    bubble: m.bubble || null
  };
}

/** Metadata for one installed skin, with absolute paths. Null if missing. */
function getSkin(id) {
  if (!SKIN_ID.test(String(id || ''))) return null;
  return readSkinFolder(path.join(skinsDir(), id));
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
  if (!SKIN_ID.test(String(id || ''))) return false;
  try {
    fs.rmSync(path.join(skinsDir(), id), { recursive: true, force: true });
    return true;
  } catch (e) {
    return false;
  }
}

module.exports = { importSkin, listSkins, getSkin, deleteSkin, readSkinFolder, skinsDir };
