#!/usr/bin/env node
/**
 * Pre-release checks for a build: node scripts/check.js [dist]
 */
const fs = require('fs');
const path = require('path');
const config = require('../config/site.config');
const catalog = require('../content/load').catalog();

const DIR = path.resolve(__dirname, '..', process.argv[2] || 'dist');
const DEMO = JSON.parse(fs.readFileSync(path.join(DIR, '_build.json'), 'utf8')).demo;
const problems = [];
const warn = (file, msg) => problems.push(`${path.relative(DIR, file)}: ${msg}`);

const walk = (d) =>
  fs
    .readdirSync(d, { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const files = walk(DIR);
const htmlFiles = files.filter((f) => f.endsWith('.html'));
const textFiles = files.filter((f) => /\.(html|js|css|xml|txt|json)$/.test(f));

// The client script must have its config injected by the build.
for (const f of files.filter((f) => /assets\/app\.[0-9a-f]+\.js$/.test(f))) {
  if (fs.readFileSync(f, 'utf8').includes('__CONFIG__')) warn(f, 'client config was not injected');
}

const BANNED = [
  /динамично развивающ/i,
  /индивидуальн\w* подход к каждому/i,
  /качество на высшем уровне/i,
  /лучшие цены/i,
  /лидер отрасли/i,
  /инновационн\w* решени/i,
  /самая низкая цена/i,
  /укажите телефон/i,
  /здесь будет/i,
  /lorem ipsum/i,
  /qadoqlab@gmail\.com/i,
  /qadoqlab\.uz(?!@)/i,
];
const SECRETS = [
  /re_[A-Za-z0-9]{16,}/,
  /RESEND_API_KEY\s*[:=]\s*['"][^'"]+/,
  /bot\d{6,}:[A-Za-z0-9_-]{30,}/,
  /SMTP_PASS/,
];

for (const f of textFiles) {
  const s = fs.readFileSync(f, 'utf8');
  for (const rx of BANNED) if (rx.test(s)) warn(f, `запрещённая формулировка или неверный адрес: ${rx}`);
  for (const rx of SECRETS) if (rx.test(s)) warn(f, `похоже на секрет: ${rx}`);
  for (const m of s.matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}/g)) {
    if (!['qadoqlab.uz@gmail.com', 'name@company.uz'].includes(m[0]) && !/example\./.test(m[0]))
      warn(f, `посторонний email: ${m[0]}`);
  }
}

const exists = (urlPath) => {
  const p = decodeURIComponent(urlPath.split('#')[0].split('?')[0]);
  const target = path.join(DIR, p);
  return fs.existsSync(target) && (fs.statSync(target).isFile() || fs.existsSync(path.join(target, 'index.html')));
};

const unpublished = catalog.filter(
  (c) => !(config.catalogPublished[c.slug] && c.requires.every((r) => config.capabilities[r])),
);
for (const f of htmlFiles) {
  const s = fs.readFileSync(f, 'utf8');
  const rel = path.relative(DIR, f);
  const h1 = (s.match(/<h1[\s>]/g) || []).length;
  if (rel !== 'index.html' && h1 !== 1) warn(f, `H1 на странице: ${h1}`);
  if (/href=""|href="#"/.test(s)) warn(f, 'пустая ссылка');
  for (const m of s.matchAll(/<img\b[^>]*>/g)) {
    if (!/\balt="[^"]+"/.test(m[0])) warn(f, `img без alt: ${m[0].slice(0, 80)}`);
    if (!/\bwidth="\d+"/.test(m[0]) || !/\bheight="\d+"/.test(m[0])) warn(f, 'img без width/height');
  }
  for (const m of s.matchAll(/\b(?:href|src)="(\/[^"]*)"/g))
    if (!m[1].startsWith('/api/') && !exists(m[1])) warn(f, `битая ссылка: ${m[1]}`);
  const ids = [...s.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dup.length) warn(f, `повторяющиеся id: ${[...new Set(dup)].join(', ')}`);
  if (
    !JSON.parse(fs.readFileSync(path.join(DIR, '_build.json'), 'utf8')).indexable &&
    !/<meta name="robots" content="noindex/.test(s)
  )
    warn(f, 'домен не задан, но нет noindex');
  // Uzbek pages must not contain Cyrillic text
  if (rel.startsWith('uz/')) {
    // except elements marked lang="ru" and proper names marked translate="no"
    const body = s
      .replace(/<script[\s\S]*?<\/script>/g, '')
      .replace(/<[^>]+(?:lang="ru"|translate="no")[^>]*>[^<]*<\/[a-z]+>/g, '');
    const cyr = body.match(/[А-Яа-яЁё]{2,}/g);
    if (cyr) warn(f, `кириллица на узбекской странице: ${[...new Set(cyr)].slice(0, 5).join(', ')}`);
  }
  if (rel.startsWith('ru/')) {
    const body = s.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+lang="uz"[^>]*>[^<]*<\/[a-z]+>/g, '');
    if (/[a-z]‘[a-z]/i.test(body)) warn(f, 'узбекский текст на русской странице');
  }
  if (!DEMO) {
    for (const c of unpublished) {
      if (s.includes(`/catalog/${c.slug}/`)) warn(f, `ссылка на неопубликованную категорию ${c.slug}`);
      if (s.includes(`>${c.ru.name}<`) || s.includes(`>${c.uz.name}<`))
        warn(f, `неопубликованная категория в тексте: ${c.slug}`);
    }
    if (/tag-demo|demo-banner/.test(s)) warn(f, 'демо-маркировка в публичной сборке');
  }
}

console.log(
  `Проверено: ${htmlFiles.length} HTML, ${textFiles.length} текстовых файлов в ${path.relative(process.cwd(), DIR) || '.'}${DEMO ? ' (демо)' : ''}`,
);
if (problems.length) {
  console.log(problems.map((p) => '✗ ' + p).join('\n'));
  process.exit(1);
}
console.log('✓ замечаний нет');
