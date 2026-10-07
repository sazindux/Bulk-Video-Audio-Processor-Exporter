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
  /** Folder picker -> string path or null (never the raw dialog result). */
  pickFolder: () => ipcRenderer.invoke('dialog:openFolder'),

  probe: (filePath) => ipcRenderer.invoke('media:probe', filePath),
  thumbnail: (filePath, duration) => ipcRenderer.invoke('media:thumbnail', filePath, duration),
  audioProxy: (filePath) => ipcRenderer.invoke('media:proxy', filePath),
  /** Returns an ArrayBuffer of the file (used to decode music / proxy audio in Web Audio). */
  readFile: (filePath) => ipcRenderer.invoke('media:readFile', filePath),

  /** Export queue. Events: 'export:progress' {id, progress}, 'export:item' {id, status, error?, outputPath?, verification?}, 'export:done' {ok, failed, cancelled, total}. */
  startExport: (payload) => ipcRenderer.invoke('export:start', payload),
  cancelExport: () => ipcRenderer.invoke('export:cancel'),
  onExportEvent: (cb) => {
    const chans = ['export:progress', 'export:item', 'export:done'];
    const handlers = chans.map((ch) => { const h = (e, data) => cb(ch, data); ipcRenderer.on(ch, h); return [ch, h]; });
    return () => handlers.forEach(([ch, h]) => ipcRenderer.removeListener(ch, h));
  },
  /** Open a folder in Explorer. Distinct name from pickFolder (a duplicate key used to shadow the picker). */
  openPath: (dir) => ipcRenderer.invoke('shell:openPath', dir),
});
