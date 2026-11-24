'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('robik', {
  act: (action, payload) => ipcRenderer.send('act', action, payload),
  layout: (w, h) => ipcRenderer.send('layout', { w, h }),
  dragStart: () => ipcRenderer.send('drag', { type: 'start' }),
  dragMove: (dx, dy) => ipcRenderer.send('drag', { type: 'move', dx, dy }),
  dragEnd: () => ipcRenderer.send('drag', { type: 'end' }),
  getState: () => ipcRenderer.invoke('get-state'),
  onState: (cb) => ipcRenderer.on('state', (_e, s) => cb(s)),
  onReminder: (cb) => ipcRenderer.on('reminder', (_e, r) => cb(r)),
  onCelebrate: (cb) => ipcRenderer.on('celebrate', (_e, r) => cb(r)),
  onEyesStart: (cb) => ipcRenderer.on('eyes-start', (_e, r) => cb(r)),
});
