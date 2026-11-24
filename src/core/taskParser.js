'use strict';

// Разбор задачи с русским указанием времени:
//   «через 10 минут позвонить маме»
//   «созвон в 15:30», «завтра в 9 утра отчёт», «в 18 забрать посылку»
// Возвращает { text, dueAt } — dueAt в мс или null.

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

function parseTask(raw, now = Date.now()) {
  const original = String(raw || '').trim();
  let text = ' ' + original;
  let dueAt = null;

  // 1. Относительное время: «через N единиц»
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

  // 2. День + абсолютное время (только если не нашли относительное)
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
      // «в 2 магазинах» — не время; «в 18 забрать посылку» — время (в начале)
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
      // «завтра купить хлеб» — на 9:00 указанного дня
      const d = new Date(now);
      d.setHours(9, 0, 0, 0);
      d.setDate(d.getDate() + dayShift);
      dueAt = d.getTime();
    } else if (!timeUsed && dayShift === 0) {
      // «сегодня» без времени — просто слово, возвращаем в текст
      text = text + ' ' + (dw ? dw[1] : '');
    }
  }

  const cleaned = capitalize(cleanup(text));
  return { text: cleaned || capitalize(original), dueAt };
}

module.exports = { parseTask };
