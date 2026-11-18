'use strict';

// Quote request: server-side validation and the e-mail sent to the company.
// Everything coming from the visitor is untrusted.

const config = require('../config/site.config');
const content = require('../content/load');
const { RX_EMAIL } = require('../config/validate');

const LIMITS = config.form.limits;
const ENUMS = {
  industry: Object.keys(content.DEFAULTS.ru.form.industries),
  print: Object.keys(content.DEFAULTS.ru.form.printOptions),
  unit: ['mm', 'cm'],
  dimType: ['inner', 'outer', 'unknown'],
  channel: ['phone', 'email', 'telegram'],
  topic: ['compare'],
};
const RX_PHONE = /^[+\d][\d\s()-]{6,22}$/;
const RX_TELEGRAM = /^@?[a-zA-Z][a-zA-Z0-9_]{4,31}$/;
const RX_TELEGRAM_LINK = /^(https?:\/\/)?t\.me\/[a-zA-Z][a-zA-Z0-9_]{4,31}\/?$/;

const digitCount = (s) => (s.match(/\d/g) || []).length;
const isPhone = (s) => RX_PHONE.test(s) && digitCount(s) >= 9 && digitCount(s) <= 15;

// Strips control characters and collapses spaces. Returns null when the text is too long.
function clean(value, max, multiline = false) {
  if (typeof value !== 'string') return '';
  let s = value.normalize('NFC').replace(/\r\n?/g, '\n');
  s = multiline
    ? s.replace(/[\u0000-\u0009\u000B-\u001F\u007F\u2028\u2029]/g, '')
    : s.replace(/[\u0000-\u001F\u007F\u2028\u2029]/g, ' ');
  s = s.replace(/[ \t]+/g, ' ').trim();
  return s.length > max ? null : s;
}

function validContact(channel, value) {
  if (!value) return false;
  if (channel === 'email') return RX_EMAIL.test(value);
  if (channel === 'phone') return isPhone(value);
  if (channel === 'telegram') return RX_TELEGRAM.test(value) || RX_TELEGRAM_LINK.test(value) || isPhone(value);
  return false;
}

/** @returns {{ ok: true, data: object } | { ok: false, fields: string[] }} */
function validate(raw) {
  const invalid = new Set();
  const get = (name) => (typeof raw[name] === 'string' ? raw[name] : '');

  const text = (name, max, multiline) => {
    const value = clean(get(name), max, multiline);
    if (value === null) {
      invalid.add(name);
      return '';
    }
    return value;
  };
  const oneOf = (name) => {
    const value = get(name).trim();
    return ENUMS[name].includes(value) ? value : '';
  };
  const positiveInt = (name, maxLength) => {
    const value = get(name).replace(/\s+/g, '');
    if (!value) return '';
    if (!/^\d+$/.test(value) || value.length > maxLength || Number(value) <= 0) {
      invalid.add(name);
      return '';
    }
    return String(Number(value));
  };

  const page = get('page');
  const type = get('type');
  const data = {
    company: text('company', LIMITS.company),
    name: text('name', LIMITS.name),
    task: text('task', LIMITS.task, true),
    city: text('city', LIMITS.city),
    contact: text('contact', LIMITS.contact),
    channel: oneOf('channel') || 'phone',
    industry: oneOf('industry'),
    print: oneOf('print'),
    unit: oneOf('unit') || 'mm',
    dimType: oneOf('dimType') || 'unknown',
    topic: oneOf('topic'),
    length: positiveInt('length', LIMITS.dimension),
    width: positiveInt('width', LIMITS.dimension),
    height: positiveInt('height', LIMITS.dimension),
    quantity: positiveInt('quantity', LIMITS.quantity),
    type: content.catalogDefault.some((c) => c.slug === type) ? type : '',
    page: /^\/(ru|uz)\/[a-z0-9\-/]{0,120}$/.test(page) ? page : '',
  };
  data.lang = data.page.startsWith('/uz/') ? 'uz' : 'ru';

  if (!validContact(data.channel, data.contact)) invalid.add('contact');
  // A request needs at least something to quote: a description, a product group, a size or a box type.
  if (!data.task && !data.industry && !data.length && !data.width && !data.height && !data.type) invalid.add('task');

  return invalid.size ? { ok: false, fields: [...invalid] } : { ok: true, data };
}

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function tashkentTime(date = new Date()) {
  const formatted = new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Asia/Tashkent',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
  return `${formatted} (Ташкент, UTC+5)`;
}

const dimensions = (d, units) =>
  d.length || d.width || d.height ? `${d.length || '?'} × ${d.width || '?'} × ${d.height || '?'} ${units}` : '';

/** The notification for the company. Always in Russian; the site language is noted inside. */
function buildEmail(d, attachments = []) {
  const form = content.dicts().ru.form;
  const typeName = d.type ? content.catalog().find((c) => c.slug === d.type).ru.name : '';
  const size = dimensions(d, d.unit === 'cm' ? 'см' : 'мм');
  const topic =
    typeName || (d.industry && form.industries[d.industry]) || d.task.split('\n')[0].slice(0, 60) || 'запрос на расчёт';
  const subject = `Новая заявка QADOQLAB — ${topic}`.replace(/\s+/g, ' ').slice(0, 160);

  const rows = [
    ['Дата и время', tashkentTime()],
    ['Язык сайта', d.lang === 'uz' ? 'узбекский' : 'русский'],
    ['Компания', d.company],
    ['Контактное лицо', d.name],
    ['Контакт', d.contact && `${form.channels[d.channel]}: ${d.contact}`],
    ['Город', d.city],
    ['Что упаковать', d.industry && form.industries[d.industry]],
    ['Вариант упаковки', typeName],
    ['Тема', d.topic === 'compare' ? 'Сравнение условий на одну позицию' : ''],
    ['Задача', d.task],
    ['Размеры', size],
    ['Внутренние или внешние', size && { inner: 'внутренние', outer: 'внешние', unknown: 'не указано' }[d.dimType]],
    ['Количество', d.quantity],
    ['Печать', d.print && form.printOptions[d.print]],
    ['Страница', d.page],
    ['Вложения', attachments.map((a) => a.filename).join(', ')],
  ].filter(([, value]) => value);

  const text = `${rows.map(([k, v]) => (v.includes('\n') ? `${k}:\n${v}` : `${k}: ${v}`)).join('\n')}\n`;
  const cell = 'border-bottom:1px solid #DEDCD4';
  const tableRows = rows
    .map(
      ([k, v]) =>
        `<tr><td style="${cell};color:#626A63;vertical-align:top;white-space:nowrap">${escapeHtml(k)}</td>` +
        `<td style="${cell};white-space:pre-wrap">${escapeHtml(v)}</td></tr>`,
    )
    .join('\n');
  const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#202722;line-height:1.5">
<h2 style="font-size:18px;color:#123C2B;margin:0 0 16px">${escapeHtml(subject)}</h2>
<table cellpadding="8" cellspacing="0" style="border-collapse:collapse;font-size:14px;max-width:680px">
${tableRows}
</table>
${d.channel === 'email' ? '<p style="font-size:13px;color:#626A63">Ответ на это письмо уйдёт на email клиента (Reply-To).</p>' : ''}
</body></html>`;

  // Reply-To only for a valid address; From always stays the verified sender.
  const replyTo = d.channel === 'email' && RX_EMAIL.test(d.contact) ? d.contact : undefined;
  return { subject, text, html, replyTo };
}

/** A prepared e-mail for the visitor's own mail app, used when online sending is off. */
function mailtoHref(d) {
  const t = content.dicts()[d.lang === 'uz' ? 'uz' : 'ru'];
  const labels = t.form.mail;
  const lines = [labels.greeting, labels.intro, ''];
  const add = (label, value) => value && lines.push(`${label}: ${value}`);
  add(labels.company, d.company);
  add(labels.name, d.name);
  add(labels.industry, d.industry && t.form.industries[d.industry]);
  add(labels.dims, dimensions(d, t.form.fields[d.unit]));
  add(labels.quantity, d.quantity);
  add(labels.city, d.city);
  add(labels.contact, d.contact && `${t.form.channels[d.channel]} — ${d.contact}`);
  if (d.task) lines.push('', `${labels.task}:`, d.task.slice(0, 1500));
  const subject = encodeURIComponent(config.form.mailSubject[d.lang]);
  return `mailto:${encodeURIComponent(config.contacts.email).replace('%40', '@')}?subject=${subject}&body=${encodeURIComponent(lines.join('\n'))}`;
}

module.exports = { validate, buildEmail, mailtoHref, validContact, ENUMS };
