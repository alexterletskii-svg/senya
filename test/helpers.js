'use strict';
const { Engine } = require('../src/core/engine');

function makeEngine(saved) {
  const clock = { t: new Date('2026-11-24T10:00:00').getTime() };
  const e = new Engine({ now: () => clock.t, rng: () => 0.1, saved });
  const reminders = [];
  e.on('reminder', (r) => reminders.push(r));
  // прокрутка времени секундными тиками; idle — функция состояния простоя
  const advance = (sec, idle = 0) => {
    for (let i = 0; i < sec; i++) {
      clock.t += 1000;
      e.setIdle(idle);
      e.tick();
    }
  };
  return { e, clock, reminders, advance };
}

module.exports = { makeEngine };
