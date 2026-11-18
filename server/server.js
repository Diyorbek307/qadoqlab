#!/usr/bin/env node
'use strict';

// QADOQLAB server: the built site, the quote form API and the admin panel.
//   GET  /api/status   { online, uploads }  — is online sending configured
//   POST /api/request  quote request (see form.js)
//   /admin/            admin panel (see admin.js), off without ADMIN_PASSWORD_HASH
// No dependencies. Node.js 18.17+.

const http = require('http');
const fs = require('fs');
const path = require('path');
const settings = require('./env');
const config = require('../config/site.config');
const mail = require('./mail');
const { headers, setCsp, json, plain, isSameOrigin } = require('./http');
const { createStatic } = require('./static');
const { createFormHandler, stats, mailTo } = require('./form');
const { createAdmin } = require('./admin');

const root = settings.siteDir;
if (!fs.existsSync(path.join(root, '_build.json'))) {
  console.error(`No build found in ${root}. Run: npm run build`);
  process.exit(1);
}

let build = {};
function refreshBuild() {
  build = JSON.parse(fs.readFileSync(path.join(root, '_build.json'), 'utf8'));
  setCsp({
    scriptHashes: build.scriptHashes || [],
    analytics: { ga4: Boolean(config.analytics.ga4Id), ym: Boolean(config.analytics.yandexMetrikaId) },
  });
}
refreshBuild();

const files = createStatic({ root, getHeaders: () => headers.site });
const form = createFormHandler({ getBuild: () => build });
const admin = createAdmin({ root, files, stats, mailTo, isDemo: () => Boolean(build.demo), onRebuilt: refreshBuild });

// "/" → language from the cookie set by the site, then the browser, then Russian.
function languageFor(req) {
  const saved = /(?:^|;\s*)qadoqlab_lang=(ru|uz)(?:;|$)/.exec(req.headers.cookie || '');
  if (saved) return saved[1];
  const accept = String(req.headers['accept-language'] || '').toLowerCase();
  return /^uz|,\s*uz/.test(accept) && !/^ru/.test(accept) ? 'uz' : 'ru';
}

async function route(req, res) {
  // Only origin-form targets ("/path?query"). Prefixing keeps "//x" a path instead of a host.
  if (typeof req.url !== 'string' || !req.url.startsWith('/')) return plain(res, 400);
  let pathname;
  try {
    ({ pathname } = new URL(`http://localhost${req.url}`));
  } catch {
    return plain(res, 400);
  }

  if (pathname === '/admin' || pathname.startsWith('/admin/')) return admin.handle(req, res, pathname);

  if (pathname === '/api/status') {
    return req.method === 'GET' ? form.status(req, res) : plain(res, 405, { Allow: 'GET' });
  }
  if (pathname === '/api/request') {
    if (req.method !== 'POST') return plain(res, 405, { Allow: 'POST' });
    if (!isSameOrigin(req)) return json(res, 403, { ok: false, error: 'forbidden' });
    return form.handle(req, res);
  }
  if (pathname.startsWith('/api/')) return json(res, 404, { ok: false, error: 'not_found' });

  if (req.method !== 'GET' && req.method !== 'HEAD') return plain(res, 405, { Allow: 'GET, HEAD' });
  if (pathname === '/') {
    return plain(res, 302, { Location: `/${languageFor(req)}/`, Vary: 'Cookie, Accept-Language' });
  }
  return files.serve(req, res, pathname);
}

const server = http.createServer((req, res) => {
  route(req, res).catch((err) => {
    console.error(`[server] ${req.method} request failed:`, err);
    if (!res.headersSent) json(res, 500, { ok: false, error: 'server_error' });
    else res.destroy();
  });
});

// Slow or oversized clients are cut off instead of tying up the process.
server.headersTimeout = 15_000;
server.requestTimeout = 60_000;
server.keepAliveTimeout = 5_000;
server.maxHeadersCount = 64;
server.on('clientError', (err, socket) => {
  if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
  else socket.destroy();
});

if (require.main === module) {
  server.listen(settings.port, settings.host, () => {
    const sending = mail.isConfigured() ? 'on' : 'off — visitors get a prepared e-mail instead';
    console.log(
      `QADOQLAB on http://localhost:${settings.port} (site: ${root}; online requests: ${sending}; admin: ${admin.enabled ? 'on' : 'off'})`,
    );
  });
  const stop = () => server.close(() => process.exit(0));
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

module.exports = server;
