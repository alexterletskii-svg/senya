'use strict';
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
    width: 700, height: 900, show: true, frame: false, transparent: false,
    webPreferences: { preload: path.join(__dirname, '..', 'src', 'main', 'preload.js'), contextIsolation: true, sandbox: true },
  });
  await win.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'index.html'));
  win.webContents.on('console-message', (_e, _l, msg, line) => console.log('[renderer]', msg, line));
  win.webContents.on('preload-error', (_e, f, err) => console.log('[preload-error]', err));
  await win.webContents.insertCSS('html,body{background:#c9d6e6 !important} #app{right:auto !important;left:0 !important}');

  const shot = async (name) => {
    await sleep(800);
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
    ['love', {}],
  ];
  for (const [mood, patch] of moods) {
    send('state', state({ mood, ...patch }));
    await shot(`mood-${mood}`);
  }

  const ex = (anim, title, steps) => ({ active: true, id: anim, title, steps, anim, total: 30, remainingSec: 18 });
  for (const [anim, title, steps] of [
    ['palming', 'Ладони на глаза', 'Потри ладони и прикрой ими закрытые глаза. Не дави, смотри в темноту.'],
    ['stretch', 'Потягушки', 'Встань, руки вверх, потянись макушкой к потолку.'],
  ]) {
    send('state', state({ mood: 'energetic', exercise: ex(anim, title, steps) }));
    await shot(`exercise-${anim}`);
  }
  send('state', state({ mood: 'energetic', exercise: { active: false } }));
  send('state', state({ mood: 'energetic', dnd: { active: true, auto: true, reason: 'call', manual: false, forever: false, untilMs: null } }));
  await shot('mood-quiet');
  send('state', state({ mood: 'energetic' }));
  await win.webContents.executeJavaScript("document.getElementById('robot').classList.add('drag')");
  await shot('mood-drag');
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
