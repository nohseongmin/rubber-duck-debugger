'use strict';
const { app, BrowserWindow, Tray, Menu, ipcMain, dialog, screen, nativeImage, shell } = require('electron');
const path = require('path');
const config = require('./config');

const REPO_URL = 'https://github.com/nohseongmin/rubber-duck-debugger';

let duckWin = null;
let settingsWin = null;
let tray = null;
let isQuitting = false;

const DUCK_W = 240;
const DUCK_H = 220;

function createDuckWindow() {
  const cfg = config.load();
  const { workArea } = screen.getPrimaryDisplay();
  let x, y;
  if (cfg.position && Number.isFinite(cfg.position.x) && Number.isFinite(cfg.position.y)) {
    x = cfg.position.x;
    y = cfg.position.y;
  } else {
    x = workArea.x + workArea.width - DUCK_W - 24;
    y = workArea.y + workArea.height - DUCK_H - 24;
  }

  duckWin = new BrowserWindow({
    width: DUCK_W,
    height: DUCK_H,
    x, y,
    frame: false,
    transparent: true,
    resizable: false,
    hasShadow: false,
    alwaysOnTop: cfg.alwaysOnTop,
    skipTaskbar: true,
    fullscreenable: false,
    maximizable: false,
    minimizable: false,
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      autoplayPolicy: 'no-user-gesture-required'
    }
  });

  duckWin.setAlwaysOnTop(cfg.alwaysOnTop);
  duckWin.loadFile(path.join(__dirname, 'duck', 'index.html'));

  duckWin.webContents.on('did-finish-load', () => {
    // 시작은 클릭 투과(마우스가 오리 위로 오면 렌더러가 해제 요청)
    duckWin.setIgnoreMouseEvents(true, { forward: true });
    duckWin.webContents.send('config', config.load());
  });

  duckWin.on('closed', () => { duckWin = null; });
}

function openSettings() {
  if (settingsWin) { settingsWin.focus(); return; }
  settingsWin = new BrowserWindow({
    width: 480,
    height: 700,
    resizable: true,
    title: '러버덕 디버거 설정',
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  settingsWin.setMenuBarVisibility(false);
  settingsWin.loadFile(path.join(__dirname, 'settings', 'index.html'));
  settingsWin.on('closed', () => { settingsWin = null; });
}

function trayImage() {
  const p = path.join(__dirname, '..', 'assets', 'tray.png');
  const img = nativeImage.createFromPath(p);
  return img.isEmpty() ? nativeImage.createEmpty() : img;
}

function buildTray() {
  tray = new Tray(trayImage());
  const menu = Menu.buildFromTemplate([
    { label: '🦆 러버덕 디버거 (GitHub)', click: () => shell.openExternal(REPO_URL) },
    { type: 'separator' },
    { label: '꽥! 테스트', click: () => duckWin && duckWin.webContents.send('quack') },
    { label: '설정…', click: openSettings },
    { type: 'separator' },
    { label: '종료', click: () => { isQuitting = true; app.quit(); } }
  ]);
  tray.setToolTip('러버덕 디버거 — 클릭하면 꽥!');
  tray.setContextMenu(menu);
  tray.on('click', () => duckWin && duckWin.webContents.send('quack'));
}

// ---- IPC ----
ipcMain.handle('get-config', () => config.load());

ipcMain.handle('save-config', (_e, cfg) => {
  const merged = config.save(cfg);
  if (duckWin) {
    duckWin.setAlwaysOnTop(merged.alwaysOnTop);
    duckWin.webContents.send('config', merged);
  }
  return merged;
});

ipcMain.handle('get-window-pos', () => (duckWin ? duckWin.getPosition() : [0, 0]));

ipcMain.on('move-window', (_e, x, y) => {
  if (duckWin) duckWin.setPosition(Math.round(x), Math.round(y));
});

ipcMain.on('save-position', (_e, x, y) => {
  const c = config.load();
  c.position = { x: Math.round(x), y: Math.round(y) };
  config.save(c);
});

ipcMain.on('set-mouse-through', (_e, through) => {
  if (duckWin) duckWin.setIgnoreMouseEvents(!!through, { forward: true });
});

ipcMain.on('open-settings', openSettings);
ipcMain.on('test-quack', () => duckWin && duckWin.webContents.send('quack'));
ipcMain.on('quit', () => { isQuitting = true; app.quit(); });

ipcMain.handle('pick-file', async (_e, kind) => {
  const filters = kind === 'sound'
    ? [{ name: '오디오', extensions: ['mp3', 'wav', 'ogg', 'm4a', 'flac'] }]
    : [{ name: '이미지/GIF', extensions: ['png', 'gif', 'apng', 'webp', 'jpg', 'jpeg', 'bmp'] }];
  const res = await dialog.showOpenDialog(settingsWin || undefined, {
    properties: ['openFile'],
    filters
  });
  if (res.canceled || !res.filePaths.length) return null;
  return res.filePaths[0];
});

// ---- 앱 수명주기 ----
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (duckWin) { duckWin.show(); duckWin.focus(); }
  });

  app.whenReady().then(() => {
    createDuckWindow();
    buildTray();
    app.on('activate', () => { if (!duckWin) createDuckWindow(); });
  });

  // 트레이 상주 앱: 창이 다 닫혀도 종료하지 않음(트레이 '종료'로만 끝냄)
  app.on('window-all-closed', () => {
    if (isQuitting && process.platform !== 'darwin') app.quit();
  });
}
