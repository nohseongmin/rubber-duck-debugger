'use strict';
const { app, BrowserWindow, Tray, Menu, ipcMain, dialog, screen, nativeImage, shell, globalShortcut } = require('electron');
const path = require('path');
const config = require('./config');
const skins = require('./skins');

const REPO_URL = 'https://github.com/nohseongmin/rubber-duck-debugger';

const DUCK_W = 240;
const DUCK_H = 220;
const SCREEN_MARGIN = 24;   // gap from the corner of the work area for the default position
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

// ---- Settings ----

// Overlay the active skin on the stored settings so the renderer gets something it
// can use directly. It only knows about character/sound/phrases, so the idea of a
// "skin" never leaks into it.
function effectiveConfig() {
  const cfg = config.load();
  if (!cfg.activeSkin) return cfg;

  const skin = skins.getSkin(cfg.activeSkin);
  if (!skin) {
    // the folder is gone; drop the reference so we stop looking for it
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

function sendConfigToDuck() {
  if (duckWin) duckWin.webContents.send('config', effectiveConfig());
}

// The OS is the source of truth for launch-at-login. Sync our setting from it on
// startup so the checkbox doesn't lie after someone turns it off in Windows.
function syncLaunchAtLogin() {
  const actual = app.getLoginItemSettings().openAtLogin;
  if (config.load().launchAtLogin !== actual) config.save({ launchAtLogin: actual });
}

function setActiveSkin(id) {
  const saved = config.save({ activeSkin: id || null });
  sendConfigToDuck();
  return saved.activeSkin;
}

// ---- Windows ----
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
      backgroundThrottling: false // keep the idle bob running while unfocused
    }
  });

  duckWin.setAlwaysOnTop(cfg.alwaysOnTop);
  duckWin.loadFile(path.join(__dirname, 'duck', 'index.html'));

  duckWin.webContents.on('did-finish-load', () => {
    // start click-through; the renderer asks us to turn it off over the duck
    duckWin.setIgnoreMouseEvents(true, { forward: true });
    sendConfigToDuck();
  });

  duckWin.on('closed', () => { duckWin = null; });
}

function openSettings() {
  if (settingsWin) { settingsWin.focus(); return; }
  // Release global hotkeys while settings is open, otherwise capturing a new one
  // gets swallowed. They are registered again when the window closes.
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

// ---- Actions ----
function quackNow() {
  if (duckWin) duckWin.webContents.send('quack');
}

function quitApp() {
  isQuitting = true;
  app.quit();
}

// Move mode: make the whole window grabbable and tell the renderer.
function setMoveMode(on) {
  moveMode = on;
  if (!duckWin) return;
  if (on) {
    duckWin.show(); // if it was hidden, bring it back so there is something to drag
    duckWin.setIgnoreMouseEvents(false);
    duckWin.focus(); // so it can receive Esc
  } else {
    duckWin.setIgnoreMouseEvents(true, { forward: true });
  }
  duckWin.webContents.send('move-mode', on);
}

// Cycle through the skins: own settings -> skin 1 -> skin 2 -> ...
function cycleSkin() {
  const ids = [null, ...skins.listSkins().map((s) => s.id)];
  if (ids.length <= 1) return;
  const idx = Math.max(0, ids.indexOf(config.load().activeSkin));
  setActiveSkin(ids[(idx + 1) % ids.length]);
}

// Toggle from the window's real visibility. A separate flag goes out of sync as
// soon as something else calls show(), and then the hotkey does nothing once.
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

// Register the global hotkeys listed in the settings (key combo -> action).
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

// ---- Menus ----
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
  // While settings is open, hold off re-registering so key capture keeps working
  if (!settingsWin) applyHotkeys();
  return saved;
});

ipcMain.handle('get-skins', () => ({ skins: skins.listSkins(), activeSkin: config.load().activeSkin }));
ipcMain.handle('set-active-skin', (_e, id) => setActiveSkin(id));

ipcMain.handle('import-skin', async () => {
  const file = await pickPath(FILE_FILTERS.skin);
  return file ? skins.importSkin(file) : { ok: false, canceled: true };
});

ipcMain.handle('delete-skin', (_e, id) => {
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

// ---- App lifecycle ----
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (duckWin) { duckWin.show(); duckWin.focus(); }
  });

  app.whenReady().then(() => {
    syncLaunchAtLogin();
    createDuckWindow();
    buildTray();
    applyHotkeys();
    app.on('activate', () => { if (!duckWin) createDuckWindow(); });
  });

  app.on('will-quit', () => globalShortcut.unregisterAll());

  // This lives in the tray: closing the windows must not quit it. Only Quit does.
  app.on('window-all-closed', () => {
    if (isQuitting && process.platform !== 'darwin') app.quit();
  });
}
