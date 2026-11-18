'use strict';

// POST /api/request — the quote request form.
// Replies { ok: true } only after the mail service accepted the message.

const crypto = require('crypto');
const config = require('../config/site.config');
const content = require('../content/load');
const mail = require('./mail');
const settings = require('./env');
const { parseMultipart, sniffType } = require('./multipart');
const { validate, buildEmail, mailtoHref } = require('./request');
const { TtlMap, RateLimiter } = require('./limiter');
const { headers, json, readBody, clientIp, HttpError } = require('./http');

const MAX_FILE = config.form.maxFileSizeMb * 1024 * 1024;
const MAX_BODY = settings.uploads ? config.form.maxFiles * MAX_FILE + 512 * 1024 : 256 * 1024;

const perIp = new RateLimiter(settings.rateLimit);
const everyone = new RateLimiter({ max: settings.globalFormLimit, windowMs: settings.rateLimit.windowMs });
const idempotency = new TtlMap({ ttlMs: 30 * 60_000, maxSize: 20_000 });
const delivered = new TtlMap({ ttlMs: 10 * 60_000, maxSize: 20_000 });

setInterval(() => {
  perIp.prune();
  everyone.prune();
  idempotency.prune();
  delivered.prune();
}, 60_000).unref();

// Counters for the admin overview. No personal data.
const stats = { since: new Date().toISOString(), delivered: 0, failed: 0, lastDeliveredAt: null, lastFailedAt: null };

const mailTo = () =>
  (settings.env.MAIL_TO || config.contacts.email)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Plain result page for browsers that submitted the form without JavaScript.
function resultPage(res, status, lang, kind, extra, cssHref) {
  const t = content.dicts()[lang === 'uz' ? 'uz' : 'ru'];
  const email = escapeHtml(config.contacts.email);
  const subject = encodeURIComponent(config.form.mailSubject[lang] || config.form.mailSubject.ru);
  const mailLink = `<a href="mailto:${email}?subject=${subject}">${email}</a>`;
  const withEmail = (text) => escapeHtml(text).replace('{email}', mailLink);
  const errorText = (field) => t.form.errors[field === 'contact' || field === 'task' ? field : 'number'];

  let body;
  if (kind === 'ok') body = `<p class="lead">${escapeHtml(t.form.success)}</p>`;
  else if (kind === 'mailto') {
    body =
      `<p class="lead">${withEmail(t.form.mailtoMode)}</p>` +
      `<p class="btn-row"><a class="btn btn-primary" href="${escapeHtml(extra.mailto)}">${escapeHtml(t.form.mailtoSubmit)}</a></p>`;
  } else if (kind === 'validation') {
    const items = extra.fields.map((f) => `<li>${escapeHtml(errorText(f))}</li>`).join('');
    body = `<p class="lead">${escapeHtml(t.form.errorsSummary)}</p><ul class="check-list">${items}</ul>`;
  } else body = `<p class="lead">${withEmail(kind === 'rate' ? t.form.errorRate : t.form.error)}</p>`;

  const page = `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>QADOQLAB</title>
<link rel="stylesheet" href="${escapeHtml(cssHref)}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
</head>
<body>
<main class="container section">
<p class="logo"><span class="logo-word">QADOQLAB</span></p>
<h1 class="section-title-sm">${escapeHtml(t.form.title)}</h1>
${body}
<p class="section-more"><a class="link-arrow" href="/${lang}/request/">← ${escapeHtml(t.nav.request)}</a></p>
</main>
</body>
</html>`;
  res.writeHead(status, { ...headers.site, 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(page);
}

function createFormHandler({ getBuild }) {
  async function handle(req, res) {
    const wantsJson =
      String(req.headers.accept || '').includes('application/json') || req.headers['x-requested-with'] === 'fetch';
    let lang = 'ru';
    const reply = (status, payload, kind = 'error', extra = {}) =>
      wantsJson ? json(res, status, payload) : resultPage(res, status, lang, kind, extra, getBuild().css);

    const ip = clientIp(req);
    if (perIp.hit(ip) || everyone.hit('all')) return reply(429, { ok: false, error: 'rate_limited' }, 'rate');

    let fields;
    let files = [];
    try {
      const type = String(req.headers['content-type'] || '');
      const buf = await readBody(req, MAX_BODY);
      if (type.startsWith('multipart/form-data')) ({ fields, files } = parseMultipart(buf, type));
      else if (type.startsWith('application/x-www-form-urlencoded')) {
        fields = Object.assign(Object.create(null), Object.fromEntries(new URLSearchParams(buf.toString('utf8'))));
      } else return reply(415, { ok: false, error: 'unsupported' });
    } catch (err) {
      if (err instanceof HttpError && err.status === 413) return reply(413, { ok: false, error: 'too_large' });
      return reply(400, { ok: false, error: 'bad_request' });
    }
    lang = String(fields.page || '').startsWith('/uz/') ? 'uz' : 'ru';

    // Honeypot: the field is hidden from people. Bots get a quiet success and nothing is sent.
    if (fields.website) {
      console.warn(`[form] honeypot hit from ${ip}`);
      return reply(200, { ok: true }, 'ok');
    }

    const result = validate(fields);
    if (!result.ok) {
      return reply(400, { ok: false, error: 'validation', fields: result.fields }, 'validation', {
        fields: result.fields,
      });
    }
    const data = result.data;

    if (!mail.isConfigured()) {
      // No mail service: say so and offer a prepared e-mail instead. Never fake a success.
      return reply(503, { ok: false, error: 'not_configured' }, 'mailto', { mailto: mailtoHref(data) });
    }

    const startedAt = Number(fields.ts);
    if (wantsJson && (!startedAt || Date.now() - startedAt < settings.minFillMs)) {
      return reply(400, { ok: false, error: 'too_fast' });
    }

    const key = /^[a-zA-Z0-9-]{8,64}$/.test(fields.idem || '') ? fields.idem : null;
    const previous = key && idempotency.get(key);
    if (previous === 'done') return reply(200, { ok: true }, 'ok');
    if (previous === 'pending') return reply(409, { ok: false, error: 'in_progress' });

    const fingerprint = crypto
      .createHash('sha256')
      .update(
        [data.contact, data.task, data.length, data.width, data.height, data.quantity, data.type, data.industry].join(
          '|',
        ),
      )
      .digest('hex');
    if (delivered.has(fingerprint)) return reply(200, { ok: true }, 'ok'); // already delivered a moment ago

    // Attachments: only when enabled; type is checked by content, client file names are dropped.
    const attachments = [];
    if (settings.uploads) {
      const real = files.filter((f) => f.field === 'files' && f.data.length > 0);
      const rejectFiles = () =>
        reply(400, { ok: false, error: 'validation', fields: ['files'] }, 'validation', { fields: ['files'] });
      if (real.length > config.form.maxFiles) return rejectFiles();
      for (const [i, file] of real.entries()) {
        const sniffed = sniffType(file.data);
        if (!sniffed || !config.form.allowedTypes.includes(sniffed.mime) || file.data.length > MAX_FILE)
          return rejectFiles();
        attachments.push({ filename: `attachment-${i + 1}.${sniffed.ext}`, data: file.data });
      }
    }

    if (key) idempotency.set(key, 'pending');
    try {
      await mail.send({ to: mailTo(), ...buildEmail(data, attachments), attachments });
    } catch (err) {
      if (key) idempotency.delete(key);
      stats.failed += 1;
      stats.lastFailedAt = new Date().toISOString();
      console.error(`[form] send failed: ${err.message}`);
      return reply(502, { ok: false, error: 'send_failed' });
    }
    if (key) idempotency.set(key, 'done');
    delivered.set(fingerprint, true);
    stats.delivered += 1;
    stats.lastDeliveredAt = new Date().toISOString();
    console.log(`[form] delivered (${data.lang}, ${attachments.length} attachment(s))`);
    return reply(200, { ok: true }, 'ok');
  }

  function status(req, res) {
    const online = mail.isConfigured();
    json(res, 200, { online, uploads: online && settings.uploads });
  }

  return { handle, status };
}

module.exports = { createFormHandler, stats, mailTo };
