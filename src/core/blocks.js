'use strict';

const MOODS = {
  happy: 'радость',
  love: 'любовь',
  sad: 'грусть',
  energetic: 'бодрость',
  focused: 'сосредоточенность',
};

const SOUNDS = {
  happy: 'весёлый',
  sad: 'грустный',
  love: 'нежный',
  poke: 'тык',
  alert: 'тревога',
  work: 'работа',
  done: 'готово',
  wake: 'проснулся',
  sleep: 'засыпаю',
};

const OPS = { gt: 'больше', lt: 'меньше', eq: 'равно' };

const CONDITIONS = {
  sad: 'я грущу',
  quiet: 'включена тишина',
  pomodoro: 'идёт Pomodoro',
  morning: 'сейчас утро (до 12:00)',
  evening: 'сейчас вечер (после 18:00)',
  hasTasks: 'в списке есть дела',
  chance: 'выпал шанс 50%',
};

const NAME_RE = /^[A-Za-zА-Яа-яЁё_][A-Za-zА-Яа-яЁё0-9_]{0,15}$/;

const options = (map) => Object.entries(map).map(([value, label]) => ({ value, label }));

const CATALOG = {
  events: {
    start: { label: 'Когда Сеня запустился', params: [] },
    click: { label: 'Когда меня тыкнули', params: [] },
    pet: { label: 'Когда меня погладили', params: [] },
    break: { label: 'Когда пора на перерыв', params: [] },
    pomoStart: { label: 'Когда начался Pomodoro', params: [] },
    pomoEnd: { label: 'Когда закончился Pomodoro', params: [] },
    taskDone: { label: 'Когда дело выполнено', params: [] },
    wake: { label: 'Когда Сеня проснулся', params: [] },
    sleep: { label: 'Когда Сеня заснул', params: [] },
    exerciseDone: { label: 'Когда разминка закончена', params: [] },
    time: {
      label: 'В',
      params: [{ key: 'at', kind: 'text', max: 5, def: '09:00', pattern: /^([01]?\d|2[0-3]):[0-5]\d$/, patternMessage: 'Время нужно писать так: 09:30', patternHint: 'Часы, двоеточие, минуты. Например 14:05.' }],
    },
    every: {
      label: 'Каждые',
      params: [{ key: 'min', kind: 'number', min: 1, max: 240, def: 10, suffix: 'мин' }],
    },
  },
  actions: {
    say: {
      label: 'Сказать',
      params: [{ key: 'text', kind: 'text', max: 120, def: 'Привет!' }],
    },
    emotion: {
      label: 'Показать эмоцию',
      params: [{ key: 'mood', kind: 'select', options: options(MOODS), def: 'happy' }],
    },
    sound: {
      label: 'Издать звук',
      params: [{ key: 'name', kind: 'select', options: options(SOUNDS), def: 'happy' }],
    },
    sayRandom: {
      label: 'Сказать одну из',
      params: [{ key: 'text', kind: 'text', max: 120, def: 'Привет!; Здорово!; Ура!', hint: 'Впиши несколько фраз через точку с запятой, Сеня выберет одну.' }],
    },
    exercise: { label: 'Запустить разминку', params: [] },
    eyes: { label: 'Запустить гимнастику для глаз', params: [] },
    pomoStart: { label: 'Запустить Pomodoro', params: [] },
    pomoStop: { label: 'Остановить Pomodoro', params: [] },
    dnd: {
      label: 'Включить тишину на',
      params: [{ key: 'min', kind: 'number', min: 1, max: 120, def: 10, suffix: 'мин' }],
    },
    addTask: {
      label: 'Добавить дело',
      params: [{ key: 'text', kind: 'text', max: 120, def: 'Выпить воды', hint: 'Впиши дело, например «позвонить маме» или «через 20 минут размяться».' }],
    },
    setVar: {
      label: 'Запомнить число',
      params: [
        { key: 'name', kind: 'text', max: 16, def: 'счёт', pattern: NAME_RE, patternMessage: 'Название числа можно писать буквами и цифрами без пробелов.', patternHint: 'Например: счёт или клики2.' },
        { key: 'value', kind: 'number', min: -999, max: 999, def: 0, suffix: '' },
      ],
    },
    changeVar: {
      label: 'Прибавить к числу',
      params: [
        { key: 'name', kind: 'text', max: 16, def: 'счёт', pattern: NAME_RE, patternMessage: 'Название числа можно писать буквами и цифрами без пробелов.', patternHint: 'Например: счёт или клики2.' },
        { key: 'by', kind: 'number', min: -999, max: 999, def: 1, suffix: '' },
      ],
    },
    wait: {
      label: 'Подождать',
      params: [{ key: 'sec', kind: 'number', min: 1, max: 30, def: 2, suffix: 'сек' }],
    },
    repeat: {
      label: 'Повторить',
      container: true,
      params: [{ key: 'times', kind: 'number', min: 1, max: 10, def: 3, suffix: 'раз' }],
    },
    ifVar: {
      label: 'Если число',
      container: true,
      params: [
        { key: 'name', kind: 'text', max: 16, def: 'счёт', pattern: NAME_RE, patternMessage: 'Название числа можно писать буквами и цифрами без пробелов.', patternHint: 'Например: счёт или клики2.' },
        { key: 'op', kind: 'select', options: options(OPS), def: 'gt' },
        { key: 'value', kind: 'number', min: -999, max: 999, def: 3, suffix: '' },
      ],
    },
    if: {
      label: 'Если',
      container: true,
      params: [{ key: 'cond', kind: 'select', options: options(CONDITIONS), def: 'pomodoro' }],
    },
  },
};

const LIMITS = {
  rules: 12,
  blocks: 80,
  depth: 3,
  steps: 300,
  textLen: 120,
};

function sanitize(program) {
  const out = { rules: [] };
  if (!program || !Array.isArray(program.rules)) return out;
  let count = 0;

  const cleanBlock = (b, depth) => {
    if (!b || typeof b !== 'object' || count >= LIMITS.blocks) return null;
    count++;
    const params = {};
    for (const [k, v] of Object.entries(b.params || {})) {
      if (typeof v === 'string') params[k] = v.slice(0, 300);
      else if (typeof v === 'number' && Number.isFinite(v)) params[k] = v;
    }
    const block = { id: String(b.id || '').slice(0, 40), type: String(b.type || '').slice(0, 20), params };
    if (Array.isArray(b.children)) {
      block.children = depth < LIMITS.depth + 1
        ? b.children.map((c) => cleanBlock(c, depth + 1)).filter(Boolean)
        : [];
    }
    return block;
  };

  for (const r of program.rules.slice(0, LIMITS.rules)) {
    if (!r || typeof r !== 'object' || count >= LIMITS.blocks) continue;
    count++;
    const params = {};
    for (const [k, v] of Object.entries((r.event && r.event.params) || {})) {
      if (typeof v === 'string') params[k] = v.slice(0, 300);
      else if (typeof v === 'number' && Number.isFinite(v)) params[k] = v;
    }
    out.rules.push({
      id: String(r.id || '').slice(0, 40),
      event: { type: String((r.event && r.event.type) || '').slice(0, 20), params },
      body: (Array.isArray(r.body) ? r.body : []).map((b) => cleanBlock(b, 1)).filter(Boolean),
    });
  }
  return out;
}

function numberOf(params, spec) {
  const v = params ? params[spec.key] : undefined;
  return typeof v === 'number' ? v : Number(v);
}

function validate(program) {
  const problems = [];
  const add = (blockId, level, message, hint) => problems.push({ blockId, level, message, hint });
  const p = sanitize(program);

  if (program && Array.isArray(program.rules) && program.rules.length > LIMITS.rules) {
    add('', 'error', `Слишком много правил: можно не больше ${LIMITS.rules}.`, 'Удали те, которые тебе не нужны.');
  }

  const checkParams = (block, spec) => {
    for (const ps of spec.params) {
      const v = block.params[ps.key];
      if (ps.kind === 'text') {
        if (typeof v !== 'string' || !v.trim()) {
          add(block.id, 'error', `В блоке «${spec.label}» ничего не написано.`, ps.hint || 'Впиши в поле текст, который должен сказать Сеня.');
        } else if (ps.pattern && !ps.pattern.test(v.trim())) {
          add(block.id, 'error', ps.patternMessage, ps.patternHint);
        } else if (v.length > ps.max) {
          add(block.id, 'error', `Текст слишком длинный: ${v.length} символов, а можно ${ps.max}.`, 'Сократи фразу или раздели на два блока «Сказать».');
        }
      } else if (ps.kind === 'number') {
        const n = numberOf(block.params, ps);
        if (!Number.isFinite(n)) {
          add(block.id, 'error', `В блоке «${spec.label}» нужно число.`, 'Впиши цифрами, например 3.');
        } else if (n < ps.min || n > ps.max) {
          add(block.id, 'error', `В блоке «${spec.label}» число ${n} не подходит: нужно от ${ps.min} до ${ps.max}.`, `Выбери число от ${ps.min} до ${ps.max}.`);
        }
      } else if (ps.kind === 'select') {
        if (!ps.options.some((o) => o.value === v)) {
          add(block.id, 'error', `В блоке «${spec.label}» ничего не выбрано.`, 'Открой список и выбери один из вариантов.');
        }
      }
    }
  };

  const walk = (blocks, depth, hasWaitAbove) => {
    let sawWait = hasWaitAbove;
    for (const b of blocks) {
      const spec = CATALOG.actions[b.type];
      if (!spec) {
        add(b.id, 'error', `Не знаю блок «${b.type || 'без названия'}».`, 'Удали его и возьми блок из списка слева.');
        continue;
      }
      checkParams(b, spec);
      if (b.type === 'wait') sawWait = true;
      if (spec.container) {
        if (depth >= LIMITS.depth) {
          add(b.id, 'error', 'Блоки вложены слишком глубоко.', `Можно вкладывать не больше ${LIMITS.depth} уровней: упрости программу.`);
          continue;
        }
        const kids = b.children || [];
        if (!kids.length) {
          add(b.id, 'warn', `Внутри блока «${spec.label}» пусто, он ничего не делает.`, 'Добавь внутрь блок «Сказать» или другое действие.');
        }
        if (b.type === 'repeat') {
          const times = numberOf(b.params, spec.params[0]);
          const hasWait = containsType(kids, 'wait');
          const talks = ['say', 'sayRandom', 'sound', 'addTask'].some((t) => containsType(kids, t));
          if (Number.isFinite(times) && times > 3 && talks && !hasWait && !sawWait) {
            add(b.id, 'warn', 'Сеня будет повторять очень быстро, и фразы сольются.', 'Добавь внутрь «Повторить» блок «Подождать» хотя бы на 2 секунды.');
          }
        }
        walk(kids, depth + 1, sawWait);
      }
    }
  };

  const seenEvents = new Map();
  for (const r of p.rules) {
    const spec = CATALOG.events[r.event.type];
    if (!spec) {
      add(r.id, 'error', 'У этого правила нет события.', 'Выбери событие слева: например «Когда меня тыкнули».');
      continue;
    }
    checkParams({ id: r.id, params: r.event.params }, spec);
    if (!r.body.length) {
      add(r.id, 'warn', `Под событием «${spec.label}» нет ни одного действия.`, 'Нажми на блок действия слева, например «Сказать».');
    }
    if (r.event.type !== 'every' && r.event.type !== 'time') {
      if (seenEvents.has(r.event.type)) {
        add(r.id, 'warn', `Событие «${spec.label}» уже есть выше: сработают оба правила по очереди.`, 'Если так и задумано, всё в порядке. Если нет, объедини их в одно.');
      }
      seenEvents.set(r.event.type, true);
    }
    walk(r.body, 1, false);
  }

  const countAll = (blocks) => blocks.reduce((n, b) => n + 1 + countAll(b.children || []), 0);
  const total = p.rules.reduce((n, r) => n + 1 + countAll(r.body), 0);
  if (total >= LIMITS.blocks) {
    add('', 'error', `Блоков слишком много: можно не больше ${LIMITS.blocks}.`, 'Удали лишние блоки.');
  }
  return problems;
}

function containsType(blocks, type) {
  return blocks.some((b) => b.type === type || containsType(b.children || [], type));
}

class Cancelled extends Error {}

const MAX_TASKS_PER_RUN = 3;
const clampNum = (n) => Math.max(-999, Math.min(999, Number.isFinite(n) ? n : 0));

class Runtime {
  constructor({ api, sleep, rng = Math.random, now = () => new Date() }) {
    this.api = api;
    this.sleep = sleep || ((sec) => new Promise((res) => setTimeout(res, sec * 1000)));
    this.rng = rng;
    this.now = now;
    this.rules = [];
    this.running = new Map();
    this.token = 0;
    this._everyAcc = new Map();
    this.vars = new Map();
    this._lastTime = new Map();
    this.onError = () => {};
  }

  load(program) {
    const clean = sanitize(program);
    this.rules = clean.rules.filter((r) => (
      CATALOG.events[r.event.type] && r.body.length
      && !validate({ rules: [r] }).some((p) => p.level === 'error')
    ));
    this._everyAcc = new Map();
    this.vars = new Map();
    this._lastTime = new Map();
  }

  stopAll() {
    this.token++;
    this.running.clear();
  }

  fire(eventType) {
    const out = [];
    for (const rule of this.rules) {
      if (rule.event.type === eventType) out.push(this.run(rule));
    }
    return Promise.all(out);
  }

  tick(dtSec) {
    const d = this.now();
    const stamp = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()} ${d.getHours()}:${d.getMinutes()}`;
    for (const rule of this.rules) {
      if (rule.event.type === 'time') {
        const [h, m] = String(rule.event.params.at).trim().split(':').map(Number);
        if (d.getHours() === h && d.getMinutes() === m && this._lastTime.get(rule.id) !== stamp) {
          this._lastTime.set(rule.id, stamp);
          this.run(rule);
        }
      }
      if (rule.event.type !== 'every') continue;
      const every = Math.max(1, Number(rule.event.params.min) || 10) * 60;
      const acc = (this._everyAcc.get(rule.id) || 0) + dtSec;
      if (acc >= every) {
        this._everyAcc.set(rule.id, 0);
        this.run(rule);
      } else {
        this._everyAcc.set(rule.id, acc);
      }
    }
  }

  async run(rule) {
    if (this.running.has(rule.id)) return;
    const token = this.token;
    this.running.set(rule.id, true);
    const ctx = { token, steps: 0, tasks: 0 };
    try {
      await this._exec(rule.body, ctx);
    } catch (e) {
      if (!(e instanceof Cancelled)) this.onError(e, rule);
    } finally {
      if (this.token === token) this.running.delete(rule.id);
    }
  }

  async _exec(blocks, ctx) {
    for (const b of blocks) {
      if (this.token !== ctx.token) throw new Cancelled();
      if (++ctx.steps > LIMITS.steps) throw new Error('Программа сделала слишком много шагов и была остановлена.');
      const p = b.params;
      switch (b.type) {
        case 'say': this.api.say(this._fill(String(p.text))); break;
        case 'sayRandom': {
          const parts = String(p.text).split(';').map((x) => x.trim()).filter(Boolean);
          if (parts.length) this.api.say(this._fill(parts[Math.floor(this.rng() * parts.length) % parts.length]));
          break;
        }
        case 'exercise': this.api.exercise(); break;
        case 'eyes': this.api.eyes(); break;
        case 'pomoStart': this.api.pomoStart(); break;
        case 'pomoStop': this.api.pomoStop(); break;
        case 'dnd': this.api.dnd(Number(p.min)); break;
        case 'addTask':
          if (ctx.tasks < MAX_TASKS_PER_RUN) {
            ctx.tasks += 1;
            this.api.addTask(String(p.text));
          }
          break;
        case 'setVar': this.vars.set(String(p.name).trim(), clampNum(Number(p.value))); break;
        case 'changeVar': {
          const key = String(p.name).trim();
          this.vars.set(key, clampNum((this.vars.get(key) || 0) + Number(p.by)));
          break;
        }
        case 'ifVar': {
          const v = this.vars.get(String(p.name).trim()) || 0;
          const n = Number(p.value);
          const ok = p.op === 'gt' ? v > n : p.op === 'lt' ? v < n : v === n;
          if (ok) await this._exec(b.children || [], ctx);
          break;
        }
        case 'emotion': this.api.emotion(String(p.mood)); break;
        case 'sound': this.api.sound(String(p.name)); break;
        case 'wait': await this.sleep(Number(p.sec)); break;
        case 'repeat': {
          const times = Math.min(10, Math.max(1, Number(p.times)));
          for (let i = 0; i < times; i++) await this._exec(b.children || [], ctx);
          break;
        }
        case 'if':
          if (this._cond(String(p.cond))) await this._exec(b.children || [], ctx);
          break;
        default: break;
      }
    }
    if (this.token !== ctx.token) throw new Cancelled();
  }

  _fill(text) {
    return text.replace(/\{([^{}]{1,16})\}/g, (m, name) => (this.vars.has(name.trim()) ? String(this.vars.get(name.trim())) : m));
  }

  _cond(name) {
    const hour = this.now().getHours();
    switch (name) {
      case 'sad': return Boolean(this.api.isSad());
      case 'quiet': return Boolean(this.api.isQuiet());
      case 'pomodoro': return Boolean(this.api.pomodoroRunning());
      case 'morning': return hour < 12;
      case 'evening': return hour >= 18;
      case 'hasTasks': return this.api.openTasks() > 0;
      case 'chance': return this.rng() < 0.5;
      default: return false;
    }
  }
}

module.exports = { CATALOG, LIMITS, MOODS, SOUNDS, CONDITIONS, sanitize, validate, Runtime };
