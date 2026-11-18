/**
 * QADOQLAB site settings.
 *
 * These are the defaults. Edits made in the admin panel are stored in data/settings.json
 * and applied on top (objects key by key, arrays as a whole).
 *
 * Rule: anything the owner hasn't confirmed stays empty ('' / null / false).
 * Empty values are never rendered — the related element is simply left out.
 * Run `npm run build` after changing this file.
 */
const defaults = {
  brand: {
    name: 'QADOQLAB',
    // Signature used in messages. No personal name on purpose.
    signature: {
      ru: 'Представитель компании Qadoqlab',
      uz: 'Qadoqlab kompaniyasi vakili',
    },
    // The header mark is a temporary wordmark, not an approved logo.
    logoIsTemporary: true,
  },

  // Production origin without a trailing slash, e.g. 'https://example.uz'.
  // While empty there is no canonical/hreflang/sitemap and the site is noindex.
  domain: '',

  languages: ['ru', 'uz'],
  defaultLanguage: 'ru',

  contacts: {
    email: 'qadoqlab.uz@gmail.com', // confirmed; not qadoqlab@gmail.com
    phone: '', // '+998 XX XXX XX XX'; hidden while empty
    telegram: '', // username without @; hidden while empty
    whatsapp: '', // international number, digits only; hidden while empty
    address: { ru: '', uz: '' }, // production address, not confirmed yet
    coordinates: null, // { lat, lng }, only for a confirmed address
    workingHours: { ru: '', uz: '' },
  },

  // Data controller details for the privacy policy. Not published while empty.
  legal: {
    operatorName: '', // full legal name
    taxId: '', // tax ID (STIR), 9 digits
    legalAddress: '',
    privacyContactEmail: 'qadoqlab.uz@gmail.com',
    // Turn on only after the details are filled in and a lawyer has checked the text.
    privacyPolicyReady: false,
  },

  /**
   * Confirmed production capabilities. Everything is off until the owner confirms it.
   */
  capabilities: {
    printing: false, // printing on boxes
    ownDelivery: false, // own delivery
    foodContactMaterials: false, // materials approved for direct food contact
    samplesAccepted: false, // physical samples (currently by arrangement only, see FAQ)
  },

  /**
   * Confirmed facts. Nothing here yet, so the site shows no figures.
   */
  facts: {
    foundedYear: null,
    capacity: null,
    employees: null,
    minOrder: null,
    leadTime: null,
    certificates: [],
    clients: [],
    testimonials: [],
    projects: [],
  },

  /**
   * Catalog categories by slug. Texts live in content/catalog.js.
   * Set to true only once the owner confirms the box type is actually produced.
   */
  catalogPublished: {
    'transport-boxes': false,
    'four-flap-boxes': false,
    'die-cut-boxes': false,
    'apparel-boxes': false,
    'ecommerce-boxes': false,
    'archive-boxes': false,
    'custom-boxes': false,
    'printed-boxes': false, // also needs capabilities.printing
  },

  /**
   * Gallery: real material only; an empty section is not published.
   * Item: { src: '/media/<hash>.jpg', width, height, alt: { ru, uz }, caption: { ru, uz }, illustration }
   * No client names, run sizes or project results.
   */
  gallery: {
    samples: [],
    construction: [],
    printing: [],
    production: [],
  },

  /**
   * Real photos for the About page. While empty, a neutral packaging illustration is shown.
   */
  aboutPhotos: {
    workshop: [],
    equipment: [],
    samples: [],
    process: [],
    qualityControl: [],
  },

  form: {
    // File uploads are switched on by the server (UPLOADS_ENABLED=true) and need working mail.
    maxFiles: 3,
    maxFileSizeMb: 10,
    allowedTypes: ['image/jpeg', 'image/png', 'application/pdf'],
    limits: {
      company: 120,
      name: 80,
      task: 3000,
      dimension: 6,
      quantity: 12,
      city: 80,
      contact: 120,
      comment: 2000,
    },
    mailSubject: { ru: 'Запрос на расчёт упаковки — Qadoqlab', uz: 'Qadoq hisob-kitobi bo‘yicha so‘rov — Qadoqlab' },
  },

  /**
   * Analytics. Nothing is loaded without an ID. Only event names and safe parameters
   * (language, page, category, industry) are sent — never names, contacts or request text.
   */
  analytics: {
    ga4Id: '', // 'G-XXXXXXX'
    yandexMetrikaId: '', // '12345678'
  },
};

// Settings saved from the admin panel live in data/settings.json and are laid over the
// defaults above. Only keys that already exist here are taken, and only with a value of
// a compatible type, so the file can't introduce new keys or touch Object.prototype.
const fs = require('fs');
const path = require('path');

const dataDir = () => (process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, '..', 'data'));
const settingsFile = () => path.join(dataDir(), 'settings.json');

const clone = (o) => JSON.parse(JSON.stringify(o));
const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const sameKind = (a, b) => (Array.isArray(a) ? Array.isArray(b) : typeof a === typeof b);

function merge(base, over) {
  for (const key of Object.keys(over)) {
    if (!Object.prototype.hasOwnProperty.call(base, key)) continue;
    const value = over[key];
    if (isPlainObject(base[key]) && isPlainObject(value)) merge(base[key], value);
    else if (base[key] === null || value === null || sameKind(base[key], value)) base[key] = value;
  }
  return base;
}

function load() {
  let saved = {};
  try {
    saved = JSON.parse(fs.readFileSync(settingsFile(), 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') console.error(`settings.json: ${err.message}`);
  }
  return merge(clone(defaults), isPlainObject(saved) ? saved : {});
}

const config = load();

Object.defineProperties(config, {
  defaults: { value: defaults },
  dataDir: { value: dataDir },
  settingsFile: { value: settingsFile },
  // Re-reads settings in place, so modules holding a reference see the new values.
  reload: {
    value() {
      const fresh = load();
      for (const key of Object.keys(config)) delete config[key];
      return Object.assign(config, fresh);
    },
  },
});

module.exports = config;
