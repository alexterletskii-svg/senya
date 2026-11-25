'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('senya', {
  act: (action, payload) => ipcRenderer.send('act', action, payload),
  layout: (w, h) => ipcRenderer.send('layout', { w, h }),
  dragStart: () => ipcRenderer.send('drag', { type: 'start' }),
  dragMove: (dx, dy) => ipcRenderer.send('drag', { type: 'move', dx, dy }),
  dragEnd: () => ipcRenderer.send('drag', { type: 'end' }),
  getState: () => ipcRenderer.invoke('get-state'),
  onState: (cb) => ipcRenderer.on('state', (_e, s) => cb(s)),
  onReminder: (cb) => ipcRenderer.on('reminder', (_e, r) => cb(r)),
  onCelebrate: (cb) => ipcRenderer.on('celebrate', (_e, r) => cb(r)),
  onCursor: (cb) => ipcRenderer.on('cursor', (_e, p) => cb(p)),
  onEyesStart: (cb) => ipcRenderer.on('eyes-start', (_e, r) => cb(r)),
  onExerciseStart: (cb) => ipcRenderer.on('exercise-start', (_e, r) => cb(r)),
  onOpenPanel: (cb) => ipcRenderer.on('open-panel', () => cb()),
  onSound: (cb) => ipcRenderer.on('sound', (_e, name) => cb(name)),
  program: {
    get: () => ipcRenderer.invoke('program:get'),
    save: (program) => ipcRenderer.invoke('program:save', program),
    check: (program) => ipcRenderer.invoke('program:check', program),
    run: (ruleId) => ipcRenderer.invoke('program:run', ruleId),
    stop: () => ipcRenderer.invoke('program:stop'),
    explain: (problem) => ipcRenderer.invoke('program:explain', problem),
    export: (name) => ipcRenderer.invoke('program:export', name),
    import: (text) => ipcRenderer.invoke('program:import', text),
    examples: () => ipcRenderer.invoke('program:examples'),
  },
});
