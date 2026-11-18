'use strict';

// Serves the built site. Small text files are kept in memory pre-compressed;
// large files (uploaded photos) are streamed from disk.

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
};
const COMPRESSIBLE = new Set(['.html', '.css', '.js', '.svg', '.xml', '.txt', '.json']);
const MAX_CACHED = 1024 * 1024;
// Asset names carry a content hash, so they never change and can be cached for a year.
const HASHED = /^assets\/((img|fonts)\/)?[\w-]+\.[0-9a-f]{10}\.(css|js|svg|woff2)$/;

function createStatic({ root, getHeaders }) {
  const cache = new Map();

  function load(file, stat) {
    const hit = cache.get(file);
    if (hit && hit.mtime === stat.mtimeMs && hit.size === stat.size) return hit;
    const buf = fs.readFileSync(file);
    const entry = {
      buf,
      mtime: stat.mtimeMs,
      size: stat.size,
      etag: `"${crypto.createHash('sha1').update(buf).digest('base64url').slice(0, 22)}"`,
    };
    if (COMPRESSIBLE.has(path.extname(file)) && buf.length > 512) {
      entry.br = zlib.brotliCompressSync(buf, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 } });
      entry.gz = zlib.gzipSync(buf, { level: 9 });
    }
    cache.set(file, entry);
    return entry;
  }

  function cacheControl(rel) {
    if (HASHED.test(rel)) return 'public, max-age=31536000, immutable';
    if (rel.startsWith('assets/') || rel.startsWith('media/')) return 'public, max-age=2592000';
    return 'no-cache';
  }

  function sendFile(req, res, file, { status = 200, headers = getHeaders() } = {}) {
    let stat;
    try {
      stat = fs.statSync(file);
    } catch {
      return notFound(req, res);
    }
    const rel = path.relative(root, file).split(path.sep).join('/');
    const out = {
      ...headers,
      'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': rel.startsWith('..') ? 'no-cache' : cacheControl(rel),
    };

    if (stat.size > MAX_CACHED) {
      out['Content-Length'] = stat.size;
      out['Last-Modified'] = stat.mtime.toUTCString();
      res.writeHead(status, out);
      if (req.method === 'HEAD') return res.end();
      return fs
        .createReadStream(file)
        .on('error', () => res.destroy())
        .pipe(res);
    }

    const entry = load(file, stat);
    out.ETag = entry.etag;
    out.Vary = 'Accept-Encoding';
    if (status === 200 && req.headers['if-none-match'] === entry.etag) {
      res.writeHead(304, out);
      return res.end();
    }
    const accept = String(req.headers['accept-encoding'] || '');
    let body = entry.buf;
    if (entry.br && /\bbr\b/.test(accept)) {
      body = entry.br;
      out['Content-Encoding'] = 'br';
    } else if (entry.gz && /\bgzip\b/.test(accept)) {
      body = entry.gz;
      out['Content-Encoding'] = 'gzip';
    }
    out['Content-Length'] = body.length;
    res.writeHead(status, out);
    return res.end(req.method === 'HEAD' ? undefined : body);
  }

  function notFound(req, res) {
    const page = path.join(root, '404.html');
    if (!fs.existsSync(page)) {
      res.writeHead(404, { ...getHeaders(), 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Not found');
    }
    return sendFile(req, res, page, { status: 404 });
  }

  function serve(req, res, pathname) {
    let decoded;
    try {
      decoded = decodeURIComponent(pathname);
    } catch {
      return notFound(req, res);
    }
    // No null bytes, backslashes, dot-files or build metadata (_build.json).
    if (/[\0\\]/.test(decoded) || decoded.split('/').some((seg) => seg.startsWith('.') || seg.startsWith('_'))) {
      return notFound(req, res);
    }
    const file = path.join(root, path.normalize(decoded));
    if (file !== root && !file.startsWith(root + path.sep)) return notFound(req, res);

    let stat;
    try {
      stat = fs.statSync(file);
    } catch {
      return notFound(req, res);
    }
    if (stat.isDirectory()) {
      const index = path.join(file, 'index.html');
      if (!fs.existsSync(index)) return notFound(req, res);
      if (!decoded.endsWith('/')) {
        // Rebuilt from the resolved path, so "//host" style input can't turn into an off-site redirect.
        const canonical = `/${path.relative(root, file).split(path.sep).join('/')}/`.replace(/\/+/g, '/');
        res.writeHead(301, { ...getHeaders(), Location: canonical, 'Cache-Control': 'no-cache' });
        return res.end();
      }
      return sendFile(req, res, index);
    }
    return sendFile(req, res, file);
  }

  return { serve, sendFile, notFound };
}

module.exports = { createStatic };
