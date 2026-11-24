'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { validate, sanitize, Runtime, CATALOG } = require('../src/core/blocks');

const say = (id, text) => ({ id, type: 'say', params: { text } });
const rule = (id, type, body, params = {}) => ({ id, event: { type, params }, body });

function makeRuntime(extra = {}) {
  const log = [];
  const api = {
    say: (t) => log.push(['say', t]),
    emotion: (m) => log.push(['emotion', m]),
    sound: (n) => log.push(['sound', n]),
    pomodoroRunning: () => extra.pomo || false,
    openTasks: () => extra.tasks || 0,
    isSad: () => extra.sad || false,
    isQuiet: () => extra.quiet || false,
    exercise: () => log.push(['exercise']),
    eyes: () => log.push(['eyes']),
    pomoStart: () => log.push(['pomoStart']),
    pomoStop: () => log.push(['pomoStop']),
    dnd: (m) => log.push(['dnd', m]),
    addTask: (t) => log.push(['addTask', t]),
  };
  const waits = [];
  const rt = new Runtime({
    api,
    sleep: async (s) => { waits.push(s); },
    rng: extra.rng || (() => 0.1),
    now: () => new Date(2026, 0, 1, extra.hour ?? 10, 0, 0),
  });
  rt.onError = (e) => log.push(['error', e.message]);
  return { rt, log, waits };
}

test('пустая фраза: понятная ошибка с подсказкой', () => {
  const p = validate({ rules: [rule('r1', 'click', [say('b1', '  ')])] });
  const e = p.find((x) => x.blockId === 'b1');
  assert.equal(e.level, 'error');
  assert.match(e.message, /ничего не написано/);
  assert.match(e.hint, /текст/);
});

test('число вне диапазона и не число', () => {
  const p = validate({
    rules: [rule('r1', 'click', [
      { id: 'w', type: 'wait', params: { sec: 99 } },
      { id: 'w2', type: 'wait', params: { sec: 'много' } },
    ])],
  });
  assert.match(p.find((x) => x.blockId === 'w').message, /от 1 до 30/);
  assert.match(p.find((x) => x.blockId === 'w2').message, /нужно число/);
});

test('неизвестный блок, пустой цикл, правило без действий, правило без события', () => {
  const p = validate({
    rules: [
      rule('r1', 'click', [{ id: 'x', type: 'fly', params: {} }, { id: 'rp', type: 'repeat', params: { times: 2 }, children: [] }]),
      rule('r2', 'pet', []),
      rule('r3', '', [say('s', 'a')]),
    ],
  });
  assert.match(p.find((x) => x.blockId === 'x').message, /Не знаю блок/);
  assert.equal(p.find((x) => x.blockId === 'rp').level, 'warn');
  assert.equal(p.find((x) => x.blockId === 'r2').level, 'warn');
  assert.match(p.find((x) => x.blockId === 'r3').message, /нет события/);
});

test('быстрый повтор с речью без паузы: предупреждение', () => {
  const p = validate({
    rules: [rule('r1', 'click', [{ id: 'rp', type: 'repeat', params: { times: 8 }, children: [say('s', 'раз')] }])],
  });
  assert.match(p.find((x) => x.blockId === 'rp').message, /слишком быстро|очень быстро/);
  const ok = validate({
    rules: [rule('r1', 'click', [{ id: 'rp', type: 'repeat', params: { times: 8 }, children: [say('s', 'раз'), { id: 'w', type: 'wait', params: { sec: 2 } }] }])],
  });
  assert.equal(ok.length, 0);
});

test('корректная программа без замечаний', () => {
  const p = validate({
    rules: [
      rule('r1', 'click', [say('a', 'Ой!'), { id: 'e', type: 'emotion', params: { mood: 'happy' } }]),
      rule('r2', 'every', [{ id: 'if', type: 'if', params: { cond: 'pomodoro' }, children: [say('b', 'Держись!')] }], { min: 15 }),
    ],
  });
  assert.deepEqual(p, []);
});

test('sanitize режет мусор и лишние поля', () => {
  const s = sanitize({ rules: [{ id: 'r', event: { type: 'click', params: { evil: { a: 1 } } }, body: [null, say('a', 'x'.repeat(500))] }], extra: 1 });
  assert.deepEqual(s.rules[0].event.params, {});
  assert.equal(s.rules[0].body.length, 1);
  assert.equal(s.rules[0].body[0].params.text.length, 300);
  assert.ok(!('extra' in s));
  assert.deepEqual(sanitize(null), { rules: [] });
});

test('выполнение: порядок, повтор, ожидание', async () => {
  const { rt, log, waits } = makeRuntime();
  rt.load({
    rules: [rule('r1', 'click', [
      say('a', 'один'),
      { id: 'rp', type: 'repeat', params: { times: 2 }, children: [say('b', 'два'), { id: 'w', type: 'wait', params: { sec: 3 } }] },
      { id: 'e', type: 'emotion', params: { mood: 'love' } },
    ])],
  });
  await rt.fire('click');
  assert.deepEqual(log, [['say', 'один'], ['say', 'два'], ['say', 'два'], ['emotion', 'love']]);
  assert.deepEqual(waits, [3, 3]);
});

test('условия: утро, вечер, Pomodoro, дела, шанс', async () => {
  const cases = [
    ['morning', { hour: 9 }, true], ['morning', { hour: 15 }, false],
    ['evening', { hour: 19 }, true], ['evening', { hour: 15 }, false],
    ['pomodoro', { pomo: true }, true], ['pomodoro', {}, false],
    ['hasTasks', { tasks: 2 }, true], ['hasTasks', {}, false],
    ['chance', { rng: () => 0.2 }, true], ['chance', { rng: () => 0.8 }, false],
  ];
  for (const [cond, extra, expected] of cases) {
    const { rt, log } = makeRuntime(extra);
    rt.load({ rules: [rule('r', 'click', [{ id: 'i', type: 'if', params: { cond }, children: [say('s', 'да')] }])] });
    await rt.fire('click');
    assert.equal(log.length === 1, expected, `${cond} ${JSON.stringify(extra)}`);
  }
});

test('правило с ошибкой не запускается, остальные работают', async () => {
  const { rt, log } = makeRuntime();
  rt.load({ rules: [rule('r1', 'click', [say('a', '')]), rule('r2', 'click', [say('b', 'ок')])] });
  await rt.fire('click');
  assert.deepEqual(log, [['say', 'ок']]);
});

test('повторный запуск во время выполнения игнорируется, stopAll прерывает', async () => {
  const log = [];
  let release;
  const gate = new Promise((r) => { release = r; });
  const rt = new Runtime({
    api: { say: (t) => log.push(t), emotion() {}, sound() {}, pomodoroRunning: () => false, openTasks: () => 0 },
    sleep: () => gate,
  });
  rt.load({ rules: [rule('r', 'click', [say('a', 'до'), { id: 'w', type: 'wait', params: { sec: 5 } }, say('b', 'после')])] });
  const first = rt.fire('click');
  await rt.fire('click');
  assert.deepEqual(log, ['до']);
  rt.stopAll();
  release();
  await first;
  assert.deepEqual(log, ['до']);
});

test('every: срабатывает по накопленному времени', async () => {
  const { rt, log } = makeRuntime();
  rt.load({ rules: [rule('r', 'every', [say('a', 'тик')], { min: 2 })] });
  rt.tick(60);
  assert.equal(log.length, 0);
  rt.tick(60);
  await new Promise((r) => setImmediate(r));
  assert.equal(log.length, 1);
});

test('предел шагов защищает от бесконечной нагрузки', async () => {
  const { rt, log } = makeRuntime();
  const inner = { id: 'i', type: 'repeat', params: { times: 10 }, children: [{ id: 's', type: 'sound', params: { name: 'happy' } }] };
  rt.load({ rules: [rule('r', 'click', [{ id: 'o', type: 'repeat', params: { times: 10 }, children: [inner, { ...inner, id: 'i2' }, { ...inner, id: 'i3' }] }])] });
  await rt.fire('click');
  assert.ok(log.some((l) => l[0] === 'error' && /слишком много шагов/.test(l[1])));
});

test('каталог: у каждого блока есть подпись и параметры', () => {
  for (const group of [CATALOG.events, CATALOG.actions]) {
    for (const spec of Object.values(group)) {
      assert.ok(spec.label);
      assert.ok(Array.isArray(spec.params));
    }
  }
});

test('счётчики: запомнить, прибавить, сравнить, подставить в фразу', async () => {
  const { rt, log } = makeRuntime();
  rt.load({ rules: [rule('r', 'click', [
    { id: 'a', type: 'setVar', params: { name: 'счёт', value: 1 } },
    { id: 'b', type: 'changeVar', params: { name: 'счёт', by: 4 } },
    say('c', 'Счёт: {счёт}'),
    { id: 'd', type: 'ifVar', params: { name: 'счёт', op: 'gt', value: 4 }, children: [say('e', 'много')] },
    { id: 'f', type: 'ifVar', params: { name: 'счёт', op: 'lt', value: 4 }, children: [say('g', 'мало')] },
    { id: 'h', type: 'ifVar', params: { name: 'счёт', op: 'eq', value: 5 }, children: [say('i', 'ровно')] },
  ])] });
  await rt.fire('click');
  assert.deepEqual(log, [['say', 'Счёт: 5'], ['say', 'много'], ['say', 'ровно']]);
});

test('счётчик не выходит за пределы и живёт между запусками', async () => {
  const { rt, log } = makeRuntime();
  rt.load({ rules: [rule('r', 'click', [
    { id: 'a', type: 'changeVar', params: { name: 'n', by: 999 } },
    { id: 'b', type: 'changeVar', params: { name: 'n', by: 999 } },
    say('c', '{n}'),
  ])] });
  await rt.fire('click');
  await rt.fire('click');
  assert.deepEqual(log, [['say', '999'], ['say', '999']]);
});

test('сказать одну из: выбирает по генератору', async () => {
  const { rt, log } = makeRuntime({ rng: () => 0.99 });
  rt.load({ rules: [rule('r', 'click', [{ id: 'a', type: 'sayRandom', params: { text: 'раз; два; три' } }])] });
  await rt.fire('click');
  assert.deepEqual(log, [['say', 'три']]);
});

test('действия управления: разминка, глаза, Pomodoro, тишина, дело', async () => {
  const { rt, log } = makeRuntime();
  rt.load({ rules: [rule('r', 'click', [
    { id: 'a', type: 'exercise', params: {} },
    { id: 'b', type: 'eyes', params: {} },
    { id: 'c', type: 'pomoStart', params: {} },
    { id: 'd', type: 'pomoStop', params: {} },
    { id: 'e', type: 'dnd', params: { min: 5 } },
    { id: 'f', type: 'addTask', params: { text: 'вода' } },
  ])] });
  await rt.fire('click');
  assert.deepEqual(log, [['exercise'], ['eyes'], ['pomoStart'], ['pomoStop'], ['dnd', 5], ['addTask', 'вода']]);
});

test('добавление дел за один запуск ограничено', async () => {
  const { rt, log } = makeRuntime();
  const add = { id: 'a', type: 'addTask', params: { text: 'дело' } };
  rt.load({ rules: [rule('r', 'click', [{ id: 'rp', type: 'repeat', params: { times: 10 }, children: [add, { id: 'w', type: 'wait', params: { sec: 1 } }] }])] });
  await rt.fire('click');
  assert.equal(log.filter((l) => l[0] === 'addTask').length, 3);
});

test('событие «В заданное время» срабатывает один раз в минуту', async () => {
  const { rt, log } = makeRuntime({ hour: 9 });
  rt.load({ rules: [rule('r', 'time', [say('a', 'доброе утро')], { at: '9:00' })] });
  rt.tick(1);
  await new Promise((r) => setImmediate(r));
  rt.tick(1);
  await new Promise((r) => setImmediate(r));
  assert.equal(log.length, 1);
});

test('время и имя числа проверяются понятными сообщениями', () => {
  const p = validate({ rules: [
    rule('r', 'time', [{ id: 'v', type: 'setVar', params: { name: '1 2', value: 0 } }], { at: '25:99' }),
  ] });
  assert.match(p.find((x) => x.blockId === 'r').message, /09:30/);
  assert.match(p.find((x) => x.blockId === 'v').message, /Название числа/);
});

test('условия «грущу» и «тишина»', async () => {
  for (const [cond, extra] of [['sad', { sad: true }], ['quiet', { quiet: true }]]) {
    const { rt, log } = makeRuntime(extra);
    rt.load({ rules: [rule('r', 'click', [{ id: 'i', type: 'if', params: { cond }, children: [say('s', 'да')] }])] });
    await rt.fire('click');
    assert.equal(log.length, 1, cond);
  }
});
