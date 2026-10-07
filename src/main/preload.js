'use strict';
const { contextBridge, ipcRenderer } = require('electron');

// Minimal API surface. Extended in later tasks (see handoff.md "IPC channels").
contextBridge.exposeInMainWorld('bvape', {
  getEnvInfo: () => ipcRenderer.invoke('env:info'),
});
