'use strict';

const EventEmitter = require('node:events');
const { pick } = require('./phrases');
const { parseTask, nextDue, repeatLabel } = require('./taskParser');
const { getExercise, pickExercise } = require('./exercises');

const DEFAULT_SETTINGS = {
  breakEveryMin: 30,
  eyesEveryMin: 20,
  waterEveryMin: 45,
  postureEveryMin: 35,
  breakEnabled: true,
  eyesEnabled: true,
  waterEnabled: true,
  postureEnabled: true,
  workMin: 25,
  shortBreakMin: 5,
  longBreakMin: 15,
  cyclesBeforeLong: 4,
  idleSleepMin: 3,
  idleBreakMin: 5,
  dailyGoal: 6,
  sound: true,
  volume: 60,
  autoDnd: true,
  openAtLogin: false,
  panelAutoCloseSec: 4,
};

const MIN_SETTING = { panelAutoCloseSec: 0 };

const EYES_SECONDS = 20;
const HAPPY_MS = 5000;
const LOVE_MS = 5000;
const AWAKE_ON_TOUCH_MS = 20000;
const AWAKE_ON_ALERT_MS = 12000;
const MAX_TICK_SEC = 5;
const SNOOZE_BREAK_MIN = 5;
const MISSED_FOR_SAD = 3;
const HISTORY_DAYS = 90;

const REMINDER_KINDS = [
  ['break', 'breakEveryMin', 'breakEnabled'],
  ['eyes', 'eyesEveryMin', 'eyesEnabled'],
  ['water', 'waterEveryMin', 'waterEnabled'],
  ['posture', 'postureEveryMin', 'postureEnabled'],
];

const pad2 = (n) => String(n).padStart(2, '0');
const dayKey = (ms) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};
const emptyDay = (date) => ({
  date, breaks: 0, pomodoros: 0, tasks: 0, exercises: 0, activeMin: 0, goalReached: false,
});

class Engine extends EventEmitter {
  constructor({ now = Date.now, rng = Math.random, saved = {} } = {}) {
    super();
    this._now = now;
    this._rng = rng;
    this.settings = { ...DEFAULT_SETTINGS, ...(saved.settings || {}) };
    this.tasks = Array.isArray(saved.tasks) ? saved.tasks.map((t) => ({ ...t })) : [];
    this._nextTaskId = this.tasks.reduce((m, t) => Math.max(m, t.id), 0) + 1;

    const t = this._now();
    this._last = t;
    this._acc = { break: 0, eyes: 0, water: 0, posture: 0 };
    this._breakPending = false;
    this.missedBreaks = 0;
    this._idleSec = 0;
    this._lastIdle = 0;
    this._sleeping = false;
    this._happyUntil = 0;
    this._loveUntil = 0;
    this._awakeUntil = 0;
    this._reminderSeq = 1;
    this._activeAcc = 0;
    this._dndUntil = 0;
    this._autoDnd = false;
    this._autoReason = '';

    this.pomo = { phase: 'idle', running: false, remainingSec: 0, cycle: 0 };
    this.eyes = { active: false, remainingSec: 0 };
    this.exercise = { active: false, id: null, remainingSec: 0, total: 0 };
    this._lastExercise = null;

    this.history = {};
    for (const [k, v] of Object.entries(saved.history || {})) this.history[k] = { ...emptyDay(k), ...v };
    if (saved.stats && saved.stats.date && !this.history[saved.stats.date]) {
      this.history[saved.stats.date] = { ...emptyDay(saved.stats.date), ...saved.stats };
    }
    this.stats = this._today(t);

    this._mood = this.getMood();
  }

  updateSettings(patch) {
    const next = { ...this.settings };
    for (const [k, v] of Object.entries(patch || {})) {
      if (!(k in DEFAULT_SETTINGS)) continue;
      const def = DEFAULT_SETTINGS[k];
      if (typeof def === 'boolean') next[k] = Boolean(v);
      else {
        const n = Number(v);
        if (Number.isFinite(n) && n >= (MIN_SETTING[k] ?? 1) && n <= 600) next[k] = Math.round(n);
      }
    }
    this.settings = next;
    if (!next.autoDnd) {
      this._autoDnd = false;
      this._autoReason = '';
    }
    this._emitState();
  }

  tick() {
    const now = this._now();
    let dt = (now - this._last) / 1000;
    this._last = now;
    if (dt < 0) dt = 0;

    if (dt > MAX_TICK_SEC * 6) {
      if (dt >= this.settings.idleBreakMin * 60) this._restTaken();
      dt = 0;
    } else if (dt > MAX_TICK_SEC) {
      dt = MAX_TICK_SEC;
    }

    this._rollDay(now);
    this._tickPomodoro(dt);
    this._tickEyes(dt);
    this._tickExercise(dt);
    this._tickActive(dt);

    const dnd = this.isDnd(now);
    const active = !this._sleeping && !(this.pomo.running && this.pomo.phase !== 'idle');
    if (active && !dnd) this._tickReminders(dt);
    if (!dnd) this._tickTasks(now);
    this._emitState();
  }

  setIdle(seconds) {
    const s = Math.max(0, seconds);
    const returned = s < this._lastIdle;
    const peak = this._lastIdle;
    this._lastIdle = s;
    this._idleSec = s;

    if (returned) {
      if (peak >= this.settings.idleBreakMin * 60) this._restTaken();
      if (this._sleeping) {
        this._sleeping = false;
        this._say(this._mk('wake', pick('wake', this._rng), []));
      }
    }
    if (!this._sleeping && s >= this.settings.idleSleepMin * 60) {
      this._sleeping = true;
    }
    this._emitState();
  }

  _tickActive(dt) {
    if (this._sleeping || this._idleSec >= 60) return;
    this._activeAcc += dt;
    if (this._activeAcc >= 60) {
      this._activeAcc -= 60;
      this.stats.activeMin += 1;
    }
  }

  isDnd(now = this._now()) {
    return this._autoDnd || now < this._dndUntil;
  }

  setDnd(minutes) {
    const m = Number(minutes);
    if (m === -1) this._dndUntil = Infinity;
    else if (m > 0) this._dndUntil = this._now() + m * 60000;
    else this._dndUntil = 0;
    this._emitState();
  }

  setAutoDnd(on, reason = '') {
    const next = Boolean(on) && this.settings.autoDnd;
    if (next === this._autoDnd && (!next || reason === this._autoReason)) return;
    this._autoDnd = next;
    this._autoReason = next ? reason : '';
    this._emitState();
  }

  _say(r, force = false) {
    if (!force && this.isDnd()) return;
    this.emit('reminder', r);
  }

  _tickReminders(dt) {
    for (const [kind, intervalKey, enabledKey] of REMINDER_KINDS) {
      if (!this.settings[enabledKey]) continue;
      this._acc[kind] += dt;
      if (this._acc[kind] >= this.settings[intervalKey] * 60) {
        this._acc[kind] = 0;
        this._fire(kind);
      }
    }
  }

  _fire(kind) {
    if (kind === 'break') {
      if (this._breakPending) this.missedBreaks += 1;
      this._breakPending = true;
      const text = this.missedBreaks >= MISSED_FOR_SAD ? pick('sad', this._rng) : pick('break', this._rng);
      this._say(this._mk('break', text, [
        { id: 'exercise:start', label: 'Упражнение' },
        { id: 'break:ack', label: 'Размялся ✓' },
        { id: 'break:snooze', label: `+${SNOOZE_BREAK_MIN} мин` },
      ]));
    } else if (kind === 'eyes') {
      if (this.eyes.active) return;
      this._say(this._mk('eyes', pick('eyes', this._rng), [
        { id: 'eyes:start', label: 'Начать' },
      ]));
    } else {
      this._say(this._mk(kind, pick(kind, this._rng), []));
    }
  }

  _mk(kind, text, actions, extra = {}) {
    return { id: this._reminderSeq++, kind, text, actions, ...extra };
  }

  greet() {
    const open = this.tasks.filter((t) => !t.done).length;
    const streak = this.streak();
    let text = pick('greeting', this._rng);
    if (open > 0) text += ` В списке дел: ${open}.`;
    if (streak > 1) text += ` Серия: ${streak} дн.`;
    this._say(this._mk('hello', text, []), true);
  }

  ackBreak() {
    const wasSad = this.missedBreaks >= MISSED_FOR_SAD;
    this._restTaken(true);
    if (wasSad) this._startLove();
    this._emitState();
  }

  snoozeBreak() {
    this._breakPending = false;
    this._acc.break = Math.max(0, this.settings.breakEveryMin * 60 - SNOOZE_BREAK_MIN * 60);
    this._emitState();
  }

  _restTaken(counted = false) {
    this._breakPending = false;
    this.missedBreaks = 0;
    this._acc.break = 0;
    this._acc.eyes = 0;
    this._acc.posture = 0;
    if (counted) {
      this.stats.breaks += 1;
      this._checkGoal();
    }
  }

  _metGoal(key) {
    const d = this.history[key];
    return Boolean(d) && d.breaks >= this.settings.dailyGoal;
  }

  _checkGoal() {
    if (this.stats.goalReached || this.stats.breaks < this.settings.dailyGoal) return;
    this.stats.goalReached = true;
    this._startLove(true);
    const n = this.streak();
    const text = `${pick('goal', this._rng)} ${this.settings.dailyGoal} перерывов.` + (n > 1 ? ` Серия: ${n} дн.` : '');
    this._say(this._mk('goal', text, []), true);
  }

  streak() {
    const d = new Date(this._now());
    if (!this._metGoal(dayKey(d.getTime()))) d.setDate(d.getDate() - 1);
    let n = 0;
    while (n < 400 && this._metGoal(dayKey(d.getTime()))) {
      n += 1;
      d.setDate(d.getDate() - 1);
    }
    return n;
  }

  week() {
    const out = [];
    const d = new Date(this._now());
    d.setDate(d.getDate() - 6);
    for (let i = 0; i < 7; i++) {
      const key = dayKey(d.getTime());
      const h = this.history[key] || emptyDay(key);
      out.push({
        date: key, dow: d.getDay(), breaks: h.breaks, pomodoros: h.pomodoros,
        tasks: h.tasks, exercises: h.exercises, activeMin: h.activeMin, goal: this._metGoal(key),
      });
      d.setDate(d.getDate() + 1);
    }
    return out;
  }

  _today(now) {
    const key = dayKey(now);
    if (!this.history[key]) this.history[key] = emptyDay(key);
    return this.history[key];
  }

  _rollDay(now) {
    if (this.stats.date === dayKey(now)) return;
    this.stats = this._today(now);
    const keys = Object.keys(this.history).sort();
    while (keys.length > HISTORY_DAYS) delete this.history[keys.shift()];
  }

  startEyes() {
    if (this.eyes.active) return;
    this.eyes = { active: true, remainingSec: EYES_SECONDS };
    this._acc.eyes = 0;
    this.emit('eyes-start', { durationSec: EYES_SECONDS, text: pick('eyesStart', this._rng) });
    this._emitState();
  }

  cancelEyes() {
    if (!this.eyes.active) return;
    this.eyes = { active: false, remainingSec: 0 };
    this._emitState();
  }

  _tickEyes(dt) {
    if (!this.eyes.active) return;
    this.eyes.remainingSec = Math.max(0, this.eyes.remainingSec - dt);
    if (this.eyes.remainingSec <= 0) {
      this.eyes = { active: false, remainingSec: 0 };
      this._say(this._mk('eyes-done', pick('eyesDone', this._rng), []), true);
    }
  }

  startExercise(id) {
    if (this.exercise.active) return;
    const ex = pickExercise(id, this._lastExercise, this._rng);
    this._lastExercise = ex.id;
    this.exercise = { active: true, id: ex.id, remainingSec: ex.seconds, total: ex.seconds };
    this._awakeUntil = Math.max(this._awakeUntil, this._now() + AWAKE_ON_TOUCH_MS);
    this.emit('exercise-start', { ...ex });
    this._emitState();
  }

  cancelExercise() {
    if (!this.exercise.active) return;
    this.exercise = { active: false, id: null, remainingSec: 0, total: 0 };
    this._emitState();
  }

  _tickExercise(dt) {
    if (!this.exercise.active) return;
    this.exercise.remainingSec = Math.max(0, this.exercise.remainingSec - dt);
    if (this.exercise.remainingSec > 0) return;
    this.exercise = { active: false, id: null, remainingSec: 0, total: 0 };
    this.stats.exercises += 1;
    this._restTaken(true);
    this._happyUntil = this._now() + HAPPY_MS;
    this._say(this._mk('exercise-done', pick('exerciseDone', this._rng), []), true);
  }

  startPomodoro() {
    this.pomo = { phase: 'work', running: true, remainingSec: this.settings.workMin * 60, cycle: this.pomo.cycle };
    this._announcePhase('work');
    this._emitState();
  }

  pausePomodoro() {
    if (this.pomo.phase === 'idle') return;
    this.pomo.running = false;
    this._emitState();
  }

  resumePomodoro() {
    if (this.pomo.phase === 'idle') return this.startPomodoro();
    this.pomo.running = true;
    this._emitState();
  }

  stopPomodoro() {
    if (this.pomo.phase === 'idle') return;
    this.pomo = { phase: 'idle', running: false, remainingSec: 0, cycle: 0 };
    this._say(this._mk('pomodoro', pick('pomodoroStop', this._rng), []), true);
    this._emitState();
  }

  skipPhase() {
    if (this.pomo.phase === 'idle') return;
    this._nextPhase();
    this._emitState();
  }

  _tickPomodoro(dt) {
    if (!this.pomo.running || this.pomo.phase === 'idle') return;
    this.pomo.remainingSec -= dt;
    if (this.pomo.remainingSec <= 0) this._nextPhase();
  }

  _nextPhase() {
    const s = this.settings;
    if (this.pomo.phase === 'work') {
      this.pomo.cycle += 1;
      this.stats.pomodoros += 1;
      const long = this.pomo.cycle % s.cyclesBeforeLong === 0;
      this.pomo.phase = long ? 'longBreak' : 'break';
      this.pomo.remainingSec = (long ? s.longBreakMin : s.shortBreakMin) * 60;
      this._restTaken(true);
    } else {
      this.pomo.phase = 'work';
      this.pomo.remainingSec = s.workMin * 60;
    }
    this.pomo.running = true;
    this._announcePhase(this.pomo.phase);
  }

  _announcePhase(phase) {
    const key = { work: 'pomodoroWork', break: 'pomodoroBreak', longBreak: 'pomodoroLong' }[phase];
    this._say(this._mk('pomodoro', pick(key, this._rng), [], { phase }));
  }

  addTask(raw) {
    const text = String(raw || '').trim();
    if (!text) return null;
    const now = this._now();
    const parsed = parseTask(text, now);
    const task = {
      id: this._nextTaskId++,
      text: parsed.text,
      dueAt: parsed.dueAt,
      repeat: parsed.repeat || null,
      done: false,
      notified: false,
      createdAt: now,
    };
    this.tasks.push(task);
    this.emit('tasks-changed');
    this._say(this._mk('task-added', pick('taskAdded', this._rng), [], { taskId: task.id, dueAt: task.dueAt }), true);
    this._emitState();
    return task;
  }

  completeTask(id) {
    const t = this.tasks.find((x) => x.id === id);
    if (!t || t.done) return;
    const now = this._now();
    this.stats.tasks += 1;
    this._happyUntil = now + HAPPY_MS;
    if (t.repeat) {
      t.dueAt = nextDue(t.repeat, Math.max(now, t.dueAt || now));
      t.notified = false;
      t.lastDoneAt = now;
    } else {
      t.done = true;
      t.doneAt = now;
    }
    this.emit('tasks-changed');
    this.emit('celebrate', { text: pick('happy', this._rng) });
    this._emitState();
  }

  reopenTask(id) {
    const t = this.tasks.find((x) => x.id === id);
    if (!t || !t.done) return;
    t.done = false;
    delete t.doneAt;
    this.emit('tasks-changed');
    this._emitState();
  }

  removeTask(id) {
    const n = this.tasks.length;
    this.tasks = this.tasks.filter((x) => x.id !== id);
    if (this.tasks.length !== n) this.emit('tasks-changed');
    this._emitState();
  }

  snoozeTask(id, minutes = 10) {
    const t = this.tasks.find((x) => x.id === id);
    if (!t || t.done) return;
    t.dueAt = this._now() + minutes * 60 * 1000;
    t.notified = false;
    this.emit('tasks-changed');
    this._emitState();
  }

  clearDone() {
    this.tasks = this.tasks.filter((t) => !t.done);
    this.emit('tasks-changed');
    this._emitState();
  }

  _tickTasks(now) {
    for (const t of this.tasks) {
      if (t.done || t.notified || !t.dueAt || t.dueAt > now) continue;
      t.notified = true;
      this._awakeUntil = now + AWAKE_ON_ALERT_MS;
      this.emit('tasks-changed');
      this._say(this._mk('task', `${pick('task', this._rng)} ${t.text}`, [
        { id: 'task:done', label: 'Готово ✓', payload: t.id },
        { id: 'task:snooze', label: '+10 мин', payload: t.id },
      ], { taskId: t.id }), true);
    }
  }

  _startLove(silent = false) {
    const now = this._now();
    const already = now < this._loveUntil;
    this._loveUntil = now + LOVE_MS;
    this._awakeUntil = Math.max(this._awakeUntil, now + AWAKE_ON_TOUCH_MS);
    if (!already && !silent) this._say(this._mk('love', pick('love', this._rng), []), true);
  }

  pet() {
    this._startLove();
    this._emitState();
  }

  poke() {
    if (this.getMood() !== 'sleeping') return;
    this._awakeUntil = this._now() + AWAKE_ON_TOUCH_MS;
    this._say(this._mk('poke', pick('poke', this._rng), []), true);
    this._emitState();
  }

  chat() {
    this._awakeUntil = Math.max(this._awakeUntil, this._now() + AWAKE_ON_TOUCH_MS);
    this._say(this._mk('chat', pick('chat', this._rng), []), true);
    this._emitState();
  }

  getMood() {
    const now = this._now();
    if (this._sleeping && now >= this._awakeUntil) return 'sleeping';
    if (now < this._loveUntil) return 'love';
    if (now < this._happyUntil) return 'happy';
    if (this.missedBreaks >= MISSED_FOR_SAD) return 'sad';
    if (this.pomo.phase === 'work') return 'focused';
    return 'energetic';
  }

  snapshot() {
    const ex = this.exercise.active ? getExercise(this.exercise.id) : null;
    const now = this._now();
    return {
      mood: this._mood,
      hardHat: this.pomo.phase === 'work',
      missedBreaks: this.missedBreaks,
      pomodoro: { ...this.pomo, remainingSec: Math.ceil(Math.max(0, this.pomo.remainingSec)) },
      eyes: { active: this.eyes.active, remainingSec: Math.ceil(this.eyes.remainingSec) },
      exercise: ex
        ? { active: true, id: ex.id, title: ex.title, steps: ex.steps, anim: ex.anim, total: this.exercise.total, remainingSec: Math.ceil(this.exercise.remainingSec) }
        : { active: false },
      dnd: {
        active: this.isDnd(now),
        auto: this._autoDnd,
        reason: this._autoReason,
        manual: now < this._dndUntil,
        forever: this._dndUntil === Infinity,
        untilMs: Number.isFinite(this._dndUntil) && now < this._dndUntil ? this._dndUntil : null,
      },
      tasks: this.tasks.map((t) => ({ ...t, repeatText: repeatLabel(t.repeat) })),
      stats: { ...this.stats },
      week: this.week(),
      streak: this.streak(),
      settings: { ...this.settings },
    };
  }

  persistable() {
    return { settings: this.settings, tasks: this.tasks, history: this.history };
  }

  _emitState() {
    this._mood = this.getMood();
    this.emit('state', this.snapshot());
  }

  dispatch(action, payload) {
    switch (action) {
      case 'pet': return this.pet();
      case 'poke': return this.poke();
      case 'chat': return this.chat();
      case 'break:ack': return this.ackBreak();
      case 'break:snooze': return this.snoozeBreak();
      case 'eyes:start': return this.startEyes();
      case 'eyes:cancel': return this.cancelEyes();
      case 'exercise:start': return this.startExercise(payload);
      case 'exercise:cancel': return this.cancelExercise();
      case 'dnd:set': return this.setDnd(payload);
      case 'pomo:start': return this.startPomodoro();
      case 'pomo:pause': return this.pausePomodoro();
      case 'pomo:resume': return this.resumePomodoro();
      case 'pomo:stop': return this.stopPomodoro();
      case 'pomo:skip': return this.skipPhase();
      case 'task:add': return this.addTask(payload);
      case 'task:done': return this.completeTask(payload);
      case 'task:reopen': return this.reopenTask(payload);
      case 'task:remove': return this.removeTask(payload);
      case 'task:snooze': return this.snoozeTask(payload);
      case 'task:clear-done': return this.clearDone();
      case 'settings:set': return this.updateSettings(payload);
      default: return undefined;
    }
  }
}

module.exports = { Engine, DEFAULT_SETTINGS, EYES_SECONDS };
