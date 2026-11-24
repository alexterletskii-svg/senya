'use strict';

(() => {
  const api = window.robik;
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

  // ---------- размер окна под содержимое ----------
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

  // ---------- настроение ----------
  function applyMood(s) {
    robot.setAttribute('class', `mood-${s.mood}${s.hardHat ? ' hat' : ''}`);
  }

  // ---------- звук ----------
  let audio = null;
  function beep() {
    if (!state || !state.settings.sound) return;
    try {
      audio = audio || new AudioContext();
      const t = audio.currentTime;
      [660, 880].forEach((f, i) => {
        const o = audio.createOscillator();
        const g = audio.createGain();
        o.type = 'sine';
        o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t + i * 0.14);
        g.gain.exponentialRampToValueAtTime(0.12, t + i * 0.14 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.14 + 0.2);
        o.connect(g).connect(audio.destination);
        o.start(t + i * 0.14);
        o.stop(t + i * 0.14 + 0.22);
      });
    } catch { /* звук недоступен */ }
  }

  // ---------- облачка ----------
  const bubblesEl = $('#bubbles');
  const queue = [];
  let current = null;
  const TTL = { break: 60000, eyes: 45000, water: 14000, posture: 14000, pomodoro: 9000, wake: 6000, hello: 6000, 'task-added': 3500, 'eyes-done': 4500, happy: 4500, task: 0 };

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
      el('button', { class: 'x', text: '✕', title: 'Закрыть', onclick: closeBubble }),
      el('div', { class: 'text', text: r.text }),
      actions.length ? el('div', { class: 'actions' }, actions) : null,
    ]));
    const ttl = TTL[r.kind] === undefined ? 12000 : TTL[r.kind];
    if (ttl > 0) current.timer = setTimeout(closeBubble, ttl);
  }

  function pushBubble(r, { beepOn = true } = {}) {
    const same = (x) => x.kind === r.kind && x.taskId === r.taskId;
    if (current && same(current)) {
      // обновляем текст текущего облачка вместо дубля
      clearTimeout(current.timer);
      current = { ...r };
      renderBubble();
      return;
    }
    const i = queue.findIndex(same);
    if (i >= 0) queue.splice(i, 1);
    queue.push({ ...r });
    if (queue.length > 5) queue.shift();
    if (beepOn && !['task-added', 'eyes-done', 'wake', 'hello'].includes(r.kind)) beep();
    showNext();
  }

  // ---------- панель ----------
  const panel = $('#panel');
  const P = {}; // ссылки на живые элементы панели

  function buildPanel() {
    P.stats = el('div', { class: 'stats' });
    P.pomoTime = el('div', { class: 'pomo-time', text: '25:00' });
    P.pomoPhase = el('div', { class: 'pomo-phase' });
    P.pomoStart = el('button', { text: 'Старт', onclick: () => api.act(pomoPrimaryAction()) });
    P.pomoSkip = el('button', { class: 'ghost', text: 'Пропуск', onclick: () => api.act('pomo:skip') });
    P.pomoStop = el('button', { class: 'ghost', text: 'Стоп', onclick: () => api.act('pomo:stop') });

    P.input = el('input', { type: 'text', placeholder: 'Задача… напр. «через 20 мин позвонить»', maxlength: '200' });
    P.input.addEventListener('keydown', (e) => { if (e.key === 'Enter') addTask(); });
    P.taskList = el('div', { class: 'tasks' });
    P.clearDone = el('button', { class: 'ghost', text: 'Убрать выполненные', onclick: () => api.act('task:clear-done') });
    P.settings = el('div', { class: 'settings' });

    panel.replaceChildren(
      el('div', { class: 'p-head' }, [
        el('b', { text: '🤖 Робик' }),
        el('button', { class: 'ghost', text: '✕', title: 'Закрыть меню', onclick: togglePanel }),
      ]),
      P.stats,
      el('div', { class: 'card' }, [
        P.pomoTime, P.pomoPhase,
        el('div', { class: 'row' }, [P.pomoStart, P.pomoSkip, P.pomoStop]),
      ]),
      el('div', { class: 'row' }, [
        el('button', { class: 'ghost', text: '👀 Гимнастика', onclick: () => api.act('eyes:start') }),
        el('button', { class: 'ghost', text: '🧘 Размялся', onclick: () => api.act('break:ack') }),
      ]),
      el('div', { class: 'card' }, [
        el('h3', { text: 'Список дел' }),
        el('div', { class: 'task-add' }, [P.input, el('button', { text: '＋', onclick: addTask })]),
        el('div', { class: 'hint', text: 'Можно со временем: «в 15:30 созвон», «завтра в 9 отчёт»' }),
        P.taskList,
        P.clearDone,
      ]),
      el('details', {}, [el('summary', { text: 'Настройки' }), P.settings]),
      el('div', { class: 'row' }, [
        el('button', { class: 'ghost', text: 'Спрятать', title: 'Скрыть Робика; вернуть — через иконку в трее', onclick: () => api.act('app:hide') }),
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

  function pomoPrimaryAction() {
    const p = state && state.pomodoro;
    if (!p || p.phase === 'idle') return 'pomo:start';
    return p.running ? 'pomo:pause' : 'pomo:resume';
  }

  const fmt = (sec) => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
  const PHASE = { idle: 'Не запущен', work: '🔨 Работа', break: '☕ Перерыв', longBreak: '🌴 Длинный перерыв' };

  function dueLabel(ts) {
    const d = new Date(ts);
    const now = new Date();
    const hm = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
    if (d.toDateString() === now.toDateString()) return hm;
    if (d.toDateString() === tomorrow.toDateString()) return `завтра ${hm}`;
    return `${d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })} ${hm}`;
  }

  let shown = { tasks: '', settings: '' };

  function renderPanel(s) {
    P.stats.textContent = `Сегодня: ☕ ${s.stats.breaks} · 🍅 ${s.stats.pomodoros} · ✅ ${s.stats.tasks}`;

    const p = s.pomodoro;
    P.pomoTime.textContent = p.phase === 'idle' ? fmt(s.settings.workMin * 60) : fmt(p.remainingSec);
    P.pomoTime.className = `pomo-time ${p.phase === 'work' ? 'work' : p.phase === 'idle' ? '' : 'break'}`;
    P.pomoPhase.textContent = PHASE[p.phase] + (p.phase !== 'idle' && !p.running ? ' — пауза' : '') + (p.cycle ? ` · циклов: ${p.cycle}` : '');
    P.pomoStart.textContent = p.phase === 'idle' ? 'Старт' : p.running ? 'Пауза' : 'Продолжить';
    P.pomoSkip.disabled = P.pomoStop.disabled = p.phase === 'idle';

    const tj = JSON.stringify(s.tasks);
    if (tj !== shown.tasks) {
      shown.tasks = tj;
      renderTasks(s.tasks);
    }
    P.clearDone.hidden = !s.tasks.some((t) => t.done);

    const sj = JSON.stringify(s.settings);
    if (sj !== shown.settings && !P.settings.contains(document.activeElement)) {
      shown.settings = sj;
      renderSettings(s.settings);
    }
  }

  function renderTasks(tasks) {
    const now = Date.now();
    const sorted = [...tasks].sort((a, b) => (a.done - b.done) || ((a.dueAt || Infinity) - (b.dueAt || Infinity)) || a.id - b.id);
    if (sorted.length === 0) {
      P.taskList.replaceChildren(el('div', { class: 'empty', text: 'Дел пока нет. Скажи Робику, что запомнить.' }));
      return;
    }
    P.taskList.replaceChildren(...sorted.map((t) => {
      const cb = el('input', { type: 'checkbox' });
      cb.checked = t.done;
      cb.addEventListener('change', () => api.act(cb.checked ? 'task:done' : 'task:reopen', t.id));
      return el('div', { class: `task${t.done ? ' done' : ''}` }, [
        cb,
        el('span', { class: 't', text: t.text }),
        t.dueAt ? el('span', { class: `due${!t.done && t.dueAt < now ? ' late' : ''}`, text: `⏰ ${dueLabel(t.dueAt)}` }) : null,
        el('button', { class: 'rm', text: '✕', title: 'Удалить', onclick: () => api.act('task:remove', t.id) }),
      ]);
    }));
  }

  const SETTING_FIELDS = [
    ['breakEveryMin', 'Перерыв каждые, мин'],
    ['eyesEveryMin', 'Гимнастика глаз, мин'],
    ['waterEveryMin', 'Вода, мин'],
    ['postureEveryMin', 'Осанка, мин'],
    ['workMin', 'Pomodoro: работа, мин'],
    ['shortBreakMin', 'Pomodoro: перерыв, мин'],
    ['longBreakMin', 'Pomodoro: длинный, мин'],
    ['idleSleepMin', 'Засыпать после простоя, мин'],
  ];
  const SETTING_TOGGLES = [
    ['breakEnabled', 'Напоминать о перерывах'],
    ['eyesEnabled', 'Напоминать о гимнастике глаз'],
    ['waterEnabled', 'Напоминать пить воду'],
    ['postureEnabled', 'Напоминать об осанке'],
    ['sound', 'Звуковой сигнал'],
    ['openAtLogin', 'Запускать при входе в систему'],
  ];

  function renderSettings(cfg) {
    const nodes = [];
    for (const [key, label] of SETTING_FIELDS) {
      const inp = el('input', { type: 'number', min: '1', max: '600' });
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

  // ---------- перетаскивание / клик по роботу ----------
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
      api.dragStart();
    }
    if (press.dragging) api.dragMove(dx, dy);
  });
  const release = () => {
    if (!press) return;
    if (press.dragging) api.dragEnd();
    else togglePanel();
    press = null;
  };
  robotWrap.addEventListener('pointerup', release);
  robotWrap.addEventListener('pointercancel', () => { if (press && press.dragging) api.dragEnd(); press = null; });

  // ---------- гимнастика для глаз ----------
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
      const w = (2 * Math.PI) / 7; // «восьмёрка» за 7 секунд
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

  // ---------- события из main ----------
  function onState(s) {
    state = s;
    applyMood(s);
    if (!panel.hidden) renderPanel(s);
    if (s.eyes.active) {
      if (stage.hidden) startEyesUi();
      $('#eyes-left').textContent = `${s.eyes.remainingSec} с`;
    } else if (!stage.hidden) {
      stopEyesUi();
    }
  }

  api.onState(onState);
  api.onReminder((r) => pushBubble(r));
  api.onCelebrate((r) => pushBubble({ kind: 'happy', text: r.text, actions: [] }, { beepOn: false }));
  api.onEyesStart((r) => {
    closeBubble();
    startEyesUi(r.text);
  });

  buildPanel();
  api.getState().then(onState);
})();
