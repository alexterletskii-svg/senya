'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, screen, powerMonitor } = require('electron');
const { Engine } = require('../core/engine');

const SAVE_FILE = () => path.join(app.getPath('userData'), 'robik.json');

let win = null;
let tray = null;
let engine = null;
let anchor = null; // правый-нижний угол окна в экранных координатах
let drag = null;
let silent = false;
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

function createWindow(saved) {
  anchor = saved.anchor && Number.isFinite(saved.anchor.x) ? saved.anchor : defaultAnchor();
  win = new BrowserWindow({
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
  win.once('ready-to-show', () => win.showInactive());
  win.webContents.once('did-finish-load', () => setTimeout(() => engine.greet(), 500));
}

// ---------- движок ----------

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

function startEngine(saved) {
  engine = new Engine({ saved });
  engine.on('state', (s) => {
    const json = JSON.stringify(s);
    if (json === lastStateJson) return;
    lastStateJson = json;
    send('state', s);
  });
  engine.on('reminder', (r) => {
    if (!silent) send('reminder', r);
  });
  engine.on('celebrate', (r) => send('celebrate', r));
  engine.on('eyes-start', (r) => send('eyes-start', r));
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
}

// ---------- IPC ----------

function wireIpc() {
  ipcMain.handle('get-state', () => engine.snapshot());

  ipcMain.on('act', (_e, action, payload) => {
    if (action === 'app:quit') return app.quit();
    if (action === 'app:hide') return toggleSilent(true);
    if (action === 'settings:set' && payload && 'openAtLogin' in payload) {
      app.setLoginItemSettings({ openAtLogin: Boolean(payload.openAtLogin) });
    }
    engine.dispatch(action, payload);
    if (action === 'settings:set') saveSoon();
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
  if (win) (silent ? win.hide() : win.showInactive());
  refreshTray();
}

function refreshTray() {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: silent ? 'Показать Робика' : 'Спрятать Робика (без напоминаний)', click: () => toggleSilent(!silent) },
    { type: 'separator' },
    { label: 'Pomodoro: старт', click: () => engine.startPomodoro() },
    { label: 'Pomodoro: стоп', click: () => engine.stopPomodoro() },
    { label: 'Гимнастика для глаз', click: () => engine.startEyes() },
    { type: 'separator' },
    { label: 'Выход', click: () => app.quit() },
  ]));
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, '..', 'assets', 'tray.png')).resize({ width: 18, height: 18 });
  tray = new Tray(icon);
  tray.setToolTip('Робик — цифровой напарник');
  tray.on('click', () => toggleSilent(!silent));
  refreshTray();
}

// ---------- запуск ----------

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (silent) toggleSilent(false);
  });
  app.whenReady().then(() => {
    const saved = load();
    startEngine(saved);
    wireIpc();
    createWindow(saved);
    createTray();
  });
  app.on('before-quit', () => {
    if (engine) save();
  });
  app.on('window-all-closed', () => app.quit());
}
