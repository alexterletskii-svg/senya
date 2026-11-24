'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseEnv, collect } = require('../scripts/embed-key');

test('parseEnv: значения, кавычки, пропуск пустых и # строк', () => {
  const r = parseEnv('# заметка\n\nDEEPSEEK_API_KEY="sk-abc"\nexport DEEPSEEK_MODEL=deepseek-chat\r\nмусор\n');
  assert.deepEqual(r, { DEEPSEEK_API_KEY: 'sk-abc', DEEPSEEK_MODEL: 'deepseek-chat' });
});

test('collect: переменная окружения главнее .env', () => {
  const r = collect({ DEEPSEEK_API_KEY: 'sk-env' }, 'DEEPSEEK_API_KEY=sk-file');
  assert.equal(r.DEEPSEEK_API_KEY, 'sk-env');
  assert.deepEqual(collect({}, ''), {});
});
