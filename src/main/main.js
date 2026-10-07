'use strict';
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs/promises');
const { resolveBinaries } = require('./paths');
const ff = require('./ffmpeg');

const isDev = !app.isPackaged;

const FILTERS = {
  video: [{ name: 'Videos', extensions: ['mp4', 'mov', 'mkv'] }],
  music: [{ name: 'Audio', extensions: ['mp3', 'wav', 'm4a'] }],
};

async function versionLine(bin) {
  if (!bin) return 'not found';
  try { return (await ff.run(bin, ['-version'])).stdout.split(/\r?\n/)[0]; } catch (e) { return 'error: ' + e.message; }
}

function registerIpc() {
  ipcMain.handle('env:info', async () => {
    const bins = resolveBinaries();
    return {
      ffmpegPath: bins.ffmpeg,
      ffprobePath: bins.ffprobe,
      ffmpegVersion: await versionLine(bins.ffmpeg),
      ffprobeVersion: await versionLine(bins.ffprobe),
      electron: process.versions.electron,
      packaged: app.isPackaged,
    };
  });

  ipcMain.handle('dialog:openFiles', async (e, kind) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    const r = await dialog.showOpenDialog(win, {
      properties: ['openFile', 'multiSelections'],
      filters: FILTERS[kind] || [...FILTERS.video, ...FILTERS.music],
    });
    return r.canceled ? [] : r.filePaths;
  });

  ipcMain.handle('dialog:openFolder', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    const r = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'] });
    return r.canceled ? null : r.filePaths[0];
  });

  // Media services return { ok, value } or { ok:false, error } so the renderer can show stderr tails.
  const wrap = (fn) => async (e, ...args) => {
    try { return { ok: true, value: await fn(...args) }; } catch (err) { return { ok: false, error: String(err.message || err) }; }
  };
  ipcMain.handle('media:probe', wrap((p) => ff.probe(p)));
  ipcMain.handle('media:thumbnail', wrap((p, d) => ff.thumbnail(p, d)));
  ipcMain.handle('media:proxy', wrap((p) => ff.audioProxy(p)));
  ipcMain.handle('media:readFile', wrap(async (p) => {
    const buf = await fs.readFile(p);
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  }));
}

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
  ff.ensureTempDir();
  registerIpc();
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { app.quit(); });
app.on('will-quit', () => { ff.cleanTempDir(); });
