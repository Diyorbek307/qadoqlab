'use strict';

// Admin panel at /admin/. Off unless ADMIN_PASSWORD_HASH is set (npm run admin:password).
// Edits are stored in DATA_DIR (settings.json, catalog.json, texts.json, media/). After each
// save the site is rebuilt into a sibling folder and swapped in; a failed build leaves the
// live site untouched. Quote requests are not stored here — they go to e-mail.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { promisify } = require('util');
const config = require('../config/site.config');
const content = require('../content/load');
const settings = require('./env');
const mail = require('./mail');
const { parseMultipart } = require('./multipart');
const { TtlMap, RateLimiter } = require('./limiter');
const { headers, json, readBody, clientIp, isSameOrigin, HttpError } = require('./http');
const { validateSettings, oneLine, multiLine, ValidationError } = require('../config/validate');

const scrypt = promisify(crypto.scrypt);
const UI_DIR = path.join(settings.projectRoot, 'src', 'admin');
const FONT_DIR = path.join(settings.projectRoot, 'src', 'assets', 'fonts');
const COOKIE = 'qadoqlab_admin';
const SESSION_MS = 8 * 3600 * 1000;
const MAX_IMAGE = 6 * 1024 * 1024;
const BUILD_TIMEOUT_MS = 60_000;

const MEDIA_SECTIONS = {
  'gallery.samples': ['gallery', 'samples'],
  'gallery.construction': ['gallery', 'construction'],
  'gallery.printing': ['gallery', 'printing'],
  'gallery.production': ['gallery', 'production'],
  'about.workshop': ['aboutPhotos', 'workshop'],
  'about.equipment': ['aboutPhotos', 'equipment'],
  'about.samples': ['aboutPhotos', 'samples'],
  'about.process': ['aboutPhotos', 'process'],
  'about.qualityControl': ['aboutPhotos', 'qualityControl'],
};
const SLUGS = content.catalogDefault.map((c) => c.slug);
const HASH_FORMAT = /^scrypt\$(\d+)\$(\d+)\$(\d+)\$([A-Za-z0-9+/=]+)\$([A-Za-z0-9+/=]+)$/;

const hasOwn = (o, k) => o !== null && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k);
const placeholders = (s) =>
  [...String(s).matchAll(/\{(\w+)\}/g)]
    .map((m) => m[1])
    .sort()
    .join(',');

// Only these sections are ever written to settings.json.
function editable(cfg) {
  return {
    domain: cfg.domain,
    contacts: cfg.contacts,
    legal: cfg.legal,
    capabilities: { printing: cfg.capabilities.printing },
    catalogPublished: cfg.catalogPublished,
    gallery: cfg.gallery,
    aboutPhotos: cfg.aboutPhotos,
    analytics: cfg.analytics,
  };
}

// Width and height from the file header. Anything that isn't JPEG, PNG or WebP returns null.
function imageInfo(data) {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (data.length > 24 && data.subarray(0, 8).equals(png)) {
    return { ext: 'png', width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
  }
  if (data.length > 4 && data[0] === 0xff && data[1] === 0xd8) {
    let i = 2;
    while (i + 9 < data.length) {
      if (data[i] !== 0xff) {
        i += 1;
        continue;
      }
      const marker = data[i + 1];
      const isFrame = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
      if (isFrame) return { ext: 'jpg', height: data.readUInt16BE(i + 5), width: data.readUInt16BE(i + 7) };
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        i += 2;
        continue;
      }
      i += 2 + data.readUInt16BE(i + 2);
    }
    return null;
  }
  if (data.length > 30 && data.toString('latin1', 0, 4) === 'RIFF' && data.toString('latin1', 8, 12) === 'WEBP') {
    const chunk = data.toString('latin1', 12, 16);
    if (chunk === 'VP8 ')
      return { ext: 'webp', width: data.readUInt16LE(26) & 0x3fff, height: data.readUInt16LE(28) & 0x3fff };
    if (chunk === 'VP8L') {
      const [b0, b1, b2, b3] = data.subarray(21, 25);
      return {
        ext: 'webp',
        width: 1 + (((b1 & 0x3f) << 8) | b0),
        height: 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)),
      };
    }
    if (chunk === 'VP8X') return { ext: 'webp', width: 1 + data.readUIntLE(24, 3), height: 1 + data.readUIntLE(27, 3) };
  }
  return null;
}

function createAdmin({ root, files, stats, mailTo, isDemo, onRebuilt, env = settings.env }) {
  const passwordHash = env.ADMIN_PASSWORD_HASH || '';
  const hashParts = HASH_FORMAT.exec(passwordHash);
  const enabled = Boolean(hashParts);
  if (passwordHash && !enabled)
    console.error('[admin] ADMIN_PASSWORD_HASH has a wrong format, panel is off. Run: npm run admin:password');

  const secret = env.ADMIN_SESSION_SECRET || crypto.randomBytes(32).toString('hex');
  const revoked = new TtlMap({ ttlMs: SESSION_MS, maxSize: 10_000 });
  const failedByIp = new RateLimiter({ max: 5, windowMs: 15 * 60_000 });
  // Caps guesses from many addresses at once; locks the form for 15 minutes when reached.
  const failedTotal = new RateLimiter({ max: 30, windowMs: 15 * 60_000 });
  let lastBuild = { at: null, ok: null };
  let buildQueue = Promise.resolve();

  const adminHeaders = () => ({ ...headers.admin, 'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': 'no-store' });
  const send = (res, status, body, extra = {}) =>
    json(res, status, body, { 'X-Robots-Tag': 'noindex, nofollow', ...extra });
  const audit = (req, action) => console.log(`[admin] ${new Date().toISOString()} ${clientIp(req)} ${action}`);

  // --- sessions -----------------------------------------------------------------------
  // Token: "<expires>.<nonce>.<hmac>". The HMAC covers the password hash too, so changing
  // the password signs everyone out.
  const sign = (data) => crypto.createHmac('sha256', secret).update(`${data}|${passwordHash}`).digest('base64url');

  function newToken() {
    const expires = Date.now() + SESSION_MS;
    const nonce = crypto.randomBytes(16).toString('base64url');
    return `${expires}.${nonce}.${sign(`${expires}.${nonce}`)}`;
  }

  function session(req) {
    const match = new RegExp(`(?:^|;\\s*)${COOKIE}=([A-Za-z0-9_.-]{20,200})`).exec(req.headers.cookie || '');
    if (!match) return null;
    const [expires, nonce, mac] = match[1].split('.');
    if (!expires || !nonce || !mac || Number(expires) < Date.now() || revoked.has(nonce)) return null;
    const expected = Buffer.from(sign(`${expires}.${nonce}`));
    const given = Buffer.from(mac);
    if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
    return { nonce };
  }

  const isHttps = (req) =>
    settings.https || req.socket.encrypted || (settings.proxyHops > 0 && req.headers['x-forwarded-proto'] === 'https');
  const cookie = (req, value, maxAgeSec) =>
    `${COOKIE}=${value}; Path=/admin; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSec}${isHttps(req) ? '; Secure' : ''}`;

  async function checkPassword(password) {
    const [, n, r, p, salt, hash] = hashParts;
    const expected = Buffer.from(hash, 'base64');
    const actual = await scrypt(password.normalize('NFC'), Buffer.from(salt, 'base64'), expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
      maxmem: 256 * 1024 * 1024,
    });
    return crypto.timingSafeEqual(actual, expected);
  }

  async function readJson(req, limit = 512 * 1024) {
    if (!String(req.headers['content-type'] || '').startsWith('application/json'))
      throw new ValidationError('content_type');
    const buf = await readBody(req, limit);
    try {
      return JSON.parse(buf.toString('utf8'));
    } catch {
      throw new ValidationError('json');
    }
  }

  // --- storage and rebuild ------------------------------------------------------------
  const currentSettings = () => editable(config.reload());

  function saveSettings(next) {
    content.writeJson('settings.json', editable(next));
    config.reload();
  }

  function runBuild() {
    return new Promise((resolve) => {
      const next = `${root}.next`;
      fs.rmSync(next, { recursive: true, force: true });
      const args = [path.join(settings.projectRoot, 'src', 'build.js'), `--out=${next}`];
      if (isDemo()) args.push('--demo');
      const child = spawn(process.execPath, args, {
        cwd: settings.projectRoot,
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let log = '';
      const collect = (chunk) => {
        log = (log + chunk).slice(-4000);
      };
      child.stdout.on('data', collect);
      child.stderr.on('data', collect);
      const timer = setTimeout(() => child.kill('SIGKILL'), BUILD_TIMEOUT_MS);
      child.on('close', (code) => {
        clearTimeout(timer);
        if (code !== 0) {
          fs.rmSync(next, { recursive: true, force: true });
          console.error(`[admin] build failed:\n${log}`);
          lastBuild = { at: new Date().toISOString(), ok: false };
          return resolve(lastBuild);
        }
        const previous = `${root}.prev-${Date.now()}`;
        fs.renameSync(root, previous);
        fs.renameSync(next, root);
        fs.rmSync(previous, { recursive: true, force: true });
        config.reload();
        onRebuilt();
        lastBuild = { at: new Date().toISOString(), ok: true };
        return resolve(lastBuild);
      });
    });
  }

  function rebuild() {
    buildQueue = buildQueue.then(runBuild, runBuild);
    return buildQueue;
  }

  // --- state for the UI ---------------------------------------------------------------
  function state() {
    const cfg = config.reload();
    const dicts = content.dicts();
    const overrides = content.readJson('texts.json');
    const changed = (lang, key) => hasOwn(overrides, lang) && hasOwn(overrides[lang], key);
    let build = {};
    try {
      build = JSON.parse(fs.readFileSync(path.join(root, '_build.json'), 'utf8'));
    } catch {
      /* a missing file just means no build info */
    }
    const isPublished = (c) => cfg.catalogPublished[c.slug] && c.requires.every((r) => cfg.capabilities[r]);
    const texts = content
      .leaves(content.DEFAULTS.ru)
      .filter(([key]) => !content.LOCKED.test(key))
      .map(([key, ruDefault]) => ({
        path: key,
        ru: content.getPath(dicts.ru, key),
        uz: content.getPath(dicts.uz, key),
        ruDefault,
        uzDefault: content.getPath(content.DEFAULTS.uz, key),
        changed: changed('ru', key) || changed('uz', key),
      }))
      .filter((t) => typeof t.uz === 'string');

    return {
      settings: editable(cfg),
      catalog: content.catalog().map((c) => {
        const original = content.catalogDefault.find((x) => x.slug === c.slug);
        return {
          slug: c.slug,
          requires: c.requires,
          published: cfg.catalogPublished[c.slug] === true,
          ru: c.ru,
          uz: c.uz,
          defaults: { ru: original.ru, uz: original.uz },
        };
      }),
      texts,
      mediaSections: Object.keys(MEDIA_SECTIONS),
      status: {
        mail: { configured: mail.isConfigured(), to: mailTo() },
        uploads: mail.isConfigured() && settings.uploads,
        domain: cfg.domain || null,
        indexable: Boolean(build.indexable),
        demo: Boolean(build.demo),
        privacyReady: Boolean(
          cfg.legal.privacyPolicyReady && cfg.legal.operatorName && cfg.legal.taxId && cfg.legal.legalAddress,
        ),
        analytics: { ga4: Boolean(cfg.analytics.ga4Id), ym: Boolean(cfg.analytics.yandexMetrikaId) },
        catalog: { published: content.catalogDefault.filter(isPublished).length, total: content.catalogDefault.length },
        build: { builtAt: build.builtAt || null, pages: (build.pages || []).length, last: lastBuild },
        requests: stats,
      },
    };
  }

  const saved = async (res) => {
    const build = await rebuild();
    return send(res, build.ok ? 200 : 500, { ok: build.ok, build, state: state() });
  };

  // --- API handlers -------------------------------------------------------------------
  async function login(req, res) {
    const ip = clientIp(req);
    if (failedByIp.isLimited(ip) || failedTotal.isLimited('all'))
      return send(res, 429, { ok: false, error: 'too_many_attempts' });
    const body = await readJson(req, 2048).catch(() => ({}));
    const password = typeof body.password === 'string' && body.password.length <= 200 ? body.password : '';
    const ok = password ? await checkPassword(password) : false;
    if (!ok) {
      failedByIp.hit(ip);
      failedTotal.hit('all');
      await new Promise((r) => setTimeout(r, 400));
      audit(req, 'login failed');
      return send(res, 401, { ok: false, error: 'bad_password' });
    }
    failedByIp.reset(ip);
    audit(req, 'login');
    return send(res, 200, { ok: true }, { 'Set-Cookie': cookie(req, newToken(), SESSION_MS / 1000) });
  }

  async function putSettings(req, res) {
    const input = await readJson(req);
    saveSettings(validateSettings(input, currentSettings(), { slugs: SLUGS }));
    audit(req, `settings saved: ${Object.keys(input || {}).join(', ')}`);
    return saved(res);
  }

  async function putCatalog(req, res) {
    const input = await readJson(req);
    const overrides = content.readJson('catalog.json');
    for (const slug of Object.keys(input || {})) {
      const original = content.catalogDefault.find((c) => c.slug === slug);
      if (!original) throw new ValidationError('unknown_slug', slug);
      const entry = {};
      for (const lang of ['ru', 'uz']) {
        const value = hasOwn(input[slug], lang) ? input[slug][lang] : null;
        if (!value) continue;
        const field = (name) => `${slug}.${lang}.${name}`;
        const required = (name, max) => {
          const s = oneLine(value[name], max, field(name));
          if (!s) throw new ValidationError('required', field(name));
          return s;
        };
        if (!Array.isArray(value.uses)) throw new ValidationError('type', field('uses'));
        const uses = value.uses.map((x) => oneLine(x, 140, field('uses'))).filter(Boolean);
        if (!uses.length || uses.length > 6) throw new ValidationError('uses_count', field('uses'));
        const clean = {
          name: required('name', 90),
          short: required('short', 220),
          intro: required('intro', 1200),
          alt: required('alt', 220),
          uses,
        };
        // Only differences from the original text are stored.
        const diff = {};
        for (const key of content.CATALOG_FIELDS) {
          if (JSON.stringify(clean[key]) !== JSON.stringify(original[lang][key])) diff[key] = clean[key];
        }
        if (Object.keys(diff).length) entry[lang] = diff;
      }
      if (Object.keys(entry).length) overrides[slug] = entry;
      else delete overrides[slug];
    }
    content.writeJson('catalog.json', overrides);
    audit(req, `catalog texts saved: ${Object.keys(input || {}).join(', ')}`);
    return saved(res);
  }

  async function putTexts(req, res) {
    const input = await readJson(req);
    const overrides = content.readJson('texts.json');
    let count = 0;
    for (const lang of ['ru', 'uz']) {
      const edits = hasOwn(input, lang) && input[lang] && typeof input[lang] === 'object' ? input[lang] : {};
      const current = hasOwn(overrides, lang) ? overrides[lang] : {};
      for (const key of Object.keys(edits)) {
        if (!content.isEditableText(lang, key)) throw new ValidationError('unknown_key', `${lang}:${key}`);
        const original = content.getPath(content.DEFAULTS[lang], key);
        const value = edits[key];
        count += 1;
        if (value === null) {
          delete current[key];
          continue;
        }
        const text = multiLine(value, 3000, `${lang}:${key}`);
        if (!text) throw new ValidationError('required', `${lang}:${key}`);
        if (placeholders(text) !== placeholders(original)) throw new ValidationError('placeholders', `${lang}:${key}`);
        if (text === original) delete current[key];
        else current[key] = text;
      }
      overrides[lang] = current;
    }
    content.writeJson('texts.json', overrides);
    audit(req, `texts saved: ${count} value(s)`);
    return saved(res);
  }

  async function uploadMedia(req, res) {
    const type = String(req.headers['content-type'] || '');
    if (!type.startsWith('multipart/form-data')) throw new ValidationError('content_type');
    const { fields, files: parts } = parseMultipart(await readBody(req, MAX_IMAGE + 64 * 1024), type, { maxParts: 12 });
    const section = hasOwn(MEDIA_SECTIONS, fields.section) ? MEDIA_SECTIONS[fields.section] : null;
    if (!section) throw new ValidationError('section', 'section');
    const file = parts.find((p) => p.field === 'file' && p.data.length);
    if (!file) throw new ValidationError('file_required', 'file');
    if (file.data.length > MAX_IMAGE) throw new ValidationError('file_size', 'file');
    const info = imageInfo(file.data);
    if (!info || !info.width || !info.height) throw new ValidationError('file_type', 'file');
    if (info.width > 6000 || info.height > 6000) throw new ValidationError('file_dimensions', 'file');

    const alt = { ru: oneLine(fields.alt_ru, 200, 'alt_ru'), uz: oneLine(fields.alt_uz, 200, 'alt_uz') };
    if (!alt.ru) throw new ValidationError('required', 'alt_ru');
    if (!alt.uz) throw new ValidationError('required', 'alt_uz');
    const caption = {
      ru: oneLine(fields.caption_ru, 200, 'caption_ru'),
      uz: oneLine(fields.caption_uz, 200, 'caption_uz'),
    };

    // Stored under its content hash; the client's file name is never used.
    const name = `${crypto.createHash('sha256').update(file.data).digest('hex').slice(0, 16)}.${info.ext}`;
    const dir = path.join(config.dataDir(), 'media');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, name), file.data, { mode: 0o644 });

    const next = currentSettings();
    const list = next[section[0]][section[1]];
    const src = `/media/${name}`;
    if (!list.some((item) => item.src === src)) {
      list.push({
        src,
        width: info.width,
        height: info.height,
        alt,
        caption,
        illustration: fields.illustration === 'true',
      });
    }
    saveSettings(validateSettings({ [section[0]]: { [section[1]]: list } }, next, { slugs: SLUGS }));
    audit(req, `photo added to ${fields.section}: ${name}`);
    return saved(res);
  }

  async function deleteMedia(req, res) {
    const input = await readJson(req, 4096);
    const section = hasOwn(MEDIA_SECTIONS, input.section) ? MEDIA_SECTIONS[input.section] : null;
    if (!section || typeof input.src !== 'string') throw new ValidationError('section');
    const next = currentSettings();
    next[section[0]][section[1]] = next[section[0]][section[1]].filter((item) => item.src !== input.src);
    saveSettings(next);
    const inUse = Object.values(MEDIA_SECTIONS).some(([group, key]) =>
      next[group][key].some((item) => item.src === input.src),
    );
    const match = /^\/media\/([a-f0-9]{16}\.(jpg|png|webp))$/.exec(input.src);
    if (match && !inUse) fs.rmSync(path.join(config.dataDir(), 'media', match[1]), { force: true });
    audit(req, `photo removed from ${input.section}`);
    return saved(res);
  }

  async function testMail(req, res) {
    if (!mail.isConfigured()) return send(res, 409, { ok: false, error: 'not_configured' });
    const when = new Intl.DateTimeFormat('ru-RU', {
      timeZone: 'Asia/Tashkent',
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date());
    const text = `Проверка отправки заявок из панели управления сайтом (${when}, Ташкент). Если вы видите это письмо, заявки с сайта будут приходить на этот адрес.`;
    try {
      await mail.send({
        to: mailTo(),
        subject: 'Тестовое письмо QADOQLAB',
        text,
        html: `<p style="font-family:Arial,sans-serif">${text}</p>`,
      });
    } catch (err) {
      audit(req, 'test mail failed');
      const detail = String(err.message)
        .replace(/re_[A-Za-z0-9_]+/g, '***')
        .slice(0, 300);
      return send(res, 502, { ok: false, error: 'send_failed', detail });
    }
    audit(req, 'test mail sent');
    return send(res, 200, { ok: true, to: mailTo() });
  }

  const routes = {
    'GET /admin/api/state': (req, res) => send(res, 200, { ok: true, ...state() }),
    'PUT /admin/api/settings': putSettings,
    'PUT /admin/api/catalog': putCatalog,
    'PUT /admin/api/texts': putTexts,
    'POST /admin/api/media': uploadMedia,
    'DELETE /admin/api/media': deleteMedia,
    'POST /admin/api/test-mail': testMail,
    'POST /admin/api/rebuild': (req, res) => {
      audit(req, 'manual rebuild');
      return saved(res);
    },
    'POST /admin/api/logout': (req, res, s) => {
      revoked.set(s.nonce, true);
      audit(req, 'logout');
      return send(res, 200, { ok: true }, { 'Set-Cookie': cookie(req, '', 0) });
    },
  };

  // --- entry point --------------------------------------------------------------------
  async function handle(req, res, pathname) {
    if (!enabled) return files.notFound(req, res);

    if (!pathname.startsWith('/admin/api/')) {
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { ok: false });
      if (pathname === '/admin') {
        res.writeHead(301, { ...adminHeaders(), Location: '/admin/' });
        return res.end();
      }
      const asset = { '/admin/': 'index.html', '/admin/admin.js': 'admin.js', '/admin/admin.css': 'admin.css' }[
        pathname
      ];
      if (asset) return files.sendFile(req, res, path.join(UI_DIR, asset), { headers: adminHeaders() });
      const font = /^\/admin\/fonts\/(manrope-(?:cyrillic|latin)-wght-normal\.woff2)$/.exec(pathname);
      if (font) return files.sendFile(req, res, path.join(FONT_DIR, font[1]), { headers: adminHeaders() });
      return files.notFound(req, res);
    }

    // State-changing calls: same origin, and only from the panel's own script
    // (a custom header can't be sent cross-site without a CORS preflight we never allow).
    if (req.method !== 'GET' && (!isSameOrigin(req) || req.headers['x-admin-request'] !== '1')) {
      return send(res, 403, { ok: false, error: 'forbidden' });
    }

    try {
      if (pathname === '/admin/api/login' && req.method === 'POST') return await login(req, res);
      const current = session(req);
      if (!current) return send(res, 401, { ok: false, error: 'unauthorized' });
      const handler = routes[`${req.method} ${pathname}`];
      if (!handler) return send(res, 404, { ok: false, error: 'not_found' });
      return await handler(req, res, current);
    } catch (err) {
      if (err instanceof ValidationError) return send(res, 400, { ok: false, error: err.code, field: err.field });
      if (err instanceof HttpError) return send(res, err.status, { ok: false, error: err.code });
      if (err.message === 'bad_body' || err.message === 'bad_part' || err.message === 'no_boundary')
        return send(res, 400, { ok: false, error: 'bad_request' });
      throw err;
    }
  }

  if (enabled) console.log('[admin] panel is on: /admin/');
  return { handle, enabled };
}

module.exports = { createAdmin, imageInfo };
