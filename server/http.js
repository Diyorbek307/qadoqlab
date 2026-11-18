'use strict';

// Shared HTTP helpers: security headers, JSON replies, body reading, client IP.

const settings = require('./env');

const BASE_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'X-Permitted-Cross-Domain-Policies': 'none',
  'Origin-Agent-Cluster': '?1',
};
if (settings.https) BASE_HEADERS['Strict-Transport-Security'] = 'max-age=31536000';

const ANALYTICS_HOSTS = {
  ga4: {
    script: ['https://www.googletagmanager.com'],
    connect: ['https://*.google-analytics.com', 'https://*.analytics.google.com', 'https://www.googletagmanager.com'],
  },
  ym: { script: ['https://mc.yandex.ru'], connect: ['https://mc.yandex.ru'] },
};

/**
 * Builds the Content-Security-Policy. Public pages enforce Trusted Types (no string
 * reaches innerHTML or a script URL) unless an analytics tag is on: those tags inject
 * scripts themselves and would break under it.
 */
function buildCsp({
  scriptHashes = [],
  analytics = {},
  trustedTypes = false,
  mailtoForms = false,
  connectHosts = [],
  https = settings.https,
}) {
  const script = ["'self'", ...scriptHashes.map((h) => `'${h}'`)];
  const connect = ["'self'", ...connectHosts];
  const img = ["'self'", 'data:'];
  for (const [id, hosts] of Object.entries(ANALYTICS_HOSTS)) {
    if (!analytics[id]) continue;
    script.push(...hosts.script);
    connect.push(...hosts.connect);
    img.push(...hosts.connect);
  }
  const directives = [
    "default-src 'self'",
    `script-src ${script.join(' ')}`,
    "style-src 'self'",
    `img-src ${img.join(' ')}`,
    "font-src 'self'",
    `connect-src ${connect.join(' ')}`,
    "media-src 'none'",
    "frame-src 'none'",
    "worker-src 'none'",
    "manifest-src 'self'",
    mailtoForms ? "form-action 'self' mailto:" : "form-action 'self'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "object-src 'none'",
  ];
  if (trustedTypes && !analytics.ga4 && !analytics.ym)
    directives.push("require-trusted-types-for 'script'", "trusted-types 'none'");
  if (https) directives.push('upgrade-insecure-requests');
  return directives.join('; ');
}

// Mutable so the CSP can be swapped after a rebuild without restarting.
const headers = { site: { ...BASE_HEADERS }, admin: { ...BASE_HEADERS } };

function setCsp({ scriptHashes, analytics, mailtoForms = false }) {
  headers.site['Content-Security-Policy'] = buildCsp({ scriptHashes, analytics, trustedTypes: true, mailtoForms });
  headers.admin['Content-Security-Policy'] = buildCsp({ scriptHashes: [], analytics: {} });
}

function json(res, status, body, extra = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    ...headers.site,
    ...extra,
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

function plain(res, status, extra = {}) {
  res.writeHead(status, { ...headers.site, 'Cache-Control': 'no-store', ...extra });
  res.end();
}

class HttpError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers['content-length'] || 0);
    if (declared > limit) {
      req.resume();
      reject(new HttpError(413, 'too_large'));
      return;
    }
    const chunks = [];
    let size = 0;
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      fn(value);
    };
    req.on('data', (chunk) => {
      if (settled) return;
      size += chunk.length;
      if (size > limit) {
        req.resume();
        finish(reject, new HttpError(413, 'too_large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => finish(resolve, Buffer.concat(chunks)));
    req.on('aborted', () => finish(reject, new HttpError(400, 'aborted')));
    req.on('error', (err) => finish(reject, err));
  });
}

// With N trusted proxies, each appends the address it saw, so the client is the
// N-th entry from the right. Anything further left was written by the client.
function clientIp(req) {
  const socketIp = req.socket.remoteAddress || 'unknown';
  if (!settings.proxyHops) return socketIp;
  const chain = String(req.headers['x-forwarded-for'] || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const ip = chain[chain.length - settings.proxyHops];
  return ip && /^[0-9a-fA-F:.]{2,45}$/.test(ip) ? ip : socketIp;
}

// Origin must match Host when present. Browsers always send Origin on cross-site POSTs;
// "null" comes from sandboxed frames and data: pages, so it is treated as foreign.
function isSameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

module.exports = { BASE_HEADERS, headers, setCsp, buildCsp, json, plain, readBody, clientIp, isSameOrigin, HttpError };
