'use strict';

const path = require('node:path');
const { readFile } = require('./dotenv');

const SYSTEM_PROMPT =
  'Ты — Сеня, маленький парящий робот-напарник на рабочем столе пользователя. ' +
  'Говоришь по-русски, коротко (1–3 предложения), тепло и с лёгким юмором. ' +
  'Помогаешь не залипать за компьютером: перерывы, вода, осанка, глаза, Pomodoro, список дел. ' +
  'Если не знаешь ответа — честно скажи. Не выдумывай факты о пользователе. ' +
  'У тебя нет рук и ног, ты умеешь парить и показывать эмоции глазами.';

const MAX_HISTORY = 8;
const TIMEOUT_MS = 20000;

function loadEnv(base = process.env, dotenvFile = path.join(__dirname, '..', '..', '.env')) {
  let embedded = {};
  try {
    embedded = require('./embedded.json');
  } catch {
    embedded = {};
  }
  const env = { ...base };
  for (const [k, v] of Object.entries({ ...embedded, ...readFile(dotenvFile) })) {
    if (v && !(env[k] && String(env[k]).trim())) env[k] = v;
  }
  return env;
}

function isConfigured(env = process.env) {
  return Boolean(env.DEEPSEEK_API_KEY && env.DEEPSEEK_API_KEY.trim());
}

function buildMessages({ history = [], userText, context = '' }) {
  const system = context ? `${SYSTEM_PROMPT}\nКонтекст: ${context}` : SYSTEM_PROMPT;
  return [
    { role: 'system', content: system },
    ...history.slice(-MAX_HISTORY * 2),
    { role: 'user', content: userText },
  ];
}

class Chat {
  constructor({ env = loadEnv(), fetchFn = globalThis.fetch } = {}) {
    this.env = env;
    this.fetchFn = fetchFn;
    this.history = [];
  }

  get available() {
    return isConfigured(this.env);
  }

  async ask(userText, context = '') {
    const text = String(userText || '').trim().slice(0, 1000);
    if (!text) return { ok: false, text: 'Я весь внимание. Спроси что-нибудь!' };
    if (!this.available) {
      return {
        ok: false,
        text: 'Чтобы болтать по-настоящему, мне нужен ключ: задай переменную окружения DEEPSEEK_API_KEY и перезапусти меня.',
      };
    }
    const base = (this.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, '');
    const body = {
      model: this.env.DEEPSEEK_MODEL || 'deepseek-chat',
      messages: buildMessages({ history: this.history, userText: text, context }),
      max_tokens: 300,
      temperature: 0.8,
    };
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    try {
      const res = await this.fetchFn(`${base}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.env.DEEPSEEK_API_KEY.trim()}`,
        },
        body: JSON.stringify(body),
        signal: ctl.signal,
      });
      if (!res.ok) {
        const hint = res.status === 401 ? ' Похоже, ключ не подошёл.' : '';
        return { ok: false, text: `Связь с мозгами подвела (код ${res.status}).${hint}` };
      }
      const data = await res.json();
      const answer = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
      if (!answer) return { ok: false, text: 'Я задумался и забыл, что хотел сказать. Спроси ещё раз?' };
      const clean = String(answer).trim();
      this.history.push({ role: 'user', content: text }, { role: 'assistant', content: clean });
      this.history = this.history.slice(-MAX_HISTORY * 2);
      return { ok: true, text: clean };
    } catch (err) {
      const timeout = err && err.name === 'AbortError';
      return { ok: false, text: timeout ? 'Долго думаю... попробуй ещё раз.' : 'Нет связи с интернетом. Но я всё равно рядом.' };
    } finally {
      clearTimeout(timer);
    }
  }
}

module.exports = { loadEnv, Chat, buildMessages, isConfigured, SYSTEM_PROMPT };
