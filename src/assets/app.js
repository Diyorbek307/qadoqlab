/* QADOQLAB site script. No dependencies, no build step. */
(function () {
  'use strict';
  var CFG = /*__CONFIG__*/ null;
  var doc = document;
  var html = doc.documentElement;
  var body = doc.body;
  var lang = html.lang === 'uz' ? 'uz' : 'ru';
  var T = CFG.i18n[lang];
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function $(sel, root) {
    return (root || doc).querySelector(sel);
  }
  function $$(sel, root) {
    return Array.prototype.slice.call((root || doc).querySelectorAll(sel));
  }
  function fill(s, vars) {
    return String(s).replace(/\{(\w+)\}/g, function (m, k) {
      return vars[k] != null ? vars[k] : m;
    });
  }
  var SVG_NS = 'http://www.w3.org/2000/svg';
  var ICONS = {
    alert: [
      ['circle', { cx: 10, cy: 10, r: 7.5, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.6 }],
      ['path', { d: 'M10 6v5', stroke: 'currentColor', 'stroke-width': 1.8, 'stroke-linecap': 'round' }],
      ['circle', { cx: 10, cy: 13.8, r: 1.1, fill: 'currentColor' }],
    ],
    mail: [
      [
        'path',
        {
          d: 'M3 5.5h14v9H3z M3.5 6l6.5 5 6.5-5',
          fill: 'none',
          stroke: 'currentColor',
          'stroke-width': 1.5,
          'stroke-linejoin': 'round',
        },
      ],
    ],
  };

  function icon(name) {
    var svg = doc.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'i');
    svg.setAttribute('viewBox', '0 0 20 20');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    ICONS[name].forEach(function (shape) {
      var node = doc.createElementNS(SVG_NS, shape[0]);
      Object.keys(shape[1]).forEach(function (k) {
        node.setAttribute(k, shape[1][k]);
      });
      svg.appendChild(node);
    });
    return svg;
  }

  function emailLink() {
    var a = doc.createElement('a');
    a.href = 'mailto:' + CFG.email + '?subject=' + encodeURIComponent(T.mailSubject);
    a.textContent = CFG.email;
    return a;
  }

  // Text with an optional {email} placeholder, rendered as text nodes plus a mailto link.
  function textWithEmail(template) {
    var span = doc.createElement('span');
    String(template)
      .split('{email}')
      .forEach(function (part, i) {
        if (i) span.appendChild(emailLink());
        span.appendChild(doc.createTextNode(part));
      });
    return span;
  }

  function message(name, text) {
    var span = doc.createElement('span');
    span.textContent = text;
    return [icon(name), span];
  }

  // --- analytics ---
  // Events carry only whitelisted parameters: never names, contacts, request text or files.
  var SAFE = ['cta', 'category', 'industry', 'mode', 'reason', 'to', 'form'];
  var GA4 = html.getAttribute('data-ga4');
  var YM = html.getAttribute('data-ym');
  function track(event, params) {
    var p = { lang: lang, page: body.getAttribute('data-page') || '' };
    params = params || {};
    SAFE.forEach(function (k) {
      if (params[k] != null && params[k] !== '') p[k] = String(params[k]).slice(0, 40);
    });
    try {
      window.dataLayer = window.dataLayer || [];
      if (window.gtag) window.gtag('event', event, p);
      if (window.ym && YM) window.ym(+YM, 'reachGoal', event, p);
    } catch (e) {
      /* analytics must never break the page */
    }
  }
  function loadScript(src) {
    var s = doc.createElement('script');
    s.async = true;
    s.src = src;
    doc.head.appendChild(s);
  }
  if (GA4 && /^G-[A-Z0-9]+$/.test(GA4)) {
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () {
      window.dataLayer.push(arguments);
    };
    window.gtag('js', new Date());
    window.gtag('config', GA4, { anonymize_ip: true });
    loadScript('https://www.googletagmanager.com/gtag/js?id=' + GA4);
  }
  if (YM && /^\d+$/.test(YM)) {
    window.ym =
      window.ym ||
      function () {
        (window.ym.a = window.ym.a || []).push(arguments);
      };
    window.ym.l = +new Date();
    loadScript('https://mc.yandex.ru/metrika/tag.js');
    window.ym(+YM, 'init', { clickmap: false, trackLinks: true, accurateTrackBounce: true, webvisor: false });
  }

  doc.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a, button');
    if (!a) return;
    if (a.hasAttribute('data-track')) {
      var kind = a.getAttribute('data-track');
      if (kind === 'cta') track('cta_click', { cta: a.getAttribute('data-cta') });
      else if (kind === 'email') track('email_click');
      else if (kind === 'category') track('category_select', { category: a.getAttribute('data-category') });
      else if (kind === 'industry') track('industry_select', { industry: a.getAttribute('data-industry') });
      else track(kind + '_click');
    } else if (a.getAttribute('href') && a.getAttribute('href').indexOf('mailto:') === 0) {
      track('email_click');
    }
  });

  // --- language ---
  function rememberLang(l) {
    try {
      localStorage.setItem('qadoqlab-lang', l);
    } catch (e) {
      /* storage blocked, e.g. private mode */
    }
    doc.cookie = 'qadoqlab_lang=' + l + '; path=/; max-age=31536000; SameSite=Lax';
  }
  rememberLang(lang);
  $$('[data-lang-switch]').forEach(function (a) {
    a.addEventListener('click', function () {
      var to = a.getAttribute('data-lang-switch');
      rememberLang(to);
      track('language_switch', { to: to });
      // keep the query, e.g. the selected box type
      if (location.search || location.hash) {
        var base = a.getAttribute('href').split('#')[0].split('?')[0];
        a.setAttribute('href', base + location.search + location.hash);
      }
    });
  });

  // --- header and menu ---
  var header = $('[data-header]');
  var toggle = $('[data-menu-toggle]');
  var menu = $('[data-mobile-menu]');
  function onScroll() {
    if (header) header.classList.toggle('is-scrolled', window.scrollY > 8);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  var menuTimer = 0;
  function setMenu(open, restoreFocus) {
    if (!toggle || !menu) return;
    toggle.setAttribute('aria-expanded', String(open));
    var label = toggle.querySelector('.sr-only');
    label.textContent = open ? label.getAttribute('data-label-close') : label.getAttribute('data-label-open');
    clearTimeout(menuTimer);
    html.classList.toggle('menu-open', open);
    if (open) {
      menu.hidden = false;
      $$('.mobile-nav li, .mobile-menu-foot > *', menu).forEach(function (el, i) {
        el.style.setProperty('--i', i);
      });
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          menu.classList.add('is-open');
        });
      });
      var first = menu.querySelector('a');
      if (first) first.focus({ preventScroll: true });
    } else {
      menu.classList.toggle('is-open', false);
      menuTimer = setTimeout(
        function () {
          menu.hidden = true;
        },
        reduceMotion ? 0 : 280,
      );
      if (restoreFocus) toggle.focus();
    }
    updateSticky();
  }
  if (toggle && menu) {
    toggle.addEventListener('click', function () {
      setMenu(toggle.getAttribute('aria-expanded') !== 'true', false);
    });
    doc.addEventListener('keydown', function (e) {
      if (toggle.getAttribute('aria-expanded') !== 'true') return;
      if (e.key === 'Escape') {
        e.preventDefault();
        setMenu(false, true);
        return;
      }
      if (e.key === 'Tab') {
        // keep focus inside the header while the menu is open
        var items = [toggle].concat($$('a, button', menu)).filter(function (el) {
          return el.offsetParent !== null;
        });
        var i = items.indexOf(doc.activeElement);
        if (e.shiftKey && i <= 0) {
          e.preventDefault();
          items[items.length - 1].focus();
        } else if (!e.shiftKey && i === items.length - 1) {
          e.preventDefault();
          items[0].focus();
        } else if (i === -1) {
          e.preventDefault();
          items[0].focus();
        }
      }
    });
    menu.addEventListener('click', function (e) {
      if (e.target.closest('a')) setMenu(false, false);
    });
    var mq = window.matchMedia('(min-width: 961px)');
    var onMq = function () {
      if (mq.matches && toggle.getAttribute('aria-expanded') === 'true') setMenu(false, false);
    };
    if (mq.addEventListener) mq.addEventListener('change', onMq);
    else mq.addListener(onMq);
  }

  // --- hero: boxes get taped and opened (SMIL inside the inline SVG) ---
  var heroStart = doc.getElementById('hxGo');
  if (heroStart && typeof heroStart.beginElement === 'function' && !reduceMotion) heroStart.beginElement();

  // --- reveal on scroll ---
  if ('IntersectionObserver' in window && !reduceMotion) {
    // Headings split into words get an index for the stagger.
    $$('.words').forEach(function (heading) {
      $$('.wi', heading).forEach(function (word, i) {
        word.style.setProperty('--wi', Math.min(i, 12));
      });
    });
    var revealEls = $$('.reveal, .words');
    if (revealEls.length) {
      var ro = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (en) {
            if (en.isIntersecting) {
              en.target.classList.add('is-in');
              ro.unobserve(en.target);
            }
          });
        },
        { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
      );
      // Read all positions first, then write: interleaving the two forces a layout per element.
      var viewport = window.innerHeight;
      var onScreen = revealEls.map(function (el) {
        return el.getBoundingClientRect().top < viewport;
      });
      revealEls.forEach(function (el, i) {
        // stagger siblings so blocks appear one after another
        var siblings = Array.prototype.filter.call(el.parentNode.children, function (c) {
          return c.classList.contains('reveal');
        });
        if (siblings.length) el.style.setProperty('--d', Math.min(Math.max(siblings.indexOf(el), 0), 6));
        if (onScreen[i]) el.classList.add('is-in'); // already on screen: no animation
        ro.observe(el);
      });
      html.classList.add('reveal-ready');
    }
  }

  // --- sticky mobile CTA ---
  var sticky = $('[data-sticky-cta]');
  var stickyState = { past: false, blockers: 0, focused: false };
  function updateSticky() {
    if (!sticky) return;
    var show =
      stickyState.past && stickyState.blockers === 0 && !stickyState.focused && !html.classList.contains('menu-open');
    sticky.classList.toggle('is-visible', show);
    if (show) {
      sticky.removeAttribute('inert');
      sticky.removeAttribute('aria-hidden');
    } else {
      sticky.setAttribute('inert', '');
      sticky.setAttribute('aria-hidden', 'true');
    }
  }
  if (sticky && 'IntersectionObserver' in window) {
    sticky.hidden = false;
    updateSticky();
    var visible = new Set();
    var bo = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) visible.add(en.target);
        else visible.delete(en.target);
      });
      stickyState.blockers = visible.size;
      updateSticky();
    });
    // hidden while a form, the final CTA or the hero buttons are on screen
    $$('.form-card, .wizard-card, .final-cta, .hero .btn-row, .site-footer').forEach(function (el) {
      bo.observe(el);
    });
    window.addEventListener(
      'scroll',
      function () {
        stickyState.past = window.scrollY > 420;
        updateSticky();
      },
      { passive: true },
    );
    // hide it while typing so it does not sit on top of the keyboard
    doc.addEventListener('focusin', function (e) {
      if (e.target.matches('input, textarea, select')) {
        stickyState.focused = true;
        updateSticky();
      }
    });
    doc.addEventListener('focusout', function () {
      stickyState.focused = false;
      setTimeout(updateSticky, 50);
    });
  }

  // --- motion details ---
  var finePointer = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  // scroll progress line in the header
  if (header) {
    var bar = doc.createElement('span');
    bar.className = 'scroll-progress';
    bar.setAttribute('aria-hidden', 'true');
    header.appendChild(bar);
    var spTick = false;
    var updSp = function () {
      spTick = false;
      var max = doc.documentElement.scrollHeight - window.innerHeight;
      bar.style.setProperty('--sp', max > 0 ? Math.min(1, window.scrollY / max).toFixed(4) : 0);
    };
    window.addEventListener(
      'scroll',
      function () {
        if (!spTick) {
          spTick = true;
          requestAnimationFrame(updSp);
        }
      },
      { passive: true },
    );
    updSp();
  }

  // pointer highlight on buttons and cards
  if (finePointer) {
    doc.addEventListener(
      'pointermove',
      function (e) {
        var t = e.target.closest && e.target.closest('.btn, .cat-card, .compare-card');
        if (!t) return;
        var r = t.getBoundingClientRect();
        var x = e.clientX - r.left + 'px',
          y = e.clientY - r.top + 'px';
        if (t.classList.contains('btn')) {
          t.style.setProperty('--bx', x);
          t.style.setProperty('--by', y);
        } else {
          t.style.setProperty('--mx', x);
          t.style.setProperty('--my', y);
        }
      },
      { passive: true },
    );
  }

  // catalog cards tilt toward the pointer; the rect is taken on enter, before the card tilts
  if (finePointer && !reduceMotion) {
    $$('.cat-card').forEach(function (card) {
      var box = null;
      card.addEventListener('pointerenter', function () {
        box = card.getBoundingClientRect();
      });
      card.addEventListener('pointermove', function (e) {
        if (!box) return;
        card.style.setProperty('--tx', (((e.clientX - box.left) / box.width) * 2 - 1).toFixed(3));
        card.style.setProperty('--ty', (((e.clientY - box.top) / box.height) * 2 - 1).toFixed(3));
        card.classList.add('is-tilting');
      });
      card.addEventListener('pointerleave', function () {
        box = null;
        card.classList.toggle('is-tilting', false);
      });
    });
  }

  // the clicked card's box flies into the box type page (see the generated CSS in the build)
  if (!reduceMotion) {
    doc.addEventListener('click', function (e) {
      var link = e.target.closest && e.target.closest('.cat-card a');
      if (!link || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
      var card = link.closest('.cat-card');
      var media = card.querySelector('.cat-media');
      var picture = card.querySelector('img[data-vt]');
      if (picture && media && link.getAttribute('href') === media.getAttribute('href')) picture.classList.add('vt-go');
    });
    window.addEventListener('pageshow', function () {
      $$('.vt-go').forEach(function (el) {
        el.classList.toggle('vt-go', false);
      });
    });
  }

  // ripple on press
  if (!reduceMotion) {
    doc.addEventListener(
      'pointerdown',
      function (e) {
        var b = e.target.closest && e.target.closest('.btn');
        if (!b || b.disabled) return;
        var r = b.getBoundingClientRect();
        var d = Math.max(r.width, r.height) * 2.2;
        var w = doc.createElement('span');
        w.className = 'ripple';
        w.style.width = w.style.height = d + 'px';
        w.style.left = e.clientX - r.left + 'px';
        w.style.top = e.clientY - r.top + 'px';
        b.appendChild(w);
        setTimeout(function () {
          if (w.parentNode) w.parentNode.removeChild(w);
        }, 650);
      },
      { passive: true },
    );
  }

  // hero illustration follows the pointer a little
  var art = $('[data-hero-art]');
  if (art && finePointer && !reduceMotion) {
    var heroTick = false,
      pending = null;
    window.addEventListener(
      'pointermove',
      function (e) {
        pending = e;
        if (heroTick) return;
        heroTick = true;
        requestAnimationFrame(function () {
          heroTick = false;
          var r = art.getBoundingClientRect();
          if (r.bottom < 0 || r.top > window.innerHeight) return;
          var px = ((pending.clientX - (r.left + r.width / 2)) / window.innerWidth) * 2;
          var py = ((pending.clientY - (r.top + r.height / 2)) / window.innerHeight) * 2;
          art.style.setProperty('--px', Math.max(-1, Math.min(1, px)).toFixed(3));
          art.style.setProperty('--py', Math.max(-1, Math.min(1, py)).toFixed(3));
        });
      },
      { passive: true },
    );
  }

  // FAQ: animate the height of <details>
  if (!reduceMotion && Element.prototype.animate) {
    $$('.faq-item').forEach(function (d) {
      var sum = d.querySelector('summary');
      var content = d.querySelector('.faq-a');
      var anim = null;
      sum.addEventListener('click', function (e) {
        e.preventDefault();
        if (anim) anim.cancel();
        if (!d.open) {
          d.open = true;
          var h = content.offsetHeight;
          anim = content.animate(
            [
              { height: '0px', opacity: 0 },
              { height: h + 'px', opacity: 1 },
            ],
            { duration: 320, easing: 'cubic-bezier(.16,1,.3,1)' },
          );
          anim.onfinish = function () {
            anim = null;
          };
        } else {
          var h2 = content.offsetHeight;
          anim = content.animate(
            [
              { height: h2 + 'px', opacity: 1 },
              { height: '0px', opacity: 0 },
            ],
            { duration: 240, easing: 'cubic-bezier(.65,0,.35,1)' },
          );
          anim.onfinish = function () {
            d.open = false;
            anim = null;
          };
        }
      });
    });
  }

  // --- forms ---
  var statusPromise = null;
  function getStatus() {
    if (statusPromise) return statusPromise;
    statusPromise = new Promise(function (resolve) {
      var done = false;
      var t = setTimeout(function () {
        if (!done) {
          done = true;
          resolve({ online: false });
        }
      }, 6000);
      fetch('/api/status', { cache: 'no-store', headers: { Accept: 'application/json' } })
        .then(function (r) {
          return r.ok ? r.json() : { online: false };
        })
        .catch(function () {
          return { online: false };
        })
        .then(function (s) {
          if (!done) {
            done = true;
            clearTimeout(t);
            resolve(s && typeof s === 'object' ? s : { online: false });
          }
        });
    });
    return statusPromise;
  }

  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2);
  }

  var RX_EMAIL = /^[^\s@<>()"',;:]+@[^\s@<>()"',;:]+\.[a-z]{2,}$/i;
  function digits(s) {
    return (s.match(/\d/g) || []).length;
  }
  function validContact(channel, v) {
    v = v.trim();
    if (!v) return 'contact';
    if (channel === 'email') return RX_EMAIL.test(v) ? '' : 'email';
    if (channel === 'phone')
      return /^[+\d][\d\s()\-]{6,22}$/.test(v) && digits(v) >= 9 && digits(v) <= 15 ? '' : 'phone';
    if (channel === 'telegram') {
      if (/^@?[a-zA-Z][a-zA-Z0-9_]{4,31}$/.test(v)) return '';
      if (/^(https?:\/\/)?t\.me\/[a-zA-Z][a-zA-Z0-9_]{4,31}\/?$/.test(v)) return '';
      if (/^[+\d][\d\s()\-]{6,22}$/.test(v) && digits(v) >= 9 && digits(v) <= 15) return '';
      return 'telegram';
    }
    return '';
  }
  var CH_ATTRS = {
    phone: { type: 'tel', inputmode: 'tel', autocomplete: 'tel' },
    email: { type: 'email', inputmode: 'email', autocomplete: 'email' },
    telegram: { type: 'text', inputmode: 'text', autocomplete: 'off' },
  };

  function fieldErrorEl(input) {
    var ids = (input.getAttribute('aria-describedby') || '').split(/\s+/);
    for (var i = 0; i < ids.length; i++) {
      if (/-err$/.test(ids[i])) return doc.getElementById(ids[i]);
    }
    return null;
  }
  function setError(input, msg) {
    var el = fieldErrorEl(input);
    if (msg) {
      input.setAttribute('aria-invalid', 'true');
      if (el) {
        el.replaceChildren.apply(el, message('alert', msg));
        el.hidden = false;
      }
    } else {
      input.removeAttribute('aria-invalid');
      if (el && !$$('[aria-describedby~="' + el.id + '"][aria-invalid="true"]').length) {
        el.hidden = true;
        el.textContent = '';
      }
    }
  }

  function channelOf(form) {
    var c = form.querySelector('[data-channel]:checked');
    return c ? c.value : 'phone';
  }

  function applyChannel(form) {
    var input = form.querySelector('[data-contact]');
    if (!input) return;
    var ch = channelOf(form);
    var a = CH_ATTRS[ch];
    input.type = a.type;
    input.setAttribute('inputmode', a.inputmode);
    input.setAttribute('autocomplete', a.autocomplete);
    input.placeholder = input.getAttribute('data-ph-' + ch) || '';
    if (input.getAttribute('aria-invalid') === 'true') setError(input, '');
  }

  function intError(input) {
    var v = input.value.replace(/\s+/g, '');
    if (!v) return '';
    if (!/^\d+$/.test(v) || +v <= 0) return T.form.errors.number;
    return '';
  }

  // Validates the form (or one part of it) and returns [{ input, msg }].
  function validate(form, scope) {
    var errs = [];
    var root = scope || form;
    var E = T.form.errors;
    var L = CFG.limits;
    $$('[data-int]', root).forEach(function (inp) {
      if (inp.disabled) return;
      inp.value = inp.value.replace(/\s+/g, '');
      var m = intError(inp);
      setError(inp, m);
      if (m) errs.push({ input: inp, msg: m });
    });
    var task = root.querySelector('textarea[name="task"]');
    if (task && !task.disabled) {
      var tv = task.value.trim();
      var tm = task.required && tv.length < 3 ? E.task : tv.length > L.task ? fill(E.tooLong, { max: L.task }) : '';
      setError(task, tm);
      if (tm) errs.push({ input: task, msg: tm });
    }
    var contact = root.querySelector('[data-contact]');
    if (contact) {
      var code = validContact(channelOf(form), contact.value);
      var cm = code ? E[code] : '';
      setError(contact, cm);
      if (cm) errs.push({ input: contact, msg: cm });
    }
    var files = root.querySelector('input[type="file"]');
    if (files && !files.disabled && files.files && files.files.length) {
      var fm = fileError(files.files);
      setError(files, fm);
      if (fm) errs.push({ input: files, msg: fm });
    }
    return errs;
  }

  function fileError(list) {
    var E = T.form.errors;
    if (list.length > CFG.maxFiles) return E.fileCount;
    for (var i = 0; i < list.length; i++) {
      var f = list[i];
      var okType = CFG.allowedTypes.indexOf(f.type) !== -1 || /\.(jpe?g|png|pdf)$/i.test(f.name);
      if (!okType) return fill(E.fileType, { name: f.name });
      if (f.size > CFG.maxFileSizeMb * 1024 * 1024) return fill(E.fileSize, { name: f.name });
    }
    return '';
  }

  function showSummary(form, errs) {
    var box = form.querySelector('[data-error-summary]');
    if (!box) return;
    var ul = box.querySelector('ul');
    ul.replaceChildren();
    errs.forEach(function (er) {
      var li = doc.createElement('li');
      var a = doc.createElement('a');
      a.href = '#' + er.input.id;
      a.textContent = er.msg;
      a.addEventListener('click', function (e) {
        e.preventDefault();
        er.input.focus();
      });
      li.appendChild(a);
      ul.appendChild(li);
    });
    box.hidden = false;
    box.classList.toggle('shake', false);
    void box.offsetWidth;
    if (!reduceMotion) box.classList.add('shake');
    box.focus();
  }
  function hideSummary(form) {
    var b = form.querySelector('[data-error-summary]');
    if (b) b.hidden = true;
  }

  function setStatus(form, kind, template) {
    var st = form.querySelector('[data-status]');
    if (!st) return;
    st.className = 'form-status' + (kind ? ' is-' + kind : '');
    if (template) st.replaceChildren(icon(kind === 'error' ? 'alert' : 'mail'), textWithEmail(template));
    else st.replaceChildren();
  }

  function dimsText(fd) {
    var l = fd.get('length'),
      w = fd.get('width'),
      h = fd.get('height');
    if (!l && !w && !h) return '';
    var unit = T.dims[fd.get('unit') === 'cm' ? 'cm' : 'mm'];
    var s = [l || '?', w || '?', h || '?'].join(' × ') + ' ' + unit;
    var dt = fd.get('dimType');
    if (dt && dt !== 'unknown') s += ' (' + T.dims[dt].toLowerCase() + ')';
    return s;
  }

  function buildMailto(form) {
    var fd = new FormData(form);
    var M = T.form.mail;
    var lines = [M.greeting, M.intro, ''];
    var add = function (label, v) {
      v = (v || '').toString().trim();
      if (v) lines.push(label + ': ' + v);
    };
    add(M.company, fd.get('company'));
    add(M.name, fd.get('name'));
    add(M.type, T.types[fd.get('type')] || '');
    if (fd.get('topic') === 'compare') add(M.task, T.compareTopic);
    add(M.industry, T.industries[fd.get('industry')] || '');
    add(M.dims, dimsText(fd));
    add(M.quantity, fd.get('quantity'));
    add(M.print, T.printOptions[fd.get('print')] || '');
    add(M.city, fd.get('city'));
    add(M.contact, (T.channels[fd.get('channel')] || '') + ' — ' + (fd.get('contact') || ''));
    var task = (fd.get('task') || '').toString().trim();
    if (task) {
      lines.push('');
      lines.push(M.task + ':');
      lines.push(task.slice(0, 1500));
    }
    return (
      'mailto:' +
      CFG.email +
      '?subject=' +
      encodeURIComponent(T.mailSubject) +
      '&body=' +
      encodeURIComponent(lines.join('\n'))
    );
  }

  function setMode(form, status) {
    var online = !!(status && status.online);
    form.setAttribute('data-mode', online ? 'online' : 'mailto');
    var btn = form.querySelector('[data-submit]');
    if (btn)
      btn.querySelector('.btn-label').textContent = online
        ? btn.getAttribute('data-label')
        : btn.getAttribute('data-label-mailto');
    var note = form.querySelector('[data-mailto-note]');
    if (note) note.hidden = online;
    var files = form.querySelector('[data-files]');
    var filesOk = online && status.uploads;
    if (files) {
      files.hidden = !filesOk;
      var fi = files.querySelector('input');
      if (fi) fi.disabled = !filesOk;
    }
    var fnote = form.querySelector('[data-files-email-note]');
    if (fnote) fnote.hidden = !(online && !status.uploads);
  }

  function initForm(form, opts) {
    opts = opts || {};
    form.querySelector('input[name="page"]').value = location.pathname.slice(0, 200);
    form.querySelector('input[name="ts"]').value = String(Date.now());
    form.querySelector('input[name="idem"]').value = uuid();
    var formName = form.id;

    // prefill from the URL
    var preset = form.getAttribute('data-preset-type');
    var typeInput = form.querySelector('[data-type-input]');
    var chip = form.querySelector('[data-type-chip]');
    if (preset && typeInput) typeInput.value = preset;
    if (opts.fromUrl) {
      var q = new URLSearchParams(location.search);
      var type = q.get('type');
      if (type && T.types[type] && typeInput && chip) {
        typeInput.value = type;
        chip.querySelector('[data-type-name]').textContent = T.types[type];
        chip.hidden = false;
      }
      var ind = q.get('industry');
      var sel = form.querySelector('[data-industry-select]');
      if (ind && sel && T.industries[ind]) sel.value = ind;
      if (q.get('topic') === 'compare') {
        var tp = form.querySelector('[data-topic-input]');
        if (tp) tp.value = 'compare';
        if (chip && !chip.hidden) {
          /* box type already shown */
        } else if (chip) {
          chip.querySelector('.type-chip-label').textContent = '';
          chip.querySelector('[data-type-name]').textContent = T.compareTopic;
          chip.hidden = false;
        }
      }
    }
    var rm = form.querySelector('[data-type-remove]');
    if (rm)
      rm.addEventListener('click', function () {
        typeInput.value = '';
        var tp = form.querySelector('[data-topic-input]');
        if (tp) tp.value = '';
        chip.hidden = true;
        var task = form.querySelector('textarea[name="task"]');
        if (task) task.focus();
      });

    $$('[data-channel]', form).forEach(function (r) {
      r.addEventListener('change', function () {
        applyChannel(form);
      });
    });
    applyChannel(form);

    // re-check a field as soon as it is corrected
    form.addEventListener('input', function (e) {
      var el = e.target;
      if (el.getAttribute('aria-invalid') === 'true') {
        if (el.hasAttribute('data-int')) setError(el, intError(el));
        else if (el.hasAttribute('data-contact')) {
          var c = validContact(channelOf(form), el.value);
          setError(el, c ? T.form.errors[c] : '');
        } else if (el.name === 'task' && el.value.trim().length >= 3) setError(el, '');
      }
    });
    form.addEventListener('change', function (e) {
      if (e.target.type === 'file') {
        var m = e.target.files.length ? fileError(e.target.files) : '';
        setError(e.target, m);
      }
    });
    var started = false;
    form.addEventListener('input', function () {
      if (!started) {
        started = true;
        track('form_start', { form: formName });
      }
    });

    getStatus().then(function (s) {
      setMode(form, s);
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (opts.beforeSubmit && opts.beforeSubmit() === false) return;
      var errs = validate(form);
      if (errs.length) {
        showSummary(form, errs);
        return;
      }
      hideSummary(form);
      if (form.getAttribute('data-mode') !== 'online') {
        // Fallback: the visitor sends the prepared e-mail from their own mail app.
        location.href = buildMailto(form);
        setStatus(form, 'info', T.form.mailtoOpened);
        track('mailto_prepared', { form: formName });
        return;
      }
      send(form, formName, opts);
    });
  }

  var sending = false;
  function send(form, formName, opts) {
    if (sending) return; // no double submits
    sending = true;
    var btn = form.querySelector('[data-submit]');
    var label = btn.querySelector('.btn-label');
    btn.disabled = true;
    btn.classList.add('is-sending');
    label.textContent = btn.getAttribute('data-label-sending');
    setStatus(form, '', '');
    var fd = new FormData(form);
    var finish = function () {
      sending = false;
      btn.disabled = false;
      btn.classList.remove('is-sending');
      label.textContent = btn.getAttribute('data-label');
    };
    fetch(form.action, {
      method: 'POST',
      body: fd,
      headers: { Accept: 'application/json', 'X-Requested-With': 'fetch' },
      credentials: 'same-origin',
    })
      .then(function (r) {
        return r
          .json()
          .catch(function () {
            return {};
          })
          .then(function (j) {
            return { status: r.status, body: j };
          });
      })
      .then(function (res) {
        finish();
        if (res.status === 200 && res.body && res.body.ok === true) {
          track('form_submit_success', { form: formName });
          var panel = doc.querySelector('[data-success-for="' + form.id + '"]');
          form.hidden = true;
          if (opts.onSuccess) opts.onSuccess();
          if (panel) {
            panel.hidden = false;
            panel.focus();
            var again = panel.querySelector('[data-success-reset]');
            again.onclick = function () {
              form.reset();
              applyChannel(form);
              form.querySelector('input[name="idem"]').value = uuid();
              form.querySelector('input[name="ts"]').value = String(Date.now());
              panel.hidden = true;
              form.hidden = false;
              if (opts.onReset) opts.onReset();
              var first = form.querySelector('input:not([type=hidden]):not([tabindex="-1"]), textarea');
              if (first) first.focus();
            };
          }
          return;
        }
        var code = (res.body && res.body.error) || 'http_' + res.status;
        track('form_submit_error', { form: formName, reason: code });
        if (code === 'not_configured') {
          // server says sending is not configured: switch to the e-mail fallback
          setMode(form, { online: false });
          setStatus(form, 'error', T.form.error);
          return;
        }
        if (code === 'validation' && res.body.fields) {
          var errs = [];
          res.body.fields.forEach(function (name) {
            var inp = form.querySelector('[name="' + name + '"]:not([type=hidden])');
            if (inp) {
              var msg =
                T.form.errors[name === 'contact' ? 'contact' : name === 'task' ? 'task' : 'number'] ||
                T.form.errors.contact;
              setError(inp, msg);
              errs.push({ input: inp, msg: msg });
            }
          });
          if (errs.length) {
            showSummary(form, errs);
            return;
          }
        }
        if (code === 'too_fast') form.querySelector('input[name="ts"]').value = String(Date.now() - 10000);
        var msgTpl = code === 'rate_limited' ? T.form.errorRate : T.form.error;
        setStatus(form, 'error', msgTpl);
        var st = form.querySelector('[data-status]');
        if (st) st.focus();
      })
      .catch(function () {
        finish();
        track('form_submit_error', { form: formName, reason: 'network' });
        setStatus(form, 'error', T.form.error);
        var st = form.querySelector('[data-status]');
        if (st) st.focus();
      });
  }

  // --- step-by-step helper ---
  function initWizard(form) {
    var steps = $$('.wz-step', form);
    var total = steps.length;
    var summary = form.querySelector('[data-summary]');
    var nav = form.querySelector('[data-wz-nav]');
    var finalBox = form.querySelector('[data-wz-final]');
    var back = form.querySelector('[data-wz-back]');
    var next = form.querySelector('[data-wz-next]');
    var bar = form.closest('.wizard-card').querySelector('[data-wz-bar]');
    var cur = 1; // 1..total; total + 1 is the summary
    var returnToSummary = false;
    var opened = false;
    form.classList.add('is-stepped');
    nav.hidden = false;

    function sizeMode() {
      var v = (form.querySelector('[data-know-size]:checked') || {}).value;
      var yes = form.querySelector('[data-size-yes]');
      var help = form.querySelector('[data-size-help]');
      yes.hidden = v !== 'yes';
      help.hidden = v === 'yes';
      $$('input, select', yes).forEach(function (i) {
        i.disabled = v !== 'yes';
      });
      $$('textarea', help).forEach(function (i) {
        i.disabled = v === 'yes';
      });
    }
    $$('[data-know-size]', form).forEach(function (r) {
      r.addEventListener('change', sizeMode);
    });
    sizeMode();

    var shown = 1;
    function render(focus) {
      var dir = cur >= shown ? 'from-next' : 'from-prev';
      steps.forEach(function (s, i) {
        var on = i + 1 === cur;
        s.classList.toggle('is-active', on);
        s.classList.toggle('from-next', false);
        s.classList.toggle('from-prev', false);
        if (on && focus && cur !== shown) {
          void s.offsetWidth;
          s.classList.add(dir);
        }
      });
      shown = cur;
      var atSummary = cur > total;
      summary.hidden = !atSummary;
      finalBox.hidden = !atSummary;
      back.hidden = cur === 1;
      next.hidden = atSummary;
      var lbl =
        cur === total || returnToSummary
          ? next.getAttribute('data-label-summary')
          : next.getAttribute('data-label-next');
      next.firstChild.textContent = lbl;
      bar.style.width = (Math.min(cur, total + 1) / (total + 1)) * 100 + '%';
      if (atSummary) fillSummary();
      if (focus) {
        var target = atSummary ? summary : steps[cur - 1];
        target.setAttribute('tabindex', '-1');
        target.focus({ preventScroll: true });
        var top = form.closest('.wizard-card').getBoundingClientRect().top;
        if (top < 0 || top > window.innerHeight * 0.6)
          form.closest('.wizard-card').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
      }
    }

    function stepValid() {
      var step = steps[cur - 1];
      var errBox = step.querySelector('[data-step-error]');
      if (cur === 1) {
        var ok = !!form.querySelector('input[name="industry"]:checked');
        if (errBox) {
          if (!ok) {
            errBox.replaceChildren.apply(errBox, message('alert', T.wizard.sum.what + ': ' + T.wizard.sum.notSet));
            errBox.hidden = false;
          } else errBox.hidden = true;
        }
        if (!ok) {
          var first = step.querySelector('input');
          if (first) first.focus();
        }
        return ok;
      }
      var errs = validate(form, step);
      if (errs.length) {
        errs[0].input.focus();
        return false;
      }
      return true;
    }

    function fillSummary() {
      var fd = new FormData(form);
      var ns = T.wizard.sum.notSet;
      var set = function (k, v) {
        var el = summary.querySelector('[data-sum="' + k + '"]');
        el.textContent = v || ns;
        el.classList.toggle('muted', !v);
      };
      set('what', T.industries[fd.get('industry')]);
      var size = fd.get('knowSize') === 'yes' ? dimsText(fd) : (fd.get('task') || '').toString().trim();
      set('size', size.length > 140 ? size.slice(0, 140) + '…' : size);
      set('qty', fd.get('quantity'));
      set('print', T.printOptions[fd.get('print')]);
      set('contact', (T.channels[fd.get('channel')] || '') + ': ' + (fd.get('contact') || '').toString().trim());
    }

    next.addEventListener('click', function () {
      if (!opened) {
        opened = true;
        track('wizard_progress', { form: 'wizard' });
      }
      if (!stepValid()) return;
      cur = returnToSummary ? total + 1 : cur + 1;
      if (cur > total) returnToSummary = false;
      render(true);
    });
    back.addEventListener('click', function () {
      returnToSummary = false;
      cur = Math.max(1, cur - 1);
      render(true);
    });
    $$('[data-goto]', form).forEach(function (b) {
      b.addEventListener('click', function () {
        cur = +b.getAttribute('data-goto');
        returnToSummary = true;
        render(true);
      });
    });
    // Enter moves to the next step instead of submitting
    form.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && e.target.tagName === 'INPUT' && cur <= total) {
        e.preventDefault();
        next.click();
      }
    });
    var io =
      'IntersectionObserver' in window
        ? new IntersectionObserver(
            function (en) {
              if (en[0].isIntersecting) {
                track('form_open', { form: 'wizard' });
                io.disconnect();
              }
            },
            { threshold: 0.3 },
          )
        : null;
    if (io) io.observe(form);
    render(false);

    initForm(form, {
      beforeSubmit: function () {
        if (cur <= total) {
          next.click();
          return false;
        }
        return true;
      },
      onReset: function () {
        cur = 1;
        returnToSummary = false;
        sizeMode();
        render(true);
      },
    });
  }

  var forms = $$('[data-request-form]');
  forms.forEach(function (form, i) {
    if (form.hasAttribute('data-wizard')) initWizard(form);
    else initForm(form, { fromUrl: i === 0 && body.getAttribute('data-page') === 'request' });
  });
  if (body.getAttribute('data-page') === 'request' && forms.length) track('form_open', { form: forms[0].id });
})();
