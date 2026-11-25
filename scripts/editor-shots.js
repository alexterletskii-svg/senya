'use strict';
const path = require('node:path');
const fs = require('node:fs');
const { app, BrowserWindow, ipcMain } = require('electron');
const { CATALOG, validate, sanitize, examples, parseImport, serialize } = require('../src/core/blocks');

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
  ipcMain.handle('program:get', () => ({ program, catalog: JSON.parse(JSON.stringify(CATALOG)), problems: validate(program), ai: true }));
  ipcMain.handle('program:examples', () => examples());
  ipcMain.handle('program:export', (_e, name) => serialize(program, name));
  ipcMain.handle('program:import', (_e, text) => {
    const r = parseImport(text);
    if (r.ok) program = r.program;
    return r;
  });
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
  const run = (code) => win.webContents.executeJavaScript(code);
  const snap = async (name) => fs.writeFileSync(path.join(out, `${name}.png`), (await win.webContents.capturePage()).toPNG());
  await run("document.querySelector('#btn-examples').click(); 0");
  await sleep(400);
  await snap('editor-examples');
  await run("window.confirm = () => true; [...document.querySelectorAll('#menu .item')][0].click(); 0");
  await sleep(500);
  await run("document.querySelector('#btn-mode').click(); 0");
  await sleep(500);
  await snap('editor-simple');
  await run("document.querySelector('#btn-mode').click(); 0");
  const text = serialize(program, 'тест');
  await run(`(async () => { const f = new File([${JSON.stringify(text)}], 'p.json', { type: 'application/json' }); const dt = new DataTransfer(); dt.items.add(f); const inp = document.querySelector('#file'); inp.files = dt.files; inp.dispatchEvent(new Event('change')); })(); 0`);
  await sleep(600);
  console.log('status:', await run("document.querySelector('#status').textContent"));
  app.quit();
});
