'use strict';
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { execFile } = require('child_process');
const { resolveBinaries } = require('./paths');

const isDev = !app.isPackaged;

function firstLine(bin) {
  return new Promise((resolve) => {
    if (!bin) return resolve('not found');
    execFile(bin, ['-version'], { windowsHide: true }, (err, stdout) => {
      if (err) return resolve('error: ' + err.message);
      resolve(String(stdout).split(/\r?\n/)[0]);
    });
  });
}

ipcMain.handle('env:info', async () => {
  const bins = resolveBinaries();
  return {
    ffmpegPath: bins.ffmpeg,
    ffprobePath: bins.ffprobe,
    ffmpegVersion: await firstLine(bins.ffmpeg),
    ffprobeVersion: await firstLine(bins.ffprobe),
    electron: process.versions.electron,
    node: process.versions.node,
    packaged: app.isPackaged,
  };
});

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#15171c',
    title: 'Bulk Video Audio Processor',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: isDev,
    },
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, '../renderer/index.html'));
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { app.quit(); });
