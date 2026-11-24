'use strict';

(() => {
  const api = window.senya.program;
  const $ = (sel) => document.querySelector(sel);
  const palette = $('#palette');
  const work = $('#work');
  const problemsEl = $('#problems');
  const statusEl = $('#status');

  let catalog = null;
  let aiAvailable = false;
  let program = { rules: [] };
  let problems = [];
  let selectedId = '';
  let saveTimer = null;
  const answers = new Map();

  const uid = () => Math.random().toString(36).slice(2, 9);

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

  function findBlock(id, blocks = null, parent = null) {
    const list = blocks || program.rules.flatMap((r) => [r]);
    for (const item of list) {
      if (item.id === id) return { item, parent };
      const kids = item.body || item.children || [];
      const hit = findBlock(id, kids, item);
      if (hit) return hit;
    }
    return null;
  }

  function containerOf(id) {
    const hit = findBlock(id);
    if (!hit) return null;
    const spec = hit.item.event ? true : (catalog.actions[hit.item.type] || {}).container;
    return spec ? hit.item : null;
  }

  function ruleOf(id) {
    for (const r of program.rules) {
      if (r.id === id || findBlock(id, r.body)) return r;
    }
    return null;
  }

  function addEvent(type) {
    const spec = catalog.events[type];
    const rule = { id: uid(), event: { type, params: defaults(spec) }, body: [] };
    program.rules.push(rule);
    selectedId = rule.id;
    changed(true);
  }

  function addAction(type) {
    const spec = catalog.actions[type];
    if (!program.rules.length) {
      flash('Сначала выбери событие слева, например «Когда меня тыкнули».');
      return;
    }
    let target = containerOf(selectedId);
    if (!target) target = program.rules[program.rules.length - 1];
    const block = { id: uid(), type, params: defaults(spec) };
    if (spec.container) block.children = [];
    (target.event ? target.body : target.children).push(block);
    if (spec.container) selectedId = block.id;
    changed(true);
  }

  function removeById(id) {
    const ri = program.rules.findIndex((r) => r.id === id);
    if (ri >= 0) {
      program.rules.splice(ri, 1);
    } else {
      const hit = findBlock(id);
      if (!hit) return;
      const list = hit.parent.body || hit.parent.children;
      list.splice(list.indexOf(hit.item), 1);
    }
    if (selectedId === id) selectedId = '';
    changed(true);
  }

  function moveById(id, dir) {
    const ri = program.rules.findIndex((r) => r.id === id);
    const list = ri >= 0 ? program.rules : (() => {
      const hit = findBlock(id);
      return hit ? (hit.parent.body || hit.parent.children) : null;
    })();
    if (!list) return;
    const i = list.findIndex((b) => b.id === id);
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    changed(true);
  }

  function flash(text) {
    statusEl.textContent = text;
  }

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
      return node;
    }
    const line = el('div', { class: 'line' }, [
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
    return node;
  }

  function ruleNode(r) {
    const spec = catalog.events[r.event.type];
    const node = el('div', { class: `rule${r.id === selectedId ? ' sel' : ''}`, 'data-id': r.id });
    const line = el('div', { class: 'line' }, [
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
    return node;
  }

  function renderPalette() {
    const groups = [
      ['События', catalog.events, 'ev', addEvent],
      ['Действия', Object.fromEntries(Object.entries(catalog.actions).filter(([, s]) => !s.container)), 'ac', addAction],
      ['Управление', Object.fromEntries(Object.entries(catalog.actions).filter(([, s]) => s.container)), 'co', addAction],
    ];
    palette.replaceChildren();
    for (const [title, map, cls, handler] of groups) {
      palette.append(el('h3', { text: title }));
      for (const [type, spec] of Object.entries(map)) {
        const first = spec.params[0];
        const text = spec.label + (spec.params.length ? ` …${first && first.suffix ? ` ${first.suffix}` : ''}` : '');
        palette.append(el('button', { class: cls, text, onclick: () => handler(type) }));
      }
    }
  }

  function render() {
    work.replaceChildren();
    if (!program.rules.length) {
      work.append(el('div', { class: 'empty', text: '$ пусто\nВыбери слева событие, например «Когда меня тыкнули», затем добавь действия: «Сказать», «Показать эмоцию», «Издать звук». Нажми «Пример», чтобы увидеть готовую программу.' }));
      work.firstChild.style.whiteSpace = 'pre-line';
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

  async function check() {
    problems = await api.check(program);
    markProblems();
    renderProblems();
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

  const EXAMPLE = () => ({
    rules: [
      {
        id: uid(), event: { type: 'click', params: {} },
        body: [
          { id: uid(), type: 'say', params: { text: 'Ой, щекотно!' } },
          { id: uid(), type: 'emotion', params: { mood: 'happy' } },
          { id: uid(), type: 'sound', params: { name: 'happy' } },
        ],
      },
      {
        id: uid(), event: { type: 'every', params: { min: 20 } },
        body: [
          { id: uid(), type: 'if', params: { cond: 'pomodoro' }, children: [
            { id: uid(), type: 'say', params: { text: 'Держись, ты молодец!' } },
          ] },
        ],
      },
    ],
  });

  $('#btn-example').addEventListener('click', () => {
    if (program.rules.length && !confirm('Заменить текущую программу примером?')) return;
    program = EXAMPLE();
    selectedId = program.rules[0].id;
    changed(true);
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
    selectedId = program.rules.length ? program.rules[0].id : '';
    renderPalette();
    render();
  })();
})();
