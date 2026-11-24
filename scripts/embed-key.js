'use strict';
const fs = require('node:fs');
const path = require('node:path');

const file = path.join(__dirname, '..', 'src', 'main', 'embedded.json');
const key = (process.env.DEEPSEEK_API_KEY || '').trim();

if (!key) {
  console.log('DEEPSEEK_API_KEY не задан: сборка без встроенного ключа');
  process.exit(0);
}
fs.writeFileSync(file, JSON.stringify({ DEEPSEEK_API_KEY: key }));
console.log('Ключ встроен в сборку');
