'use strict';
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const target = path.join(root, 'src', 'main', 'embedded.json');
const NAMES = ['DEEPSEEK_API_KEY', 'DEEPSEEK_BASE_URL', 'DEEPSEEK_MODEL'];

function parseEnv(text) {
  const out = {};
  for (const raw of String(text).replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}

function collect(env, fileText) {
  const fromFile = fileText ? parseEnv(fileText) : {};
  const result = {};
  for (const name of NAMES) {
    const v = String(env[name] || fromFile[name] || '').trim();
    if (v) result[name] = v;
  }
  return result;
}

if (require.main === module) {
  const envFile = path.join(root, '.env');
  const text = fs.existsSync(envFile) ? fs.readFileSync(envFile, 'utf8') : '';
  const data = collect(process.env, text);
  if (!data.DEEPSEEK_API_KEY) {
    console.log('Ключ не найден ни в .env, ни в переменной окружения: сборка без встроенного ключа');
    process.exit(0);
  }
  fs.writeFileSync(target, JSON.stringify(data));
  console.log('Ключ встроен в сборку');
}

module.exports = { parseEnv, collect };
