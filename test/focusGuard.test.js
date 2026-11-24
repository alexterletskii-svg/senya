'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { parseLine, decide, startFocusGuard, PS_SCRIPT } = require('../src/main/focusGuard');

test('parseLine разбирает строки PowerShell', () => {
  assert.deepEqual(parseLine('quns=5 mic=0\r\n'), { quns: 5, mic: false });
  assert.deepEqual(parseLine('quns=3 mic=1'), { quns: 3, mic: true });
  assert.equal(parseLine('мусор'), null);
});

test('decide: полный экран и презентация прячут Сеню, звонок только глушит', () => {
  assert.deepEqual(decide({ quns: 5, mic: false }), { dnd: false, hide: false, reason: '' });
  assert.deepEqual(decide({ quns: 2, mic: false }), { dnd: true, hide: true, reason: 'fullscreen' });
  assert.deepEqual(decide({ quns: 3, mic: false }), { dnd: true, hide: true, reason: 'fullscreen' });
  assert.deepEqual(decide({ quns: 4, mic: false }), { dnd: true, hide: true, reason: 'presentation' });
  assert.deepEqual(decide({ quns: 5, mic: true }), { dnd: true, hide: false, reason: 'call' });
  assert.equal(decide({ quns: 3, mic: true }).hide, true);
});

test('не-Windows: ничего не запускается', () => {
  let spawned = false;
  const stop = startFocusGuard(() => {}, { platform: 'linux', spawnFn: () => { spawned = true; } });
  stop();
  assert.equal(spawned, false);
});

test('Windows: события только при смене состояния, ввод кусками', () => {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.kill = () => { child.killed = true; };
  let args;
  const seen = [];
  const stop = startFocusGuard((d) => seen.push(d.reason), {
    platform: 'win32',
    spawnFn: (cmd, a) => { args = [cmd, a]; return child; },
  });
  assert.equal(args[0], 'powershell.exe');
  assert.ok(args[1].includes('-EncodedCommand'));
  child.stdout.emit('data', Buffer.from('quns=5 mic=0\nquns=5 m'));
  child.stdout.emit('data', Buffer.from('ic=0\nquns=3 mic=0\nquns=3 mic=0\nquns=5 mic=1\n'));
  assert.deepEqual(seen, ['', 'fullscreen', 'call']);
  stop();
  assert.equal(child.killed, true);
});

test('скрипт PowerShell содержит нужные вызовы', () => {
  assert.match(PS_SCRIPT, /SHQueryUserNotificationState/);
  assert.match(PS_SCRIPT, /ConsentStore/);
});
