'use strict';

window.Sound = (() => {
  let ctx = null;
  let master = null;
  let enabled = true;
  let volume = 0.6;

  function ensure() {
    if (!ctx) {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    master.gain.value = volume * 0.5;
    return ctx;
  }

  function tone(c, { f0, f1 = f0, at = 0, dur = 0.1, type = 'square', gain = 0.12, vibrato = 0 }) {
    const t = c.currentTime + at;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(f1, t + dur);
    if (vibrato) {
      const lfo = c.createOscillator();
      const lg = c.createGain();
      lfo.frequency.value = 22;
      lg.gain.value = vibrato;
      lfo.connect(lg).connect(osc.frequency);
      lfo.start(t);
      lfo.stop(t + dur + 0.02);
    }
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.03);
  }

  const PHRASES = {
    happy: [
      { f0: 700, f1: 1300, at: 0, dur: 0.08 }, { f0: 900, f1: 1600, at: 0.09, dur: 0.08 },
      { f0: 1200, f1: 2100, at: 0.18, dur: 0.12, type: 'triangle' },
    ],
    sad: [
      { f0: 520, f1: 300, at: 0, dur: 0.28, type: 'triangle', gain: 0.14 },
      { f0: 340, f1: 190, at: 0.3, dur: 0.4, type: 'triangle', gain: 0.14 },
    ],
    love: [
      { f0: 780, f1: 980, at: 0, dur: 0.16, type: 'sine', gain: 0.16, vibrato: 30 },
      { f0: 980, f1: 760, at: 0.17, dur: 0.16, type: 'sine', gain: 0.16, vibrato: 30 },
      { f0: 900, f1: 1180, at: 0.34, dur: 0.22, type: 'sine', gain: 0.16, vibrato: 40 },
    ],
    sleep: [{ f0: 200, f1: 130, at: 0, dur: 0.5, type: 'sine', gain: 0.08 }],
    wake: [{ f0: 300, f1: 1100, at: 0, dur: 0.22, type: 'sine', gain: 0.14 }, { f0: 1100, f1: 900, at: 0.24, dur: 0.08, type: 'square', gain: 0.08 }],
    poke: [{ f0: 700, f1: 480, at: 0, dur: 0.1 }, { f0: 480, f1: 900, at: 0.12, dur: 0.14 }],
    alert: [{ f0: 1000, at: 0, dur: 0.07 }, { f0: 1250, at: 0.12, dur: 0.09 }],
    work: [{ f0: 440, f1: 660, at: 0, dur: 0.06 }, { f0: 660, f1: 880, at: 0.08, dur: 0.06 }],
    done: [{ f0: 880, at: 0, dur: 0.07 }, { f0: 1320, at: 0.09, dur: 0.14, type: 'triangle' }],
  };

  function play(name) {
    if (!enabled) return;
    const seq = PHRASES[name];
    if (!seq) return;
    try {
      const c = ensure();
      for (const n of seq) tone(c, n);
    } catch {  }
  }

  let babbleTimer = 0;
  function babble(text, { onEnd } = {}) {
    clearTimeout(babbleTimer);
    if (!enabled) { if (onEnd) onEnd(); return 0; }
    const chars = [...String(text)].slice(0, 70);
    let i = 0;
    let total = 0;
    try {
      const c = ensure();
      for (const ch of chars) {
        const step = ch === ' ' ? 0.09 : 0.055;
        if (ch !== ' ' && /[\p{L}\p{N}]/u.test(ch)) {
          const code = ch.toLowerCase().codePointAt(0);
          const f = 420 + ((code * 37) % 900);
          tone(c, { f0: f, f1: f * (code % 2 ? 1.25 : 0.8), at: total, dur: 0.05, type: code % 3 ? 'square' : 'triangle', gain: 0.07 });
        }
        total += step;
        i += 1;
      }
    } catch {  }
    babbleTimer = setTimeout(() => { if (onEnd) onEnd(); }, total * 1000);
    return total * 1000;
  }

  return {
    play,
    babble,
    setConfig(cfg) {
      enabled = Boolean(cfg.sound);
      volume = Math.min(1, Math.max(0, (cfg.volume ?? 60) / 100));
      if (master) master.gain.value = volume * 0.5;
    },
  };
})();
