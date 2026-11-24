'use strict';

const WORD_NUMBERS = {
  один: 1, одну: 1, одна: 1, два: 2, две: 2, три: 3, четыре: 4, пять: 5,
  шесть: 6, семь: 7, восемь: 8, девять: 9, десять: 10, пятнадцать: 15,
  двадцать: 20, тридцать: 30, сорок: 40, пятьдесят: 50, полтора: 1.5,
};

const SEC = 1000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

const END = '(?=$|[\\s,.!?;:])';
const REL = new RegExp(
  '(?:^|[\\s,])через\\s+(?:(\\d+(?:[.,]\\d+)?|[а-яё]+)\\s+)?' +
  '(полчаса|часа|часов|час|минуту|минуты|минут|мин|секунду|секунды|секунд|сек|дня|дней|день)' + END,
  'iu'
);
const DAYWORD = new RegExp('(?:^|[\\s,])(сегодня|завтра|послезавтра)' + END, 'iu');
const ABS = new RegExp(
  '(?:^|[\\s,])(?:в|к)\\s+(\\d{1,2})(?:[:.](\\d{2}))?' +
  '(?:\\s*(утра|дня|вечера|ночи))?(?:\\s*(?:часов|часа|час|ч))?' + END,
  'iu'
);

function unitMs(u) {
  u = u.toLowerCase();
  if (u.startsWith('сек')) return SEC;
  if (u.startsWith('мин')) return MIN;
  if (u.startsWith('час')) return HOUR;
  return DAY;
}

function cleanup(text) {
  return text
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s,.:;!?\-—]+|[\s,.:;\-—]+$/g, '')
    .trim();
}

function capitalize(s) {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

const WEEKDAY_WORD = '(понедельник[а-я]*|вторник[а-я]*|сред[а-я]*|четверг[а-я]*|пятниц[а-я]*|суббот[а-я]*|воскресень[а-я]*)';
const REP_WEEKDAYS = new RegExp('(?:^|[\\s,])(?:по\\s+будням|каждый\\s+будний\\s+день|в\\s+будни)' + END, 'iu');
const REP_DAILY = new RegExp('(?:^|[\\s,])(?:каждый\\s+день|ежедневно)' + END, 'iu');
const REP_WEEKLY = new RegExp('(?:^|[\\s,])(?:каждый|каждую|каждое|по)\\s+' + WEEKDAY_WORD + END, 'iu');
const REP_INTERVAL = new RegExp(
  '(?:^|[\\s,])кажд(?:ые|ый|ую)\\s+(?:(\\d+|[а-яё]+)\\s+)?(полчаса|часа|часов|час|минуту|минуты|минут|мин)' + END,
  'iu'
);
const DOW_PREFIX = [['воскр', 0], ['понед', 1], ['вторн', 2], ['сред', 3], ['четв', 4], ['пятн', 5], ['субб', 6]];
const DOW_SHORT = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

function nextDue(rep, from) {
  if (rep.kind === 'interval') return from + rep.everyMin * MIN;
  const [h, m] = rep.time.split(':').map(Number);
  for (let i = 0; i < 9; i++) {
    const d = new Date(from);
    d.setDate(d.getDate() + i);
    d.setHours(h, m, 0, 0);
    const dow = d.getDay();
    const ok = rep.kind === 'daily' ||
      (rep.kind === 'weekdays' && dow >= 1 && dow <= 5) ||
      (rep.kind === 'weekly' && dow === rep.dow);
    if (ok && d.getTime() > from) return d.getTime();
  }
  return from + DAY;
}

function repeatLabel(rep) {
  if (!rep) return '';
  if (rep.kind === 'interval') {
    if (rep.everyMin === 60) return 'каждый час';
    if (rep.everyMin % 60 === 0) return `каждые ${rep.everyMin / 60} ч`;
    return `каждые ${rep.everyMin} мин`;
  }
  if (rep.kind === 'daily') return `каждый день ${rep.time}`;
  if (rep.kind === 'weekdays') return `по будням ${rep.time}`;
  return `${DOW_SHORT[rep.dow]} ${rep.time}`;
}

const pad2 = (n) => String(n).padStart(2, '0');

function parseRepeat(text) {
  let m;
  if ((m = REP_WEEKDAYS.exec(text))) return { rep: { kind: 'weekdays' }, full: m[0] };
  if ((m = REP_DAILY.exec(text))) return { rep: { kind: 'daily' }, full: m[0] };
  if ((m = REP_WEEKLY.exec(text))) {
    const w = m[1].toLowerCase();
    const hit = DOW_PREFIX.find(([p]) => w.startsWith(p));
    if (hit) return { rep: { kind: 'weekly', dow: hit[1] }, full: m[0] };
  }
  if ((m = REP_INTERVAL.exec(text))) {
    const [full, numRaw, unit] = m;
    const u = unit.toLowerCase();
    let n = 1;
    if (u === 'полчаса') n = 0.5;
    else if (numRaw !== undefined) {
      const w = numRaw.toLowerCase();
      if (/^\d/.test(w)) n = parseFloat(w);
      else if (w in WORD_NUMBERS) n = WORD_NUMBERS[w];
      else return null;
    }
    const perUnit = u === 'полчаса' ? 60 : u.startsWith('мин') ? 1 : 60;
    const everyMin = Math.round(n * perUnit);
    if (everyMin >= 1) return { rep: { kind: 'interval', everyMin }, full };
  }
  return null;
}

function parseTask(raw, now = Date.now()) {
  const original = String(raw || '').trim();
  let text = ' ' + original;
  let dueAt = null;
  let repeat = null;

  const pr = parseRepeat(text);
  if (pr) {
    repeat = pr.rep;
    text = text.replace(pr.full, ' ');
    if (repeat.kind === 'interval') {
      dueAt = nextDue(repeat, now);
    } else {
      let time = '09:00';
      const abs = ABS.exec(text);
      if (abs) {
        const h = parseInt(abs[1], 10);
        const m = abs[2] ? parseInt(abs[2], 10) : 0;
        if (h <= 24 && m < 60) {
          let hh = h;
          const p = abs[3] ? abs[3].toLowerCase() : null;
          if ((p === 'дня' || p === 'вечера') && hh < 12) hh += 12;
          if (hh === 24 || (p === 'ночи' && hh === 12)) hh = 0;
          time = `${pad2(hh)}:${pad2(m)}`;
          text = text.replace(abs[0], ' ');
        }
      }
      repeat.time = time;
      dueAt = nextDue(repeat, now);
    }
    const cleanedRep = capitalize(cleanup(text));
    return { text: cleanedRep || capitalize(original), dueAt, repeat };
  }

  const rel = REL.exec(text);
  if (rel) {
    const [full, numRaw, unit] = rel;
    let n = 1;
    let ok = true;
    if (unit.toLowerCase() === 'полчаса') {
      dueAt = now + 30 * MIN;
    } else {
      if (numRaw !== undefined) {
        const w = numRaw.toLowerCase();
        if (/^\d/.test(w)) n = parseFloat(w.replace(',', '.'));
        else if (w in WORD_NUMBERS) n = WORD_NUMBERS[w];
        else ok = false;
      }
      if (ok) dueAt = now + n * unitMs(unit);
    }
    if (ok) text = text.replace(full, ' ');
  }

  if (dueAt === null) {
    let dayShift = null;
    const dw = DAYWORD.exec(text);
    if (dw) {
      dayShift = { сегодня: 0, завтра: 1, послезавтра: 2 }[dw[1].toLowerCase()];
      text = text.replace(dw[0], ' ');
    }

    const abs = ABS.exec(text);
    let timeUsed = false;
    if (abs) {
      const [full, hStr, mStr, part] = abs;
      let h = parseInt(hStr, 10);
      const m = mStr ? parseInt(mStr, 10) : 0;
      const atStart = text.slice(0, abs.index).trim() === '';
      const atEnd = text.slice(abs.index + full.length).trim() === '';
      const explicit = mStr !== undefined || part !== undefined || /час|ч$/i.test(full.trim());
      const plausible = h <= 24 && m < 60 && (explicit || atStart || atEnd || dayShift !== null);
      if (plausible) {
        const p = part ? part.toLowerCase() : null;
        if (p === 'дня' && h < 12 && h !== 12) h += 12;
        else if (p === 'вечера' && h < 12) h += 12;
        else if (p === 'ночи' && h === 12) h = 0;
        else if (p === 'утра' && h === 12) h = 0;
        if (h === 24) h = 0;
        const d = new Date(now);
        d.setHours(h, m, 0, 0);
        if (dayShift !== null) d.setDate(d.getDate() + dayShift);
        else if (d.getTime() <= now) d.setDate(d.getDate() + 1);
        dueAt = d.getTime();
        text = text.replace(full, ' ');
        timeUsed = true;
      }
    }
    if (!timeUsed && dayShift !== null && dayShift > 0) {
      const d = new Date(now);
      d.setHours(9, 0, 0, 0);
      d.setDate(d.getDate() + dayShift);
      dueAt = d.getTime();
    } else if (!timeUsed && dayShift === 0) {
      text = text + ' ' + (dw ? dw[1] : '');
    }
  }

  const cleaned = capitalize(cleanup(text));
  return { text: cleaned || capitalize(original), dueAt, repeat: null };
}

module.exports = { parseTask, nextDue, repeatLabel };
