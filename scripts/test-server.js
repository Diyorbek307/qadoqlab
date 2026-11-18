#!/usr/bin/env node
/**
 * Quote form API tests against a fake mail API — no real e-mail is sent.
 * Run: npm run build && npm test
 */
const http = require('http');
const assert = require('assert/strict');

const sent = [];
let mockStatus = 200;
const mock = http.createServer((req, res) => {
  let b = '';
  req.on('data', (c) => {
    b += c;
  });
  req.on('end', () => {
    sent.push({ auth: req.headers.authorization, body: JSON.parse(b) });
    res.writeHead(mockStatus, { 'Content-Type': 'application/json' });
    res.end(mockStatus === 200 ? '{"id":"test"}' : '{"message":"fail"}');
  });
});

const results = [];
async function test(name, fn) {
  try {
    await fn();
    results.push(['ok', name]);
  } catch (e) {
    results.push(['FAIL', name, e.message]);
  }
}

(async () => {
  await new Promise((r) => mock.listen(0, '127.0.0.1', r));
  Object.assign(process.env, {
    MAIL_PROVIDER: 'resend',
    RESEND_API_KEY: 'test-key',
    MAIL_FROM: 'QADOQLAB <requests@example.test>',
    RESEND_API_URL: `http://127.0.0.1:${mock.address().port}/emails`,
    UPLOADS_ENABLED: 'true',
    TRUST_PROXY: 'true',
    RATE_LIMIT_MAX: '3',
    MIN_FILL_MS: '2500',
  });
  const server = require('../server/server');
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  let ipN = 1;
  const post = (fields, { files = [], ip, headers = {} } = {}) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.append(k, v);
    for (const f of files) fd.append('files', new Blob([f.data], { type: f.type }), f.name);
    return fetch(base + '/api/request', {
      method: 'POST',
      body: fd,
      headers: { Accept: 'application/json', 'X-Forwarded-For': ip || `10.0.0.${ipN++}`, ...headers },
    });
  };
  const old = String(Date.now() - 10000);
  const good = {
    task: 'Орехи в пакетах по 1 кг, 10 пакетов в коробке',
    channel: 'email',
    contact: 'buyer@example.uz',
    page: '/ru/request/',
    ts: old,
    length: '400',
    width: '300',
    height: '200',
    unit: 'mm',
    dimType: 'inner',
    quantity: '2000',
    industry: 'nuts',
    print: 'none',
    city: 'Самарканд',
    company: 'ООО Тест',
  };
  const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(100)]);

  await test('status: online and uploads', async () => {
    const s = await (await fetch(base + '/api/status')).json();
    assert.deepEqual(s, { online: true, uploads: true });
  });
  await test('valid request → 200 ok, email to qadoqlab.uz@gmail.com with Reply-To', async () => {
    const r = await post({ ...good, idem: 'idem-test-0001' });
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { ok: true });
    assert.equal(sent.length, 1);
    const m = sent[0].body;
    assert.deepEqual(m.to, ['qadoqlab.uz@gmail.com']);
    assert.equal(m.from, 'QADOQLAB <requests@example.test>');
    assert.equal(m.reply_to, 'buyer@example.uz');
    assert.match(m.subject, /^Новая заявка QADOQLAB — Сухофрукты или орехи$/);
    assert.match(m.text, /Размеры: 400 × 300 × 200 мм/);
    assert.match(m.text, /Внутренние или внешние: внутренние/);
    assert.match(m.text, /Ташкент, UTC\+5/);
    assert.equal(sent[0].auth, 'Bearer test-key');
  });
  await test('same idempotency key → no second email', async () => {
    const r = await post({ ...good, idem: 'idem-test-0001' });
    assert.equal(r.status, 200);
    assert.equal(sent.length, 1);
  });
  await test('same content with new key → treated as duplicate, no second email', async () => {
    const r = await post({ ...good, idem: 'idem-test-0002' });
    assert.equal(r.status, 200);
    assert.equal(sent.length, 1);
  });
  await test('missing contact → 400 validation [contact]', async () => {
    const r = await post({ ...good, contact: '', idem: 'idem-test-0003' });
    assert.equal(r.status, 400);
    assert.deepEqual(await r.json(), { ok: false, error: 'validation', fields: ['contact'] });
  });
  await test('bad email for email channel → 400', async () => {
    const r = await post({ ...good, contact: 'not-an-email', idem: 'idem-test-0004' });
    assert.equal(r.status, 400);
  });
  await test('task + one contact is enough (minimal request)', async () => {
    const r = await post({
      task: 'Нужны коробки для текстиля',
      channel: 'telegram',
      contact: '@buyer_uz',
      page: '/uz/',
      ts: old,
      idem: 'idem-test-0005',
    });
    assert.equal(r.status, 200);
    assert.equal(sent.length, 2);
    assert.equal(sent[1].body.reply_to, undefined);
    assert.match(sent[1].body.text, /Язык сайта: узбекский/);
  });
  await test('nothing to calculate (no task, industry, dims) → 400 [task]', async () => {
    const r = await post({
      channel: 'phone',
      contact: '+998 90 123 45 67',
      page: '/ru/',
      ts: old,
      idem: 'idem-test-0006',
    });
    assert.deepEqual((await r.json()).fields, ['task']);
  });
  await test('honeypot filled → no email sent', async () => {
    const before = sent.length;
    const r = await post({ ...good, task: 'spam', website: 'http://spam', idem: 'idem-test-0007' });
    assert.equal(r.status, 200);
    assert.equal(sent.length, before);
  });
  await test('submitted too fast → 400 too_fast', async () => {
    const r = await post({ ...good, task: 'fast', ts: String(Date.now()), idem: 'idem-test-0008' });
    assert.equal((await r.json()).error, 'too_fast');
  });
  await test('HTML in task is escaped in email', async () => {
    const r = await post({ ...good, task: '<script>alert(1)</script> & "x"', idem: 'idem-test-0009' });
    assert.equal(r.status, 200);
    const m = sent[sent.length - 1].body;
    assert.ok(!m.html.includes('<script>'));
    assert.ok(m.html.includes('&lt;script&gt;'));
  });
  await test('field too long → 400', async () => {
    const r = await post({ ...good, task: 'x'.repeat(3001), idem: 'idem-test-0010' });
    assert.equal(r.status, 400);
  });
  await test('real PNG attached → renamed attachment-1.png', async () => {
    const r = await post(
      { ...good, task: 'с файлом', idem: 'idem-test-0011' },
      { files: [{ name: '../../etc/passwd.png', type: 'image/png', data: PNG }] },
    );
    assert.equal(r.status, 200);
    const a = sent[sent.length - 1].body.attachments;
    assert.equal(a.length, 1);
    assert.equal(a[0].filename, 'attachment-1.png');
    assert.equal(Buffer.from(a[0].content, 'base64').length, PNG.length);
  });
  await test('text file disguised as .png → 400 [files]', async () => {
    const r = await post(
      { ...good, task: 'подмена', idem: 'idem-test-0012' },
      { files: [{ name: 'photo.png', type: 'image/png', data: Buffer.from('<html>not an image</html>') }] },
    );
    assert.equal(r.status, 400);
    assert.deepEqual((await r.json()).fields, ['files']);
  });
  await test('4 files → 400 [files]', async () => {
    const f = { name: 'a.png', type: 'image/png', data: PNG };
    const r = await post({ ...good, task: 'много файлов', idem: 'idem-test-0013' }, { files: [f, f, f, f] });
    assert.equal(r.status, 400);
  });
  await test('file over 10 MB → rejected', async () => {
    const big = Buffer.concat([PNG, Buffer.alloc(10 * 1024 * 1024)]);
    const r = await post(
      { ...good, task: 'большой файл', idem: 'idem-test-0014' },
      { files: [{ name: 'big.png', type: 'image/png', data: big }] },
    );
    assert.ok(r.status === 400 || r.status === 413, `status ${r.status}`);
  });
  await test('mail service error → 502 send_failed, no success', async () => {
    mockStatus = 500;
    const r = await post({ ...good, task: 'сервис упал', idem: 'idem-test-0015' });
    mockStatus = 200;
    assert.equal(r.status, 502);
    assert.equal((await r.json()).error, 'send_failed');
  });
  await test('retry after failure with same key → delivered', async () => {
    const before = sent.length;
    const r = await post({ ...good, task: 'сервис упал', idem: 'idem-test-0015' });
    assert.equal(r.status, 200);
    assert.equal(sent.length, before + 1);
  });
  await test('rate limit: 4th request from one IP in window → 429', async () => {
    const codes = [];
    for (let i = 0; i < 4; i++)
      codes.push((await post({ ...good, task: `лимит ${i}`, idem: `idem-rate-000${i}` }, { ip: '10.9.9.9' })).status);
    assert.deepEqual(codes, [200, 200, 200, 429]);
  });
  await test('cross-origin POST → 403', async () => {
    const r = await post(
      { ...good, task: 'чужой сайт', idem: 'idem-test-0016' },
      { headers: { Origin: 'https://evil.example' } },
    );
    assert.equal(r.status, 403);
  });
  await test('no-JS form post (HTML) → success page in Uzbek', async () => {
    const fd = new FormData();
    Object.entries({ ...good, task: 'без JS', page: '/uz/request/' }).forEach(([k, v]) => fd.append(k, v));
    const r = await fetch(base + '/api/request', {
      method: 'POST',
      body: fd,
      headers: { Accept: 'text/html', 'X-Forwarded-For': '10.8.8.8' },
    });
    const t = await r.text();
    assert.equal(r.status, 200);
    assert.match(t, /So‘rov yuborildi/);
  });
  await test('mail not configured → 503 not_configured (no fake success)', async () => {
    const k = process.env.RESEND_API_KEY;
    delete process.env.RESEND_API_KEY;
    const s = await (await fetch(base + '/api/status')).json();
    const r = await post({ ...good, task: 'не настроено', idem: 'idem-test-0017' });
    process.env.RESEND_API_KEY = k;
    assert.deepEqual(s, { online: false, uploads: false });
    assert.equal(r.status, 503);
    assert.equal((await r.json()).error, 'not_configured');
  });
  await test('static: _build.json hidden, traversal blocked, 404 page', async () => {
    assert.equal((await fetch(base + '/_build.json')).status, 404);
    assert.equal((await fetch(base + '/%2e%2e/config/site.config.js')).status, 404);
    const r = await fetch(base + '/ru/missing/');
    assert.equal(r.status, 404);
    assert.match(await r.text(), /Страница не найдена/);
  });
  await test('root redirects by saved language cookie', async () => {
    const r = await fetch(base + '/', { redirect: 'manual', headers: { Cookie: 'qadoqlab_lang=uz' } });
    assert.equal(r.status, 302);
    assert.equal(r.headers.get('location'), '/uz/');
    const r2 = await fetch(base + '/', { redirect: 'manual', headers: { 'Accept-Language': 'uz-UZ,uz;q=0.9' } });
    assert.equal(r2.headers.get('location'), '/uz/');
    const r3 = await fetch(base + '/', { redirect: 'manual', headers: { 'Accept-Language': 'en-US' } });
    assert.equal(r3.headers.get('location'), '/ru/');
  });
  await test('security headers present', async () => {
    const r = await fetch(base + '/ru/');
    assert.match(r.headers.get('content-security-policy'), /script-src 'self' 'sha256-/);
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  });

  await test('malformed request line does not crash the server', async () => {
    const net = require('net');
    const raw = await new Promise((resolve) => {
      const sock = net.connect(server.address().port, '127.0.0.1', () =>
        sock.write('GET http://[ HTTP/1.1\r\nHost: x\r\n\r\n'),
      );
      let data = '';
      sock.on('data', (c) => {
        data += c;
      });
      sock.on('end', () => resolve(data));
      sock.on('error', () => resolve(data));
      setTimeout(() => {
        sock.destroy();
        resolve(data);
      }, 1500);
    });
    assert.match(raw, /^HTTP\/1\.1 400/);
    assert.equal((await fetch(base + '/ru/')).status, 200);
  });
  await test('no open redirect via //host paths', async () => {
    const r = await fetch(base + '//ru', { redirect: 'manual' });
    if (r.status === 301) assert.equal(r.headers.get('location'), '/ru/');
    else assert.equal(r.status, 404);
  });
  await test('X-Forwarded-For: client-supplied entries are ignored', async () => {
    const codes = [];
    for (let i = 0; i < 4; i++)
      codes.push(
        (await post({ ...good, task: `xff ${i}`, idem: `idem-xff-000${i}` }, { ip: `203.0.113.${i}, 10.6.6.6` }))
          .status,
      );
    assert.deepEqual(codes, [200, 200, 200, 429]);
  });
  await test('Origin: null is rejected', async () => {
    const r = await post({ ...good, task: 'sandboxed', idem: 'idem-null-0001' }, { headers: { Origin: 'null' } });
    assert.equal(r.status, 403);
  });
  await test('__proto__ form field does not pollute or crash', async () => {
    const r = await post({ ...good, task: 'proto', idem: 'idem-proto-001', __proto__: 'x', constructor: 'y' });
    assert.equal(r.status, 200);
    assert.equal({}.x, undefined);
  });
  await test('wrong methods and unknown API paths', async () => {
    assert.equal((await fetch(base + '/ru/', { method: 'PUT' })).status, 405);
    assert.equal((await fetch(base + '/api/request')).status, 405);
    const r = await fetch(base + '/api/nope');
    assert.equal(r.status, 404);
    assert.equal((await r.json()).error, 'not_found');
  });
  await test('strict CSP with Trusted Types and isolation headers', async () => {
    const r = await fetch(base + '/ru/');
    const csp = r.headers.get('content-security-policy');
    assert.match(csp, /require-trusted-types-for 'script'/);
    assert.match(csp, /base-uri 'none'/);
    assert.ok(!/unsafe-inline|unsafe-eval/.test(csp));
    assert.equal(r.headers.get('cross-origin-opener-policy'), 'same-origin');
    assert.equal(r.headers.get('x-frame-options'), 'DENY');
  });

  server.close();
  mock.close();
  for (const [s, n, e] of results) console.log(`${s === 'ok' ? '✓' : '✗'} ${n}${e ? `\n    ${e}` : ''}`);
  const failed = results.filter((r) => r[0] !== 'ok').length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
})();
