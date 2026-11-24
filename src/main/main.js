'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, screen, powerMonitor, globalShortcut } = require('electron');
const { Engine } = require('../core/engine');
const { Chat } = require('./ai');
const { startFocusGuard } = require('./focusGuard');

// Звуки Сени проигрываются без предварительного клика
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

const HOTKEY = 'CommandOrControl+Alt+S';
const SAVE_FILE = () => path.join(app.getPath('userData'), 'senya.json');

let win = null;
let tray = null;
let engine = null;
let chat = null;
let stopGuard = () => {};
let anchor = null; // правый-нижний угол окна в экранных координатах
let drag = null;
let silent = false; // пользователь спрятал Сеню
let autoHidden = false; // полноэкранное приложение / презентация
let lastStateJson = '';
let saveTimer = null;

// ---------- хранение ----------

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

// ---------- окно ----------

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
  anchor = clampAnchor(anchor, w, h);
  win.setBounds({ x: anchor.x - w, y: anchor.y - h, width: w, height: h });
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
  // «screen-saver» держит окно над полноэкранными приложениями на Windows/macOS
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  win.once('ready-to-show', applyVisibility);
  win.webContents.once('did-finish-load', () => setTimeout(() => engine.greet(), 500));
}

// Показать меню Сени из любого места (горячая клавиша, второй запуск)
function summon() {
  silent = false;
  autoHidden = false;
  if (!win) return;
  win.show();
  win.focus();
  send('open-panel');
  refreshTray();
}

// ---------- движок ----------

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

  setInterval(() => {
    try {
      engine.setIdle(powerMonitor.getSystemIdleTime());
    } catch {
      /* простой недоступен — считаем, что пользователь активен */
    }
    engine.tick();
  }, 1000);
  setInterval(save, 30000);

  // Позиция курсора для глаз Сени (в координатах экрана)
  let lastCursor = '';
  setInterval(() => {
    if (!win || win.isDestroyed() || !win.isVisible()) return;
    const p = screen.getCursorScreenPoint();
    const key = `${p.x},${p.y}`;
    if (key === lastCursor) return;
    lastCursor = key;
    win.webContents.send('cursor', p);
  }, 80);

  // Полноэкранные приложения, презентации и звонки (только Windows)
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

// ---------- IPC ----------

function wireIpc() {
  ipcMain.handle('get-state', () => ({ ...engine.snapshot(), ai: chat.available, platform: process.platform }));

  ipcMain.on('act', (_e, action, payload) => {
    if (action === 'app:quit') return app.quit();
    if (action === 'app:hide') return toggleSilent(true);
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
      anchor = clampAnchor({ x: b.x + b.width, y: b.y + b.height }, b.width, b.height);
      drag = null;
      applyBounds(b.width, b.height);
      saveSoon();
    }
  });
}

// ---------- трей ----------

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

// ---------- запуск ----------

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
