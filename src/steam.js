'use strict';
/*
 * 스팀 창작마당(Workshop) 연동.
 *
 * 이 모듈은 메인 프로세스에서만 쓴다. steamworks.js 문서는 Electron 에서
 * contextIsolation 을 끄라고 안내하지만 그건 렌더러에서 직접 부를 때 이야기다.
 * 우리는 파일·설정을 전부 메인에서 처리하므로 렌더러 보안 설정을 건드리지 않는다.
 *
 * 스팀이 없거나 AppID 가 없으면 available=false 로 두고 전부 조용히 no-op 한다.
 * 앱은 스팀 없이도 지금과 똑같이 동작해야 한다.
 */
const fs = require('fs');
const path = require('path');
const skins = require('./skins');

const WORKSHOP_PREFIX = 'ws:'; // 창작마당 스킨 id = ws:<publishedFileId>
const PREVIEW_NAMES = ['preview.png', 'preview.jpg', 'preview.webp'];

let steam = null;      // steamworks.js 모듈
let client = null;     // init() 결과
let appId = null;
let lastError = null;

function appIdFromFile() {
  // 개발 중에는 프로젝트 루트의 steam_appid.txt 를 읽는다.
  // 스팀으로 배포된 빌드에는 이 파일을 넣지 않는다(클라이언트가 알려준다).
  for (const dir of [process.cwd(), path.join(__dirname, '..')]) {
    try {
      const raw = fs.readFileSync(path.join(dir, 'steam_appid.txt'), 'utf-8').trim();
      const id = parseInt(raw, 10);
      if (Number.isFinite(id) && id > 0) return id;
    } catch (e) { /* 없으면 다음 후보 */ }
  }
  const fromEnv = parseInt(process.env.RDD_STEAM_APPID || '', 10);
  return Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : null;
}

/** 스팀 초기화. 실패해도 예외를 밖으로 내보내지 않는다. */
function init() {
  appId = appIdFromFile();
  if (!appId) { lastError = 'no app id'; return false; }
  try {
    steam = require('steamworks.js');
    client = steam.init(appId);
    lastError = null;
    return true;
  } catch (e) {
    steam = null;
    client = null;
    lastError = e && e.message ? e.message : String(e);
    console.warn('[steam] not available:', lastError);
    return false;
  }
}

const isAvailable = () => !!client;

function status() {
  return { available: isAvailable(), appId, error: isAvailable() ? null : lastError };
}

const isWorkshopId = (id) => typeof id === 'string' && id.startsWith(WORKSHOP_PREFIX);

/** 구독한 창작마당 아이템을 스킨 목록으로. 검증은 로컬 스킨과 동일하게 거친다. */
function listWorkshopSkins() {
  if (!isAvailable()) return [];
  const out = [];
  try {
    for (const itemId of client.workshop.getSubscribedItems()) {
      let info = null;
      try {
        info = client.workshop.installInfo(itemId);
      } catch (e) { /* 아직 다운로드 전일 수 있다 */ }
      if (!info || !info.folder) continue;

      const skin = skins.readSkinFolder(info.folder, WORKSHOP_PREFIX + itemId.toString());
      if (skin) {
        skin.workshop = true;
        skin.publishedFileId = itemId.toString();
        out.push(skin);
      }
    }
  } catch (e) {
    console.warn('[steam] listing subscribed items failed:', e.message);
  }
  return out;
}

/** 창작마당 스킨 하나의 메타. 없으면 null */
function getWorkshopSkin(id) {
  return listWorkshopSkins().find((s) => s.id === id) || null;
}

function findPreview(dir) {
  for (const name of PREVIEW_NAMES) {
    const p = path.join(dir, name);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

/**
 * 로컬 스킨을 창작마당에 올린다.
 * 첫 게시라면 스팀이 약관 동의 페이지를 띄우라고 알려준다(needsToAcceptAgreement).
 */
async function publishSkin(localId, { visibility = 3 } = {}) {
  if (!isAvailable()) return { ok: false, error: 'Steam is not running' };

  const skin = skins.getSkin(localId);
  if (!skin) return { ok: false, error: 'skin not found' };

  try {
    const created = await client.workshop.createItem();
    const itemId = created.itemId;

    // 미리보기가 없으면 캐릭터 이미지를 쓴다(목록에서 회색 네모로 뜨는 걸 막는다)
    const preview = findPreview(skin.dir) || skin.imagePath;
    const update = {
      title: skin.name,
      description: (skin.author ? 'By ' + skin.author + '\n\n' : '')
        + 'A skin pack for Rubber Duck Debugger.',
      contentPath: skin.dir,
      previewPath: preview,
      tags: ['skin'],
      visibility
    };

    const result = await client.workshop.updateItem(itemId, update);
    return {
      ok: true,
      itemId: itemId.toString(),
      needsToAcceptAgreement: !!(result && result.needsToAcceptAgreement),
      url: 'https://steamcommunity.com/sharedfiles/filedetails/?id=' + itemId.toString()
    };
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
}

module.exports = {
  init, status, isAvailable, isWorkshopId,
  listWorkshopSkins, getWorkshopSkin, publishSkin,
  WORKSHOP_PREFIX
};
