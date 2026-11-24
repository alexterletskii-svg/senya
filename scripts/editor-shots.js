'use strict';
const path = require('node:path');
const fs = require('node:fs');
const { app, BrowserWindow, ipcMain } = require('electron');
const { CATALOG, validate, sanitize } = require('../src/core/blocks');

const out = path.resolve(process.env.SHOTS_DIR || 'shots');
fs.mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let program = sanitize({
  rules: [
    { id: 'r1', event: { type: 'click', params: {} }, body: [
      { id: 'a', type: 'say', params: { text: 'Ой, щекотно!' } },
      { id: 'b', type: 'emotion', params: { mood: 'happy' } },
      { id: 'c', type: 'say', params: { text: '' } },
    ] },
    { id: 'r2', event: { type: 'every', params: { min: 20 } }, body: [
      { id: 'i', type: 'if', params: { cond: 'pomodoro' }, children: [
        { id: 'd', type: 'say', params: { text: 'Держись!' } },
      ] },
      { id: 'rp', type: 'repeat', params: { times: 8 }, children: [{ id: 'e', type: 'sound', params: { name: 'happy' } }] },
    ] },
  ],
});

app.whenReady().then(async () => {
  ipcMain.handle('program:get', () => ({ program, catalog: CATALOG, problems: validate(program), ai: true }));
  ipcMain.handle('program:check', (_e, p) => validate(p));
  ipcMain.handle('program:save', (_e, p) => { program = sanitize(p); return validate(program); });
  ipcMain.handle('program:run', () => ({ ok: true }));
  ipcMain.handle('program:stop', () => ({ ok: true }));
  ipcMain.handle('program:explain', () => ({ ok: true, text: 'Блок «Сказать» пустой: впиши в него слова.' }));

  const win = new BrowserWindow({
    width: 1000, height: 700, show: true,
    webPreferences: { preload: path.join(__dirname, '..', 'src', 'main', 'preload.js'), contextIsolation: true, sandbox: true },
  });
  win.webContents.on('console-message', (_e, _l, msg, line) => console.log('[renderer]', msg, line));
  await win.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'editor.html'));
  await sleep(900);
  fs.writeFileSync(path.join(out, 'editor.png'), (await win.webContents.capturePage()).toPNG());
  await win.webContents.executeJavaScript("document.querySelector('.problem button').click()");
  await sleep(700);
  fs.writeFileSync(path.join(out, 'editor-ask.png'), (await win.webContents.capturePage()).toPNG());
  app.quit();
});
