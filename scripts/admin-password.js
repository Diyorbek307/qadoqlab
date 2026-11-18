#!/usr/bin/env node
'use strict';

// Creates the scrypt hash for the admin panel password. The password itself is not stored.
//   npm run admin:password
// Prints ADMIN_PASSWORD_HASH=… for the server environment or the .env file.

const crypto = require('crypto');
const readline = require('readline');

const MIN_LENGTH = 12;
const SCRYPT = { N: 32768, r: 8, p: 1 };

function readPiped() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => resolve(data.replace(/\r?\n$/, '')));
  });
}

function askHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    // Print the prompt but not the typed characters.
    rl._writeToOutput = (text) => {
      if (text.includes(question)) rl.output.write(text);
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
  });
}

async function main() {
  const interactive = process.stdin.isTTY;
  const password = interactive
    ? await askHidden(`Пароль для панели (не короче ${MIN_LENGTH} символов): `)
    : await readPiped();
  if (password.length < MIN_LENGTH) {
    console.error(`Пароль слишком короткий: нужно не меньше ${MIN_LENGTH} символов.`);
    process.exit(1);
  }
  if (interactive && (await askHidden('Повторите пароль: ')) !== password) {
    console.error('Пароли не совпадают.');
    process.exit(1);
  }

  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password.normalize('NFC'), salt, 32, { ...SCRYPT, maxmem: 256 * 1024 * 1024 });
  const value = ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64'), hash.toString('base64')].join('$');

  console.log('\nДобавьте в переменные окружения сервера (или в файл .env):\n');
  console.log(`ADMIN_PASSWORD_HASH='${value}'`);
  console.log('\nВ .env кавычки можно оставить. В настройках хостинга вставляйте значение без кавычек.');
}

main();
