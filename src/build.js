#!/usr/bin/env node
/**
 * Static site generator for QADOQLAB. No dependencies.
 *   node src/build.js          → dist/       public build, confirmed content only
 *   node src/build.js --demo   → dist-demo/  every category, marked as demo, noindex
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const DEMO = process.argv.includes('--demo');
const outArg = (process.argv.find((a) => a.startsWith('--out=')) || '').slice(6);
const OUT = path.resolve(ROOT, outArg || (DEMO ? 'dist-demo' : 'dist'));

const config = require('../config/site.config');
const content = require('../content/load');
const catalog = content.catalog(); // with admin panel edits
const dict = content.dicts();
const { scenes, MARK_PATHS } = require('./illustrations');
const privacyText = require('../content/privacy');

// SITE_DOMAIN overrides config.domain for a one-off build, e.g. to test SEO output.
// Settings may have been edited by hand; validate before anything is rendered.
const { validateSettings, ValidationError } = require('../config/validate');
try {
  const editable = {
    domain: process.env.SITE_DOMAIN || config.domain,
    contacts: config.contacts,
    legal: config.legal,
    analytics: config.analytics,
    gallery: config.gallery,
    aboutPhotos: config.aboutPhotos,
  };
  Object.assign(config, validateSettings(editable, config, { slugs: Object.keys(config.catalogPublished) }));
} catch (err) {
  if (!(err instanceof ValidationError)) throw err;
  console.error(`Invalid setting "${err.field}": ${err.code}. Fix it in the admin panel or data/settings.json.`);
  process.exit(1);
}
const DOMAIN = config.domain;
const INDEXABLE = Boolean(DOMAIN) && !DEMO;
const EMAIL = config.contacts.email;
const YEAR = new Date().getFullYear();

// --- helpers ---
const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
// Heading text split into words for the reveal animation; plain text without JS.
const words = (text) =>
  String(text ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => `<span class="w"><span class="wi">${esc(word)}</span></span>`)
    .join(' ');
const fill = (s, vars) => String(s).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);
const write = (rel, content) => {
  const file = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
};
const hash = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 10);

const ROUTES = {
  home: '',
  catalog: 'catalog/',
  business: 'business/',
  about: 'about/',
  request: 'request/',
  contacts: 'contacts/',
  privacy: 'privacy/',
};
const href = (lang, key, slug) => `/${lang}/${key === 'category' ? `catalog/${slug}/` : ROUTES[key]}`;
const abs = (p) => esc(DOMAIN ? DOMAIN + p : p);

const privacyReady = () => {
  const l = config.legal;
  return Boolean(l.privacyPolicyReady && l.operatorName && l.taxId && l.legalAddress);
};
const isPublished = (cat) =>
  DEMO || (config.catalogPublished[cat.slug] === true && cat.requires.every((c) => config.capabilities[c] === true));
const published = () => catalog.filter(isPublished);

const mailto = (lang) => `mailto:${EMAIL}?subject=${encodeURIComponent(config.form.mailSubject[lang])}`;

// --- icons ---
const I = {
  arrow:
    '<svg class="i" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M4 10h11m-4.5-4.5L15 10l-4.5 4.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  plus: '<svg class="i" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M10 4v12M4 10h12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  mail: '<svg class="i" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M3 5.5h14v9H3z M3.5 6l6.5 5 6.5-5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>',
  check:
    '<svg class="i" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M4.5 10.5l3.5 3.5 7.5-8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  alert:
    '<svg class="i" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><circle cx="10" cy="10" r="7.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M10 6v5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="10" cy="13.8" r="1.1" fill="currentColor"/></svg>',
  menu: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 8h16M4 16h16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  close:
    '<svg class="i" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
};
const markSvg = (cls = 'logo-mark') =>
  `<svg class="${cls}" viewBox="0 0 32 32" aria-hidden="true" focusable="false"><g fill="none" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round">${MARK_PATHS}</g></svg>`;

// --- illustrations ---
const IMG = {};
let HERO_SVG = '';
function buildImages() {
  for (const [key, fn] of Object.entries(scenes)) {
    const svg = fn();
    const [, w, h] = svg.match(/width="(\d+)" height="(\d+)"/);
    const name = `${key}.${hash(svg)}.svg`;
    write(`assets/img/${name}`, svg);
    IMG[key] = { src: `/assets/img/${name}`, w: +w, h: +h };
    if (key === 'hero') HERO_SVG = svg;
  }
}
// `vt` names the picture for cross-page transitions (see the generated CSS in buildAssets).
const img = (key, alt, { eager = false, sizes = '', vt = '' } = {}) => {
  const m = IMG[key];
  const loading = eager ? 'fetchpriority="high" decoding="async"' : 'loading="lazy" decoding="async"';
  return `<img src="${m.src}" width="${m.w}" height="${m.h}" alt="${esc(alt)}" ${loading}${sizes ? ` sizes="${sizes}"` : ''}${vt ? ` data-vt="${esc(vt)}"` : ''}>`;
};

// --- page shell ---
function head(t, { title, description, pathKey, slug, ogType = 'website', jsonld = '', noindex = false }) {
  const lang = t.lang;
  const self = pathKey ? href(lang, pathKey, slug) : null;
  const robots =
    !INDEXABLE || noindex
      ? '<meta name="robots" content="noindex, nofollow">'
      : '<meta name="robots" content="index, follow">';
  let links = '';
  if (DOMAIN && self) {
    links += `<link rel="canonical" href="${abs(self)}">`;
    for (const l of config.languages)
      links += `<link rel="alternate" hreflang="${l}" href="${abs(href(l, pathKey, slug))}">`;
    links += `<link rel="alternate" hreflang="x-default" href="${abs(href(config.defaultLanguage, pathKey, slug))}">`;
  }
  const og = [
    `<meta property="og:type" content="${ogType}">`,
    `<meta property="og:site_name" content="QADOQLAB">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(description)}">`,
    `<meta property="og:locale" content="${t.locale}">`,
    `<meta property="og:locale:alternate" content="${dict[lang === 'ru' ? 'uz' : 'ru'].locale}">`,
    DOMAIN && self ? `<meta property="og:url" content="${abs(self)}">` : '',
    `<meta property="og:image" content="${abs('/assets/og.jpg')}">`,
    '<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">',
    '<meta name="twitter:card" content="summary_large_image">',
  ].join('');
  const fontPreload =
    ASSETS.fonts[lang === 'ru' ? 'manrope-cyrillic-wght-normal.woff2' : 'manrope-latin-wght-normal.woff2'];
  const an = config.analytics;
  return `<!doctype html>
<html lang="${lang}"${an.ga4Id ? ` data-ga4="${esc(an.ga4Id)}"` : ''}${an.yandexMetrikaId ? ` data-ym="${esc(an.yandexMetrikaId)}"` : ''}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
${robots}
${links}
${og}
<meta name="theme-color" content="#123C2B">
<meta name="format-detection" content="telephone=no">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/favicon-32.png" sizes="32x32" type="image/png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="preload" href="${fontPreload}" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${ASSETS.css}">
<script>${INLINE_JS}</script>
<script src="${ASSETS.js}" defer></script>
${jsonld}
</head>`;
}
// The only inline script: flags JS for the styles. Its hash goes into the server's CSP.
const INLINE_JS = "document.documentElement.classList.add('js')";

function header(t, current, altHref) {
  const lang = t.lang;
  const items = ['catalog', 'business', 'about', 'contacts'];
  const navLinks = items
    .map(
      (k) => `<li><a href="${href(lang, k)}"${current === k ? ' aria-current="page"' : ''}>${esc(t.nav[k])}</a></li>`,
    )
    .join('');
  const langLinks = config.languages.map((l) => {
    const isCur = l === lang;
    return `<a class="lang-link" href="${esc(isCur ? '' : altHref)}" hreflang="${l}" lang="${l}"${isCur ? ' aria-current="true"' : ` data-lang-switch="${l}"`} title="${esc(dict[l].langName)}">${dict[l].langShort}</a>`;
  });
  // the current language is a label, not a link
  const langHtml = config.languages
    .map((l, i) =>
      l === lang
        ? `<span class="lang-link is-current" aria-current="true" lang="${l}">${dict[l].langShort}</span>`
        : langLinks[i],
    )
    .join('');
  return `<a class="skip-link" href="#main">${esc(t.a11y.skip)}</a>
${DEMO ? `<div class="demo-banner" role="note">${esc(t.demoBanner)}</div>` : ''}
<header class="site-header" data-header>
  <div class="container header-inner">
    <a class="logo" href="${href(lang, 'home')}" aria-label="${esc(t.a11y.home)}">${markSvg()}<span class="logo-word">QADOQLAB</span></a>
    <nav class="main-nav" aria-label="${esc(t.a11y.mainNav)}"><ul>${navLinks}</ul></nav>
    <div class="header-actions">
      <div class="lang-switch" role="group" aria-label="${esc(t.a11y.langSwitch)}">${langHtml}</div>
      ${current === 'request' ? '' : `<a class="btn btn-primary btn-sm header-cta" href="${href(lang, 'request')}" data-track="cta" data-cta="header">${esc(t.cta.primary)}</a>`}
      <button class="menu-toggle" type="button" aria-expanded="false" aria-controls="mobile-menu" data-menu-toggle>
        <span class="menu-bars" aria-hidden="true"><span></span><span></span></span>
        <span class="sr-only" data-label-open="${esc(t.a11y.menuOpen)}" data-label-close="${esc(t.a11y.menuClose)}">${esc(t.a11y.menuOpen)}</span>
      </button>
    </div>
  </div>
  <div class="mobile-menu" id="mobile-menu" data-mobile-menu hidden>
    <div class="container">
      <nav aria-label="${esc(t.a11y.mainNav)}"><ul class="mobile-nav">${navLinks}</ul></nav>
      <div class="mobile-menu-foot">
        <a class="btn btn-primary btn-block" href="${href(lang, 'request')}" data-track="cta" data-cta="menu">${esc(t.cta.primary)}</a>
        <div class="lang-switch lang-switch-lg" role="group" aria-label="${esc(t.a11y.langSwitch)}">${langHtml}</div>
        <a class="mobile-menu-mail" href="${mailto(lang)}" data-track="email">${esc(EMAIL)}</a>
      </div>
    </div>
  </div>
</header>`;
}

function footer(t, altHref) {
  const lang = t.lang;
  const links = ['catalog', 'business', 'about', 'request', 'contacts']
    .map((k) => `<li><a href="${href(lang, k)}">${esc(t.nav[k])}</a></li>`)
    .join('');
  const other = config.languages.filter((l) => l !== lang)[0];
  return `<footer class="site-footer">
  <div class="container footer-grid">
    <div class="footer-brand">
      <a class="logo logo-footer" href="${href(lang, 'home')}" aria-label="${esc(t.a11y.home)}">${markSvg()}<span class="logo-word">QADOQLAB</span></a>
      <p>${esc(t.footer.about)}</p>
    </div>
    <nav class="footer-nav" aria-label="${esc(t.a11y.footerNav)}">
      <h2 class="footer-title">${esc(t.footer.navTitle)}</h2>
      <ul>${links}</ul>
    </nav>
    <div class="footer-contact">
      <h2 class="footer-title">${esc(t.footer.contactTitle)}</h2>
      <a class="footer-mail" href="${mailto(lang)}" data-track="email">${esc(EMAIL)}</a>
      ${contactExtras(t, 'footer')}
    </div>
  </div>
  <div class="container footer-bottom">
    <span>© ${YEAR} QADOQLAB</span>
    ${privacyReady() ? `<a href="${href(lang, 'privacy')}">${esc(t.nav.privacy)}</a>` : ''}
    <a class="footer-lang" href="${esc(altHref)}" hreflang="${other}" lang="${other}" data-lang-switch="${other}">${esc(dict[other].langName)}</a>
  </div>
</footer>`;
}

// Phone, messengers, address, hours — each only when set.
function contactExtras(t, variant) {
  const c = config.contacts;
  const lang = t.lang;
  const out = [];
  if (c.phone)
    out.push(
      `<li><span class="ce-label">${esc(t.contacts.phoneLabel)}</span><a href="tel:${esc(c.phone.replace(/[^\d+]/g, ''))}" data-track="phone">${esc(c.phone)}</a></li>`,
    );
  if (c.telegram)
    out.push(
      `<li><span class="ce-label">Telegram</span><a href="https://t.me/${esc(c.telegram.replace(/^@/, ''))}" rel="noopener" data-track="telegram">@${esc(c.telegram.replace(/^@/, ''))}</a></li>`,
    );
  if (c.whatsapp)
    out.push(
      `<li><span class="ce-label">WhatsApp</span><a href="https://wa.me/${esc(c.whatsapp.replace(/\D/g, ''))}" rel="noopener" data-track="whatsapp">+${esc(c.whatsapp.replace(/\D/g, ''))}</a></li>`,
    );
  if (c.address[lang])
    out.push(
      `<li><span class="ce-label">${esc(t.contacts.addressLabel)}</span><span>${esc(c.address[lang])}</span></li>`,
    );
  if (c.workingHours[lang])
    out.push(
      `<li><span class="ce-label">${esc(t.contacts.hoursLabel)}</span><span>${esc(c.workingHours[lang])}</span></li>`,
    );
  return out.length ? `<ul class="contact-extras contact-extras-${variant}">${out.join('')}</ul>` : '';
}

function stickyCta(t, current) {
  if (current === 'request') return '';
  return `<div class="sticky-cta" data-sticky-cta hidden><a class="btn btn-primary btn-block" href="${href(t.lang, 'request')}" data-track="cta" data-cta="sticky">${esc(t.cta.primary)}</a></div>`;
}

function layout(t, opts, body) {
  const { current, pathKey, slug } = opts;
  const other = t.lang === 'ru' ? 'uz' : 'ru';
  const altHref = pathKey ? href(other, pathKey, slug) : `/${other}/`;
  return `${head(t, opts)}
<body data-page="${current || 'other'}" data-lang="${t.lang}">
${header(t, current, altHref)}
<main id="main" tabindex="-1">
${body}
</main>
${footer(t, altHref)}
${stickyCta(t, current)}
</body>
</html>
`;
}

// --- sections ---
const eyebrow = (s) => `<p class="eyebrow">${esc(s)}</p>`;

function hero(t) {
  const lang = t.lang;
  return `<section class="hero">
  <div class="container hero-grid">
    <div class="hero-copy">
      ${eyebrow(t.hero.eyebrow)}
      <h1 class="hero-title">${t.hero.titleLines.map((l, i) => `<span class="ln ln-${i + 1}"><span class="ln-i">${esc(l)}</span></span>`).join(' ')}</h1>
      <p class="hero-lead">${esc(t.hero.lead)}</p>
      <div class="btn-row">
        <a class="btn btn-primary btn-lg" href="${href(lang, 'request')}" data-track="cta" data-cta="hero">${esc(t.cta.primary)}${I.arrow}</a>
        <a class="btn btn-secondary btn-lg" href="${href(lang, 'catalog')}">${esc(t.cta.browse)}</a>
      </div>
      <p class="hero-note">${esc(t.hero.note)}</p>
    </div>
    <figure class="hero-figure">
      <div class="hero-art" data-hero-art>${HERO_SVG.replace('<svg ', `<svg class="hero-svg" aria-label="${esc(t.hero.alt)}" `)}</div>
      <figcaption class="illus-caption">${esc(t.illustrationLabel)}</figcaption>
    </figure>
  </div>
</section>`;
}

function principles(t) {
  return `<section class="principles" aria-labelledby="principles-title">
  <div class="container">
    <h2 class="sr-only" id="principles-title">${esc(t.principles.title)}</h2>
    <ol class="principles-list">
      ${t.principles.items.map((it, i) => `<li class="reveal"><span class="num">0${i + 1}</span><h3>${esc(it.t)}</h3><p>${esc(it.d)}</p></li>`).join('')}
    </ol>
  </div>
</section>`;
}

function catCard(t, cat, { headingLevel = 3 } = {}) {
  const c = cat[t.lang];
  const lang = t.lang;
  const h = `h${headingLevel}`;
  const demoTag =
    DEMO && config.catalogPublished[cat.slug] !== true ? `<span class="tag-demo">${esc(t.demoTag)}</span>` : '';
  return `<article class="cat-card reveal">
  <a class="cat-media" href="${href(lang, 'category', cat.slug)}" tabindex="-1" aria-hidden="true">${img(cat.art, c.alt, { vt: cat.slug })}</a>
  <div class="cat-body">
    ${demoTag}
    <${h} class="cat-title"><a href="${href(lang, 'category', cat.slug)}">${esc(c.name)}</a></${h}>
    <p>${esc(c.short)}</p>
    <div class="cat-actions">
      <a class="link-arrow" href="${href(lang, 'category', cat.slug)}">${esc(t.cta.more)}${I.arrow}<span class="sr-only">: ${esc(c.name)}</span></a>
      <a class="btn btn-quiet btn-sm" href="${href(lang, 'request')}?type=${cat.slug}#request-form" data-track="category" data-category="${cat.slug}">${esc(t.cta.calcThis)}<span class="sr-only">: ${esc(c.name)}</span></a>
    </div>
  </div>
</article>`;
}

function catalogEmpty(t, { headingLevel = 3 } = {}) {
  const lang = t.lang;
  const h = `h${headingLevel}`;
  return `<div class="cat-empty reveal">
  <figure class="cat-empty-figure">${img('dieline', catalog.find((c) => c.slug === 'custom-boxes')[lang].alt)}<figcaption class="illus-caption">${esc(t.illustrationLabel)}</figcaption></figure>
  <div class="cat-empty-body">
    <${h} class="cat-empty-title">${esc(t.catalogSection.emptyTitle)}</${h}>
    <p class="lead">${esc(t.catalogSection.emptyLead)}</p>
    <dl class="param-grid">
      ${t.catalogSection.emptyPoints.map((p) => `<div><dt>${esc(p.t)}</dt><dd>${esc(p.d)}</dd></div>`).join('')}
    </dl>
    <div class="btn-row">
      <a class="btn btn-primary" href="${href(lang, 'request')}#request-form" data-track="cta" data-cta="catalog-empty">${esc(t.cta.sendSizes)}${I.arrow}</a>
      <a class="btn btn-secondary" href="${href(lang, 'home')}#wizard">${esc(t.cta.pick)}</a>
    </div>
  </div>
</div>`;
}

function catalogSection(t) {
  const list = published();
  const lang = t.lang;
  return `<section class="section" id="catalog" aria-labelledby="catalog-title">
  <div class="container">
    <div class="section-head reveal">
      ${eyebrow(t.catalogSection.eyebrow)}
      <h2 id="catalog-title" class="words">${words(t.catalogSection.title)}</h2>
      <p class="lead">${esc(t.catalogSection.lead)}</p>
    </div>
    ${
      list.length
        ? `<div class="cat-grid">${list
            .slice(0, 6)
            .map((c) => catCard(t, c))
            .join('')}</div>
    <p class="section-more"><a class="link-arrow" href="${href(lang, 'catalog')}">${esc(t.catalogSection.all)}${I.arrow}</a></p>`
        : catalogEmpty(t)
    }
  </div>
</section>`;
}

function businessList(t, { headingLevel = 3 } = {}) {
  const lang = t.lang;
  const h = `h${headingLevel}`;
  return `<ul class="biz-list">
  ${t.business.items
    .map(
      (it, i) => `<li class="biz-item reveal">
    <span class="num">${String(i + 1).padStart(2, '0')}</span>
    <${h}>${esc(it.t)}</${h}>
    <p>${esc(it.d)}</p>
    <a class="link-arrow" href="${href(lang, 'request')}?industry=${it.key}#request-form" data-track="industry" data-industry="${it.key}">${esc(t.business.discuss)}${I.arrow}<span class="sr-only">: ${esc(it.t)}</span></a>
  </li>`,
    )
    .join('')}
</ul>`;
}

function foodNote(t) {
  return `<aside class="note-card" aria-label="${esc(t.business.foodNoteTitle)}"><p><strong>${esc(t.business.foodNoteTitle)}.</strong> ${esc(t.business.foodNote)}</p></aside>`;
}

function businessSection(t) {
  return `<section class="section section-alt" id="business" aria-labelledby="business-title">
  <div class="container split">
    <div class="split-aside">
      ${eyebrow(t.business.eyebrow)}
      <h2 id="business-title" class="words">${words(t.business.title)}</h2>
      <p class="lead">${esc(t.business.lead)}</p>
      ${foodNote(t)}
    </div>
    <div class="split-main">${businessList(t)}</div>
  </div>
</section>`;
}

function compareSection(t) {
  const lang = t.lang;
  return `<section class="section compare" aria-labelledby="compare-title">
  <div class="container">
    <div class="compare-card reveal">
      <div class="compare-head">
        ${eyebrow(t.compare.eyebrow)}
        <h2 id="compare-title" class="words">${t.compare.titleLines.map((l) => `<span>${words(l)}</span>`).join(' ')}</h2>
      </div>
      <div class="compare-body">
        <p class="lead">${esc(t.compare.text)}</p>
        <h3 class="mini-title">${esc(t.compare.listTitle)}</h3>
        <ul class="check-list">${t.compare.list.map((x) => `<li>${I.check}<span>${esc(x)}</span></li>`).join('')}</ul>
        <p class="compare-note">${esc(t.compare.note)}</p>
        <a class="btn btn-primary" href="${href(lang, 'request')}?topic=compare#request-form" data-track="cta" data-cta="compare">${esc(t.cta.offer)}${I.arrow}</a>
      </div>
    </div>
  </div>
</section>`;
}

function stepsSection(t, alt = false) {
  return `<section class="section${alt ? ' section-alt' : ''}" aria-labelledby="steps-title">
  <div class="container">
    <div class="section-head reveal">
      ${eyebrow(t.steps.eyebrow)}
      <h2 id="steps-title" class="words">${words(t.steps.title)}</h2>
    </div>
    <ol class="steps">
      ${t.steps.items.map((s) => `<li class="reveal"><span class="step-num">${s.n}</span><h3>${esc(s.t)}</h3><p>${esc(s.d)}</p></li>`).join('')}
    </ol>
  </div>
</section>`;
}

function faqSection(t) {
  return `<section class="section" id="faq" aria-labelledby="faq-title">
  <div class="container split">
    <div class="split-aside">
      ${eyebrow(t.faq.eyebrow)}
      <h2 id="faq-title" class="words">${words(t.faq.title)}</h2>
    </div>
    <div class="split-main faq">
      ${t.faq.items
        .map(
          (f) => `<details class="faq-item">
        <summary><h3 class="faq-q">${esc(f.q)}</h3><span class="faq-icon">${I.plus}</span></summary>
        <div class="faq-a"><p>${f.a.includes('{email}') ? esc(f.a).replace('{email}', `<a href="${mailto(t.lang)}" data-track="email">${esc(EMAIL)}</a>`) : esc(f.a)}</p></div>
      </details>`,
        )
        .join('')}
    </div>
  </div>
</section>`;
}

function finalCta(t) {
  return `<section class="final-cta" aria-labelledby="final-title">
  <svg class="final-dieline" viewBox="0 0 640 320" aria-hidden="true" focusable="false"><path class="cut" pathLength="1" d="M20 20H158V80H162V30H258V80H262V20H398V80H402V30H500V80L524 96V224L500 240V290H402V240H398V300H262V240H258V290H162V240H158V300H20Z"/><path class="fold" d="M20 80H500M20 240H500M160 80V240M260 80V240M400 80V240M500 80V240"/></svg>
  <div class="container final-inner reveal">
    <h2 id="final-title" class="words">${words(t.finalCta.title)}</h2>
    <div>
      <p>${esc(t.finalCta.text)}</p>
      <a class="btn btn-light btn-lg" href="${href(t.lang, 'request')}" data-track="cta" data-cta="final">${esc(t.cta.primary)}${I.arrow}</a>
    </div>
  </div>
</section>`;
}

// --- forms ---
const fieldOpt = (t) => `<span class="field-opt">${esc(t.form.optional)}</span>`;
const fieldReq = (t) => `<span class="field-req">${esc(t.form.required)}</span>`;

function contactFields(t, id) {
  const f = t.form.fields;
  const L = config.form.limits;
  return `<fieldset class="field-group">
    <legend class="field-label">${esc(f.channel)}</legend>
    <div class="seg" role="presentation">
      ${['phone', 'email', 'telegram'].map((ch, i) => `<label class="seg-opt"><input type="radio" name="channel" value="${ch}"${i === 0 ? ' checked' : ''} data-channel><span>${esc(t.form.channels[ch])}</span></label>`).join('')}
    </div>
  </fieldset>
  <div class="field" data-field="contact">
    <label class="field-label" for="${id}-contact">${esc(f.contact)} ${fieldReq(t)}</label>
    <input class="input" id="${id}-contact" name="contact" type="tel" inputmode="tel" autocomplete="tel" maxlength="${L.contact}" required placeholder="${esc(t.form.contactPlaceholder.phone)}" aria-describedby="${id}-contact-err" data-contact
      data-ph-phone="${esc(t.form.contactPlaceholder.phone)}" data-ph-email="${esc(t.form.contactPlaceholder.email)}" data-ph-telegram="${esc(t.form.contactPlaceholder.telegram)}">
    <p class="field-error" id="${id}-contact-err" hidden></p>
  </div>`;
}

function dimsFields(t, id) {
  const f = t.form.fields;
  const L = config.form.limits;
  const num = (n, lbl) =>
    `<div class="dim"><label class="dim-label" for="${id}-${n}">${esc(lbl)}</label><input class="input" id="${id}-${n}" name="${n}" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="${L.dimension}" autocomplete="off" data-int aria-describedby="${id}-dims-err"></div>`;
  return `<fieldset class="field-group" data-field="dims">
    <legend class="field-label">${esc(f.dims)} ${fieldOpt(t)}</legend>
    <div class="dims">
      ${num('length', f.length)}<span class="dims-x" aria-hidden="true">×</span>${num('width', f.width)}<span class="dims-x" aria-hidden="true">×</span>${num('height', f.height)}
      <div class="dim dim-unit"><label class="dim-label" for="${id}-unit">${esc(f.unit)}</label><select class="input" id="${id}-unit" name="unit"><option value="mm" selected>${esc(f.mm)}</option><option value="cm">${esc(f.cm)}</option></select></div>
    </div>
    <p class="field-error" id="${id}-dims-err" hidden></p>
    <div class="seg seg-sm" role="group" aria-label="${esc(f.dimType)}">
      <span class="seg-caption" aria-hidden="true">${esc(f.dimType)}:</span>
      ${['inner', 'outer', 'unknown'].map((v) => `<label class="seg-opt"><input type="radio" name="dimType" value="${v}"${v === 'unknown' ? ' checked' : ''}><span>${esc(f[v])}</span></label>`).join('')}
    </div>
  </fieldset>`;
}

function industrySelect(t, id, preset, cls = 'field') {
  const f = t.form.fields;
  return `<div class="${cls}">
    <label class="field-label" for="${id}-industry">${esc(f.industry)} ${fieldOpt(t)}</label>
    <select class="input" id="${id}-industry" name="industry" data-industry-select>
      <option value="">${esc(f.industryPlaceholder)}</option>
      ${Object.entries(t.form.industries)
        .map(([k, v]) => `<option value="${k}"${preset === k ? ' selected' : ''}>${esc(v)}</option>`)
        .join('')}
    </select>
  </div>`;
}

function filesField(t, id) {
  const f = t.form.fields;
  // Hidden until /api/status confirms the server accepts files.
  return `<div class="field" data-files hidden>
    <label class="field-label" for="${id}-files">${esc(f.file)} ${fieldOpt(t)}</label>
    <input class="input input-file" id="${id}-files" name="files" type="file" multiple accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf" aria-describedby="${id}-files-hint ${id}-files-err" disabled>
    <p class="field-hint" id="${id}-files-hint">${esc(f.fileHint)}</p>
    <p class="field-error" id="${id}-files-err" hidden></p>
  </div>`;
}

function hiddenFields(id) {
  return `<input type="hidden" name="type" value="" data-type-input>
  <input type="hidden" name="topic" value="" data-topic-input>
  <input type="hidden" name="page" value="">
  <input type="hidden" name="ts" value="">
  <input type="hidden" name="idem" value="">
  <div class="hp" aria-hidden="true"><label for="${id}-website">Website</label><input id="${id}-website" name="website" type="text" tabindex="-1" autocomplete="off"></div>`;
}

function formFooter(t, id, submitText) {
  const policy = privacyReady() ? ` <a href="${href(t.lang, 'privacy')}">${esc(t.form.privacyLink)}</a>.` : '';
  return `<div class="form-foot">
    <p class="form-privacy">${esc(t.form.privacyNote)}${policy}</p>
    <p class="form-mode-note" data-mailto-note hidden>${I.mail}<span>${fill(esc(t.form.mailtoMode), { email: `<a href="${mailto(t.lang)}">${esc(EMAIL)}</a>` })} ${esc(t.form.mailtoFiles)}</span></p>
    <p class="form-files-note" data-files-email-note hidden>${fill(esc(t.form.filesByEmail), { email: `<a href="${mailto(t.lang)}" data-track="email">${esc(EMAIL)}</a>` })}</p>
    <div class="form-status" data-status role="status" aria-live="polite" tabindex="-1"></div>
    <button class="btn btn-primary btn-lg btn-submit" type="submit" data-submit data-label="${esc(submitText)}" data-label-mailto="${esc(t.form.mailtoSubmit)}" data-label-sending="${esc(t.form.sending)}">
      <span class="btn-label">${esc(submitText)}</span><span class="spinner" aria-hidden="true"></span>
    </button>
  </div>`;
}

function errorSummary(t) {
  return `<div class="error-summary" data-error-summary tabindex="-1" hidden><p>${I.alert}<span>${esc(t.form.errorsSummary)}</span></p><ul></ul></div>`;
}

// Main quote request form.
function requestForm(t, { id = 'rf', presetType = '', compact = false } = {}) {
  const f = t.form.fields;
  const L = config.form.limits;
  const lang = t.lang;
  const typeCat = presetType ? catalog.find((c) => c.slug === presetType) : null;
  return `<form class="req-form${compact ? ' req-form-compact' : ''}" id="${id}" action="/api/request" method="post" enctype="multipart/form-data" novalidate data-request-form data-lang="${lang}" data-preset-type="${esc(presetType)}">
  ${errorSummary(t)}
  <div class="type-chip" data-type-chip${typeCat ? '' : ' hidden'}>
    <span class="type-chip-label">${esc(t.form.selectedType)}:</span> <strong data-type-name>${typeCat ? esc(typeCat[lang].name) : ''}</strong>
    ${compact ? '' : `<button type="button" class="type-chip-remove" data-type-remove>${esc(t.form.removeType)}</button>`}
  </div>
  <div class="form-grid">
    ${
      compact
        ? ''
        : `<div class="field"><label class="field-label" for="${id}-company">${esc(f.company)} ${fieldOpt(t)}</label><input class="input" id="${id}-company" name="company" type="text" autocomplete="organization" maxlength="${L.company}"></div>
    <div class="field"><label class="field-label" for="${id}-name">${esc(f.name)} ${fieldOpt(t)}</label><input class="input" id="${id}-name" name="name" type="text" autocomplete="name" maxlength="${L.name}"></div>`
    }
    ${compact ? '' : industrySelect(t, id, '', 'field field-wide')}
    <div class="field field-wide" data-field="task">
      <label class="field-label" for="${id}-task">${esc(f.task)} ${fieldReq(t)}</label>
      <p class="field-hint" id="${id}-task-hint">${esc(f.taskHint)}</p>
      <textarea class="input textarea" id="${id}-task" name="task" rows="${compact ? 4 : 5}" maxlength="${L.task}" required placeholder="${esc(f.taskPlaceholder)}" aria-describedby="${id}-task-hint ${id}-task-err"></textarea>
      <p class="field-error" id="${id}-task-err" hidden></p>
    </div>
    <div class="field-wide">${dimsFields(t, id)}</div>
    <div class="field" data-field="quantity">
      <label class="field-label" for="${id}-quantity">${esc(f.quantity)} ${fieldOpt(t)}</label>
      <input class="input" id="${id}-quantity" name="quantity" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="${L.quantity}" autocomplete="off" data-int aria-describedby="${id}-quantity-hint ${id}-quantity-err">
      <p class="field-hint" id="${id}-quantity-hint">${esc(f.quantityHint)}</p>
      <p class="field-error" id="${id}-quantity-err" hidden></p>
    </div>
    <div class="field">
      <label class="field-label" for="${id}-print">${esc(f.print)} ${fieldOpt(t)}</label>
      <select class="input" id="${id}-print" name="print" aria-describedby="${id}-print-hint">
        <option value="">${esc(f.industryPlaceholder)}</option>
        ${Object.entries(t.form.printOptions)
          .map(([k, v]) => `<option value="${k}">${esc(v)}</option>`)
          .join('')}
      </select>
      <p class="field-hint" id="${id}-print-hint">${esc(t.form.printNote)}</p>
    </div>
    <div class="field field-wide"><label class="field-label" for="${id}-city">${esc(f.city)} ${fieldOpt(t)}</label><input class="input" id="${id}-city" name="city" type="text" autocomplete="address-level2" maxlength="${L.city}" placeholder="${esc(f.cityPlaceholder)}"></div>
    <div class="field-wide contact-block">${contactFields(t, id)}</div>
    <div class="field-wide">${filesField(t, id)}</div>
  </div>
  ${hiddenFields(id)}
  ${formFooter(t, id, t.form.submit)}
</form>
${successPanel(t, id)}`;
}

function successPanel(t, id) {
  return `<div class="form-success" data-success-for="${id}" tabindex="-1" hidden>
  <span class="success-icon"><svg class="i" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path class="check-path" d="M4.5 10.5l3.5 3.5 7.5-8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
  <p class="success-text" role="status">${esc(t.form.success)}</p>
  <button type="button" class="btn btn-secondary" data-success-reset>${esc(t.form.successNext)}</button>
</div>`;
}

// Step-by-step helper. Without JS it is a plain form with all questions visible.
function wizard(t) {
  const w = t.wizard;
  const L = config.form.limits;
  const id = 'wz';
  const what = ['textile', 'nuts', 'food', 'ecommerce', 'documents', 'other'];
  const total = 5;
  const stepHead = (n, q) =>
    `<legend class="wz-q"><span class="wz-count" data-step-count>${esc(fill(w.stepOf, { n, total }))}</span><span class="wz-qtext">${esc(q)}</span></legend>`;
  return `<section class="section section-alt" id="wizard" aria-labelledby="wizard-title">
  <div class="container wizard-wrap">
    <div class="wizard-intro">
      ${eyebrow(w.eyebrow)}
      <h2 id="wizard-title" class="words">${words(w.title)}</h2>
      <p class="lead">${esc(w.lead)}</p>
    </div>
    <div class="wizard-card">
      <div class="wz-progress" aria-hidden="true"><span data-wz-bar></span></div>
      <form class="wizard" id="${id}" action="/api/request" method="post" enctype="multipart/form-data" novalidate data-wizard data-request-form data-lang="${t.lang}">
        ${errorSummary(t)}
        <fieldset class="wz-step" data-step="1">
          ${stepHead(1, w.s1.q)}
          <div class="tiles">
            ${what.map((k) => `<label class="tile"><input type="radio" name="industry" value="${k}"><span>${esc(t.form.industries[k])}</span></label>`).join('')}
          </div>
          <p class="field-error" data-step-error hidden></p>
        </fieldset>
        <fieldset class="wz-step" data-step="2">
          ${stepHead(2, w.s2.q)}
          <div class="tiles tiles-2">
            <label class="tile"><input type="radio" name="knowSize" value="yes" checked data-know-size><span>${esc(w.s2.yes)}</span></label>
            <label class="tile"><input type="radio" name="knowSize" value="help" data-know-size><span>${esc(w.s2.help)}</span></label>
          </div>
          <div class="wz-sub" data-size-yes>${dimsFields(t, id)}</div>
          <div class="wz-sub field" data-size-help>
            <label class="field-label" for="${id}-task">${esc(w.s2.helpLabel)} ${fieldOpt(t)}</label>
            <p class="field-hint" id="${id}-task-hint">${esc(w.s2.helpHint)}</p>
            <textarea class="input textarea" id="${id}-task" name="task" rows="3" maxlength="${L.task}" aria-describedby="${id}-task-hint"></textarea>
          </div>
        </fieldset>
        <fieldset class="wz-step" data-step="3">
          ${stepHead(3, w.s3.q)}
          <div class="field" data-field="quantity">
            <label class="field-label" for="${id}-quantity">${esc(w.s3.label)} ${fieldOpt(t)}</label>
            <input class="input input-narrow" id="${id}-quantity" name="quantity" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="${L.quantity}" autocomplete="off" placeholder="${esc(w.s3.placeholder)}" data-int aria-describedby="${id}-quantity-hint ${id}-quantity-err">
            <p class="field-hint" id="${id}-quantity-hint">${esc(w.s3.hint)}</p>
            <p class="field-error" id="${id}-quantity-err" hidden></p>
          </div>
        </fieldset>
        <fieldset class="wz-step" data-step="4">
          ${stepHead(4, w.s4.q)}
          <div class="tiles tiles-3">
            ${Object.entries(t.form.printOptions)
              .map(
                ([k, v]) =>
                  `<label class="tile"><input type="radio" name="print" value="${k}"${k === 'undecided' ? ' checked' : ''}><span>${esc(v)}</span></label>`,
              )
              .join('')}
          </div>
          <p class="field-hint">${esc(w.s4.note)}</p>
        </fieldset>
        <fieldset class="wz-step" data-step="5">
          ${stepHead(5, w.s5.q)}
          <p class="field-hint">${esc(w.s5.hint)}</p>
          ${contactFields(t, id)}
        </fieldset>
        <div class="wz-summary" data-summary hidden tabindex="-1">
          <h3 class="wz-sum-title">${esc(w.summaryTitle)}</h3>
          <p class="field-hint">${esc(w.summaryLead)}</p>
          <dl class="sum-list">
            ${['what', 'size', 'qty', 'print', 'contact'].map((k, i) => `<div><dt>${esc(w.sum[k])}</dt><dd data-sum="${k}"></dd><dd class="sum-edit"><button type="button" class="link-btn" data-goto="${i + 1}">${esc(w.edit)}<span class="sr-only">: ${esc(w.sum[k])}</span></button></dd></div>`).join('')}
          </dl>
        </div>
        ${hiddenFields(id)}
        <div class="wz-nav" data-wz-nav hidden>
          <button type="button" class="btn btn-secondary" data-wz-back>${esc(w.back)}</button>
          <button type="button" class="btn btn-primary" data-wz-next data-label-next="${esc(w.next)}" data-label-summary="${esc(w.toSummary)}">${esc(w.next)}${I.arrow}</button>
        </div>
        <div class="wz-final" data-wz-final>
          ${formFooter(t, id, t.form.submit)}
        </div>
      </form>
      ${successPanel(t, id)}
    </div>
  </div>
</section>`;
}

// --- pages ---
function pageHome(t) {
  const org = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'QADOQLAB',
    description: t.meta.home.description,
    email: EMAIL,
    ...(DOMAIN ? { url: abs(`/${t.lang}/`), logo: abs('/apple-touch-icon.png') } : {}),
    areaServed: { '@type': 'Country', name: 'Uzbekistan' },
  };
  // "<" is escaped so no text from the settings can close the script element.
  const jsonld = `<script type="application/ld+json">${JSON.stringify(org).replace(/</g, '\\u003c')}</script>`;
  return layout(
    t,
    { current: 'home', pathKey: 'home', title: t.meta.home.title, description: t.meta.home.description, jsonld },
    [
      hero(t),
      principles(t),
      catalogSection(t),
      businessSection(t),
      compareSection(t),
      wizard(t),
      stepsSection(t),
      faqSection(t),
      finalCta(t),
    ].join('\n'),
  );
}

function pageHead(t, h1, lead, crumbs = null) {
  return `<section class="page-head">
  <div class="container">
    ${crumbs || ''}
    <h1>${esc(h1)}</h1>
    ${lead ? `<p class="lead page-lead">${esc(lead)}</p>` : ''}
  </div>
</section>`;
}

function breadcrumbs(t, items) {
  return `<nav class="crumbs" aria-label="${esc(t.a11y.breadcrumbs)}"><ol>${items.map((it, i) => (i === items.length - 1 ? `<li><span aria-current="page">${esc(it[0])}</span></li>` : `<li><a href="${it[1]}">${esc(it[0])}</a></li>`)).join('')}</ol></nav>`;
}

function pageCatalog(t) {
  const list = published();
  const lang = t.lang;
  const body = `${pageHead(t, t.catalogPage.h1, t.catalogPage.lead, breadcrumbs(t, [[t.nav.home, href(lang, 'home')], [t.catalogPage.h1]]))}
<section class="section section-tight">
  <div class="container">
    ${list.length ? `<div class="cat-grid">${list.map((c) => catCard(t, c, { headingLevel: 2 })).join('')}</div>` : catalogEmpty(t, { headingLevel: 2 })}
  </div>
</section>
${list.length ? `<section class="section section-tight"><div class="container"><div class="help-band reveal"><div><h2 class="h3">${esc(t.catalogPage.helpTitle)}</h2><p>${esc(t.catalogPage.helpText)}</p></div><div class="btn-row"><a class="btn btn-primary" href="${href(lang, 'request')}#request-form" data-track="cta" data-cta="catalog-help">${esc(t.cta.discuss)}${I.arrow}</a><a class="btn btn-secondary" href="${href(lang, 'home')}#wizard">${esc(t.cta.pick)}</a></div></div></div></section>` : ''}
${stepsSection(t, true)}
${finalCta(t)}`;
  return layout(
    t,
    { current: 'catalog', pathKey: 'catalog', title: t.meta.catalog.title, description: t.meta.catalog.description },
    body,
  );
}

function pageCategory(t, cat) {
  const c = cat[t.lang];
  const lang = t.lang;
  const cp = t.categoryPage;
  const related = published()
    .filter((x) => x.slug !== cat.slug)
    .slice(0, 3);
  const crumbs = breadcrumbs(t, [
    [t.nav.home, href(lang, 'home')],
    [t.catalogPage.h1, href(lang, 'catalog')],
    [c.name],
  ]);
  const body = `<section class="page-head page-head-product">
  <div class="container product-grid">
    <div class="product-copy">
      ${crumbs}
      ${DEMO && config.catalogPublished[cat.slug] !== true ? `<span class="tag-demo">${esc(t.demoTag)}</span>` : ''}
      <h1>${esc(c.name)}</h1>
      <p class="lead">${esc(c.intro)}</p>
      <h2 class="mini-title">${esc(cp.usesTitle)}</h2>
      <ul class="check-list">${c.uses.map((u) => `<li>${I.check}<span>${esc(u)}</span></li>`).join('')}</ul>
      <div class="btn-row"><a class="btn btn-primary" href="#request-form" data-track="cta" data-cta="product">${esc(t.cta.calcThis)}${I.arrow}</a></div>
    </div>
    <figure class="product-figure">${img(cat.art, c.alt, { eager: true, vt: cat.slug })}<figcaption class="illus-caption">${esc(t.illustrationLabel)}</figcaption></figure>
  </div>
</section>
<section class="section section-alt" aria-labelledby="params-title">
  <div class="container split">
    <div class="split-aside">
      <h2 id="params-title" class="words">${words(cp.paramsTitle)}</h2>
      <p class="muted">${esc(cp.paramsNote)}</p>
    </div>
    <ol class="params split-main">${cp.params.map((p, i) => `<li><span class="num">${String(i + 1).padStart(2, '0')}</span>${esc(p)}</li>`).join('')}</ol>
  </div>
</section>
<section class="section" id="request-form" aria-labelledby="pf-title">
  <div class="container form-layout">
    <div class="form-intro">
      <h2 id="pf-title" class="words">${words(cp.formTitle)}</h2>
      <p class="lead">${esc(cp.formLead)}</p>
    </div>
    <div class="form-card">${requestForm(t, { id: 'pf', presetType: cat.slug, compact: true })}</div>
  </div>
</section>
${related.length ? `<section class="section section-alt" aria-labelledby="related-title"><div class="container"><h2 id="related-title" class="section-title-sm words">${words(cp.relatedTitle)}</h2><div class="cat-grid cat-grid-3">${related.map((r) => catCard(t, r)).join('')}</div></div></section>` : ''}`;
  return layout(
    t,
    {
      current: 'catalog',
      pathKey: 'category',
      slug: cat.slug,
      title: c.name + t.meta.category.titleSuffix,
      description: `${c.short} ${c.intro}`.slice(0, 158).replace(/\s+\S*$/, '') + '…',
    },
    body,
  );
}

function pageBusiness(t) {
  const lang = t.lang;
  const b = t.business;
  const body = `${pageHead(t, b.pageH1, b.pageLead, breadcrumbs(t, [[t.nav.home, href(lang, 'home')], [b.pageH1]]))}
<section class="section section-tight" aria-labelledby="biz-title">
  <div class="container split">
    <div class="split-aside">
      <h2 id="biz-title" class="words">${words(b.title)}</h2>
      <p class="lead">${esc(b.lead)}</p>
      ${foodNote(t)}
    </div>
    <div class="split-main">${businessList(t)}</div>
  </div>
</section>
<section class="section section-alt" aria-labelledby="aud-title">
  <div class="container two-col">
    <div>
      <h2 id="aud-title" class="h3">${esc(b.audienceTitle)}</h2>
      <ul class="check-list">${b.audience.map((a) => `<li>${I.check}<span>${esc(a)}</span></li>`).join('')}</ul>
    </div>
    <div>
      <h2 class="h3">${esc(b.geoTitle)}</h2>
      <p>${esc(b.geoText)}</p>
    </div>
  </div>
</section>
${compareSection(t)}
${finalCta(t)}`;
  return layout(
    t,
    {
      current: 'business',
      pathKey: 'business',
      title: t.meta.business.title,
      description: t.meta.business.description,
    },
    body,
  );
}

function galleryBlock(t) {
  const lang = t.lang;
  const g = DEMO
    ? {
        samples: [{ demo: 'transport' }, { demo: 'open' }, { demo: 'archive' }],
        construction: [{ demo: 'dieline' }, { demo: 'mailer' }],
        printing: [],
        production: [],
      }
    : config.gallery;
  const sections = Object.entries(g).filter(([, items]) => items.length);
  if (!sections.length) return '';
  const item = (it) => {
    if (it.demo)
      return `<figure class="gal-item">${img(it.demo, t.illustrationLabel)}<figcaption>${esc(t.illustrationLabel)} · <span class="tag-demo">${esc(t.demoTag)}</span></figcaption></figure>`;
    return `<figure class="gal-item"><img src="${esc(it.src)}" width="${it.width}" height="${it.height}" alt="${esc(it.alt[lang])}" loading="lazy" decoding="async">${it.caption?.[lang] || it.illustration ? `<figcaption>${esc(it.caption?.[lang] || '')}${it.illustration ? ` ${esc(t.illustrationLabel)}` : ''}</figcaption>` : ''}</figure>`;
  };
  return `<section class="section" aria-labelledby="gal-title"><div class="container">
    <div class="section-head reveal">${eyebrow(t.gallery.eyebrow)}<h2 id="gal-title" class="words">${words(t.gallery.title)}</h2></div>
    ${sections.map(([k, items]) => `<div class="gal-group"><h3 class="mini-title">${esc(t.gallery.tabs[k])}</h3><div class="gal-grid">${items.map(item).join('')}</div></div>`).join('')}
  </div></section>`;
}

function aboutPhotos(t) {
  const lang = t.lang;
  const sections = Object.entries(config.aboutPhotos).filter(([, items]) => items.length);
  if (!sections.length) return '';
  return `<section class="section section-alt" aria-labelledby="photos-title"><div class="container">
    <h2 id="photos-title">${esc(t.about.photosTitle)}</h2>
    ${sections.map(([k, items]) => `<div class="gal-group"><h3 class="mini-title">${esc(t.about.sections[k])}</h3><div class="gal-grid">${items.map((it) => `<figure class="gal-item"><img src="${esc(it.src)}" width="${it.width}" height="${it.height}" alt="${esc(it.alt[lang])}" loading="lazy" decoding="async">${it.caption?.[lang] ? `<figcaption>${esc(it.caption[lang])}</figcaption>` : ''}</figure>`).join('')}</div></div>`).join('')}
  </div></section>`;
}

function pageAbout(t) {
  const lang = t.lang;
  const a = t.about;
  const body = `<section class="page-head">
  <div class="container">
    ${breadcrumbs(t, [[t.nav.home, href(lang, 'home')], [a.h1]])}
    <h1>${esc(a.h1)}</h1>
  </div>
</section>
<section class="section section-tight">
  <div class="container about-grid">
    <div class="about-copy">
      <h2 class="words">${words(a.title)}</h2>
      ${a.paragraphs.map((p, i) => `<p${i === 0 ? ' class="lead"' : ''}>${esc(p)}</p>`).join('')}
      <div class="btn-row"><a class="btn btn-primary" href="${href(lang, 'request')}" data-track="cta" data-cta="about">${esc(t.cta.primary)}${I.arrow}</a></div>
    </div>
    <figure class="about-figure">${img('about', a.composeAlt)}<figcaption class="illus-caption">${esc(t.illustrationLabel)}</figcaption></figure>
  </div>
</section>
<section class="section section-alt" aria-labelledby="ap-title">
  <div class="container">
    <h2 id="ap-title" class="section-title-sm words">${words(a.principlesTitle)}</h2>
    <ol class="principles-list principles-list-plain">
      ${a.principles.map((it, i) => `<li class="reveal"><span class="num">0${i + 1}</span><h3>${esc(it.t)}</h3><p>${esc(it.d)}</p></li>`).join('')}
    </ol>
  </div>
</section>
${aboutPhotos(t)}
${galleryBlock(t)}
${stepsSection(t)}
${finalCta(t)}`;
  return layout(
    t,
    { current: 'about', pathKey: 'about', title: t.meta.about.title, description: t.meta.about.description },
    body,
  );
}

function pageRequest(t) {
  const lang = t.lang;
  const body = `<section class="page-head page-head-form">
  <div class="container">
    ${breadcrumbs(t, [[t.nav.home, href(lang, 'home')], [t.nav.request]])}
    ${eyebrow(t.form.eyebrow)}
    <h1>${esc(t.form.title)}</h1>
    <p class="lead page-lead">${esc(t.form.lead)}</p>
  </div>
</section>
<section class="section section-tight" id="request-form">
  <div class="container form-layout form-layout-page">
    <div class="form-card">${requestForm(t, { id: 'rf' })}</div>
    <aside class="form-aside">
      <h2 class="h3">${esc(t.steps.title)}</h2>
      <ol class="steps-compact">${t.steps.items.map((s) => `<li><span class="step-num">${s.n}</span><div><strong>${esc(s.t)}</strong><p>${esc(s.d)}</p></div></li>`).join('')}</ol>
      <div class="aside-card">
        <p>${fill(esc(t.form.filesByEmail), { email: `<a class="mail-link" href="${mailto(lang)}" data-track="email">${esc(EMAIL)}</a>` })}</p>
      </div>
      <p class="aside-link"><a class="link-arrow" href="${href(lang, 'home')}#wizard">${esc(t.cta.pick)}${I.arrow}</a></p>
    </aside>
  </div>
</section>`;
  return layout(
    t,
    { current: 'request', pathKey: 'request', title: t.meta.request.title, description: t.meta.request.description },
    body,
  );
}

function pageContacts(t) {
  const lang = t.lang;
  const c = t.contacts;
  const co = config.contacts;
  const map =
    co.coordinates && co.address[lang]
      ? `<section class="section section-tight" aria-labelledby="map-title"><div class="container"><h2 id="map-title" class="h3">${esc(c.mapTitle)}</h2><p><a class="link-arrow" href="https://www.openstreetmap.org/?mlat=${co.coordinates.lat}&amp;mlon=${co.coordinates.lng}#map=17/${co.coordinates.lat}/${co.coordinates.lng}" rel="noopener">${esc(co.address[lang])}${I.arrow}</a></p></div></section>`
      : '';
  const body = `${pageHead(t, c.h1, null, breadcrumbs(t, [[t.nav.home, href(lang, 'home')], [c.h1]]))}
<section class="section section-tight">
  <div class="container contacts-grid">
    <div class="contact-card">
      <p class="contact-brand">QADOQLAB</p>
      <p class="muted">${esc(c.lead)}</p>
      <dl class="contact-dl"><div><dt>${esc(c.emailLabel)}</dt><dd><a class="contact-email" href="${mailto(lang)}" data-track="email">${esc(EMAIL)}</a></dd></div></dl>
      ${contactExtras(t, 'page')}
      <a class="btn btn-primary btn-lg" href="${mailto(lang)}" data-track="email">${I.mail}${esc(t.cta.email)}</a>
      <p class="contact-sign">${esc(config.brand.signature[lang])}</p>
    </div>
    <div class="contact-side">
      <h2 class="h3">${esc(c.whatTitle)}</h2>
      <ul class="check-list">${c.what.map((x) => `<li>${I.check}<span>${esc(x)}</span></li>`).join('')}</ul>
      <div class="aside-card">
        <p>${esc(c.formHint)}</p>
        <a class="link-arrow" href="${href(lang, 'request')}" data-track="cta" data-cta="contacts">${esc(t.cta.primary)}${I.arrow}</a>
      </div>
    </div>
  </div>
</section>
${map}
${faqSection(t)}`;
  return layout(
    t,
    {
      current: 'contacts',
      pathKey: 'contacts',
      title: t.meta.contacts.title,
      description: t.meta.contacts.description,
    },
    body,
  );
}

function pagePrivacy(t) {
  const lang = t.lang;
  const sections = privacyText[lang](config);
  const body = `${pageHead(t, t.privacy.h1, null, breadcrumbs(t, [[t.nav.home, href(lang, 'home')], [t.privacy.h1]]))}
<section class="section section-tight"><div class="container prose">${sections}</div></section>`;
  return layout(
    t,
    { current: 'privacy', pathKey: 'privacy', title: t.meta.privacy.title, description: t.meta.privacy.description },
    body,
  );
}

function page404() {
  const t = dict.ru;
  const u = dict.uz;
  const body = `<section class="page-head page-404"><div class="container">
  <p class="eyebrow">404</p>
  <h1>${esc(t.notFound.h1)}</h1>
  <p class="lead">${esc(t.notFound.text)}</p>
  <div class="btn-row"><a class="btn btn-primary" href="/ru/">${esc(t.notFound.home)}</a><a class="btn btn-secondary" href="/ru/catalog/">${esc(t.nav.catalog)}</a></div>
  <div class="nf-alt" lang="uz">
    <h2 class="h3">${esc(u.notFound.h1)}</h2>
    <p>${esc(u.notFound.text)}</p>
    <a class="link-arrow" href="/uz/">${esc(u.notFound.home)}${I.arrow}</a>
  </div>
</div></section>`;
  return layout(
    t,
    {
      current: '404',
      pathKey: null,
      title: `${t.meta.notFound.title}`,
      description: t.meta.notFound.description,
      noindex: true,
    },
    body,
  );
}

function rootIndex() {
  // Root: language choice. The server redirects by cookie; this page covers static hosting.
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>QADOQLAB</title>
${INDEXABLE ? '' : '<meta name="robots" content="noindex, nofollow">'}
${DOMAIN ? `<link rel="alternate" hreflang="ru" href="${abs('/ru/')}"><link rel="alternate" hreflang="uz" href="${abs('/uz/')}"><link rel="alternate" hreflang="x-default" href="${abs('/ru/')}"><link rel="canonical" href="${abs('/ru/')}">` : ''}
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="${ASSETS.css}">
<script src="${ASSETS.root}"></script>
</head>
<body class="root-pick">
<main class="container root-main">
  <p class="logo">${markSvg()}<span class="logo-word">QADOQLAB</span></p>
  <p><a class="btn btn-primary" href="/ru/" hreflang="ru" lang="ru" data-lang-switch="ru">Русский</a> <a class="btn btn-secondary" href="/uz/" hreflang="uz" lang="uz" data-lang-switch="uz">O‘zbekcha</a></p>
</main>
</body>
</html>`;
}

// --- assets ---
const ASSETS = {};
function buildAssets() {
  const src = path.join(ROOT, 'src', 'assets');
  let css = fs.readFileSync(path.join(src, 'styles.css'), 'utf8');
  // fonts get a content hash in the name so they can be cached for a year
  ASSETS.fonts = {};
  for (const f of fs.readdirSync(path.join(src, 'fonts'))) {
    if (!f.endsWith('.woff2')) {
      fs.copyFileSync(path.join(src, 'fonts', f), path.join(OUT, 'assets', 'fonts', f));
      continue;
    }
    const buf = fs.readFileSync(path.join(src, 'fonts', f));
    const name = f.replace('.woff2', `.${crypto.createHash('sha256').update(buf).digest('hex').slice(0, 10)}.woff2`);
    fs.writeFileSync(path.join(OUT, 'assets', 'fonts', name), buf);
    ASSETS.fonts[f] = `/assets/fonts/${name}`;
    css = css.split(`/assets/fonts/${f}`).join(ASSETS.fonts[f]);
  }
  // Shared-element transitions: the picture on a box type's page always carries a name; a card
  // gets the same name only when it is clicked (.vt-go, set by app.js), so exactly one box
  // flies from the card into the page instead of every card on screen.
  css += catalog
    .map((c) => `.product-figure [data-vt="${c.slug}"],.vt-go[data-vt="${c.slug}"]{view-transition-name:box-${c.slug}}`)
    .join('\n');

  // Simple minification. A space before ":" is kept: it matters in selectors like ".a :focus".
  const minCss = css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([{};,>])\s*/g, '$1')
    .replace(/:\s+/g, ':')
    .replace(/;}/g, '}')
    .trim();
  const cssName = `styles.${hash(minCss)}.css`;
  write(`assets/${cssName}`, minCss);
  ASSETS.css = `/assets/${cssName}`;

  // Client strings: only what the script needs (form messages, category names for the chip).
  const clientI18n = {};
  for (const l of config.languages) {
    const t = dict[l];
    clientI18n[l] = {
      form: { ...t.form, fields: undefined, mail: t.form.mail },
      wizard: { sum: t.wizard.sum, stepOf: t.wizard.stepOf },
      industries: t.form.industries,
      printOptions: t.form.printOptions,
      dims: {
        mm: t.form.fields.mm,
        cm: t.form.fields.cm,
        inner: t.form.fields.inner,
        outer: t.form.fields.outer,
        unknown: t.form.fields.unknown,
        dimType: t.form.fields.dimType,
      },
      channels: t.form.channels,
      types: Object.fromEntries(catalog.filter(isPublished).map((c) => [c.slug, c[l].name])),
      compareTopic: t.compare.titleLines[1],
      mailSubject: config.form.mailSubject[l],
    };
  }
  const clientCfg = {
    email: EMAIL,
    maxFiles: config.form.maxFiles,
    maxFileSizeMb: config.form.maxFileSizeMb,
    allowedTypes: config.form.allowedTypes,
    limits: config.form.limits,
    i18n: clientI18n,
  };
  // Light minification: drop indentation, blank lines and comment lines (app.js has no multi-line strings).
  const js = fs
    .readFileSync(path.join(src, 'app.js'), 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('//'))
    .join('\n')
    .replace(/\/\*__CONFIG__\*\/\s*null/, () => JSON.stringify(clientCfg));
  if (js.includes('__CONFIG__')) throw new Error('app.js: client config placeholder was not replaced');
  const jsName = `app.${hash(js)}.js`;
  write(`assets/${jsName}`, js);
  ASSETS.js = `/assets/${jsName}`;

  const root =
    "(function(){try{var l=localStorage.getItem('qadoqlab-lang');if(l!=='ru'&&l!=='uz'){l=(navigator.language||'').toLowerCase().indexOf('uz')===0?'uz':'ru';}location.replace('/'+l+'/');}catch(e){location.replace('/ru/');}})();";
  const rootName = `root.${hash(root)}.js`;
  write(`assets/${rootName}`, root);
  ASSETS.root = `/assets/${rootName}`;

  // photos uploaded in the admin panel
  const media = path.join(config.dataDir(), 'media');
  if (fs.existsSync(media)) {
    fs.mkdirSync(path.join(OUT, 'media'), { recursive: true });
    for (const f of fs.readdirSync(media))
      if (/^[a-f0-9]{16}\.(jpg|png|webp)$/.test(f)) fs.copyFileSync(path.join(media, f), path.join(OUT, 'media', f));
  }
  const stat = path.join(ROOT, 'src', 'static');
  for (const f of fs.readdirSync(stat))
    fs.copyFileSync(path.join(stat, f), path.join(OUT, f === 'og.jpg' ? 'assets/og.jpg' : f));
}

// --- SEO files ---
function seoFiles(pages) {
  if (INDEXABLE) {
    write(
      'robots.txt',
      `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /admin/\n\nSitemap: ${DOMAIN}/sitemap.xml\n`,
    );
    const urls = pages
      .filter((p) => p.pathKey)
      .map((p) => {
        const alts = config.languages
          .map((l) => `<xhtml:link rel="alternate" hreflang="${l}" href="${abs(href(l, p.pathKey, p.slug))}"/>`)
          .join('');
        return `<url><loc>${abs(href(p.lang, p.pathKey, p.slug))}</loc>${alts}<xhtml:link rel="alternate" hreflang="x-default" href="${abs(href(config.defaultLanguage, p.pathKey, p.slug))}"/></url>`;
      });
    write(
      'sitemap.xml',
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls.join('\n')}\n</urlset>\n`,
    );
  } else {
    // No domain yet, or a demo build: keep crawlers out.
    write('robots.txt', 'User-agent: *\nDisallow: /\n');
  }
}

// --- build ---
function main() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(path.join(OUT, 'assets', 'fonts'), { recursive: true });
  buildAssets();
  buildImages();
  const pages = [];
  for (const lang of config.languages) {
    const t = dict[lang];
    const add = (rel, html, pathKey, slug) => {
      write(rel, html);
      pages.push({ lang, pathKey, slug });
    };
    add(`${lang}/index.html`, pageHome(t), 'home');
    add(`${lang}/catalog/index.html`, pageCatalog(t), 'catalog');
    for (const cat of published())
      add(`${lang}/catalog/${cat.slug}/index.html`, pageCategory(t, cat), 'category', cat.slug);
    add(`${lang}/business/index.html`, pageBusiness(t), 'business');
    add(`${lang}/about/index.html`, pageAbout(t), 'about');
    add(`${lang}/request/index.html`, pageRequest(t), 'request');
    add(`${lang}/contacts/index.html`, pageContacts(t), 'contacts');
    if (privacyReady()) add(`${lang}/privacy/index.html`, pagePrivacy(t), 'privacy');
  }
  write('404.html', page404());
  write('index.html', rootIndex());
  seoFiles(pages);
  // Metadata for the server: inline script hash for the CSP and the published paths.
  const inlineHash = crypto.createHash('sha256').update(INLINE_JS).digest('base64');
  write(
    '_build.json',
    JSON.stringify(
      {
        demo: DEMO,
        indexable: INDEXABLE,
        css: ASSETS.css,
        scriptHashes: [`sha256-${inlineHash}`],
        pages: pages.map((p) => href(p.lang, p.pathKey, p.slug)),
        builtAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  console.log(
    `✓ ${DEMO ? 'demo' : 'public'} build → ${path.relative(ROOT, OUT)}/ (${pages.length} pages${INDEXABLE ? '' : ', noindex: domain not set'})`,
  );
}

main();
