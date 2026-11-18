#!/usr/bin/env node
'use strict';

// Browser tests: real pages in Chromium against temporary builds and servers.
// A fake mail API stands in for the provider, so no e-mail leaves the machine.
//   npm run test:browser
// Needs Playwright with Chromium (not a dependency of the site): npx playwright install chromium

const fs = require('fs');
const os = require('os');
const net = require('net');
const path = require('path');
const http = require('http');
const { spawn, spawnSync } = require('child_process');

let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  console.error('Playwright is not installed. Run: npm i -D playwright && npx playwright install chromium');
  process.exit(1);
}

const ROOT = path.resolve(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qadoqlab-browser-'));
const children = [];
const results = [];
const check = (pass, name) => results.push([Boolean(pass), name]);

function freePort() {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

function build(out, demo, env = {}) {
  const args = [path.join(ROOT, 'src/build.js'), `--out=${out}`];
  if (demo) args.push('--demo');
  const res = spawnSync(process.execPath, args, {
    env: { ...process.env, DATA_DIR: path.join(tmp, 'data'), ...env },
    encoding: 'utf8',
  });
  if (res.status !== 0) throw new Error(`build failed: ${res.stderr}`);
}

async function startServer(env) {
  const port = await freePort();
  const child = spawn(process.execPath, [path.join(ROOT, 'server/server.js')], {
    env: {
      ...process.env,
      DATA_DIR: path.join(tmp, 'data'),
      MAIL_PROVIDER: '',
      ...env,
      PORT: String(port),
      HOST: '127.0.0.1',
    },
    stdio: 'ignore',
  });
  children.push(child);
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`${base}/ru/`)).ok) return base;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('server did not start');
}

// A host without the Node server, like a Render static site: files only, no /api.
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.svg': 'image/svg+xml',
};
async function startStaticHost(dir) {
  const srv = http.createServer((req, res) => {
    let file = path.join(dir, decodeURIComponent(req.url.split('?')[0]));
    if (file.endsWith(path.sep)) file = path.join(file, 'index.html');
    if (req.method !== 'GET' || !file.startsWith(dir) || !fs.existsSync(file)) {
      res.writeHead(404);
      return res.end();
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(fs.readFileSync(file));
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  children.push({ kill: () => srv.close() });
  return `http://127.0.0.1:${srv.address().port}`;
}

function cleanup() {
  for (const child of children) child.kill();
  fs.rmSync(tmp, { recursive: true, force: true });
}

async function main() {
  const sent = [];
  const mailApi = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => {
      body += c;
    });
    req.on('end', () => {
      sent.push(JSON.parse(body));
      res.end('{"id":"test"}');
    });
  });
  await new Promise((r) => mailApi.listen(0, '127.0.0.1', r));

  build(path.join(tmp, 'public'), false);
  build(path.join(tmp, 'demo'), true);
  const online = await startServer({
    SITE_DIR: path.join(tmp, 'demo'),
    MAIL_PROVIDER: 'resend',
    RESEND_API_KEY: 'test-key',
    MAIL_FROM: 'QADOQLAB <requests@example.test>',
    RESEND_API_URL: `http://127.0.0.1:${mailApi.address().port}/emails`,
    UPLOADS_ENABLED: 'true',
    MIN_FILL_MS: '500',
  });
  const offline = await startServer({ SITE_DIR: path.join(tmp, 'public') });
  build(path.join(tmp, 'static'), false, { STATIC_HOSTING: 'true' });
  const staticHost = await startStaticHost(path.join(tmp, 'static'));

  const browser = await chromium.launch();
  const errors = [];
  const watch = (page) => {
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && !/status of (404|502)/.test(m.text()) && errors.push(m.text()));
    return page;
  };
  const desktop = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const p = watch(await desktop.newPage());

  // Quote form: validation, prefill from the URL, delivery with an attachment
  await p.goto(`${online}/ru/request/?type=archive-boxes&industry=textile`);
  check((await p.textContent('[data-type-name]')).includes('Архивные'), 'form: box type prefilled from the URL');
  check((await p.inputValue('#rf-industry')) === 'textile', 'form: industry prefilled from the URL');
  check(await p.isVisible('#rf-files'), 'form: file field shown when the server accepts files');
  await p.click('#rf [data-submit]');
  check(await p.isVisible('#rf [data-error-summary]'), 'form: error summary on empty submit');
  check(
    await p.evaluate(() => document.activeElement.matches('[data-error-summary]')),
    'form: focus moves to the summary',
  );
  await p.fill('#rf-task', 'Коробки для архива, папки А4');
  await p.click('label:has(input[value=email]) >> nth=0');
  check((await p.getAttribute('#rf-contact', 'type')) === 'email', 'form: contact field becomes type=email');
  await p.fill('#rf-contact', 'buyer@example.uz');
  await p.setInputFiles('#rf-files', {
    name: 'scan.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4 test'),
  });
  await p.waitForTimeout(700);
  await p.click('#rf [data-submit]');
  await p.waitForSelector('[data-success-for=rf]:not([hidden])', { timeout: 5000 });
  check(
    sent.length === 1 && sent[0].attachments[0].filename === 'attachment-1.pdf',
    'form: delivered with the PDF attached',
  );

  // A failed send keeps what was typed
  await p.goto(`${online}/uz/request/`);
  await p.fill('#rf-task', 'Test');
  await p.fill('#rf-contact', '+998 90 123 45 67');
  await p.route('**/api/request', (r) =>
    r.fulfill({ status: 502, contentType: 'application/json', body: '{"ok":false,"error":"send_failed"}' }),
  );
  await p.waitForTimeout(700);
  await p.click('#rf [data-submit]');
  await p.waitForSelector('#rf .form-status.is-error');
  check((await p.inputValue('#rf-task')) === 'Test', 'form: data kept after a send error (UZ)');
  await p.unroute('**/api/request');

  // Step-by-step helper
  await p.goto(`${online}/ru/#wizard`);
  await p.click('[data-wz-next]');
  check(await p.isVisible('#wz [data-step-error]'), 'helper: step 1 needs a choice');
  await p.click('.tile:has(input[value=nuts])');
  await p.click('[data-wz-next]');
  const topBefore = await p.getAttribute('#wz .box-preview .bp-top', 'points');
  await p.fill('#wz-length', '400');
  await p.fill('#wz-width', '300');
  await p.fill('#wz-height', '250');
  await p.waitForTimeout(400);
  check(
    topBefore && (await p.getAttribute('#wz .box-preview .bp-top', 'points')) !== topBefore,
    'helper: box preview follows the sizes',
  );
  await p.click('[data-wz-next]');
  await p.fill('#wz-quantity', '3000');
  await p.click('[data-wz-next]');
  await p.click('[data-wz-next]');
  await p.click('#wz label:has(input[value=telegram])');
  await p.fill('#wz-contact', '@nutsbuyer');
  await p.click('[data-wz-next]');
  check((await p.textContent('[data-summary]')).includes('400 × 300 × 250 мм'), 'helper: summary shows the answers');
  await p.click('#wz [data-submit]');
  await p.waitForSelector('[data-success-for=wz]:not([hidden])', { timeout: 5000 });
  check(sent.length === 2 && /Telegram: @nutsbuyer/.test(sent[1].text), 'helper: request delivered');

  // Without a mail service: prepared e-mail, never a fake success
  const q = watch(await desktop.newPage());
  await q.goto(`${offline}/ru/request/`);
  await q.waitForTimeout(300);
  check(
    (await q.textContent('#rf [data-submit] .btn-label')) === 'Подготовить письмо',
    'fallback: submit prepares an e-mail',
  );
  await q.fill('#rf-task', 'Коробка 300×200');
  await q.fill('#rf-contact', '+998901234567');
  await q.click('#rf [data-submit]').catch(() => {});
  await q.waitForTimeout(400);
  check(!(await q.isVisible('[data-success-for=rf]:not([hidden])')), 'fallback: no success message');

  // Language switch keeps the page and its query
  await p.goto(`${online}/ru/request/?industry=nuts`);
  await p.click('.header-actions [data-lang-switch=uz]');
  await p.waitForLoadState();
  check(p.url().endsWith('/uz/request/?industry=nuts'), 'language: same page and query after switching');

  // Catalog card → box type page: only the clicked box takes part in the transition
  await p.addInitScript(() => {
    window.addEventListener('pagereveal', (e) => {
      window.__vt = [];
      if (e.viewTransition) {
        requestAnimationFrame(() => {
          window.__vt = document
            .getAnimations()
            .map((a) => a.effect && a.effect.pseudoElement)
            .filter((x) => x && x.startsWith('::view-transition-group'));
        });
      }
    });
  });
  await p.goto(`${online}/ru/catalog/`);
  await p.click('.cat-card >> nth=1 >> .cat-title a');
  await p.waitForURL('**/four-flap-boxes/');
  await p.waitForTimeout(150);
  const groups = await p.evaluate(() => window.__vt || []);
  check(
    groups.length === 0 || (groups.includes('::view-transition-group(box-four-flap-boxes)') && groups.length === 3),
    `catalog: one box morphs into the page (${groups.join(', ') || 'no view transitions'})`,
  );

  // Contacts: copy button
  const clip = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  const c = watch(await clip.newPage());
  await c.goto(`${offline}/ru/contacts/`);
  await c.click('.copy-btn');
  await c.waitForTimeout(300);
  check(
    (await c.evaluate(() => navigator.clipboard.readText())) === 'qadoqlab.uz@gmail.com',
    'contacts: address copied',
  );

  // 404 page
  const missing = await c.goto(`${offline}/ru/no-such-page/`);
  check(missing.status() === 404 && (await c.isVisible('.nf-svg')), '404: status and illustration');

  // Mobile: menu, keyboard, sticky button, layout
  const phone = await browser.newContext({ viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true });
  const m = watch(await phone.newPage());
  await m.goto(`${offline}/ru/`);
  await m.keyboard.press('Tab');
  check(
    (await m.evaluate(() => document.activeElement.className)) === 'skip-link',
    'keyboard: first Tab is the skip link',
  );
  await m.click('[data-menu-toggle]');
  await m.waitForTimeout(700);
  const menuHeight = await m.evaluate(() => document.getElementById('mobile-menu').getBoundingClientRect().height);
  check(menuHeight > 400, `menu: opens to full height (${Math.round(menuHeight)}px)`);
  for (let i = 0; i < 12; i++) await m.keyboard.press('Tab');
  check(await m.evaluate(() => Boolean(document.activeElement.closest('[data-header]'))), 'menu: focus stays inside');
  await m.keyboard.press('Escape');
  await m.waitForTimeout(500);
  check(
    !(await m.isVisible('#mobile-menu')) &&
      (await m.evaluate(() => document.activeElement.matches('[data-menu-toggle]'))),
    'menu: Escape closes it and returns focus',
  );
  await m.evaluate(() => window.scrollTo(0, 2600));
  await m.waitForTimeout(400);
  check(
    await m.evaluate(() => document.querySelector('[data-sticky-cta]').classList.contains('is-visible')),
    'sticky button: shows after the hero',
  );
  const minFont = await m.evaluate(() =>
    Math.min(
      ...[...document.querySelectorAll('input:not([type=hidden]):not([type=radio]), textarea, select')].map((e) =>
        parseFloat(getComputedStyle(e).fontSize),
      ),
    ),
  );
  check(minFont >= 16, `fields: font size ≥ 16px, no zoom on iPhone (${minFont})`);

  // Layout: no horizontal scroll on any page at any width
  const pages = [
    'ru/',
    'uz/',
    'ru/catalog/',
    'ru/business/',
    'uz/about/',
    'ru/request/',
    'uz/contacts/',
    'ru/catalog/apparel-boxes/',
  ];
  const overflow = [];
  for (const width of [360, 390, 430, 768, 1024, 1440]) {
    const ctx = await browser.newContext({ viewport: { width, height: 800 } });
    const page = watch(await ctx.newPage());
    for (const rel of pages) {
      await page.goto(`${online}/${rel}`);
      const sw = await page.evaluate(() => document.documentElement.scrollWidth);
      if (sw > width) overflow.push(`${rel}@${width}=${sw}`);
    }
    await ctx.close();
  }
  check(overflow.length === 0, `layout: no horizontal scroll at 360–1440 ${overflow.join(' ')}`);

  // Reduced motion: no entrance animations, the hero is complete at once
  const calm = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  const r = watch(await calm.newPage());
  await r.goto(`${offline}/ru/`);
  await r.waitForTimeout(200);
  check(
    await r.evaluate(() =>
      [...document.querySelectorAll('.hx, .hero-title .ln-i')].every(
        (el) => getComputedStyle(el).animationName === 'none',
      ),
    ),
    'reduced motion: hero is static',
  );
  check(
    !(await r.evaluate(() => document.documentElement.classList.contains('reveal-ready'))),
    'reduced motion: blocks are not hidden for reveal',
  );

  // Without JavaScript the content is all there
  const nojs = await browser.newContext({ viewport: { width: 1280, height: 900 }, javaScriptEnabled: false });
  const n = await nojs.newPage();
  await n.goto(`${offline}/ru/`);
  check(
    await n.evaluate(() =>
      [...document.querySelectorAll('.reveal, .wi')].every((el) => getComputedStyle(el).opacity === '1'),
    ),
    'no JS: every block is visible',
  );
  check(await n.isVisible('#wz .wz-step[data-step="5"]'), 'no JS: the helper is a plain form with all steps');

  // Static hosting: no server to ask, the forms start in e-mail mode
  const apiCalls = [];
  const st = watch(await desktop.newPage());
  st.on('request', (req) => req.url().includes('/api/') && apiCalls.push(req.url()));
  await st.goto(`${staticHost}/ru/request/`);
  check((await st.getAttribute('#rf', 'data-mode')) === 'mailto', 'static hosting: the form is in e-mail mode');
  check(await st.isVisible('#rf [data-mailto-note]'), 'static hosting: the e-mail note is shown');
  await st.goto(`${staticHost}/ru/`);
  check(apiCalls.length === 0, 'static hosting: no requests to /api');
  const sn = await nojs.newPage();
  await sn.goto(`${staticHost}/ru/request/`);
  check(
    (await sn.getAttribute('#rf', 'action')).startsWith('mailto:qadoqlab.uz@gmail.com?'),
    'static hosting, no JS: the form goes to the mail app',
  );

  check(errors.length === 0, `no console errors ${JSON.stringify(errors)}`);
  await browser.close();
  mailApi.close();
}

main()
  .catch((err) => check(false, `crashed: ${err.message.split('\n')[0]}`))
  .finally(() => {
    cleanup();
    for (const [pass, name] of results) console.log(`${pass ? '✓' : '✗'} ${name}`);
    const failed = results.filter(([pass]) => !pass).length;
    console.log(`\n${results.length - failed}/${results.length} passed`);
    process.exit(failed ? 1 : 0);
  });
