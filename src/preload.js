'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // 렌더러 → 메인 (요청/응답)
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (cfg) => ipcRenderer.invoke('save-config', cfg),
  getWindowPos: () => ipcRenderer.invoke('get-window-pos'),
  pickFile: (kind) => ipcRenderer.invoke('pick-file', kind),
  getSkins: () => ipcRenderer.invoke('get-skins'),
  importSkin: () => ipcRenderer.invoke('import-skin'),
  setActiveSkin: (id) => ipcRenderer.invoke('set-active-skin', id),
  deleteSkin: (id) => ipcRenderer.invoke('delete-skin', id),

  // 렌더러 → 메인 (단방향)
  moveWindow: (x, y) => ipcRenderer.send('move-window', x, y),
  savePosition: (x, y) => ipcRenderer.send('save-position', x, y),
  setMouseThrough: (through) => ipcRenderer.send('set-mouse-through', through),
  openSettings: () => ipcRenderer.send('open-settings'),
  testQuack: () => ipcRenderer.send('test-quack'),
  showDuckMenu: () => ipcRenderer.send('show-duck-menu'),
  exitMoveMode: () => ipcRenderer.send('exit-move-mode'),

  // 메인 → 렌더러 (구독)
  onConfig: (cb) => ipcRenderer.on('config', (_e, cfg) => cb(cfg)),
  onQuack: (cb) => ipcRenderer.on('quack', () => cb()),
  onMoveMode: (cb) => ipcRenderer.on('move-mode', (_e, on) => cb(on))
});
