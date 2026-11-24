'use strict';

const EventEmitter = require('node:events');
const { pick } = require('./phrases');
const { parseTask } = require('./taskParser');

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
  idleSleepMin: 3, // простой дольше — Робик засыпает
  idleBreakMin: 5, // отсутствие дольше — засчитывается как перерыв
  sound: true,
  openAtLogin: false,
};

const EYES_SECONDS = 20;
const HAPPY_MS = 5000;
const LOVE_MS = 5000;
const AWAKE_ON_TOUCH_MS = 20000;
const AWAKE_ON_ALERT_MS = 12000;
const MAX_TICK_SEC = 5; // больший разрыв считаем засыпанием компьютера
const SNOOZE_BREAK_MIN = 5;
const MISSED_FOR_SAD = 3;

const REMINDER_KINDS = [
  // kind, ключ интервала, ключ включения, ключ фраз
  ['break', 'breakEveryMin', 'breakEnabled'],
  ['eyes', 'eyesEveryMin', 'eyesEnabled'],
  ['water', 'waterEveryMin', 'waterEnabled'],
  ['posture', 'postureEveryMin', 'postureEnabled'],
];

function todayKey(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

class Engine extends EventEmitter {
  /**
   * @param {object} opts
   * @param {() => number} [opts.now] — часы (для тестов)
   * @param {() => number} [opts.rng] — генератор 0..1 (для тестов)
   * @param {object} [opts.saved] — данные из persistable()
   */
  constructor({ now = Date.now, rng = Math.random, saved = {} } = {}) {
    super();
    this._now = now;
    this._rng = rng;
    this.settings = { ...DEFAULT_SETTINGS, ...(saved.settings || {}) };
    this.tasks = Array.isArray(saved.tasks) ? saved.tasks.map((t) => ({ ...t })) : [];
    this._nextTaskId = this.tasks.reduce((m, t) => Math.max(m, t.id), 0) + 1;

    const t = this._now();
    this._last = t;
    this._acc = { break: 0, eyes: 0, water: 0, posture: 0 }; // накопленные секунды активной работы
    this._breakPending = false;
    this.missedBreaks = 0;
    this._idleSec = 0;
    this._lastIdle = 0;
    this._sleeping = false;
    this._happyUntil = 0;
    this._loveUntil = 0;
    this._awakeUntil = 0;
    this._reminderSeq = 1;

    this.pomo = { phase: 'idle', running: false, remainingSec: 0, cycle: 0 };
    this.eyes = { active: false, remainingSec: 0 };

    const today = todayKey(t);
    const s = saved.stats && saved.stats.date === today ? saved.stats : null;
    this.stats = s ? { ...s } : { date: today, breaks: 0, pomodoros: 0, tasks: 0 };

    this._mood = this.getMood();
  }

  // ---------- настройки ----------

  updateSettings(patch) {
    const next = { ...this.settings };
    for (const [k, v] of Object.entries(patch || {})) {
      if (!(k in DEFAULT_SETTINGS)) continue;
      const def = DEFAULT_SETTINGS[k];
      if (typeof def === 'boolean') next[k] = Boolean(v);
      else {
        const n = Number(v);
        if (Number.isFinite(n) && n >= 1 && n <= 600) next[k] = Math.round(n);
      }
    }
    this.settings = next;
    this._emitState();
  }

  // ---------- главный тик ----------

  /** Вызывать примерно раз в секунду. */
  tick() {
    const now = this._now();
    let dt = (now - this._last) / 1000;
    this._last = now;
    if (dt < 0) dt = 0;

    // Компьютер спал / процесс был заморожен
    if (dt > MAX_TICK_SEC * 6) {
      if (dt >= this.settings.idleBreakMin * 60) this._restTaken();
      dt = 0;
    } else if (dt > MAX_TICK_SEC) {
      dt = MAX_TICK_SEC;
    }

    this._rollDay(now);
    this._tickPomodoro(dt);
    this._tickEyes(dt);

    const active = !this._sleeping && !(this.pomo.running && this.pomo.phase !== 'idle');
    if (active) this._tickReminders(dt);

    this._tickTasks(now);
    this._emitState();
  }

  /** Системное время простоя (секунды без ввода). */
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
        this.emit('reminder', this._mk('wake', pick('wake', this._rng), []));
      }
    }
    if (!this._sleeping && s >= this.settings.idleSleepMin * 60) {
      this._sleeping = true;
    }
    this._emitState();
  }

  // ---------- напоминания ----------

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
      this.emit('reminder', this._mk('break', text, [
        { id: 'break:ack', label: 'Размялся ✓' },
        { id: 'break:snooze', label: `+${SNOOZE_BREAK_MIN} мин` },
      ]));
    } else if (kind === 'eyes') {
      if (this.eyes.active) return;
      this.emit('reminder', this._mk('eyes', pick('eyes', this._rng), [
        { id: 'eyes:start', label: 'Начать' },
      ]));
    } else {
      this.emit('reminder', this._mk(kind, pick(kind, this._rng), []));
    }
  }

  _mk(kind, text, actions, extra = {}) {
    return { id: this._reminderSeq++, kind, text, actions, ...extra };
  }

  greet() {
    this.emit('reminder', this._mk('hello', pick('greeting', this._rng), []));
  }

  // ---------- перерывы ----------

  /** Пользователь размялся. */
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
    if (counted) this.stats.breaks += 1;
  }

  // ---------- гимнастика для глаз ----------

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
      this.emit('reminder', this._mk('eyes-done', pick('eyesDone', this._rng), []));
    }
  }

  // ---------- Pomodoro ----------

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
    this.emit('reminder', this._mk('pomodoro', pick('pomodoroStop', this._rng), []));
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
      // Перерыв по таймеру = настоящий перерыв
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
    this.emit('reminder', this._mk('pomodoro', pick(key, this._rng), [], { phase }));
  }

  // ---------- список дел ----------

  addTask(raw) {
    const text = String(raw || '').trim();
    if (!text) return null;
    const now = this._now();
    const parsed = parseTask(text, now);
    const task = {
      id: this._nextTaskId++,
      text: parsed.text,
      dueAt: parsed.dueAt,
      done: false,
      notified: false,
      createdAt: now,
    };
    this.tasks.push(task);
    this.emit('tasks-changed');
    this.emit('reminder', this._mk('task-added', pick('taskAdded', this._rng), [], { taskId: task.id, dueAt: task.dueAt }));
    this._emitState();
    return task;
  }

  completeTask(id) {
    const t = this.tasks.find((x) => x.id === id);
    if (!t || t.done) return;
    t.done = true;
    t.doneAt = this._now();
    this.stats.tasks += 1;
    this._happyUntil = this._now() + HAPPY_MS;
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
      this.emit('reminder', this._mk('task', `${pick('task', this._rng)} ${t.text}`, [
        { id: 'task:done', label: 'Готово ✓', payload: t.id },
        { id: 'task:snooze', label: '+10 мин', payload: t.id },
      ], { taskId: t.id }));
    }
  }

  // ---------- общение ----------

  _startLove() {
    const now = this._now();
    const already = now < this._loveUntil;
    this._loveUntil = now + LOVE_MS;
    this._awakeUntil = Math.max(this._awakeUntil, now + AWAKE_ON_TOUCH_MS);
    if (!already) this.emit('reminder', this._mk('love', pick('love', this._rng), []));
  }

  /** Погладили. */
  pet() {
    this._startLove();
    this._emitState();
  }

  /** Тыкнули: будит спящего Робика. */
  poke() {
    if (this.getMood() !== 'sleeping') return;
    this._awakeUntil = this._now() + AWAKE_ON_TOUCH_MS;
    this.emit('reminder', this._mk('poke', pick('poke', this._rng), []));
    this._emitState();
  }

  /** Поболтать. */
  chat() {
    this._awakeUntil = Math.max(this._awakeUntil, this._now() + AWAKE_ON_TOUCH_MS);
    this.emit('reminder', this._mk('chat', pick('chat', this._rng), []));
    this._emitState();
  }

  // ---------- настроение и состояние ----------

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
    return {
      mood: this._mood,
      hardHat: this.pomo.phase === 'work',
      missedBreaks: this.missedBreaks,
      pomodoro: { ...this.pomo, remainingSec: Math.ceil(Math.max(0, this.pomo.remainingSec)) },
      eyes: { active: this.eyes.active, remainingSec: Math.ceil(this.eyes.remainingSec) },
      tasks: this.tasks.map((t) => ({ ...t })),
      stats: { ...this.stats },
      settings: { ...this.settings },
    };
  }

  persistable() {
    return { settings: this.settings, tasks: this.tasks, stats: this.stats };
  }

  _rollDay(now) {
    const key = todayKey(now);
    if (this.stats.date !== key) this.stats = { date: key, breaks: 0, pomodoros: 0, tasks: 0 };
  }

  _emitState() {
    this._mood = this.getMood();
    this.emit('state', this.snapshot());
  }

  // ---------- единая точка действий (UI → движок) ----------

  dispatch(action, payload) {
    switch (action) {
      case 'pet': return this.pet();
      case 'poke': return this.poke();
      case 'chat': return this.chat();
      case 'break:ack': return this.ackBreak();
      case 'break:snooze': return this.snoozeBreak();
      case 'eyes:start': return this.startEyes();
      case 'eyes:cancel': return this.cancelEyes();
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
