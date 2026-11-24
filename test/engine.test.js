'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeEngine } = require('./helpers');

const kinds = (rs) => rs.map((r) => r.kind);

test('напоминание о перерыве через breakEveryMin активной работы', () => {
  const { e, reminders, advance } = makeEngine();
  e.updateSettings({ eyesEnabled: false, waterEnabled: false, postureEnabled: false });
  advance(29 * 60);
  assert.equal(reminders.filter((r) => r.kind === 'break').length, 0);
  advance(60);
  const br = reminders.filter((r) => r.kind === 'break');
  assert.equal(br.length, 1);
  assert.deepEqual(br[0].actions.map((a) => a.id), ['exercise:start', 'break:ack', 'break:snooze']);
});

test('вода, осанка и глаза приходят со своими интервалами', () => {
  const { e, reminders, advance } = makeEngine();
  e.updateSettings({ breakEnabled: false });
  advance(45 * 60);
  const k = kinds(reminders);
  assert.ok(k.includes('eyes') && k.includes('posture') && k.includes('water'));
});

test('три пропущенных перерыва → грустный; ack → снова бодрый', () => {
  const { e, advance } = makeEngine();
  e.updateSettings({ eyesEnabled: false, waterEnabled: false, postureEnabled: false });
  assert.equal(e.getMood(), 'energetic');
  advance(30 * 60);
  advance(30 * 60);
  advance(30 * 60);
  assert.equal(e.getMood(), 'energetic');
  advance(30 * 60);
  assert.equal(e.missedBreaks, 3);
  assert.equal(e.getMood(), 'sad');
  e.ackBreak();
  assert.equal(e.getMood(), 'love');
  assert.equal(e.stats.breaks, 1);
  advance(6);
  assert.equal(e.getMood(), 'energetic');
});

test('snooze перерыва: следующее напоминание через 5 минут и без «пропуска»', () => {
  const { e, reminders, advance } = makeEngine();
  e.updateSettings({ eyesEnabled: false, waterEnabled: false, postureEnabled: false });
  advance(30 * 60);
  e.snoozeBreak();
  advance(5 * 60);
  assert.equal(reminders.filter((r) => r.kind === 'break').length, 2);
  assert.equal(e.missedBreaks, 0);
});

test('гимнастика для глаз: 20 секунд и сообщение в конце', () => {
  const { e, reminders, advance } = makeEngine();
  const started = [];
  e.on('eyes-start', (x) => started.push(x));
  e.startEyes();
  assert.equal(started[0].durationSec, 20);
  assert.equal(e.snapshot().eyes.active, true);
  advance(19);
  assert.equal(e.snapshot().eyes.active, true);
  advance(2);
  assert.equal(e.snapshot().eyes.active, false);
  assert.ok(kinds(reminders).includes('eyes-done'));
});

test('Pomodoro: работа → перерыв → работа, каска только в работе', () => {
  const { e, advance } = makeEngine();
  e.startPomodoro();
  assert.equal(e.snapshot().hardHat, true);
  assert.equal(e.getMood(), 'focused');
  advance(25 * 60 + 1);
  assert.equal(e.pomo.phase, 'break');
  assert.equal(e.snapshot().hardHat, false);
  assert.equal(e.stats.pomodoros, 1);
  advance(5 * 60 + 1);
  assert.equal(e.pomo.phase, 'work');
});

test('Pomodoro: после 4 циклов — длинный перерыв', () => {
  const { e, advance } = makeEngine();
  e.startPomodoro();
  for (let i = 0; i < 3; i++) advance((25 + 5) * 60 + 2);
  advance(25 * 60 + 1);
  assert.equal(e.pomo.phase, 'longBreak');
  assert.ok(e.pomo.remainingSec > 14 * 60);
});

test('Pomodoro: пауза замораживает таймер; стоп сбрасывает', () => {
  const { e, advance } = makeEngine();
  e.startPomodoro();
  advance(60);
  e.pausePomodoro();
  const left = e.pomo.remainingSec;
  advance(120);
  assert.equal(e.pomo.remainingSec, left);
  e.resumePomodoro();
  advance(10);
  assert.ok(e.pomo.remainingSec < left);
  e.stopPomodoro();
  assert.equal(e.pomo.phase, 'idle');
});

test('во время Pomodoro обычные напоминания не мешают', () => {
  const { e, reminders, advance } = makeEngine();
  e.updateSettings({ workMin: 60 });
  e.startPomodoro();
  reminders.length = 0;
  advance(50 * 60);
  assert.deepEqual(kinds(reminders), []);
});

test('задача с временем: напоминание в срок; «Готово» → радость', () => {
  const { e, reminders, advance } = makeEngine();
  const t = e.addTask('через 2 минуты выпить таблетку');
  assert.equal(t.text, 'Выпить таблетку');
  advance(119);
  assert.ok(!kinds(reminders).includes('task'));
  advance(2);
  const r = reminders.find((x) => x.kind === 'task');
  assert.ok(r && r.text.includes('Выпить таблетку'));
  assert.equal(r.actions[0].payload, t.id);
  e.dispatch('task:done', t.id);
  assert.equal(e.getMood(), 'happy');
  assert.equal(e.stats.tasks, 1);
  advance(6);
  assert.equal(e.getMood(), 'energetic');
});

test('отложенная задача напоминает снова', () => {
  const { e, reminders, advance } = makeEngine();
  const t = e.addTask('через 1 минуту разминка');
  advance(61);
  e.snoozeTask(t.id, 10);
  reminders.length = 0;
  advance(9 * 60);
  assert.equal(reminders.filter((r) => r.kind === 'task').length, 0);
  advance(61);
  assert.equal(reminders.filter((r) => r.kind === 'task').length, 1);
});

test('простой → спит; возвращение → бодрый и приветствие', () => {
  const { e, reminders, advance } = makeEngine();
  advance(4 * 60, 4 * 60);
  assert.equal(e.getMood(), 'sleeping');
  advance(1, 0);
  assert.equal(e.getMood(), 'energetic');
  assert.ok(kinds(reminders).includes('wake'));
});

test('долгое отсутствие считается перерывом и снимает грусть', () => {
  const { e, advance } = makeEngine();
  e.updateSettings({ eyesEnabled: false, waterEnabled: false, postureEnabled: false });
  advance(120 * 60);
  assert.equal(e.getMood(), 'sad');
  for (let i = 0; i < 6 * 60; i++) advance(1, i + 1);
  advance(1, 0);
  assert.equal(e.missedBreaks, 0);
  assert.equal(e.getMood(), 'energetic');
});

test('во сне напоминания не копятся, но задача по сроку будит', () => {
  const { e, reminders, advance } = makeEngine();
  e.addTask('через 10 минут позвонить');
  advance(15 * 60, 15 * 60);
  assert.deepEqual(kinds(reminders).filter((k) => k !== 'task-added' && k !== 'task'), []);
  assert.ok(kinds(reminders).includes('task'));
});

test('сохранение и восстановление', () => {
  const a = makeEngine();
  a.e.addTask('купить молоко');
  a.e.updateSettings({ breakEveryMin: 40 });
  const b = makeEngine(JSON.parse(JSON.stringify(a.e.persistable())));
  assert.equal(b.e.tasks.length, 1);
  assert.equal(b.e.settings.breakEveryMin, 40);
  const t2 = b.e.addTask('ещё');
  assert.equal(t2.id, 2);
});

test('настройки валидируются', () => {
  const { e } = makeEngine();
  e.updateSettings({ breakEveryMin: -5, waterEveryMin: 'abc', hack: 1, sound: 0 });
  assert.equal(e.settings.breakEveryMin, 30);
  assert.equal(e.settings.waterEveryMin, 45);
  assert.equal(e.settings.sound, false);
  assert.ok(!('hack' in e.settings));
});

test('погладить → сердечки на 5 секунд, потом бодрый', () => {
  const { e, reminders, advance } = makeEngine();
  e.dispatch('pet');
  assert.equal(e.getMood(), 'love');
  assert.ok(kinds(reminders).includes('love'));
  advance(4);
  assert.equal(e.getMood(), 'love');
  advance(2);
  assert.equal(e.getMood(), 'energetic');
});

test('повторные поглаживания продлевают любовь без спама фразами', () => {
  const { e, reminders, advance } = makeEngine();
  e.pet(); advance(2); e.pet(); advance(2); e.pet();
  assert.equal(reminders.filter((r) => r.kind === 'love').length, 1);
  advance(4);
  assert.equal(e.getMood(), 'love');
});

test('гладить можно и спящего: он просыпается', () => {
  const { e, advance } = makeEngine();
  advance(4 * 60, 4 * 60);
  assert.equal(e.getMood(), 'sleeping');
  e.pet();
  assert.equal(e.getMood(), 'love');
  advance(6, 4 * 60 + 6);
  assert.equal(e.getMood(), 'energetic');
  advance(30, 5 * 60);
  assert.equal(e.getMood(), 'sleeping');
});

test('poke будит спящего и не трогает бодрого', () => {
  const { e, reminders, advance } = makeEngine();
  e.poke();
  assert.ok(!kinds(reminders).includes('poke'));
  advance(4 * 60, 4 * 60);
  e.poke();
  assert.equal(e.getMood(), 'energetic');
  assert.ok(kinds(reminders).includes('poke'));
});

test('chat говорит фразу', () => {
  const { e, reminders } = makeEngine();
  e.dispatch('chat');
  const r = reminders.find((x) => x.kind === 'chat');
  assert.ok(r && r.text.length > 5);
});

test('DND: таймерные напоминания молчат, дела приходят после выключения', () => {
  const { e, reminders, advance } = makeEngine();
  e.addTask('через 2 минуты позвонить');
  reminders.length = 0;
  e.dispatch('dnd:set', 60);
  assert.equal(e.snapshot().dnd.active, true);
  advance(50 * 60);
  assert.deepEqual(kinds(reminders), []);
  e.dispatch('dnd:set', 0);
  advance(2);
  assert.ok(kinds(reminders).includes('task'));
});

test('DND сам заканчивается по времени, «пока не выключат» — нет', () => {
  const { e, advance } = makeEngine();
  e.setDnd(10);
  advance(11 * 60);
  assert.equal(e.isDnd(), false);
  e.setDnd(-1);
  advance(5 * 3600);
  assert.equal(e.isDnd(), true);
  assert.equal(e.snapshot().dnd.forever, true);
});

test('авто-DND (полный экран/звонок) включается и выключается; настройка его отключает', () => {
  const { e, reminders, advance } = makeEngine();
  e.setAutoDnd(true, 'call');
  assert.equal(e.snapshot().dnd.reason, 'call');
  advance(40 * 60);
  assert.deepEqual(kinds(reminders), []);
  e.setAutoDnd(false);
  assert.equal(e.isDnd(), false);
  e.updateSettings({ autoDnd: false });
  e.setAutoDnd(true, 'fullscreen');
  assert.equal(e.isDnd(), false);
});

test('в DND можно погладить и поболтать — это ответ пользователю', () => {
  const { e, reminders } = makeEngine();
  e.setDnd(-1);
  e.pet();
  e.chat();
  assert.deepEqual(kinds(reminders).sort(), ['chat', 'love']);
});

test('разминка: идёт по таймеру, потом засчитывается как перерыв', () => {
  const { e, reminders, advance } = makeEngine();
  const started = [];
  e.on('exercise-start', (x) => started.push(x));
  e.dispatch('exercise:start');
  assert.equal(started.length, 1);
  const total = e.snapshot().exercise.total;
  advance(total - 1);
  assert.equal(e.snapshot().exercise.active, true);
  advance(2);
  assert.equal(e.snapshot().exercise.active, false);
  assert.equal(e.stats.breaks, 1);
  assert.equal(e.stats.exercises, 1);
  assert.ok(kinds(reminders).includes('exercise-done'));
  assert.equal(e.getMood(), 'happy');
});

test('разминка: отмена не засчитывается; подряд не повторяется', () => {
  const { e } = makeEngine();
  e.startExercise();
  const first = e.snapshot().exercise.id;
  e.cancelExercise();
  assert.equal(e.stats.breaks, 0);
  e.startExercise();
  assert.notEqual(e.snapshot().exercise.id, first);
});

test('цель дня: награда и сердечки', () => {
  const { e, reminders } = makeEngine();
  e.updateSettings({ dailyGoal: 2 });
  e.ackBreak();
  assert.ok(!kinds(reminders).includes('goal'));
  e.ackBreak();
  assert.ok(kinds(reminders).includes('goal'));
  assert.equal(e.getMood(), 'love');
  assert.equal(e.streak(), 1);
  e.ackBreak();
  assert.equal(reminders.filter((r) => r.kind === 'goal').length, 1);
});

test('серия считается по дням подряд, пропуск обнуляет', () => {
  const { e, clock, advance } = makeEngine();
  e.updateSettings({ dailyGoal: 1 });
  for (let day = 0; day < 3; day++) {
    e.ackBreak();
    clock.t += 24 * 3600 * 1000;
    advance(1);
  }
  assert.equal(e.streak(), 3);
  clock.t += 24 * 3600 * 1000;
  advance(1);
  clock.t += 24 * 3600 * 1000;
  advance(1);
  assert.equal(e.streak(), 0);
  const w = e.week();
  assert.equal(w.length, 7);
  assert.equal(w[6].breaks, 0);
});

test('активные минуты считаются, во сне — нет', () => {
  const { e, advance } = makeEngine();
  advance(180);
  assert.equal(e.stats.activeMin, 3);
  advance(120, 4 * 60);
  assert.equal(e.stats.activeMin, 3);
});

test('старый формат сохранения (stats) переезжает в историю', () => {
  const { e } = makeEngine({ stats: { date: '2026-11-24', breaks: 4, pomodoros: 2, tasks: 1 } });
  assert.equal(e.stats.breaks, 4);
  assert.equal(e.persistable().history['2026-11-24'].pomodoros, 2);
});

test('повторяющаяся задача не закрывается, а переезжает', () => {
  const { e, advance } = makeEngine();
  const t = e.addTask('каждый день в 11:00 планёрка');
  const first = t.dueAt;
  advance(61 * 60 + 5);
  e.completeTask(t.id);
  assert.equal(e.tasks[0].done, false);
  assert.ok(e.tasks[0].dueAt > first);
  assert.equal(new Date(e.tasks[0].dueAt).getDate(), new Date(first).getDate() + 1);
  assert.equal(e.stats.tasks, 1);
  assert.equal(e.getMood(), 'happy');
});

test('приветствие: число дел и серия', () => {
  const { e, reminders } = makeEngine();
  e.addTask('купить молоко');
  e.addTask('позвонить');
  reminders.length = 0;
  e.greet();
  assert.match(reminders[0].text, /В списке дел: 2/);
});

test('настройка автозакрытия меню: 0 разрешён, мусор отклоняется', () => {
  const { e } = makeEngine();
  assert.equal(e.settings.panelAutoCloseSec, 4);
  e.updateSettings({ panelAutoCloseSec: 0 });
  assert.equal(e.settings.panelAutoCloseSec, 0);
  e.updateSettings({ panelAutoCloseSec: -3 });
  assert.equal(e.settings.panelAutoCloseSec, 0);
  e.updateSettings({ panelAutoCloseSec: 8 });
  assert.equal(e.settings.panelAutoCloseSec, 8);
});
