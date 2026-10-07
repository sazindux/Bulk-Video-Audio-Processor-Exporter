'use strict';
const { contextBridge, ipcRenderer, webUtils } = require('electron');

// Minimal, typed-by-convention API. See handoff.md "IPC channels" for payloads.
contextBridge.exposeInMainWorld('bvape', {
  getEnvInfo: () => ipcRenderer.invoke('env:info'),
  smokeFiles: () => ipcRenderer.invoke('env:smokeFiles'),

  /** File.path is gone in modern Electron; resolve dropped files here. */
  pathForFile: (file) => webUtils.getPathForFile(file),

  getPrefs: () => ipcRenderer.invoke('prefs:get'),
  setPrefs: (patch) => ipcRenderer.invoke('prefs:set', patch),

  openFiles: (kind) => ipcRenderer.invoke('dialog:openFiles', kind),
  openFolder: () => ipcRenderer.invoke('dialog:openFolder'),

  probe: (filePath) => ipcRenderer.invoke('media:probe', filePath),
  thumbnail: (filePath, duration) => ipcRenderer.invoke('media:thumbnail', filePath, duration),
  audioProxy: (filePath) => ipcRenderer.invoke('media:proxy', filePath),
  /** Returns an ArrayBuffer of the file (used to decode music / proxy audio in Web Audio). */
  readFile: (filePath) => ipcRenderer.invoke('media:readFile', filePath),
});
