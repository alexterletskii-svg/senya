'use strict';

(() => {
  const api = window.senya;
  const $ = (sel, root = document) => root.querySelector(sel);
  const el = (tag, props = {}, children = []) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else if (v !== undefined && v !== null) n.setAttribute(k, v);
    }
    for (const c of [].concat(children)) if (c) n.append(c);
    return n;
  };

  let state = null;
  const robotWrap = $('#robot-wrap');
  robotWrap.innerHTML = window.ROBOT_SVG;
  const robot = $('#robot');

  const appEl = $('#app');
  let lastSize = '';
  const reportLayout = () => {
    const r = appEl.getBoundingClientRect();
    const key = `${Math.ceil(r.width)}x${Math.ceil(r.height)}`;
    if (key === lastSize) return;
    lastSize = key;
    api.layout(Math.ceil(r.width), Math.ceil(r.height));
  };
  new ResizeObserver(reportLayout).observe(appEl);

  const flags = { drag: false, land: false, talk: false };
  function refreshClass() {
    if (!state) return;
    robot.setAttribute('class',
      `mood-${state.mood}${state.hardHat ? ' hat' : ''}${flags.drag ? ' drag' : ''}${flags.land ? ' land' : ''}` +
      `${flags.talk ? ' talk' : ''}${state.dnd && state.dnd.active ? ' quiet' : ''}` +
      `${state.exercise && state.exercise.active ? ` ex-${state.exercise.anim}` : ''}`);
  }
  function applyMood() { refreshClass(); }

  const look = $('.look', robot);
  let cur = { x: 0, y: 0 };
  let tgt = { x: 0, y: 0 };
  let cursorTgt = { x: 0, y: 0 };
  let lastMove = 0;
  let glanceUntil = 0;
  let lookRaf = 0;

  function stepLook() {
    lookRaf = 0;
    cur.x += (tgt.x - cur.x) * 0.18;
    cur.y += (tgt.y - cur.y) * 0.18;
    look.setAttribute('transform', `translate(${cur.x.toFixed(2)} ${cur.y.toFixed(2)})`);
    if (Math.abs(tgt.x - cur.x) > 0.05 || Math.abs(tgt.y - cur.y) > 0.05) lookRaf = requestAnimationFrame(stepLook);
  }
  function setLook(x, y) {
    tgt = { x, y };
    if (!lookRaf) lookRaf = requestAnimationFrame(stepLook);
  }
  function onCursor(p) {
    const r = robotWrap.getBoundingClientRect();
    const cx = window.screenX + r.left + r.width / 2;
    const cy = window.screenY + r.top + r.height / 2;
    const dx = p.x - cx;
    const dy = p.y - cy;
    const dist = Math.hypot(dx, dy);
    const k = Math.min(dist / 140, 1);
    cursorTgt = dist < 1 ? { x: 0, y: 0 } : { x: (dx / dist) * k * 10, y: (dy / dist) * k * 7 };
    lastMove = performance.now();
    if (lastMove > glanceUntil && !(state && state.mood === 'sleeping')) setLook(cursorTgt.x, cursorTgt.y);
  }
  function idleLoop() {
    setTimeout(() => {
      const now = performance.now();
      if (state && state.mood === 'energetic' && !flags.drag && now - lastMove > 3000) {
        if (Math.random() < 0.3) {
          const eye = $('.eye-r', robot);
          eye.classList.add('wink');
          setTimeout(() => eye.classList.remove('wink'), 700);
        } else {
          setLook((Math.random() - 0.5) * 20, (Math.random() - 0.5) * 10);
          glanceUntil = now + 1500;
          setTimeout(() => setLook(cursorTgt.x, cursorTgt.y), 1500);
        }
      }
      idleLoop();
    }, 6000 + Math.random() * 8000);
  }
  idleLoop();

  const ALERT_KINDS = ['break', 'eyes', 'water', 'posture', 'task', 'pomodoro', 'goal'];
  let talkTimer = 0;

  function talk(text) {
    const ms = Sound.babble(text) || Math.min(String(text).length * 55, 2500);
    flags.talk = true;
    refreshClass();
    clearTimeout(talkTimer);
    talkTimer = setTimeout(() => { flags.talk = false; refreshClass(); }, ms);
  }

  function soundFor(r) {
    if (ALERT_KINDS.includes(r.kind)) Sound.play('alert');
    if (['eyes-done', 'exercise-done', 'goal'].includes(r.kind)) Sound.play('done');
    if (r.kind === 'poke') Sound.play('poke');
  }

  function moodSound(prev, mood) {
    if (mood === 'happy') Sound.play('happy');
    else if (mood === 'sad') Sound.play('sad');
    else if (mood === 'love') Sound.play('love');
    else if (mood === 'sleeping') Sound.play('sleep');
    else if (mood === 'focused') Sound.play('work');
    else if (prev === 'sleeping') Sound.play('wake');
  }

  const bubblesEl = $('#bubbles');
  const queue = [];
  let current = null;
  const TTL = { break: 60000, eyes: 45000, water: 14000, posture: 14000, pomodoro: 9000, wake: 6000, hello: 6000, 'task-added': 3500, 'eyes-done': 4500, 'exercise-done': 5000, goal: 7000, happy: 4500, love: 3500, poke: 4000, chat: 9000, task: 0 };

  function showNext() {
    if (current || queue.length === 0) return;
    current = queue.shift();
    renderBubble();
  }

  function closeBubble() {
    if (!current) return;
    clearTimeout(current.timer);
    current = null;
    bubblesEl.replaceChildren();
    showNext();
  }

  function renderBubble() {
    const r = current;
    const actions = (r.actions || []).map((a) =>
      el('button', {
        class: a.id.endsWith('snooze') ? 'ghost' : '',
        text: a.label,
        onclick: () => { api.act(a.id, a.payload); closeBubble(); },
      }));
    const sad = r.kind === 'break' && state && state.mood === 'sad';
    bubblesEl.replaceChildren(el('div', { class: `bubble kind-${r.kind}${sad ? ' sad' : ''}` }, [
      el('button', { class: 'x', text: 'x', title: 'Закрыть', onclick: closeBubble }),
      el('div', { class: 'text', text: r.text }),
      actions.length ? el('div', { class: 'actions' }, actions) : null,
    ]));
    setTimeout(() => talk(r.text), ALERT_KINDS.includes(r.kind) ? 320 : 0);
    const ttl = TTL[r.kind] === undefined ? 12000 : TTL[r.kind];
    if (ttl > 0) current.timer = setTimeout(closeBubble, ttl);
  }

  function pushBubble(r, { beepOn = true } = {}) {
    const same = (x) => x.kind === r.kind && x.taskId === r.taskId;
    if (current && same(current)) {
      clearTimeout(current.timer);
      current = { ...r };
      renderBubble();
      return;
    }
    const i = queue.findIndex(same);
    if (i >= 0) queue.splice(i, 1);
    queue.push({ ...r });
    if (queue.length > 5) queue.shift();
    if (beepOn) soundFor(r);
    showNext();
  }

  const panel = $('#panel');
  const P = {};
  const DOWS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
  const DND_REASON = { fullscreen: 'полный экран', presentation: 'презентация', call: 'звонок' };

  function buildPanel() {
    P.dndChip = el('span', { class: 'chip' });
    P.dndChip.hidden = true;
    P.stats = el('div', { class: 'stats' });
    P.pomoTime = el('div', { class: 'pomo-time', text: '25:00' });
    P.pomoPhase = el('div', { class: 'pomo-phase' });
    P.pomoStart = el('button', { text: 'Старт', onclick: () => api.act(pomoPrimaryAction()) });
    P.pomoSkip = el('button', { class: 'ghost', text: 'Пропуск', onclick: () => api.act('pomo:skip') });
    P.pomoStop = el('button', { class: 'ghost', text: 'Стоп', onclick: () => api.act('pomo:stop') });
    P.dndBtn = el('button', { class: 'ghost', text: 'Тишина', onclick: () => api.act('dnd:set', state && state.dnd.manual ? 0 : 60) });

    P.input = el('input', { type: 'text', placeholder: 'Задача… «через 20 мин позвонить»', maxlength: '200' });
    P.input.addEventListener('keydown', (e) => { if (e.key === 'Enter') addTask(); });
    P.taskList = el('div', { class: 'tasks' });
    P.clearDone = el('button', { class: 'ghost', text: 'Убрать выполненные', onclick: () => api.act('task:clear-done') });

    P.ask = el('input', { type: 'text', placeholder: 'Спроси Сеню о чём угодно…', maxlength: '300' });
    P.ask.addEventListener('keydown', (e) => { if (e.key === 'Enter') askAi(); });
    P.askHint = el('div', { class: 'hint' });

    P.streak = el('div', { class: 'streak' });
    P.week = el('div', { class: 'week' });
    P.weekSum = el('div', { class: 'hint' });
    P.settings = el('div', { class: 'settings' });

    panel.replaceChildren(
      el('div', { class: 'p-head' }, [
        el('b', { text: 'senya@desktop:~$' }),
        P.dndChip,
        el('button', { class: 'ghost', text: 'x', title: 'Закрыть меню', onclick: togglePanel }),
      ]),
      P.stats,
      el('div', { class: 'card' }, [
        P.pomoTime, P.pomoPhase,
        el('div', { class: 'row' }, [P.pomoStart, P.pomoSkip, P.pomoStop]),
      ]),
      el('div', { class: 'grid3' }, [
        el('button', { class: 'ghost', text: 'Глаза', title: 'Гимнастика для глаз', onclick: () => api.act('eyes:start') }),
        el('button', { class: 'ghost', text: 'Разминка', title: 'Упражнение на 30 секунд', onclick: () => api.act('exercise:start') }),
        el('button', { class: 'ghost', text: 'Размялся', title: 'Засчитать перерыв', onclick: () => api.act('break:ack') }),
        el('button', { class: 'ghost', text: 'Погладить', onclick: () => api.act('pet') }),
        el('button', { class: 'ghost', text: 'Поболтать', onclick: () => api.act('chat') }),
        P.dndBtn,
      ]),
      el('div', { class: 'card' }, [
        el('h3', { text: 'СПИСОК ДЕЛ' }),
        el('div', { class: 'task-add' }, [P.input, el('button', { text: '+', onclick: addTask })]),
        el('div', { class: 'hint', text: '«в 15:30 созвон», «завтра в 9 отчёт», «каждый день в 9 зарядка», «каждые 2 часа вода»' }),
        P.taskList,
        P.clearDone,
      ]),
      el('div', { class: 'card' }, [
        el('h3', { text: 'СПРОСИТЬ СЕНЮ' }),
        P.ask,
        P.askHint,
      ]),
      el('div', { class: 'card' }, [
        el('h3', { text: 'НЕДЕЛЯ' }),
        P.streak, P.week, P.weekSum,
      ]),
      el('details', {}, [el('summary', { text: 'Настройки' }), P.settings]),
      el('div', { class: 'row' }, [
        el('button', { class: 'ghost', text: 'Спрятать', title: 'Скрыть Сеню; вернуть — через иконку в трее или Ctrl+Alt+S', onclick: () => api.act('app:hide') }),
        el('button', { class: 'danger', text: 'Выход', onclick: () => api.act('app:quit') }),
      ]),
    );
  }

  function addTask() {
    const v = P.input.value.trim();
    if (!v) return;
    api.act('task:add', v);
    P.input.value = '';
  }

  function askAi() {
    const v = P.ask.value.trim();
    if (!v) return;
    api.act('ai:ask', v);
    P.ask.value = '';
  }

  function pomoPrimaryAction() {
    const p = state && state.pomodoro;
    if (!p || p.phase === 'idle') return 'pomo:start';
    return p.running ? 'pomo:pause' : 'pomo:resume';
  }

  const fmt = (sec) => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
  const PHASE = { idle: 'ОЖИДАНИЕ', work: 'РАБОТА', break: 'ПЕРЕРЫВ', longBreak: 'ДЛИННЫЙ ПЕРЕРЫВ' };

  function dueLabel(ts) {
    const d = new Date(ts);
    const now = new Date();
    const hm = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
    if (d.toDateString() === now.toDateString()) return hm;
    if (d.toDateString() === tomorrow.toDateString()) return `завтра ${hm}`;
    return `${d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })} ${hm}`;
  }

  let shown = { tasks: '', settings: '', week: '' };

  function renderPanel(s) {
    const st = s.stats;
    P.stats.textContent = `сегодня: перерывы=${st.breaks} разминки=${st.exercises} помодоро=${st.pomodoros} дела=${st.tasks} актив=${st.activeMin}м`;

    const d = s.dnd;
    P.dndChip.hidden = !d.active;
    if (d.active) {
      P.dndChip.textContent = d.auto ? `тихо: ${DND_REASON[d.reason] || 'авто'}` : 'тихо';
      P.dndChip.title = d.auto ? 'Сеня молчит: ' + (DND_REASON[d.reason] || 'авто') : 'Режим «Не беспокоить»';
    }
    P.dndBtn.textContent = d.manual
      ? `Вернуть${d.untilMs ? ` (ещё ${Math.max(1, Math.round((d.untilMs - Date.now()) / 60000))} мин)` : ''}`
      : 'Тишина 1 ч';

    const p = s.pomodoro;
    P.pomoTime.textContent = p.phase === 'idle' ? fmt(s.settings.workMin * 60) : fmt(p.remainingSec);
    P.pomoTime.className = `pomo-time ${p.phase === 'work' ? 'work' : p.phase === 'idle' ? '' : 'break'}`;
    P.pomoPhase.textContent = PHASE[p.phase] + (p.phase !== 'idle' && !p.running ? ' — пауза' : '') + (p.cycle ? ` · циклов: ${p.cycle}` : '');
    P.pomoStart.textContent = p.phase === 'idle' ? 'Старт' : p.running ? 'Пауза' : 'Продолжить';
    P.pomoSkip.disabled = P.pomoStop.disabled = p.phase === 'idle';

    P.askHint.textContent = s.ai ? 'Отвечает DeepSeek. Отправляются только твой вопрос и краткая сводка о состоянии, без названий дел.' : 'Для живого общения задай переменную окружения DEEPSEEK_API_KEY и перезапусти Сеню.';

    const tj = JSON.stringify(s.tasks);
    if (tj !== shown.tasks) {
      shown.tasks = tj;
      renderTasks(s.tasks);
    }
    P.clearDone.hidden = !s.tasks.some((t) => t.done);

    const wj = JSON.stringify([s.week, s.streak, s.settings.dailyGoal]);
    if (wj !== shown.week) {
      shown.week = wj;
      renderWeek(s);
    }

    const sj = JSON.stringify(s.settings);
    if (sj !== shown.settings && !P.settings.contains(document.activeElement)) {
      shown.settings = sj;
      renderSettings(s.settings);
    }
  }

  function renderWeek(s) {
    const goal = s.settings.dailyGoal;
    const max = Math.max(goal, ...s.week.map((d) => d.breaks), 1);
    P.streak.textContent = s.streak > 0
      ? `серия: ${s.streak} дн. · цель: ${goal} в день`
      : `Цель дня — ${goal} перерывов. Серия начнётся с первого выполненного дня.`;
    P.week.replaceChildren(...s.week.map((d, i) => el('div', {
      class: `wd${i === 6 ? ' today' : ''}${d.goal ? ' goal' : ''}`,
      title: `${d.date}: перерывов ${d.breaks}, помодоро ${d.pomodoros}, дел ${d.tasks}, активен ${d.activeMin} мин`,
    }, [
      el('i', { text: String(d.breaks) }),
      el('div', { class: 'bar-wrap' }, [el('div', { class: 'bar', style: `height:${Math.round((d.breaks / max) * 44)}px` })]),
      el('span', { text: DOWS[d.dow] }),
    ])));
    const sum = (k) => s.week.reduce((a, d) => a + d[k], 0);
    P.weekSum.textContent = `За 7 дней: перерывов ${sum('breaks')}, помодоро ${sum('pomodoros')}, дел ${sum('tasks')}, активен ${Math.round(sum('activeMin') / 6) / 10} ч`;
  }

  function renderTasks(tasks) {
    const now = Date.now();
    const sorted = [...tasks].sort((a, b) => (a.done - b.done) || ((a.dueAt || Infinity) - (b.dueAt || Infinity)) || a.id - b.id);
    if (sorted.length === 0) {
      P.taskList.replaceChildren(el('div', { class: 'empty', text: 'Дел пока нет. Скажи Сене, что запомнить.' }));
      return;
    }
    P.taskList.replaceChildren(...sorted.map((t) => {
      const cb = el('input', { type: 'checkbox' });
      cb.checked = t.done;
      cb.addEventListener('change', () => api.act(cb.checked ? 'task:done' : 'task:reopen', t.id));
      return el('div', { class: `task${t.done ? ' done' : ''}` }, [
        cb,
        el('span', { class: 't', text: t.text }),
        t.dueAt ? el('span', { class: `due${!t.done && t.dueAt < now ? ' late' : ''}`, title: t.repeatText || '', text: `${t.repeat ? '@повтор' : '@'} ${dueLabel(t.dueAt)}` }) : null,
        el('button', { class: 'rm', text: 'x', title: 'Удалить', onclick: () => api.act('task:remove', t.id) }),
      ]);
    }));
  }

  const SETTING_FIELDS = [
    ['breakEveryMin', 'Перерыв каждые, мин'],
    ['eyesEveryMin', 'Гимнастика глаз, мин'],
    ['waterEveryMin', 'Вода, мин'],
    ['postureEveryMin', 'Осанка, мин'],
    ['dailyGoal', 'Цель: перерывов в день'],
    ['workMin', 'Pomodoro: работа, мин'],
    ['shortBreakMin', 'Pomodoro: перерыв, мин'],
    ['longBreakMin', 'Pomodoro: длинный, мин'],
    ['idleSleepMin', 'Засыпать после простоя, мин'],
    ['volume', 'Громкость писков, %'],
  ];
  const SETTING_TOGGLES = [
    ['breakEnabled', 'Напоминать о перерывах'],
    ['eyesEnabled', 'Напоминать о гимнастике глаз'],
    ['waterEnabled', 'Напоминать пить воду'],
    ['postureEnabled', 'Напоминать об осанке'],
    ['sound', 'Звуки Сени'],
    ['autoDnd', 'Молчать в полноэкранных окнах и на звонках (Windows)'],
    ['openAtLogin', 'Запускать при входе в систему'],
  ];

  function renderSettings(cfg) {
    const nodes = [];
    for (const [key, label] of SETTING_FIELDS) {
      const inp = el('input', { type: 'number', min: '1', max: key === 'volume' ? '100' : '600' });
      inp.value = cfg[key];
      inp.addEventListener('change', () => api.act('settings:set', { [key]: inp.value }));
      nodes.push(el('span', { text: label }), inp);
    }
    for (const [key, label] of SETTING_TOGGLES) {
      const cb = el('input', { type: 'checkbox' });
      cb.checked = cfg[key];
      cb.addEventListener('change', () => api.act('settings:set', { [key]: cb.checked }));
      nodes.push(el('label', { class: 'chk' }, [cb, el('span', { text: label })]));
    }
    P.settings.replaceChildren(...nodes);
  }

  function togglePanel() {
    panel.hidden = !panel.hidden;
    if (!panel.hidden) {
      renderPanel(state);
      setTimeout(() => P.input.focus(), 50);
    }
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !panel.hidden) togglePanel();
  });

  let press = null;
  robotWrap.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    robotWrap.setPointerCapture(e.pointerId);
    press = { x: e.screenX, y: e.screenY, dragging: false };
  });
  robotWrap.addEventListener('pointermove', (e) => {
    if (!press) return;
    const dx = e.screenX - press.x;
    const dy = e.screenY - press.y;
    if (!press.dragging && Math.hypot(dx, dy) > 4) {
      press.dragging = true;
      flags.drag = true;
      flags.land = false;
      refreshClass();
      setLook(0, 0);
      Sound.play('poke');
      api.dragStart();
    }
    if (press.dragging) api.dragMove(dx, dy);
  });
  function dropRobot() {
    flags.drag = false;
    flags.land = true;
    Sound.play('done');
    refreshClass();
    setTimeout(() => { flags.land = false; refreshClass(); }, 650);
    api.dragEnd();
  }
  robotWrap.addEventListener('pointerup', () => {
    if (!press) return;
    if (press.dragging) dropRobot();
    else { api.act('poke'); togglePanel(); }
    press = null;
  });
  robotWrap.addEventListener('pointercancel', () => {
    if (press && press.dragging) dropRobot();
    press = null;
  });
  robotWrap.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    api.act('chat');
  });

  const stroke = { lastX: null, dir: 0, turns: [], cooldown: 0 };
  robotWrap.addEventListener('pointermove', (e) => {
    if (press) return;
    const now = performance.now();
    if (stroke.lastX === null) { stroke.lastX = e.clientX; return; }
    const dx = e.clientX - stroke.lastX;
    if (Math.abs(dx) < 4) return;
    const d = Math.sign(dx);
    if (stroke.dir && d !== stroke.dir) stroke.turns.push(now);
    stroke.dir = d;
    stroke.lastX = e.clientX;
    stroke.turns = stroke.turns.filter((t) => now - t < 1400);
    if (stroke.turns.length >= 4 && now > stroke.cooldown) {
      stroke.turns = [];
      stroke.cooldown = now + 1200;
      api.act('pet');
    }
  });
  robotWrap.addEventListener('pointerleave', () => {
    stroke.lastX = null; stroke.dir = 0; stroke.turns = [];
  });

  const stage = $('#eyes-stage');
  const dot = $('#eyes-dot');
  let eyesRaf = 0;
  let eyesT0 = 0;

  function startEyesUi(text) {
    $('#eyes-text').textContent = text || 'Следи за точкой';
    stage.hidden = false;
    eyesT0 = performance.now();
    cancelAnimationFrame(eyesRaf);
    const W = stage.clientWidth || 640;
    const H = stage.clientHeight || 300;
    const step = (now) => {
      const t = (now - eyesT0) / 1000;
      const w = (2 * Math.PI) / 7;
      dot.style.transform = `translate(${W / 2 + (W / 2 - 50) * Math.sin(w * t)}px, ${H / 2 - 12 + (H / 2 - 60) * Math.sin(2 * w * t)}px)`;
      eyesRaf = requestAnimationFrame(step);
    };
    eyesRaf = requestAnimationFrame(step);
  }
  function stopEyesUi() {
    cancelAnimationFrame(eyesRaf);
    stage.hidden = true;
  }
  $('#eyes-cancel').addEventListener('click', () => api.act('eyes:cancel'));

  const exCard = $('#exercise');
  function renderExercise(ex) {
    exCard.hidden = !ex.active;
    if (!ex.active) return;
    $('.ex-title', exCard).textContent = `> ${ex.title}`;
    $('.ex-steps', exCard).textContent = ex.steps;
    $('.ex-fill', exCard).style.width = `${Math.round(((ex.total - ex.remainingSec) / ex.total) * 100)}%`;
    $('.ex-left', exCard).textContent = `${ex.remainingSec} с`;
  }
  $('#ex-cancel').addEventListener('click', () => api.act('exercise:cancel'));

  function onState(s) {
    const prevMood = state ? state.mood : null;
    state = s;
    Sound.setConfig(s.settings);
    if (prevMood && prevMood !== s.mood) moodSound(prevMood, s.mood);
    renderExercise(s.exercise);
    applyMood();
    if (s.mood === 'sleeping') setLook(0, 0);
    if (!panel.hidden) renderPanel(s);
    if (s.eyes.active) {
      if (stage.hidden) startEyesUi();
      $('#eyes-left').textContent = `${s.eyes.remainingSec} с`;
    } else if (!stage.hidden) {
      stopEyesUi();
    }
  }

  api.onState(onState);
  api.onCursor(onCursor);
  api.onExerciseStart(() => { closeBubble(); Sound.play('work'); });
  api.onOpenPanel(() => { if (panel.hidden) togglePanel(); else P.input.focus(); });
  api.onReminder((r) => pushBubble(r));
  api.onCelebrate((r) => pushBubble({ kind: 'happy', text: r.text, actions: [] }, { beepOn: false }));
  api.onEyesStart((r) => {
    closeBubble();
    startEyesUi(r.text);
  });

  buildPanel();
  api.getState().then(onState);
})();
