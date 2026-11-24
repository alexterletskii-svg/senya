'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseTask } = require('../src/core/taskParser');

const NOW = new Date('2026-11-24T20:30:00').getTime();
const at = (s) => new Date(s).getTime();

test('через N минут', () => {
  const r = parseTask('через 10 минут позвонить маме', NOW);
  assert.equal(r.text, 'Позвонить маме');
  assert.equal(r.dueAt, NOW + 10 * 60000);
});

test('время в конце фразы, часы', () => {
  const r = parseTask('позвонить маме через 2 часа', NOW);
  assert.equal(r.text, 'Позвонить маме');
  assert.equal(r.dueAt, NOW + 2 * 3600000);
});

test('полчаса и числительные словами', () => {
  assert.equal(parseTask('через полчаса чай', NOW).dueAt, NOW + 30 * 60000);
  assert.equal(parseTask('через пять минут печь', NOW).dueAt, NOW + 5 * 60000);
});

test('абсолютное время: уже прошло — переносится на завтра', () => {
  const r = parseTask('созвон в 15:30', NOW);
  assert.equal(r.text, 'Созвон');
  assert.equal(r.dueAt, at('2026-11-25T15:30:00'));
});

test('абсолютное время: сегодня позже', () => {
  assert.equal(parseTask('в 22:15 таблетки', NOW).dueAt, at('2026-11-24T22:15:00'));
});

test('завтра + часть суток', () => {
  assert.equal(parseTask('завтра в 9 утра отчёт', NOW).dueAt, at('2026-11-25T09:00:00'));
  assert.equal(parseTask('в 8 вечера кино', NOW).dueAt, at('2026-11-25T20:00:00'));
});

test('«в 18» в начале и в конце — это время', () => {
  assert.equal(parseTask('в 18 забрать посылку', NOW).dueAt, at('2026-11-25T18:00:00'));
  assert.equal(parseTask('забрать посылку в 23', NOW).dueAt, at('2026-11-24T23:00:00'));
});

test('«в 2 магазинах» — не время', () => {
  const r = parseTask('купить в 2 магазинах хлеб', NOW);
  assert.equal(r.dueAt, null);
  assert.equal(r.text, 'Купить в 2 магазинах хлеб');
});

test('«завтра» без времени — 9:00', () => {
  assert.equal(parseTask('завтра купить хлеб', NOW).dueAt, at('2026-11-25T09:00:00'));
});

test('без времени', () => {
  const r = parseTask('просто задача', NOW);
  assert.deepEqual(r, { text: 'Просто задача', dueAt: null });
});
