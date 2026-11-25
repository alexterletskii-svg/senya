'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, screen, powerMonitor, globalShortcut } = require('electron');
const { Engine } = require('../core/engine');
const { Chat } = require('./ai');
const { startFocusGuard } = require('./focusGuard');
const { Runtime, CATALOG, validate, serialize, parseImport, examples } = require('../core/blocks');

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

const HOTKEY = 'CommandOrControl+Alt+S';
const SAVE_FILE = () => path.join(app.getPath('userData'), 'senya.json');

let win = null;
let tray = null;
let editorWin = null;
let runtime = null;
let engine = null;
let chat = null;
let stopGuard = () => {};
let anchor = null;
let drag = null;
let fullMode = false;
let lastSize = { w: 200, h: 240 };

const ROBOT_W = 176;
const ROBOT_H = 186;
let silent = false;
let autoHidden = false;
let lastStateJson = '';
let saveTimer = null;

function load() {
  try {
    return JSON.parse(fs.readFileSync(SAVE_FILE(), 'utf8'));
  } catch {
    return {};
  }
}

function save() {
  try {
    const file = SAVE_FILE();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file + '.tmp', JSON.stringify({ ...engine.persistable(), anchor }));
    fs.renameSync(file + '.tmp', file);
  } catch (err) {
    console.error('save failed', err);
  }
}

function saveSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 1500);
}

function defaultAnchor() {
  const wa = screen.getPrimaryDisplay().workArea;
  return { x: wa.x + wa.width - 16, y: wa.y + wa.height - 8 };
}

function clampAnchor(a, w, h) {
  const d = screen.getDisplayNearestPoint({ x: a.x - 1, y: a.y - 1 }).workArea;
  return {
    x: Math.min(Math.max(a.x, d.x + w), d.x + d.width),
    y: Math.min(Math.max(a.y, d.y + h), d.y + d.height),
  };
}

function applyBounds(w, h) {
  if (!win) return;
  lastSize = { w, h };
  if (fullMode) {
    const wa = screen.getDisplayNearestPoint({ x: anchor.x - 1, y: anchor.y - 1 }).workArea;
    win.setBounds({ x: wa.x, y: wa.y, width: wa.width, height: wa.height });
    return;
  }
  const shown = clampAnchor(anchor, w, h);
  win.setBounds({ x: shown.x - w, y: shown.y - h, width: w, height: h });
}

function setFullMode(on) {
  fullMode = Boolean(on);
  applyBounds(lastSize.w, lastSize.h);
}

function applyVisibility() {
  if (!win || win.isDestroyed()) return;
  if (silent || autoHidden) win.hide();
  else win.showInactive();
}

function createWindow(saved) {
  anchor = saved.anchor && Number.isFinite(saved.anchor.x) ? saved.anchor : defaultAnchor();
  win = new BrowserWindow({
    title: 'Сеня',
    width: 200,
    height: 240,
    x: anchor.x - 200,
    y: anchor.y - 240,
    minWidth: 1,
    minHeight: 1,
    transparent: true,
    frame: false,
    hasShadow: false,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  win.once('ready-to-show', applyVisibility);
  win.webContents.once('did-finish-load', () => setTimeout(() => engine.greet(), 500));
}

function summon() {
  silent = false;
  autoHidden = false;
  if (!win) return;
  win.show();
  win.focus();
  send('open-panel');
  refreshTray();
}

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

function startEngine(saved) {
  engine = new Engine({ saved });
  chat = new Chat();

  engine.on('state', (s) => {
    const full = { ...s, ai: chat.available, platform: process.platform };
    const json = JSON.stringify(full);
    if (json === lastStateJson) return;
    lastStateJson = json;
    send('state', full);
  });
  engine.on('reminder', (r) => send('reminder', r));
  engine.on('celebrate', (r) => send('celebrate', r));
  engine.on('eyes-start', (r) => send('eyes-start', r));
  engine.on('exercise-start', (r) => send('exercise-start', r));
  engine.on('tasks-changed', saveSoon);

  runtime = new Runtime({
    api: {
      say: (t) => engine.sayCustom(t),
      emotion: (m) => engine.setEmotion(m),
      sound: (n) => send('sound', n),
      pomodoroRunning: () => engine.pomo.phase === 'work' && engine.pomo.running,
      openTasks: () => engine.tasks.filter((t) => !t.done).length,
      isSad: () => engine.getMood() === 'sad',
      isQuiet: () => engine.isDnd(),
      exercise: () => engine.startExercise(),
      eyes: () => engine.startEyes(),
      pomoStart: () => engine.startPomodoro(),
      pomoStop: () => engine.stopPomodoro(),
      dnd: (min) => engine.setDnd(min),
      addTask: (text) => engine.addTask(text),
    },
  });
  runtime.onError = (err) => engine.sayCustom(`Ошибка в программе: ${err.message}`);
  runtime.load(engine.program);
  engine.on('program-changed', (p) => {
    runtime.stopAll();
    runtime.load(p);
    saveSoon();
  });
  engine.on('event', (name) => runtime.fire(name));
  setTimeout(() => runtime.fire('start'), 3000);

  setInterval(() => {
    try {
      engine.setIdle(powerMonitor.getSystemIdleTime());
    } catch {
    }
    engine.tick();
    runtime.tick(1);
  }, 1000);
  setInterval(save, 30000);

  let lastCursor = '';
  setInterval(() => {
    if (!win || win.isDestroyed() || !win.isVisible()) return;
    const p = screen.getCursorScreenPoint();
    const key = `${p.x},${p.y}`;
    if (key === lastCursor) return;
    lastCursor = key;
    win.webContents.send('cursor', p);
  }, 80);

  stopGuard = startFocusGuard((d) => {
    engine.setAutoDnd(d.dnd, d.reason);
    autoHidden = d.dnd && d.hide && engine.settings.autoDnd;
    applyVisibility();
  });
}

function chatContext() {
  const open = engine.tasks.filter((t) => !t.done).length;
  const s = engine.snapshot();
  return `настроение: ${s.mood}; пропущено перерывов подряд: ${s.missedBreaks}; ` +
    `Pomodoro: ${s.pomodoro.phase}; открытых дел: ${open}; перерывов сегодня: ${s.stats.breaks}`;
}

async function askAi(text) {
  send('reminder', { id: Date.now(), kind: 'chat', text: 'Думаю…', actions: [], thinking: true });
  const r = await chat.ask(text, chatContext());
  send('reminder', { id: Date.now() + 1, kind: 'chat', text: r.text, actions: [] });
}

function openEditor() {
  if (editorWin && !editorWin.isDestroyed()) {
    editorWin.show();
    editorWin.focus();
    return;
  }
  editorWin = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 760,
    minHeight: 480,
    title: 'Сеня — конструктор',
    backgroundColor: '#0c0d0b',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  editorWin.setMenuBarVisibility(false);
  editorWin.loadFile(path.join(__dirname, '..', 'renderer', 'editor.html'));
  editorWin.on('closed', () => {
    editorWin = null;
  });
}

function findRule(ruleId) {
  return runtime.rules.find((r) => r.id === ruleId);
}

function wireProgramIpc() {
  ipcMain.handle('program:get', () => ({
    program: engine.program,
    catalog: JSON.parse(JSON.stringify(CATALOG)),
    problems: validate(engine.program),
    ai: chat.available,
  }));
  ipcMain.handle('program:export', (_e, name) => serialize(engine.program, name));
  ipcMain.handle('program:import', (_e, text) => {
    const r = parseImport(text);
    if (!r.ok) return r;
    engine.setProgram(r.program);
    return { ...r, program: engine.program, problems: validate(engine.program) };
  });
  ipcMain.handle('program:examples', () => examples());
  ipcMain.handle('program:check', (_e, program) => validate(program));
  ipcMain.handle('program:save', (_e, program) => {
    engine.setProgram(program);
    return validate(engine.program);
  });
  ipcMain.handle('program:run', (_e, ruleId) => {
    const rule = findRule(ruleId);
    if (!rule) return { ok: false };
    runtime.run(rule);
    return { ok: true };
  });
  ipcMain.handle('program:stop', () => {
    runtime.stopAll();
    return { ok: true };
  });
  ipcMain.handle('program:explain', async (_e, problem) => {
    const msg = String((problem && problem.message) || '').slice(0, 300);
    const hint = String((problem && problem.hint) || '').slice(0, 300);
    const r = await chat.ask(
      `Ребёнок собирает программу для робота из блоков, как в Scratch, и получил ошибку: «${msg}» ${hint} ` +
      'Объясни простыми словами, почему так вышло и как исправить. Два-три коротких предложения.',
    );
    return r;
  });
}

function wireIpc() {
  wireProgramIpc();
  ipcMain.handle('get-state', () => ({ ...engine.snapshot(), ai: chat.available, platform: process.platform }));

  ipcMain.on('act', (_e, action, payload) => {
    if (action === 'app:quit') return app.quit();
    if (action === 'app:hide') return toggleSilent(true);
    if (action === 'editor:open') return openEditor();
    if (action === 'fullscreen') return setFullMode(payload);
    if (action === 'ai:ask') return void askAi(payload);
    if (action === 'settings:set' && payload && 'openAtLogin' in payload) {
      app.setLoginItemSettings({ openAtLogin: Boolean(payload.openAtLogin) });
    }
    engine.dispatch(action, payload);
    if (action === 'settings:set') {
      if (!engine.settings.autoDnd && autoHidden) {
        autoHidden = false;
        applyVisibility();
      }
      saveSoon();
    }
  });

  ipcMain.on('layout', (_e, { w, h }) => {
    if (drag) return;
    if (fullMode) return;
    if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
      applyBounds(Math.ceil(w), Math.ceil(h));
    }
  });

  ipcMain.on('drag', (_e, m) => {
    if (!win) return;
    if (m.type === 'start') {
      const b = win.getBounds();
      drag = { x: b.x, y: b.y, w: b.width, h: b.height };
    } else if (m.type === 'move' && drag) {
      win.setPosition(Math.round(drag.x + m.dx), Math.round(drag.y + m.dy));
    } else if (m.type === 'end' && drag) {
      const b = win.getBounds();
      anchor = clampAnchor({ x: b.x + b.width, y: b.y + b.height }, ROBOT_W, ROBOT_H);
      drag = null;
      applyBounds(lastSize.w, lastSize.h);
      saveSoon();
    }
  });
}

function toggleSilent(value) {
  silent = value;
  applyVisibility();
  refreshTray();
}

function refreshTray() {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: silent ? 'Показать Сеню' : 'Спрятать Сеню (без напоминаний)', click: () => toggleSilent(!silent) },
    { label: `Открыть меню (${HOTKEY.replace('CommandOrControl', 'Ctrl')})`, click: summon },
    { label: 'Конструктор поведения', click: openEditor },
    { type: 'separator' },
    { label: 'Не беспокоить: 30 минут', click: () => engine.setDnd(30) },
    { label: 'Не беспокоить: 1 час', click: () => engine.setDnd(60) },
    { label: 'Не беспокоить: до выключения', click: () => engine.setDnd(-1) },
    { label: 'Снова напоминать', click: () => engine.setDnd(0) },
    { type: 'separator' },
    { label: 'Pomodoro: старт', click: () => engine.startPomodoro() },
    { label: 'Pomodoro: стоп', click: () => engine.stopPomodoro() },
    { label: 'Разминка', click: () => engine.startExercise() },
    { label: 'Гимнастика для глаз', click: () => engine.startEyes() },
    { type: 'separator' },
    { label: 'Выход', click: () => app.quit() },
  ]));
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, '..', 'assets', 'tray.png')).resize({ width: 18, height: 18 });
  tray = new Tray(icon);
  tray.setToolTip('Сеня — цифровой напарник');
  tray.on('click', () => toggleSilent(!silent));
  refreshTray();
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', summon);
  app.whenReady().then(() => {
    const saved = load();
    startEngine(saved);
    wireIpc();
    createWindow(saved);
    createTray();
    if (!globalShortcut.register(HOTKEY, summon)) console.warn(`Не удалось занять ${HOTKEY}`);
  });
  app.on('before-quit', () => {
    stopGuard();
    globalShortcut.unregisterAll();
    if (engine) save();
  });
  app.on('window-all-closed', () => app.quit());
}
