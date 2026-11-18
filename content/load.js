'use strict';

// Texts and catalog with the admin panel's edits applied on top.
//   data/texts.json   { ru: { "hero.lead": "…" }, uz: { … } }   only existing string keys
//   data/catalog.json { "transport-boxes": { ru: { name, short, intro, uses, alt }, uz: { … } } }
// Files are read on every call, so edits show up without a restart.

const fs = require('fs');
const path = require('path');
const config = require('../config/site.config');
const ru = require('./i18n/ru');
const uz = require('./i18n/uz');
const catalogDefault = require('./catalog');

const DEFAULTS = { ru, uz };
const CATALOG_FIELDS = ['name', 'short', 'intro', 'uses', 'alt'];
// Service values that must not be edited from the panel.
const LOCKED = /^(lang|locale|langShort|langName)$/;
const KEY_PATH = /^[A-Za-z][A-Za-z0-9]*(\.[A-Za-z0-9]+)*$/;

const clone = (o) => JSON.parse(JSON.stringify(o));
const hasOwn = (o, k) => o !== null && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k);

function readJson(name) {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(config.dataDir(), name), 'utf8'));
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  } catch (err) {
    if (err.code !== 'ENOENT') console.error(`${name}: ${err.message}`);
    return {};
  }
}

// Write to a temp file first and rename, so a crash never leaves half a file behind.
function writeJson(name, data) {
  const dir = config.dataDir();
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, name);
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(tmp, file);
}

// Walks own properties only: "constructor.name" and friends resolve to undefined.
function getPath(obj, keyPath) {
  if (typeof keyPath !== 'string' || !KEY_PATH.test(keyPath)) return undefined;
  let node = obj;
  for (const key of keyPath.split('.')) {
    if (!hasOwn(node, key)) return undefined;
    node = node[key];
  }
  return node;
}

function setPath(obj, keyPath, value) {
  const keys = keyPath.split('.');
  const last = keys.pop();
  const parent = keys.reduce((node, key) => node[key], obj);
  parent[last] = value;
}

/** All string values of a dictionary as [path, value] pairs. */
function leaves(obj, prefix = '') {
  const out = [];
  for (const [key, value] of Object.entries(obj)) {
    const keyPath = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') out.push([keyPath, value]);
    else if (value && typeof value === 'object') out.push(...leaves(value, keyPath));
  }
  return out;
}

const isEditableText = (lang, keyPath) =>
  hasOwn(DEFAULTS, lang) && !LOCKED.test(keyPath) && typeof getPath(DEFAULTS[lang], keyPath) === 'string';

function dicts() {
  const overrides = readJson('texts.json');
  const out = {};
  for (const lang of Object.keys(DEFAULTS)) {
    const dict = clone(DEFAULTS[lang]);
    const edits = hasOwn(overrides, lang) ? overrides[lang] : {};
    for (const [keyPath, value] of Object.entries(edits)) {
      if (typeof value === 'string' && isEditableText(lang, keyPath)) setPath(dict, keyPath, value);
    }
    out[lang] = dict;
  }
  return out;
}

function catalog() {
  const overrides = readJson('catalog.json');
  return clone(catalogDefault).map((item) => {
    const edits = hasOwn(overrides, item.slug) ? overrides[item.slug] : null;
    if (!edits) return item;
    for (const lang of ['ru', 'uz']) {
      const fields = hasOwn(edits, lang) ? edits[lang] : null;
      if (!fields) continue;
      for (const field of CATALOG_FIELDS) {
        if (!hasOwn(fields, field)) continue;
        const value = fields[field];
        const ok =
          field === 'uses'
            ? Array.isArray(value) && value.every((x) => typeof x === 'string')
            : typeof value === 'string';
        if (ok) item[lang][field] = value;
      }
    }
    return item;
  });
}

module.exports = {
  dicts,
  catalog,
  leaves,
  getPath,
  readJson,
  writeJson,
  isEditableText,
  DEFAULTS,
  CATALOG_FIELDS,
  LOCKED,
  catalogDefault,
};
