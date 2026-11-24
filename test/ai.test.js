'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Chat, buildMessages, isConfigured } = require('../src/main/ai');

const okFetch = (answer, spy) => async (url, opts) => {
  if (spy) { spy.url = url; spy.opts = opts; }
  return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: answer } }] }) };
};

test('без ключа: подсказка, сеть не трогаем', async () => {
  let called = false;
  const chat = new Chat({ env: {}, fetchFn: async () => { called = true; } });
  assert.equal(chat.available, false);
  const r = await chat.ask('привет');
  assert.equal(r.ok, false);
  assert.match(r.text, /DEEPSEEK_API_KEY/);
  assert.equal(called, false);
});

test('запрос: адрес, ключ в заголовке, сообщения', async () => {
  const spy = {};
  const chat = new Chat({ env: { DEEPSEEK_API_KEY: ' sk-test ' }, fetchFn: okFetch('Привет!', spy) });
  const r = await chat.ask('как дела?', 'настроение: бодрый');
  assert.deepEqual(r, { ok: true, text: 'Привет!' });
  assert.equal(spy.url, 'https://api.deepseek.com/chat/completions');
  assert.equal(spy.opts.headers.Authorization, 'Bearer sk-test');
  const body = JSON.parse(spy.opts.body);
  assert.equal(body.model, 'deepseek-chat');
  assert.equal(body.messages[0].role, 'system');
  assert.match(body.messages[0].content, /настроение: бодрый/);
  assert.deepEqual(body.messages.at(-1), { role: 'user', content: 'как дела?' });
});

test('история копится и ограничена', async () => {
  const chat = new Chat({ env: { DEEPSEEK_API_KEY: 'k' }, fetchFn: okFetch('ок') });
  for (let i = 0; i < 12; i++) await chat.ask(`вопрос ${i}`);
  assert.equal(chat.history.length, 16);
  const msgs = buildMessages({ history: chat.history, userText: 'ещё' });
  assert.equal(msgs.length, 1 + 16 + 1);
});

test('ошибки сервера и сети не бросают исключений', async () => {
  const bad = new Chat({ env: { DEEPSEEK_API_KEY: 'k' }, fetchFn: async () => ({ ok: false, status: 401 }) });
  const r1 = await bad.ask('привет');
  assert.equal(r1.ok, false);
  assert.match(r1.text, /401/);
  const down = new Chat({ env: { DEEPSEEK_API_KEY: 'k' }, fetchFn: async () => { throw new Error('ENOTFOUND'); } });
  assert.equal((await down.ask('привет')).ok, false);
  const empty = new Chat({ env: { DEEPSEEK_API_KEY: 'k' }, fetchFn: async () => ({ ok: true, json: async () => ({}) }) });
  assert.equal((await empty.ask('привет')).ok, false);
});

test('пустой вопрос и настройка адреса/модели', async () => {
  const spy = {};
  const chat = new Chat({ env: { DEEPSEEK_API_KEY: 'k', DEEPSEEK_BASE_URL: 'http://x/', DEEPSEEK_MODEL: 'm1' }, fetchFn: okFetch('a', spy) });
  assert.equal((await chat.ask('   ')).ok, false);
  await chat.ask('q');
  assert.equal(spy.url, 'http://x/chat/completions');
  assert.equal(JSON.parse(spy.opts.body).model, 'm1');
  assert.equal(isConfigured({ DEEPSEEK_API_KEY: '' }), false);
});

test('loadEnv: переменная окружения главнее встроенного ключа', () => {
  const { loadEnv } = require('../src/main/ai');
  assert.equal(loadEnv({ DEEPSEEK_API_KEY: 'sk-env' }).DEEPSEEK_API_KEY, 'sk-env');
  assert.equal(loadEnv({}).DEEPSEEK_API_KEY, undefined);
});
