'use strict';

// Reads an optional .env file (KEY=VALUE lines) without overriding real environment
// variables, then exposes typed settings for the rest of the server.

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function loadDotEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (/^\s*(#|$)/.test(line)) continue;
    const match = /^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!match || process.env[match[1]] !== undefined) continue;
    process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}

loadDotEnv(path.join(ROOT, '.env'));

const env = process.env;
const int = (name, fallback, min, max) => {
  const n = Number.parseInt(env[name], 10);
  return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : fallback;
};

module.exports = {
  env,
  projectRoot: ROOT,
  port: int('PORT', 8080, 1, 65535),
  host: env.HOST || '0.0.0.0',
  siteDir: path.resolve(ROOT, env.SITE_DIR || 'dist'),
  uploads: env.UPLOADS_ENABLED === 'true',
  // Number of reverse proxies in front of the app. 0 = use the socket address.
  proxyHops: env.TRUST_PROXY === 'true' ? int('TRUST_PROXY_HOPS', 1, 1, 5) : 0,
  https: env.HSTS === 'true',
  rateLimit: { max: int('RATE_LIMIT_MAX', 5, 1, 1000), windowMs: int('RATE_LIMIT_WINDOW_MIN', 10, 1, 1440) * 60_000 },
  // Ceiling for all form submissions together — protects the mail quota from a botnet.
  globalFormLimit: int('FORM_GLOBAL_LIMIT', 60, 1, 10_000),
  minFillMs: int('MIN_FILL_MS', 2500, 0, 60_000),
};
