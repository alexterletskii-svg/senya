'use strict';

(() => {
  const api = window.senya.program;
  const $ = (sel) => document.querySelector(sel);
  const palette = $('#palette');
  const work = $('#work');
  const problemsEl = $('#problems');
  const statusEl = $('#status');
  const menuEl = $('#menu');

  let catalog = null;
  let aiAvailable = false;
  let program = { rules: [] };
  let problems = [];
  let exampleList = [];
  let selectedId = '';
  let saveTimer = null;
  let simple = false;
  let drag = null;
  const answers = new Map();

  const uid = () => Math.random().toString(36).slice(2, 9);

  function readMode() {
    try {
      return localStorage.getItem('senya-editor-mode') === 'simple';
    } catch {
      return false;
    }
  }

  function writeMode(value) {
    try {
      localStorage.setItem('senya-editor-mode', value ? 'simple' : 'full');
    } catch {
      return;
    }
  }

  function el(tag, props = {}, kids = []) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === 'text') n.textContent = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v);
    }
    for (const c of kids) if (c) n.append(c);
    return n;
  }

  function defaults(spec) {
    const params = {};
    for (const p of spec.params) params[p.key] = p.def;
    return params;
  }

  function makeBlock(type) {
    const spec = catalog.actions[type];
    const block = { id: uid(), type, params: defaults(spec) };
    if (spec.container) block.children = [];
    return block;
  }

  function makeRule(type) {
    return { id: uid(), event: { type, params: defaults(catalog.events[type]) }, body: [] };
  }

  function bodyOf(owner) {
    if (owner.event) return owner.body;
    if (!owner.children) owner.children = [];
    return owner.children;
  }

  function locate(id, list = program.rules, owner = null) {
    for (let i = 0; i < list.length; i++) {
      const item = list[i];
      if (item.id === id) return { list, index: i, item, owner };
      const hit = locate(id, item.event ? item.body : (item.children || []), item);
      if (hit) return hit;
    }
    return null;
  }

  function isInside(item, id) {
    const kids = item.event ? item.body : (item.children || []);
    return kids.some((k) => k.id === id || isInside(k, id));
  }

  function isContainer(item) {
    return Boolean(item.event) || Boolean((catalog.actions[item.type] || {}).container);
  }

  function ruleOf(id) {
    for (const r of program.rules) {
      if (r.id === id || isInside(r, id)) return r;
    }
    return null;
  }

  function flash(text) {
    statusEl.textContent = text;
  }

  function selectedContainer() {
    const hit = selectedId ? locate(selectedId) : null;
    if (hit && isContainer(hit.item)) return hit.item;
    return program.rules[program.rules.length - 1] || null;
  }

  function addEvent(type) {
    const rule = makeRule(type);
    program.rules.push(rule);
    selectedId = rule.id;
    changed(true);
  }

  function addAction(type) {
    const target = selectedContainer();
    if (!target) {
      flash('Сначала выбери событие слева, например «Когда меня тыкнули».');
      return;
    }
    const block = makeBlock(type);
    bodyOf(target).push(block);
    if (block.children) selectedId = block.id;
    changed(true);
  }

  function removeById(id) {
    const hit = locate(id);
    if (!hit) return;
    hit.list.splice(hit.index, 1);
    if (selectedId === id) selectedId = '';
    changed(true);
  }

  function moveById(id, dir) {
    const hit = locate(id);
    if (!hit) return;
    const j = hit.index + dir;
    if (j < 0 || j >= hit.list.length) return;
    [hit.list[hit.index], hit.list[j]] = [hit.list[j], hit.list[hit.index]];
    changed(true);
  }

  function clearMarks() {
    for (const n of document.querySelectorAll('.drop-before, .drop-after, .drop-in, .drop-end, .dragging')) {
      n.classList.remove('drop-before', 'drop-after', 'drop-in', 'drop-end', 'dragging');
    }
  }

  function dropPlan(targetId, isRule, upperHalf) {
    if (!drag) return null;
    const target = locate(targetId);
    if (!target) return null;
    const draggingRule = drag.kind === 'new' ? drag.cat === 'event' : Boolean(locate(drag.id) && locate(drag.id).item.event);
    if (drag.kind === 'move') {
      if (drag.id === targetId) return null;
      const moved = locate(drag.id);
      if (!moved || isInside(moved.item, targetId)) return null;
    }
    if (draggingRule) {
      if (!isRule) return null;
      return upperHalf ? 'before' : 'after';
    }
    if (isRule) return 'in';
    if (isContainer(target.item) && !upperHalf) return 'in';
    return upperHalf ? 'before' : 'after';
  }

  function performDrop(targetId, pos) {
    let item;
    if (drag.kind === 'new') {
      item = drag.cat === 'event' ? makeRule(drag.type) : makeBlock(drag.type);
    } else {
      const from = locate(drag.id);
      if (!from) return;
      item = from.item;
      from.list.splice(from.index, 1);
    }
    const t = locate(targetId);
    if (!t) return;
    if (pos === 'in') bodyOf(t.item).unshift(item);
    else t.list.splice(t.index + (pos === 'after' ? 1 : 0), 0, item);
    if (item.event || item.children) selectedId = item.id;
    changed(true);
  }

  function attachDropTarget(node, targetId, isRule) {
    const line = node.querySelector(':scope > .line');
    const zone = line || node;
    zone.addEventListener('dragover', (e) => {
      if (!drag) return;
      const rect = zone.getBoundingClientRect();
      const upper = e.clientY < rect.top + rect.height / 2;
      const pos = dropPlan(targetId, isRule, upper);
      if (!pos) return;
      e.preventDefault();
      e.stopPropagation();
      clearMarks();
      node.classList.add(`drop-${pos}`);
      e.dataTransfer.dropEffect = drag.kind === 'new' ? 'copy' : 'move';
    });
    zone.addEventListener('drop', (e) => {
      if (!drag) return;
      const rect = zone.getBoundingClientRect();
      const upper = e.clientY < rect.top + rect.height / 2;
      const pos = dropPlan(targetId, isRule, upper);
      if (!pos) return;
      e.preventDefault();
      e.stopPropagation();
      const payload = drag;
      clearMarks();
      drag = payload;
      performDrop(targetId, pos);
      drag = null;
    });
  }

  function handleFor(node, payload) {
    const h = el('span', { class: 'handle', text: '≡', title: 'Перетащи', draggable: 'true' });
    h.addEventListener('dragstart', (e) => {
      drag = payload;
      e.dataTransfer.effectAllowed = 'copyMove';
      e.dataTransfer.setData('text/plain', 'senya');
      const line = node.querySelector(':scope > .line');
      if (line) e.dataTransfer.setDragImage(line, 12, 12);
      setTimeout(() => node.classList.add('dragging'), 0);
    });
    h.addEventListener('dragend', () => {
      drag = null;
      clearMarks();
    });
    return h;
  }

  work.addEventListener('dragover', (e) => {
    if (!drag) return;
    const isEvent = drag.kind === 'new' ? drag.cat === 'event' : Boolean(locate(drag.id) && locate(drag.id).item.event);
    if (!isEvent && drag.kind === 'move') return;
    e.preventDefault();
    clearMarks();
    if (isEvent) work.classList.add('drop-end');
  });

  work.addEventListener('drop', (e) => {
    if (!drag) return;
    e.preventDefault();
    const payload = drag;
    clearMarks();
    drag = null;
    if (payload.kind === 'new' && payload.cat === 'event') {
      addEvent(payload.type);
    } else if (payload.kind === 'new') {
      addAction(payload.type);
    } else {
      const from = locate(payload.id);
      if (from && from.item.event) {
        from.list.splice(from.index, 1);
        program.rules.push(from.item);
        changed(true);
      }
    }
  });

  function paramInputs(spec, params, onEdit) {
    const nodes = [];
    for (const ps of spec.params) {
      if (ps.kind === 'text') {
        const inp = el('input', { type: 'text', maxlength: String(ps.max) });
        inp.value = params[ps.key] ?? '';
        inp.addEventListener('input', () => { params[ps.key] = inp.value; onEdit(false); });
        nodes.push(inp);
      } else if (ps.kind === 'number') {
        const inp = el('input', { type: 'number', min: String(ps.min), max: String(ps.max) });
        inp.value = params[ps.key] ?? '';
        inp.addEventListener('input', () => { params[ps.key] = inp.value === '' ? '' : Number(inp.value); onEdit(false); });
        nodes.push(inp);
        if (ps.suffix) nodes.push(el('span', { class: 'suffix', text: ps.suffix }));
      } else {
        const sel = el('select');
        for (const o of ps.options) sel.append(el('option', { value: o.value, text: o.label }));
        sel.value = params[ps.key];
        sel.addEventListener('change', () => { params[ps.key] = sel.value; onEdit(false); });
        nodes.push(sel);
      }
    }
    return nodes;
  }

  function controls(id) {
    return el('span', { class: 'ctl' }, [
      el('button', { class: 'ghost', text: '↑', title: 'Выше', onclick: (e) => { e.stopPropagation(); moveById(id, -1); } }),
      el('button', { class: 'ghost', text: '↓', title: 'Ниже', onclick: (e) => { e.stopPropagation(); moveById(id, 1); } }),
      el('button', { class: 'ghost', text: 'x', title: 'Удалить', onclick: (e) => { e.stopPropagation(); removeById(id); } }),
    ]);
  }

  function blockNode(b) {
    const spec = catalog.actions[b.type];
    const node = el('div', { class: `block ${spec && spec.container ? 'co' : 'ac'}${b.id === selectedId ? ' sel' : ''}`, 'data-id': b.id });
    if (!spec) {
      node.append(el('div', { class: 'line' }, [el('span', { class: 'label', text: `? ${b.type}` }), controls(b.id)]));
      node.append(el('div', { class: 'msg-slot' }));
      return node;
    }
    const line = el('div', { class: 'line' }, [
      handleFor(node, { kind: 'move', id: b.id }),
      el('span', { class: 'label', text: spec.label }),
      ...paramInputs(spec, b.params, changed),
      controls(b.id),
    ]);
    if (spec.container) line.addEventListener('click', () => { selectedId = b.id; render(); });
    node.append(line);
    node.append(el('div', { class: 'msg-slot' }));
    if (spec.container) {
      const kids = el('div', { class: 'children' });
      for (const c of b.children || []) kids.append(blockNode(c));
      node.append(kids);
    }
    attachDropTarget(node, b.id, false);
    return node;
  }

  function ruleNode(r) {
    const spec = catalog.events[r.event.type];
    const node = el('div', { class: `rule${r.id === selectedId ? ' sel' : ''}`, 'data-id': r.id });
    const line = el('div', { class: 'line' }, [
      handleFor(node, { kind: 'move', id: r.id }),
      el('span', { class: 'label', text: `КОГДА · ${spec ? spec.label : '?'}` }),
      ...(spec ? paramInputs(spec, r.event.params, changed) : []),
      controls(r.id),
    ]);
    line.addEventListener('click', () => { selectedId = r.id; render(); });
    node.append(line);
    node.append(el('div', { class: 'msg-slot' }));
    const kids = el('div', { class: 'children' });
    for (const b of r.body) kids.append(blockNode(b));
    node.append(kids);
    attachDropTarget(node, r.id, true);
    return node;
  }

  function paletteButton(type, spec, cls, cat) {
    const first = spec.params[0];
    const text = spec.label + (spec.params.length ? ` …${first && first.suffix ? ` ${first.suffix}` : ''}` : '');
    const b = el('button', { class: cls, text, draggable: 'true', onclick: () => (cat === 'event' ? addEvent(type) : addAction(type)) });
    b.addEventListener('dragstart', (e) => {
      drag = { kind: 'new', cat, type };
      e.dataTransfer.effectAllowed = 'copy';
      e.dataTransfer.setData('text/plain', 'senya');
    });
    b.addEventListener('dragend', () => {
      drag = null;
      clearMarks();
    });
    return b;
  }

  function renderPalette() {
    const visible = (spec) => !simple || spec.simple;
    const pick = (map, container) => Object.entries(map).filter(([, s]) => visible(s) && Boolean(s.container) === container);
    palette.replaceChildren();
    palette.append(el('h3', { text: 'События' }));
    for (const [type, spec] of pick(catalog.events, false)) palette.append(paletteButton(type, spec, 'ev', 'event'));
    palette.append(el('h3', { text: 'Действия' }));
    for (const [type, spec] of pick(catalog.actions, false)) palette.append(paletteButton(type, spec, 'ac', 'action'));
    const containers = pick(catalog.actions, true);
    if (containers.length) {
      palette.append(el('h3', { text: 'Управление' }));
      for (const [type, spec] of containers) palette.append(paletteButton(type, spec, 'co', 'action'));
    }
  }

  function render() {
    work.replaceChildren();
    if (!program.rules.length) {
      const hint = el('div', { class: 'empty', text: '$ пусто\nПеретащи сюда событие слева (или просто нажми на него), например «Когда меня тыкнули». Потом перетаскивай под него действия: «Сказать», «Показать эмоцию», «Издать звук». Готовые программы лежат в «Примеры».' });
      hint.style.whiteSpace = 'pre-line';
      work.append(hint);
    }
    for (const r of program.rules) work.append(ruleNode(r));
    markProblems();
    renderProblems();
  }

  function markProblems() {
    for (const n of work.querySelectorAll('.msg')) n.remove();
    for (const n of work.querySelectorAll('.err, .warn')) n.classList.remove('err', 'warn');
    for (const p of problems) {
      const node = p.blockId ? work.querySelector(`[data-id="${p.blockId}"]`) : null;
      if (!node) continue;
      if (!node.classList.contains('err')) node.classList.add(p.level === 'error' ? 'err' : 'warn');
      const slot = node.querySelector(':scope > .msg-slot');
      if (slot) slot.append(el('div', { class: `msg ${p.level}`, text: `${p.level === 'error' ? 'ошибка' : 'совет'}: ${p.message}` }));
    }
  }

  function renderProblems() {
    problemsEl.replaceChildren();
    if (!problems.length) {
      problemsEl.append(el('div', { class: 'ok', text: program.rules.length ? '✓ Ошибок нет. Нажми «Запустить правило», чтобы проверить.' : 'Здесь появятся подсказки и ошибки.' }));
      return;
    }
    for (const p of problems) {
      const key = `${p.blockId}|${p.message}`;
      const head = el('div', { class: 'head' }, [
        el('span', { class: `tag ${p.level}`, text: p.level === 'error' ? 'ОШИБКА' : 'СОВЕТ' }),
        el('span', { text: p.message }),
      ]);
      if (aiAvailable) {
        head.append(el('button', { class: 'ghost', text: 'Спросить Сеню', onclick: async () => {
          answers.set(key, 'Сеня думает…');
          renderProblems();
          const r = await api.explain(p);
          answers.set(key, r.text);
          renderProblems();
        } }));
      }
      const box = el('div', { class: 'problem' }, [head, el('div', { class: 'hint', text: `Как исправить: ${p.hint}` })]);
      if (answers.has(key)) box.append(el('div', { class: 'answer', text: answers.get(key) }));
      problemsEl.append(box);
    }
  }

  function changed(full) {
    flash('сохраняю…');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      problems = await api.save(program);
      flash('сохранено');
      markProblems();
      renderProblems();
    }, 350);
    if (full) render();
  }

  function applyMode() {
    document.body.classList.toggle('simple', simple);
    $('#btn-mode').textContent = simple ? 'Режим: простой' : 'Режим: полный';
    renderPalette();
  }

  function closeMenu() {
    menuEl.hidden = true;
  }

  function replaceProgram(next, label) {
    if (program.rules.length && !confirm('Заменить текущую программу?')) return;
    program = next;
    selectedId = program.rules.length ? program.rules[0].id : '';
    changed(true);
    flash(label);
  }

  function openExamples() {
    if (!menuEl.hidden) return closeMenu();
    menuEl.replaceChildren();
    const list = exampleList.filter((ex) => !simple || ex.simple);
    for (const ex of list) {
      menuEl.append(el('button', {
        class: 'item',
        onclick: () => {
          closeMenu();
          replaceProgram(JSON.parse(JSON.stringify(ex.program)), `загружен пример «${ex.name}»`);
        },
      }, [el('b', { text: ex.name }), el('span', { text: ex.text })]));
    }
    menuEl.hidden = false;
  }

  $('#btn-examples').addEventListener('click', (e) => {
    e.stopPropagation();
    openExamples();
  });
  document.addEventListener('click', (e) => {
    if (!menuEl.hidden && !menuEl.contains(e.target)) closeMenu();
  });

  $('#btn-mode').addEventListener('click', () => {
    simple = !simple;
    writeMode(simple);
    applyMode();
    flash(simple ? 'простой режим: только главные блоки' : 'полный режим');
  });

  $('#btn-save').addEventListener('click', async () => {
    clearTimeout(saveTimer);
    await api.save(program);
    const text = await api.export('Моя программа');
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = el('a', { href: url, download: 'программа-сени.json' });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    flash('файл сохранён: отправь его другу');
  });

  $('#btn-load').addEventListener('click', () => $('#file').click());
  $('#file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 200000) return flash('файл слишком большой для программы Сени');
    if (program.rules.length && !confirm('Загруженная программа заменит текущую. Продолжить?')) return;
    const text = await file.text();
    const r = await api.import(text);
    if (!r.ok) {
      flash(r.error);
      return;
    }
    program = r.program;
    problems = r.problems;
    selectedId = program.rules.length ? program.rules[0].id : '';
    render();
    flash(`загружено${r.name ? `: ${r.name}` : ''}`);
  });

  $('#btn-run').addEventListener('click', async () => {
    const rule = ruleOf(selectedId) || program.rules[0];
    if (!rule) return flash('Сначала добавь правило.');
    clearTimeout(saveTimer);
    problems = await api.save(program);
    markProblems();
    renderProblems();
    const r = await api.run(rule.id);
    flash(r.ok ? 'правило запущено, смотри на Сеню' : 'в этом правиле есть ошибка, исправь её');
  });

  $('#btn-stop').addEventListener('click', async () => {
    await api.stop();
    flash('остановлено');
  });

  (async () => {
    const data = await api.get();
    catalog = data.catalog;
    aiAvailable = data.ai;
    program = data.program;
    problems = data.problems;
    exampleList = await api.examples();
    selectedId = program.rules.length ? program.rules[0].id : '';
    simple = readMode();
    applyMode();
    render();
  })();
})();
