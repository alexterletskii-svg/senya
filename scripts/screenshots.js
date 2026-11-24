'use strict';
// Рендерит Робика в PNG для всех состояний (визуальная проверка без запуска всего приложения).
// Запуск: SHOTS_DIR=shots xvfb-run -a npx electron --no-sandbox scripts/screenshots.js
const path = require('node:path');
const fs = require('node:fs');
const { app, BrowserWindow, ipcMain } = require('electron');
const { Engine } = require('../src/core/engine');

const out = path.resolve(process.env.SHOTS_DIR || 'shots');
fs.mkdirSync(out, { recursive: true });

const engine = new Engine({});
engine.addTask('через 20 минут позвонить маме');
engine.addTask('в 15:30 созвон по проекту');
engine.addTask('Написать отчёт');
engine.completeTask(3);
const base = engine.snapshot();
const state = (patch) => ({ ...base, ...patch });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  ipcMain.handle('get-state', () => state({ mood: 'energetic' }));
  ipcMain.on('act', () => {});
  ipcMain.on('layout', () => {});
  ipcMain.on('drag', () => {});

  const win = new BrowserWindow({
    width: 700, height: 640, show: false, frame: false, transparent: false,
    webPreferences: { preload: path.join(__dirname, '..', 'src', 'main', 'preload.js'), contextIsolation: true, sandbox: true },
  });
  await win.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'index.html'));
  await win.webContents.insertCSS('html,body{background:#c9d6e6 !important} #app{right:auto !important;left:0 !important}');

  const shot = async (name) => {
    await sleep(350);
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(out, `${name}.png`), img.toPNG());
  };
  const send = (ch, p) => win.webContents.send(ch, p);

  const moods = [
    ['energetic', {}],
    ['focused', { hardHat: true, pomodoro: { phase: 'work', running: true, remainingSec: 1234, cycle: 1 } }],
    ['sad', { missedBreaks: 3 }],
    ['happy', {}],
    ['sleeping', {}],
  ];
  for (const [mood, patch] of moods) {
    send('state', state({ mood, ...patch }));
    await shot(`mood-${mood}`);
  }

  send('state', state({ mood: 'energetic' }));
  send('reminder', { id: 1, kind: 'break', text: 'Пора размяться! Встань, потянись.', actions: [{ id: 'break:ack', label: 'Размялся ✓' }, { id: 'break:snooze', label: '+5 мин' }] });
  await shot('bubble-break');

  await win.webContents.executeJavaScript("document.getElementById('robot-wrap').dispatchEvent(new PointerEvent('pointerdown',{button:0,pointerId:1,screenX:5,screenY:5}));document.getElementById('robot-wrap').dispatchEvent(new PointerEvent('pointerup',{button:0,pointerId:1,screenX:5,screenY:5}));");
  send('state', state({ mood: 'focused', hardHat: true, pomodoro: { phase: 'work', running: true, remainingSec: 1234, cycle: 1 } }));
  await shot('panel');

  await win.webContents.executeJavaScript("document.getElementById('robot-wrap').dispatchEvent(new PointerEvent('pointerdown',{button:0,pointerId:1,screenX:5,screenY:5}));document.getElementById('robot-wrap').dispatchEvent(new PointerEvent('pointerup',{button:0,pointerId:1,screenX:5,screenY:5}));");
  send('state', state({ mood: 'energetic', eyes: { active: true, remainingSec: 14 } }));
  await shot('eyes');

  app.quit();
});
