'use strict';

// Validation for editable settings. Used by the admin API on save and by the
// build as a last line of defence against a hand-edited data/settings.json.

const RX_EMAIL = /^[^\s@<>()"',;:]+@[^\s@<>()"',;:]+\.[a-z]{2,}$/i;
const RX_DOMAIN = /^https:\/\/[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+(:\d{2,5})?$/i;

class ValidationError extends Error {
  constructor(code, field) {
    super(code);
    this.status = 400;
    this.code = code;
    this.field = field || null;
  }
}

const fail = (code, field) => {
  throw new ValidationError(code, field);
};

const hasOwn = (obj, key) => obj != null && Object.prototype.hasOwnProperty.call(obj, key);

function oneLine(value, max, field) {
  if (value == null) return '';
  if (typeof value !== 'string') fail('type', field);
  const s = value
    .normalize('NFC')
    .replace(/[\u0000-\u001F\u007F\u2028\u2029]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (s.length > max) fail('too_long', field);
  return s;
}

function multiLine(value, max, field) {
  if (typeof value !== 'string') fail('type', field);
  const s = value
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0009\u000B-\u001F\u007F\u2028\u2029]/g, '')
    .trim();
  if (s.length > max) fail('too_long', field);
  return s;
}

function email(value, field) {
  const s = oneLine(value, 120, field);
  if (!RX_EMAIL.test(s)) fail('email', field);
  return s;
}

function phone(value, field) {
  const s = oneLine(value, 30, field);
  const digits = (s.match(/\d/g) || []).length;
  if (s && (!/^\+?[\d\s()-]{7,24}$/.test(s) || digits < 9 || digits > 15)) fail('phone', field);
  return s;
}

function contacts(c, field = 'contacts') {
  c = c || {};
  const telegram = oneLine(c.telegram, 40, `${field}.telegram`)
    .replace(/^@/, '')
    .replace(/^https?:\/\/t\.me\//i, '');
  if (telegram && !/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(telegram)) fail('telegram', `${field}.telegram`);

  const whatsapp = oneLine(c.whatsapp, 30, `${field}.whatsapp`).replace(/\D/g, '');
  if (whatsapp && (whatsapp.length < 9 || whatsapp.length > 15)) fail('whatsapp', `${field}.whatsapp`);

  let coordinates = null;
  const co = c.coordinates;
  if (co && !(co.lat === '' && co.lng === '') && !(co.lat == null && co.lng == null)) {
    const lat = Number(co.lat);
    const lng = Number(co.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      fail('coordinates', `${field}.coordinates`);
    }
    coordinates = { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 };
  }

  return {
    email: email(c.email, `${field}.email`),
    phone: phone(c.phone, `${field}.phone`),
    telegram,
    whatsapp,
    address: {
      ru: oneLine(c.address && c.address.ru, 200, `${field}.address.ru`),
      uz: oneLine(c.address && c.address.uz, 200, `${field}.address.uz`),
    },
    coordinates,
    workingHours: {
      ru: oneLine(c.workingHours && c.workingHours.ru, 100, `${field}.workingHours.ru`),
      uz: oneLine(c.workingHours && c.workingHours.uz, 100, `${field}.workingHours.uz`),
    },
  };
}

function legal(l, field = 'legal') {
  l = l || {};
  const taxId = oneLine(l.taxId, 20, `${field}.taxId`).replace(/\s/g, '');
  if (taxId && !/^\d{9}$/.test(taxId)) fail('taxId', `${field}.taxId`);
  const out = {
    operatorName: oneLine(l.operatorName, 200, `${field}.operatorName`),
    taxId,
    legalAddress: oneLine(l.legalAddress, 300, `${field}.legalAddress`),
    privacyContactEmail: email(l.privacyContactEmail, `${field}.privacyContactEmail`),
    privacyPolicyReady: l.privacyPolicyReady === true,
  };
  if (out.privacyPolicyReady && !(out.operatorName && out.taxId && out.legalAddress)) {
    fail('privacy_incomplete', `${field}.privacyPolicyReady`);
  }
  return out;
}

function analytics(a) {
  a = a || {};
  const ga4Id = oneLine(a.ga4Id, 20, 'analytics.ga4Id').toUpperCase();
  if (ga4Id && !/^G-[A-Z0-9]{4,15}$/.test(ga4Id)) fail('ga4', 'analytics.ga4Id');
  const yandexMetrikaId = oneLine(a.yandexMetrikaId, 12, 'analytics.yandexMetrikaId');
  if (yandexMetrikaId && !/^\d{4,12}$/.test(yandexMetrikaId)) fail('ym', 'analytics.yandexMetrikaId');
  return { ga4Id, yandexMetrikaId };
}

function domain(value) {
  const d = oneLine(value, 200, 'domain').replace(/\/+$/, '');
  if (d && !RX_DOMAIN.test(d)) fail('domain', 'domain');
  return d.toLowerCase();
}

function mediaItem(item, field) {
  if (!item || typeof item !== 'object') fail('type', field);
  if (typeof item.src !== 'string' || !/^\/media\/[a-f0-9]{16}\.(jpg|png|webp)$/.test(item.src))
    fail('media_src', field);
  const size = (n) => (Number.isInteger(n) && n > 0 && n <= 6000 ? n : fail('media_size', field));
  return {
    src: item.src,
    width: size(item.width),
    height: size(item.height),
    alt: { ru: oneLine(item.alt && item.alt.ru, 200, field), uz: oneLine(item.alt && item.alt.uz, 200, field) },
    caption: {
      ru: oneLine(item.caption && item.caption.ru, 200, field),
      uz: oneLine(item.caption && item.caption.uz, 200, field),
    },
    illustration: item.illustration === true,
  };
}

/**
 * Validates the sections present in `input` and returns `current` with them replaced.
 * Unknown keys are ignored; known keys are rebuilt from scratch, so nothing unexpected
 * survives into settings.json.
 */
function validateSettings(input, current, { slugs = [] } = {}) {
  const out = JSON.parse(JSON.stringify(current));
  input = input || {};

  if (hasOwn(input, 'domain')) out.domain = domain(input.domain);
  if (hasOwn(input, 'contacts')) out.contacts = contacts(input.contacts);
  if (hasOwn(input, 'legal')) out.legal = legal(input.legal);
  if (hasOwn(input, 'analytics')) out.analytics = analytics(input.analytics);
  if (hasOwn(input, 'capabilities')) {
    out.capabilities = {
      ...out.capabilities,
      printing: Boolean(input.capabilities) && input.capabilities.printing === true,
    };
  }
  if (hasOwn(input, 'catalogPublished')) {
    const pub = input.catalogPublished || {};
    for (const slug of slugs) {
      if (hasOwn(pub, slug)) out.catalogPublished[slug] = pub[slug] === true;
    }
  }
  for (const group of ['gallery', 'aboutPhotos']) {
    if (!hasOwn(input, group)) continue;
    for (const section of Object.keys(out[group])) {
      const list = input[group] && input[group][section];
      if (list === undefined) continue;
      if (!Array.isArray(list) || list.length > 60) fail('type', `${group}.${section}`);
      out[group][section] = list.map((item, i) => mediaItem(item, `${group}.${section}.${i}`));
    }
  }
  return out;
}

module.exports = { validateSettings, oneLine, multiLine, email, ValidationError, RX_EMAIL };
