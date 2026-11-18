#!/usr/bin/env node
/**
 * Admin panel tests against a temporary data folder and build; data/ and dist/ are not touched.
 * Run: npm run test:admin
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert/strict');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qadoqlab-admin-'));
const PASSWORD = 'correct-horse-battery-7';
const salt = crypto.randomBytes(16);
const hash = crypto.scryptSync(PASSWORD, salt, 32, { N: 16384, r: 8, p: 1 });

Object.assign(process.env, {
  DATA_DIR: path.join(tmp, 'data'),
  SITE_DIR: path.join(tmp, 'site'),
  ADMIN_PASSWORD_HASH: `scrypt$16384$8$1$${salt.toString('base64')}$${hash.toString('base64')}`,
  TRUST_PROXY: 'true',
  MAIL_PROVIDER: '',
  RESEND_API_KEY: '',
});
const b = spawnSync(process.execPath, [path.join(ROOT, 'src/build.js'), `--out=${process.env.SITE_DIR}`], {
  env: process.env,
  encoding: 'utf8',
});
if (b.status !== 0) {
  console.error(b.stderr);
  process.exit(1);
}

const results = [];
async function test(name, fn) {
  try {
    await fn();
    results.push(['ok', name]);
  } catch (e) {
    results.push(['FAIL', name, e.message]);
  }
}
const site = (rel) => fs.readFileSync(path.join(process.env.SITE_DIR, rel), 'utf8');
const PNG = Buffer.concat([
  Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0x06, 0x40, 0, 0, 0x04,
    0xb0,
  ]),
  Buffer.alloc(64),
]);

(async () => {
  const server = require('../server/server');
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = '';
  const call = (method, p, body, { headers = {}, form, noAdmin, noCookie } = {}) =>
    fetch(base + p, {
      method,
      headers: {
        ...(noAdmin ? {} : { 'X-Admin-Request': '1' }),
        ...(body !== undefined && !form ? { 'Content-Type': 'application/json' } : {}),
        ...(cookie && !noCookie ? { Cookie: cookie } : {}),
        'X-Forwarded-For': headers['X-Forwarded-For'] || '10.1.1.1',
        ...headers,
      },
      body: form || (body !== undefined ? JSON.stringify(body) : undefined),
    });

  await test('panel disabled without password hash', async () => {
    const { createAdmin } = require('../server/admin');
    const off = createAdmin({
      root: tmp,
      files: {},
      stats: {},
      mailTo: () => [],
      isDemo: () => false,
      onRebuilt() {},
      env: {},
    });
    assert.equal(off.enabled, false);
    const broken = createAdmin({
      root: tmp,
      files: {},
      stats: {},
      mailTo: () => [],
      isDemo: () => false,
      onRebuilt() {},
      env: { ADMIN_PASSWORD_HASH: 'plain-password' },
    });
    assert.equal(broken.enabled, false);
  });
  await test('UI page served with noindex', async () => {
    const r = await fetch(base + '/admin/');
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('x-robots-tag'), 'noindex, nofollow');
    assert.match(await r.text(), /Панель управления/);
  });
  await test('API without session → 401', async () => {
    assert.equal((await call('GET', '/admin/api/state')).status, 401);
  });
  await test('login without X-Admin-Request header → 403', async () => {
    assert.equal((await call('POST', '/admin/api/login', { password: PASSWORD }, { noAdmin: true })).status, 403);
  });
  await test('wrong password → 401', async () => {
    assert.equal((await call('POST', '/admin/api/login', { password: 'nope' })).status, 401);
  });
  await test('login: HttpOnly, SameSite=Strict, Path=/admin cookie', async () => {
    const r = await call('POST', '/admin/api/login', { password: PASSWORD });
    assert.equal(r.status, 200);
    const sc = r.headers.get('set-cookie');
    assert.match(sc, /HttpOnly/);
    assert.match(sc, /SameSite=Strict/);
    assert.match(sc, /Path=\/admin/);
    cookie = sc.split(';')[0];
  });
  await test('state returns settings, catalog, texts, status', async () => {
    const j = await (await call('GET', '/admin/api/state')).json();
    assert.equal(j.settings.contacts.email, 'qadoqlab.uz@gmail.com');
    assert.equal(j.catalog.length, 8);
    assert.ok(j.texts.length > 200);
    assert.equal(j.status.mail.configured, false);
  });
  const settingsBase = async () => (await (await call('GET', '/admin/api/state')).json()).settings;
  await test('invalid phone → 400 with field', async () => {
    const s = await settingsBase();
    const j = await (await call('PUT', '/admin/api/settings', { contacts: { ...s.contacts, phone: '12' } })).json();
    assert.equal(j.error, 'phone');
    assert.equal(j.field, 'contacts.phone');
  });
  await test('valid phone → saved, site rebuilt, phone on contacts page', async () => {
    const s = await settingsBase();
    const r = await call('PUT', '/admin/api/settings', {
      contacts: { ...s.contacts, phone: '+998 90 000 00 00', telegram: '@qadoqlab_test' },
    });
    const j = await r.json();
    assert.equal(r.status, 200);
    assert.equal(j.build.ok, true);
    const h = site('ru/contacts/index.html');
    assert.match(h, /\+998 90 000 00 00/);
    assert.match(h, /t\.me\/qadoqlab_test/);
    assert.equal(
      JSON.parse(fs.readFileSync(path.join(process.env.DATA_DIR, 'settings.json'), 'utf8')).contacts.telegram,
      'qadoqlab_test',
    );
  });
  await test('privacy page needs requisites', async () => {
    const s = await settingsBase();
    const j = await (
      await call('PUT', '/admin/api/settings', { legal: { ...s.legal, privacyPolicyReady: true } })
    ).json();
    assert.equal(j.error, 'privacy_incomplete');
    const r = await call('PUT', '/admin/api/settings', {
      legal: {
        ...s.legal,
        operatorName: 'Тестовый оператор',
        taxId: '123456789',
        legalAddress: 'Тестовый адрес',
        privacyPolicyReady: true,
      },
    });
    assert.equal(r.status, 200);
    assert.equal((await fetch(base + '/ru/privacy/')).status, 200);
    assert.match(site('ru/request/index.html'), /href="\/ru\/privacy\/"/);
  });
  await test('publish category → page appears; printed boxes need printing', async () => {
    let r = await call('PUT', '/admin/api/settings', {
      catalogPublished: { 'transport-boxes': true, 'printed-boxes': true },
    });
    assert.equal(r.status, 200);
    assert.equal((await fetch(base + '/ru/catalog/transport-boxes/')).status, 200);
    assert.equal((await fetch(base + '/uz/catalog/transport-boxes/')).status, 200);
    assert.equal((await fetch(base + '/ru/catalog/printed-boxes/')).status, 404);
    r = await call('PUT', '/admin/api/settings', { capabilities: { printing: true } });
    assert.equal((await fetch(base + '/ru/catalog/printed-boxes/')).status, 200);
  });
  await test('catalog text edit; empty name rejected', async () => {
    const st = await (await call('GET', '/admin/api/state')).json();
    const c = st.catalog.find((x) => x.slug === 'transport-boxes');
    const j = await (
      await call('PUT', '/admin/api/catalog', { 'transport-boxes': { ru: { ...c.ru, name: '' }, uz: c.uz } })
    ).json();
    assert.equal(j.error, 'required');
    assert.equal(j.field, 'transport-boxes.ru.name');
    const r = await call('PUT', '/admin/api/catalog', {
      'transport-boxes': { ru: { ...c.ru, name: 'Гофрокороба для перевозки' }, uz: c.uz },
    });
    assert.equal(r.status, 200);
    assert.match(site('ru/catalog/transport-boxes/index.html'), /<h1>Гофрокороба для перевозки<\/h1>/);
    const saved = JSON.parse(fs.readFileSync(path.join(process.env.DATA_DIR, 'catalog.json'), 'utf8'));
    assert.deepEqual(Object.keys(saved['transport-boxes']), ['ru']); // only the difference is stored
  });
  await test('texts: edit, placeholders protected, unknown key rejected, HTML escaped', async () => {
    let j = await (await call('PUT', '/admin/api/texts', { ru: { 'form.error': 'Ошибка без адреса' } })).json();
    assert.equal(j.error, 'placeholders');
    j = await (await call('PUT', '/admin/api/texts', { ru: { 'nope.key': 'x' } })).json();
    assert.equal(j.error, 'unknown_key');
    j = await (await call('PUT', '/admin/api/texts', { ru: { lang: 'en' } })).json();
    assert.equal(j.error, 'unknown_key');
    const r = await call('PUT', '/admin/api/texts', {
      ru: { 'hero.lead': 'Новый подзаголовок <script>alert(1)</script>' },
      uz: { 'hero.note': 'Yangi izoh.' },
    });
    assert.equal(r.status, 200);
    const h = site('ru/index.html');
    assert.match(h, /Новый подзаголовок &lt;script&gt;/);
    assert.ok(!h.includes('<script>alert(1)'));
    assert.match(site('uz/index.html'), /Yangi izoh\./);
    await call('PUT', '/admin/api/texts', { ru: { 'hero.lead': null } });
    assert.ok(!site('ru/index.html').includes('Новый подзаголовок'));
  });
  let mediaSrc = '';
  await test('photo upload: PNG accepted and published, non-image rejected', async () => {
    const fd = new FormData();
    fd.append('section', 'about.workshop');
    fd.append('alt_ru', 'Цех');
    fd.append('alt_uz', 'Sex');
    fd.append('file', new Blob([Buffer.from('<svg onload=alert(1)>')], { type: 'image/png' }), 'x.png');
    let j = await (await call('POST', '/admin/api/media', undefined, { form: fd })).json();
    assert.equal(j.error, 'file_type');
    const fd2 = new FormData();
    fd2.append('section', 'about.workshop');
    fd2.append('alt_ru', 'Цех');
    fd2.append('alt_uz', 'Sex');
    fd2.append('file', new Blob([PNG], { type: 'image/png' }), '../../evil.png');
    const r = await call('POST', '/admin/api/media', undefined, { form: fd2 });
    j = await r.json();
    assert.equal(r.status, 200);
    const item = j.state.settings.aboutPhotos.workshop[0];
    assert.match(item.src, /^\/media\/[a-f0-9]{16}\.png$/);
    assert.equal(item.width, 1600);
    assert.equal(item.height, 1200);
    mediaSrc = item.src;
    assert.equal((await fetch(base + mediaSrc)).status, 200);
    assert.ok(site('ru/about/index.html').includes(mediaSrc));
  });
  await test('photo delete removes file and section', async () => {
    const r = await call('DELETE', '/admin/api/media', { section: 'about.workshop', src: mediaSrc });
    assert.equal(r.status, 200);
    assert.ok(!fs.existsSync(path.join(process.env.DATA_DIR, 'media', path.basename(mediaSrc))));
    assert.ok(!site('ru/about/index.html').includes(mediaSrc));
  });
  await test('domain + analytics → canonical, sitemap, CSP updated', async () => {
    const r = await call('PUT', '/admin/api/settings', {
      domain: 'https://example.uz/',
      analytics: { ga4Id: 'g-abc1234', yandexMetrikaId: '' },
    });
    assert.equal(r.status, 200);
    assert.match(site('ru/index.html'), /<link rel="canonical" href="https:\/\/example\.uz\/ru\/">/);
    assert.match(site('robots.txt'), /Sitemap: https:\/\/example\.uz\/sitemap\.xml/);
    assert.match(site('robots.txt'), /Disallow: \/admin\//);
    const h = await fetch(base + '/ru/');
    assert.match(h.headers.get('content-security-policy'), /googletagmanager/);
    const bad = await (await call('PUT', '/admin/api/settings', { domain: 'javascript:alert(1)' })).json();
    assert.equal(bad.error, 'domain');
  });
  await test('test mail without mail service → 409 not_configured', async () => {
    const r = await call('POST', '/admin/api/test-mail', {});
    assert.equal(r.status, 409);
  });
  await test('cross-origin change → 403', async () => {
    const r = await call('PUT', '/admin/api/settings', { domain: '' }, { headers: { Origin: 'https://evil.example' } });
    assert.equal(r.status, 403);
  });
  await test('forged cookie → 401', async () => {
    const r = await call('GET', '/admin/api/state', undefined, {
      noCookie: true,
      headers: { Cookie: 'qadoqlab_admin=9999999999999.abc.def' },
    });
    assert.equal(r.status, 401);
  });
  await test('logout revokes session', async () => {
    assert.equal((await call('POST', '/admin/api/logout', {})).status, 200);
    assert.equal((await call('GET', '/admin/api/state')).status, 401);
  });
  await test('login attempts limited: 6th wrong attempt → 429', async () => {
    const codes = [];
    for (let i = 0; i < 6; i++)
      codes.push(
        (await call('POST', '/admin/api/login', { password: 'wrong' }, { headers: { 'X-Forwarded-For': '10.7.7.7' } }))
          .status,
      );
    assert.deepEqual(codes, [401, 401, 401, 401, 401, 429]);
  });
  await test('public build check passes after all edits', async () => {
    const c = spawnSync(process.execPath, [path.join(ROOT, 'scripts/check.js'), process.env.SITE_DIR], {
      env: process.env,
      encoding: 'utf8',
    });
    assert.equal(c.status, 0, c.stdout + c.stderr);
  });

  server.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  for (const [s, n, e] of results) console.log(`${s === 'ok' ? '✓' : '✗'} ${n}${e ? `\n    ${e}` : ''}`);
  const failed = results.filter((r) => r[0] !== 'ok').length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
})();
