'use strict';
const { app, BrowserWindow, Tray, Menu, ipcMain, dialog, screen, nativeImage, shell, globalShortcut } = require('electron');
const path = require('path');
const config = require('./config');
const skins = require('./skins');
const steam = require('./steam');

const REPO_URL = 'https://github.com/nohseongmin/rubber-duck-debugger';

const DUCK_W = 240;
const DUCK_H = 220;
const SCREEN_MARGIN = 24;   // 기본 위치를 작업영역 모서리에서 띄우는 여백
const SETTINGS_W = 480;
const SETTINGS_H = 700;

const ASSETS_DIR = path.join(__dirname, '..', 'assets');
const APP_ICON = path.join(ASSETS_DIR, 'icon.png');
const TRAY_ICON = path.join(ASSETS_DIR, 'tray.png');
const PRELOAD = path.join(__dirname, 'preload.js');

const FILE_FILTERS = {
  image: { name: 'Images & GIFs', extensions: ['png', 'gif', 'apng', 'webp', 'jpg', 'jpeg', 'bmp'] },
  sound: { name: 'Audio', extensions: ['mp3', 'wav', 'ogg', 'm4a', 'flac'] },
  skin: { name: 'Skin packs', extensions: ['rduck', 'zip'] }
};

let duckWin = null;
let settingsWin = null;
let tray = null;
let isQuitting = false;
let moveMode = false;

// ---- 설정 ----

// 저장된 설정 위에 활성 스킨을 덮어, 렌더러가 그대로 쓸 수 있는 형태로 반환한다.
// (렌더러는 character/sound/phrases 만 알면 되므로 스킨 개념이 렌더러로 새지 않는다)
function effectiveConfig() {
  const cfg = config.load();
  if (!cfg.activeSkin) return cfg;

  const skin = findSkin(cfg.activeSkin);
  if (!skin) {
    // 스킨 폴더가 사라졌으면 참조를 지운다(설정에도 반영해 다음부터 다시 찾지 않도록)
    config.save({ activeSkin: null });
    cfg.activeSkin = null;
    return cfg;
  }

  cfg.character = { type: 'image', imagePath: skin.imagePath, size: skin.size, emoji: cfg.character.emoji };
  cfg.sound = skin.soundPath
    ? { type: 'file', filePath: skin.soundPath, volume: skin.volume }
    : { type: 'synth', filePath: null, volume: cfg.sound.volume };
  if (skin.phrases) cfg.phrases = skin.phrases;
  cfg.bubble = skin.bubble || null;
  return cfg;
}

// 로컬 스킨 + 구독한 창작마당 스킨을 한 목록으로 (창작마당 id 는 'ws:' 로 구분)
function allSkins() {
  return [...skins.listSkins(), ...steam.listWorkshopSkins()];
}

function findSkin(id) {
  return steam.isWorkshopId(id) ? steam.getWorkshopSkin(id) : skins.getSkin(id);
}

function sendConfigToDuck() {
  if (duckWin) duckWin.webContents.send('config', effectiveConfig());
}

// 자동 실행은 OS 쪽이 실제 상태다. 시작할 때 설정을 OS 기준으로 맞춰,
// 사용자가 윈도우 시작프로그램에서 직접 껐을 때 체크박스가 거짓말하지 않게 한다.
function syncLaunchAtLogin() {
  const actual = app.getLoginItemSettings().openAtLogin;
  if (config.load().launchAtLogin !== actual) config.save({ launchAtLogin: actual });
}

function setActiveSkin(id) {
  const saved = config.save({ activeSkin: id || null });
  sendConfigToDuck();
  return saved.activeSkin;
}

// ---- 창 ----
function createDuckWindow() {
  const cfg = config.load();
  const { workArea } = screen.getPrimaryDisplay();
  const saved = cfg.position;
  const hasSavedPos = saved && Number.isFinite(saved.x) && Number.isFinite(saved.y);

  duckWin = new BrowserWindow({
    width: DUCK_W,
    height: DUCK_H,
    x: hasSavedPos ? saved.x : workArea.x + workArea.width - DUCK_W - SCREEN_MARGIN,
    y: hasSavedPos ? saved.y : workArea.y + workArea.height - DUCK_H - SCREEN_MARGIN,
    frame: false,
    transparent: true,
    resizable: false,
    hasShadow: false,
    alwaysOnTop: cfg.alwaysOnTop,
    skipTaskbar: true,
    fullscreenable: false,
    maximizable: false,
    minimizable: false,
    icon: APP_ICON,
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      autoplayPolicy: 'no-user-gesture-required',
      backgroundThrottling: false // 포커스 없어도 대기 부유 애니메이션 계속 재생
    }
  });

  duckWin.setAlwaysOnTop(cfg.alwaysOnTop);
  duckWin.loadFile(path.join(__dirname, 'duck', 'index.html'));

  duckWin.webContents.on('did-finish-load', () => {
    // 시작은 클릭 투과(마우스가 오리 위로 오면 렌더러가 해제 요청)
    duckWin.setIgnoreMouseEvents(true, { forward: true });
    sendConfigToDuck();
  });

  duckWin.on('closed', () => { duckWin = null; });
}

function openSettings() {
  if (settingsWin) { settingsWin.focus(); return; }
  // 설정 중에는 전역 단축키를 해제해야 단축키 캡처가 창에 정상 전달된다(창 닫힐 때 재등록).
  globalShortcut.unregisterAll();
  settingsWin = new BrowserWindow({
    width: SETTINGS_W,
    height: SETTINGS_H,
    resizable: true,
    title: 'Rubber Duck Debugger — Settings',
    icon: APP_ICON,
    webPreferences: { preload: PRELOAD, contextIsolation: true, nodeIntegration: false }
  });
  settingsWin.setMenuBarVisibility(false);
  settingsWin.loadFile(path.join(__dirname, 'settings', 'index.html'));
  settingsWin.on('closed', () => { settingsWin = null; applyHotkeys(); });
}

// ---- 액션 ----
function quackNow() {
  if (duckWin) duckWin.webContents.send('quack');
}

function quitApp() {
  isQuitting = true;
  app.quit();
}

// 위치 이동 모드: 창 전체를 잡을 수 있게 하고 렌더러에 알린다
function setMoveMode(on) {
  moveMode = on;
  if (!duckWin) return;
  if (on) {
    duckWin.show(); // 숨긴 상태였다면 옮길 수 있게 다시 띄운다
    duckWin.setIgnoreMouseEvents(false);
    duckWin.focus(); // Esc 입력을 받기 위해
  } else {
    duckWin.setIgnoreMouseEvents(true, { forward: true });
  }
  duckWin.webContents.send('move-mode', on);
}

// 설치된 스킨을 순환(직접 설정 → 스킨1 → 스킨2 → …)
function cycleSkin() {
  const ids = [null, ...allSkins().map((s) => s.id)];
  if (ids.length <= 1) return;
  const idx = Math.max(0, ids.indexOf(config.load().activeSkin));
  setActiveSkin(ids[(idx + 1) % ids.length]);
}

// 창의 실제 표시 상태를 기준으로 토글한다(별도 플래그를 두면 다른 경로로
// show() 된 뒤 한 번 헛도는 문제가 생긴다)
function toggleHide() {
  if (!duckWin) return;
  if (duckWin.isVisible()) duckWin.hide();
  else duckWin.show();
}

const ACTIONS = {
  'quack': quackNow,
  'next-skin': cycleSkin,
  'toggle-hide': toggleHide,
  'open-settings': openSettings
};

// 전역 단축키 등록(설정의 hotkeys 배열 기준: 키 조합 ↔ 액션)
function applyHotkeys() {
  globalShortcut.unregisterAll();
  for (const hk of config.load().hotkeys || []) {
    const run = hk && hk.accel ? ACTIONS[hk.action] : null;
    if (!run) continue;
    try {
      if (!globalShortcut.register(hk.accel, run)) {
        console.warn('hotkey registration failed (already taken?):', hk.accel);
      }
    } catch (e) {
      console.warn('invalid hotkey:', hk.accel, e.message);
    }
  }
}

// ---- 메뉴 ----
const githubItem = { label: '🦆 Rubber Duck Debugger on GitHub', click: () => shell.openExternal(REPO_URL) };

function buildTray() {
  const icon = nativeImage.createFromPath(TRAY_ICON);
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
  tray.setToolTip('Rubber Duck Debugger — click to quack');
  tray.setContextMenu(Menu.buildFromTemplate([
    githubItem,
    { type: 'separator' },
    { label: 'Test quack', click: quackNow },
    { label: 'Move', click: () => setMoveMode(true) },
    { label: 'Settings…', click: openSettings },
    { type: 'separator' },
    { label: 'Quit', click: quitApp }
  ]));
  tray.on('click', quackNow);
}

function popupDuckMenu() {
  if (!duckWin) return;
  Menu.buildFromTemplate([
    { label: moveMode ? '✓ Done moving' : 'Move', click: () => setMoveMode(!moveMode) },
    { label: 'Settings…', click: openSettings },
    { type: 'separator' },
    githubItem,
    { type: 'separator' },
    { label: 'Quit', click: quitApp }
  ]).popup({ window: duckWin });
}

async function pickPath(filter) {
  const res = await dialog.showOpenDialog(settingsWin || undefined, {
    properties: ['openFile'],
    filters: [filter]
  });
  return res.canceled || !res.filePaths.length ? null : res.filePaths[0];
}

// ---- IPC ----
ipcMain.handle('get-config', () => config.load());

ipcMain.handle('save-config', (_e, cfg) => {
  const saved = config.save(cfg);
  app.setLoginItemSettings({ openAtLogin: !!saved.launchAtLogin });
  if (duckWin) {
    duckWin.setAlwaysOnTop(saved.alwaysOnTop);
    sendConfigToDuck();
  }
  // 설정창이 열려 있는 동안엔 캡처를 위해 재등록을 미룬다(창 닫힐 때 applyHotkeys)
  if (!settingsWin) applyHotkeys();
  return saved;
});

ipcMain.handle('get-skins', () => ({
  skins: allSkins(),
  activeSkin: config.load().activeSkin,
  steam: steam.status()
}));

ipcMain.handle('publish-skin', (_e, id) => steam.publishSkin(id));
ipcMain.handle('set-active-skin', (_e, id) => setActiveSkin(id));

ipcMain.handle('import-skin', async () => {
  const file = await pickPath(FILE_FILTERS.skin);
  return file ? skins.importSkin(file) : { ok: false, canceled: true };
});

ipcMain.handle('delete-skin', (_e, id) => {
  if (steam.isWorkshopId(id)) return false; // 구독 해제는 스팀에서 한다
  const ok = skins.deleteSkin(id);
  if (config.load().activeSkin === id) setActiveSkin(null);
  return ok;
});

ipcMain.handle('pick-file', (_e, kind) => pickPath(kind === 'sound' ? FILE_FILTERS.sound : FILE_FILTERS.image));

ipcMain.handle('get-window-pos', () => (duckWin ? duckWin.getPosition() : [0, 0]));

ipcMain.on('move-window', (_e, x, y) => {
  if (duckWin) duckWin.setPosition(Math.round(x), Math.round(y));
});

ipcMain.on('save-position', (_e, x, y) => {
  config.save({ position: { x: Math.round(x), y: Math.round(y) } });
});

ipcMain.on('set-mouse-through', (_e, through) => {
  if (duckWin) duckWin.setIgnoreMouseEvents(!!through, { forward: true });
});

ipcMain.on('open-settings', openSettings);
ipcMain.on('test-quack', quackNow);
ipcMain.on('show-duck-menu', popupDuckMenu);
ipcMain.on('exit-move-mode', () => setMoveMode(false));

// ---- 앱 수명주기 ----
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (duckWin) { duckWin.show(); duckWin.focus(); }
  });

  app.whenReady().then(() => {
    steam.init(); // 스팀/AppID 없으면 false, 앱은 그대로 동작
    syncLaunchAtLogin();
    createDuckWindow();
    buildTray();
    applyHotkeys();
    app.on('activate', () => { if (!duckWin) createDuckWindow(); });
  });

  app.on('will-quit', () => globalShortcut.unregisterAll());

  // 트레이 상주 앱: 창이 닫혀도 종료하지 않는다(트레이/메뉴의 '종료'로만 끝냄)
  app.on('window-all-closed', () => {
    if (isQuitting && process.platform !== 'darwin') app.quit();
  });
}
