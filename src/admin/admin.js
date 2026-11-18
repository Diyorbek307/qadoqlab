/* QADOQLAB admin panel. No dependencies. */
(function () {
  'use strict';
  var $ = function (s, r) {
    return (r || document).querySelector(s);
  };
  var $$ = function (s, r) {
    return Array.prototype.slice.call((r || document).querySelectorAll(s));
  };
  var S = null; // state from the server
  var textDirty = {}; // path → { ru, uz }

  var ERR = {
    email: 'Проверьте адрес почты.',
    phone: 'Телефон: 9–15 цифр, например +998 90 123 45 67.',
    telegram: 'Имя пользователя Telegram: 5–32 символа — латинские буквы, цифры, «_».',
    whatsapp: 'WhatsApp: номер в международном формате, 9–15 цифр.',
    coordinates: 'Координаты: широта от −90 до 90, долгота от −180 до 180.',
    taxId: 'ИНН — 9 цифр.',
    domain: 'Адрес сайта в формате https://example.uz',
    ga4: 'Идентификатор GA4 вида G-XXXXXXXXXX.',
    ym: 'Номер счётчика Метрики — только цифры.',
    privacy_incomplete: 'Чтобы опубликовать политику, заполните наименование, ИНН и юридический адрес.',
    too_long: 'Слишком длинный текст.',
    required: 'Заполните поле.',
    placeholders: 'Сохраните фрагменты в фигурных скобках так же, как в исходном тексте.',
    uses_count: 'Укажите от 1 до 6 пунктов — каждый с новой строки.',
    file_type: 'Подходят только изображения JPG, PNG или WebP.',
    file_size: 'Файл больше 6 МБ.',
    file_dimensions: 'Изображение больше 6000 px по стороне.',
    file_required: 'Выберите файл.',
    too_large: 'Файл слишком большой.',
    unauthorized: 'Сессия закончилась — войдите снова.',
    forbidden: 'Запрос отклонён.',
    too_many_attempts: 'Слишком много попыток входа. Попробуйте через 15 минут.',
    bad_password: 'Неверный пароль.',
    not_configured:
      'Почтовый сервис не подключён: задайте переменные окружения на сервере (README → «Подключение отправки заявок»).',
    send_failed: 'Почтовый сервис вернул ошибку.',
  };
  var MEDIA_LABELS = {
    'gallery.samples': 'Галерея — образцы упаковки',
    'gallery.construction': 'Галерея — детали конструкции',
    'gallery.printing': 'Галерея — печать',
    'gallery.production': 'Галерея — производство',
    'about.workshop': 'О производстве — цех',
    'about.equipment': 'О производстве — оборудование',
    'about.samples': 'О производстве — образцы',
    'about.process': 'О производстве — процесс изготовления',
    'about.qualityControl': 'О производстве — контроль продукции',
  };
  var GROUP_LABELS = {
    meta: 'Заголовки и описания страниц (SEO)',
    a11y: 'Служебные подписи для доступности',
    nav: 'Меню',
    cta: 'Кнопки',
    hero: 'Первый экран',
    principles: 'Принципы работы',
    catalogSection: 'Блок «Варианты упаковки»',
    catalogPage: 'Страница каталога',
    categoryPage: 'Страница вида упаковки',
    business: 'Решения для бизнеса',
    compare: 'Сравнение условий',
    wizard: 'Помощник подбора',
    steps: 'Как начать сотрудничество',
    about: 'О производстве',
    gallery: 'Галерея',
    faq: 'Частые вопросы',
    finalCta: 'Нижний призыв',
    contacts: 'Контакты',
    footer: 'Подвал',
    form: 'Форма заявки',
    notFound: 'Страница 404',
    privacy: 'Политика',
    illustrationLabel: 'Подпись иллюстраций',
    demoBanner: 'Демо-режим',
    demoTag: 'Демо-режим',
  };

  // --- helpers ---
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function getPath(o, p) {
    return p.split('.').reduce(function (a, k) {
      return a == null ? undefined : a[k];
    }, o);
  }
  function setPath(o, p, v) {
    var ks = p.split('.');
    var c = o;
    for (var i = 0; i < ks.length - 1; i++) {
      c[ks[i]] = c[ks[i]] || {};
      c = c[ks[i]];
    }
    c[ks[ks.length - 1]] = v;
  }
  function fmtDate(iso) {
    if (!iso) return '—';
    try {
      return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
    } catch (e) {
      return iso;
    }
  }

  function toast(msg, isError) {
    var t = document.createElement('div');
    t.className = 'toast' + (isError ? ' is-error' : '');
    t.setAttribute('role', isError ? 'alert' : 'status');
    t.textContent = msg;
    $('#toasts').appendChild(t);
    setTimeout(
      function () {
        t.classList.add('is-out');
        setTimeout(function () {
          t.remove();
        }, 300);
      },
      isError ? 7000 : 4000,
    );
  }

  function api(method, url, body, isForm) {
    var opts = {
      method: method,
      credentials: 'same-origin',
      headers: { 'X-Admin-Request': '1', Accept: 'application/json' },
    };
    if (body !== undefined) {
      if (isForm) opts.body = body;
      else {
        opts.headers['Content-Type'] = 'application/json';
        opts.body = JSON.stringify(body);
      }
    }
    return fetch(url, opts).then(function (r) {
      return r
        .json()
        .catch(function () {
          return {};
        })
        .then(function (j) {
          if (r.status === 401 && url !== '/admin/api/login') {
            showLogin();
          }
          if (!r.ok || j.ok === false) {
            var e = new Error(j.error || 'http_' + r.status);
            e.data = j;
            e.status = r.status;
            throw e;
          }
          return j;
        });
    });
  }

  function busy(btn, fn) {
    if (btn.disabled) return Promise.resolve();
    btn.disabled = true;
    btn.classList.add('is-busy');
    return Promise.resolve()
      .then(fn)
      .finally(function () {
        btn.disabled = false;
        btn.classList.remove('is-busy');
      });
  }

  function afterSave(j, what) {
    if (j.state) {
      S = j.state;
      renderAll();
    }
    if (j.build && j.build.ok === false)
      toast((what || 'Сохранено') + ', но сборка сайта не удалась. Подробности — в журнале сервера.', true);
    else toast((what || 'Сохранено') + '. Сайт обновлён.');
  }

  function clearErrors(root) {
    $$('[aria-invalid="true"]', root).forEach(function (el) {
      el.removeAttribute('aria-invalid');
    });
    $$('.field-error', root).forEach(function (el) {
      el.remove();
    });
  }
  function showFieldError(el, code) {
    if (!el) return;
    el.setAttribute('aria-invalid', 'true');
    var p = document.createElement('p');
    p.className = 'field-error';
    p.id = (el.id || 'f' + Math.random().toString(36).slice(2)) + '-err';
    p.textContent = ERR[code] || 'Проверьте значение.';
    el.insertAdjacentElement('afterend', p);
    el.setAttribute('aria-describedby', p.id);
    el.focus();
  }
  function handleError(e, root, finder) {
    var d = e.data || {};
    if (d.field && root) {
      var el = finder ? finder(d.field) : null;
      if (el) {
        showFieldError(el, d.error);
        return;
      }
    }
    toast(ERR[d.error || e.message] || 'Ошибка: ' + (d.error || e.message), true);
  }

  // --- sign in ---
  function showLogin() {
    $('#app').hidden = true;
    $('#login').hidden = false;
    setTimeout(function () {
      $('#password').focus();
    }, 30);
  }
  $('#login-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var btn = e.submitter || $('#login-form button');
    var err = $('#login-error');
    err.hidden = true;
    busy(btn, function () {
      return api('POST', '/admin/api/login', { password: $('#password').value })
        .then(function () {
          $('#password').value = '';
          return load();
        })
        .catch(function (x) {
          err.textContent = ERR[(x.data && x.data.error) || x.message] || 'Не удалось войти.';
          err.hidden = false;
          $('#password').select();
        });
    });
  });
  $('#logout').addEventListener('click', function () {
    api('POST', '/admin/api/logout', {})
      .catch(function () {})
      .then(showLogin);
  });

  function load() {
    return api('GET', '/admin/api/state')
      .then(function (j) {
        S = j;
        $('#login').hidden = true;
        $('#app').hidden = false;
        renderAll();
        route();
      })
      .catch(function (e) {
        if (e.status !== 401) toast('Не удалось загрузить данные панели.', true);
      });
  }

  // --- tabs ---
  function route() {
    var tab = (location.hash || '#overview').slice(1);
    if (!$('#tab-' + tab)) tab = 'overview';
    $$('.tab').forEach(function (t) {
      t.hidden = t.id !== 'tab-' + tab;
    });
    $$('[data-tab]').forEach(function (a) {
      if (a.getAttribute('data-tab') === tab) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    document.title = $('#tab-' + tab).getAttribute('data-title') + ' — QADOQLAB';
  }
  window.addEventListener('hashchange', function () {
    route();
    $('#main').focus({ preventScroll: true });
    window.scrollTo(0, 0);
  });

  function renderAll() {
    renderOverview();
    fillForm($('#form-contacts'));
    fillForm($('#form-seo'));
    renderCatalog();
    renderTextsGroups();
    renderTexts();
    renderMedia();
  }

  // --- overview ---
  function card(title, badgeCls, badge, text) {
    return (
      '<div class="card"><span class="card-title">' +
      esc(title) +
      '</span><span class="badge ' +
      badgeCls +
      '">' +
      esc(badge) +
      '</span>' +
      (text ? '<span class="card-text">' + text + '</span>' : '') +
      '</div>'
    );
  }
  function renderOverview() {
    var st = S.status;
    var html = '';
    html += st.mail.configured
      ? card('Заявки с сайта', 'badge-ok', 'Онлайн-отправка подключена', 'Получатель: ' + esc(st.mail.to.join(', ')))
      : card(
          'Заявки с сайта',
          'badge-warn',
          'Режим письма',
          'Посетители отправляют запрос из своего почтового приложения. Для онлайн-отправки подключите почтовый сервис на сервере.',
        );
    html += st.uploads
      ? card('Файлы в заявках', 'badge-ok', 'Принимаются', 'JPG, PNG, PDF — до 3 файлов по 10 МБ.')
      : card('Файлы в заявках', 'badge-off', 'Выключено', 'Посетителям предлагается прислать файлы на почту.');
    html += st.demo
      ? card('Поисковые системы', 'badge-warn', 'Демо-сборка', 'Не индексируется.')
      : st.indexable
        ? card('Поисковые системы', 'badge-ok', 'Сайт открыт', esc(st.domain))
        : card('Поисковые системы', 'badge-warn', 'Закрыт от поиска', 'Укажите домен в разделе «Домен и аналитика».');
    html += st.catalog.published
      ? card('Каталог', 'badge-ok', 'Опубликовано ' + st.catalog.published + ' из ' + st.catalog.total, '')
      : card(
          'Каталог',
          'badge-warn',
          'Нет опубликованных категорий',
          'На сайте показан блок «Коробка под вашу продукцию».',
        );
    html += st.privacyReady
      ? card('Политика конфиденциальности', 'badge-ok', 'Опубликована', '')
      : card(
          'Политика конфиденциальности',
          'badge-off',
          'Не опубликована',
          'Нужны реквизиты оператора и проверка текста.',
        );
    html +=
      st.analytics.ga4 || st.analytics.ym
        ? card(
            'Аналитика',
            'badge-ok',
            [st.analytics.ga4 ? 'GA4' : '', st.analytics.ym ? 'Метрика' : ''].filter(Boolean).join(' + '),
            '',
          )
        : card('Аналитика', 'badge-off', 'Не подключена', '');
    $('#status-cards').innerHTML = html;
    $$('.card', $('#status-cards')).forEach(function (el, i) {
      el.style.setProperty('--i', i);
    });
    $('#build-info').textContent = 'Сайт собран: ' + fmtDate(st.build.builtAt) + ' · страниц: ' + st.build.pages;

    var s = S.settings;
    var media = Object.keys(s.gallery)
      .concat(Object.keys(s.aboutPhotos))
      .some(function (k) {
        return (s.gallery[k] || s.aboutPhotos[k] || []).length;
      });
    var todo = [
      [st.mail.configured, 'Подключить почтовый сервис для онлайн-заявок (на сервере, см. README)', null],
      [Boolean(s.domain), 'Указать домен сайта', 'seo'],
      [st.catalog.published > 0, 'Подтвердить и опубликовать виды упаковки', 'catalog'],
      [st.privacyReady, 'Заполнить реквизиты и опубликовать политику конфиденциальности', 'contacts'],
      [
        Boolean(s.contacts.phone || s.contacts.telegram || s.contacts.whatsapp),
        'Добавить телефон или мессенджер — по желанию',
        'contacts',
      ],
      [media, 'Загрузить реальные фото производства и образцов — по желанию', 'media'],
      [st.analytics.ga4 || st.analytics.ym, 'Подключить аналитику — по желанию', 'seo'],
    ];
    $('#todo').innerHTML = todo
      .map(function (t) {
        return (
          '<li><span class="' +
          (t[0] ? 'done' : '') +
          '">' +
          esc(t[1]) +
          '</span>' +
          (t[0]
            ? '<span class="badge badge-ok">Готово</span>'
            : t[2]
              ? '<a class="btn btn-ghost" href="#' + t[2] + '">Перейти</a>'
              : '<span class="badge badge-warn">Нужно</span>') +
          '</li>'
        );
      })
      .join('');
    var r = st.requests;
    $('#req-stats').innerHTML =
      '<dt>Доставлено на почту</dt><dd>' +
      r.delivered +
      '</dd><dt>Ошибок отправки</dt><dd>' +
      r.failed +
      '</dd><dt>Последняя доставка</dt><dd>' +
      fmtDate(r.lastDeliveredAt) +
      '</dd><dt>Последняя ошибка</dt><dd>' +
      fmtDate(r.lastFailedAt) +
      '</dd><dt>Сервер запущен</dt><dd>' +
      fmtDate(r.since) +
      '</dd>';
  }
  $('#test-mail').addEventListener('click', function () {
    var b = this;
    busy(b, function () {
      return api('POST', '/admin/api/test-mail', {})
        .then(function (j) {
          toast('Тестовое письмо отправлено: ' + j.to.join(', ') + '. Проверьте входящие и «Спам».');
        })
        .catch(function (e) {
          var d = e.data || {};
          toast((ERR[d.error] || 'Ошибка отправки.') + (d.detail ? ' ' + d.detail : ''), true);
        });
    });
  });
  $('#rebuild').addEventListener('click', function () {
    var b = this;
    busy(b, function () {
      return api('POST', '/admin/api/rebuild', {})
        .then(function (j) {
          afterSave(j, 'Готово');
        })
        .catch(function (e) {
          handleError(e);
        });
    });
  });

  // --- settings forms ---
  function fillForm(form) {
    $$('[data-path]', form).forEach(function (el) {
      var v = getPath(S.settings, el.getAttribute('data-path'));
      if (el.type === 'checkbox') el.checked = v === true;
      else el.value = v == null ? '' : v;
    });
  }
  function collect(form) {
    var out = {};
    $$('[data-path]', form).forEach(function (el) {
      var p = el.getAttribute('data-path');
      setPath(out, p, el.type === 'checkbox' ? el.checked : el.value.trim());
    });
    if (out.contacts && out.contacts.coordinates && !out.contacts.coordinates.lat && !out.contacts.coordinates.lng)
      out.contacts.coordinates = null;
    return out;
  }
  function bindSettingsForm(form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      clearErrors(form);
      var btn = $('button[type=submit]', form);
      busy(btn, function () {
        return api('PUT', '/admin/api/settings', collect(form))
          .then(function (j) {
            afterSave(j);
          })
          .catch(function (x) {
            handleError(x, form, function (field) {
              return (
                form.querySelector('[data-path="' + field + '"]') || form.querySelector('[data-path^="' + field + '."]')
              );
            });
          });
      });
    });
  }
  bindSettingsForm($('#form-contacts'));
  bindSettingsForm($('#form-seo'));

  // --- catalog ---
  function renderCatalog() {
    var printing = S.settings.capabilities.printing === true;
    $('#cap-printing').checked = printing;
    $('#catalog-list').innerHTML = S.catalog
      .map(function (c) {
        var blocked = c.requires.indexOf('printing') !== -1 && !printing;
        var col = function (lang, title) {
          var v = c[lang];
          var f = function (name, label, multi) {
            var id = 'cat-' + c.slug + '-' + lang + '-' + name;
            var val = name === 'uses' ? v.uses.join('\n') : v[name];
            return (
              '<div><label class="label" for="' +
              id +
              '">' +
              esc(label) +
              '</label>' +
              (multi
                ? '<textarea class="input" id="' +
                  id +
                  '" data-cfield="' +
                  c.slug +
                  '.' +
                  lang +
                  '.' +
                  name +
                  '" rows="' +
                  (name === 'uses' ? 3 : 4) +
                  '">' +
                  esc(val) +
                  '</textarea>'
                : '<input class="input" id="' +
                  id +
                  '" data-cfield="' +
                  c.slug +
                  '.' +
                  lang +
                  '.' +
                  name +
                  '" value="' +
                  esc(val) +
                  '">') +
              '</div>'
            );
          };
          return (
            '<div class="col"><span class="col-title">' +
            title +
            '</span>' +
            f('name', 'Название') +
            f('short', 'Кратко') +
            f('intro', 'Описание', true) +
            f('uses', 'Где применяется — каждый пункт с новой строки', true) +
            f('alt', 'Описание иллюстрации для незрячих') +
            '</div>'
          );
        };
        return (
          '<article class="cat' +
          (c.published && !blocked ? ' is-on' : '') +
          '" data-slug="' +
          c.slug +
          '">' +
          '<div class="cat-head"><div><h3>' +
          esc(c.ru.name) +
          '</h3><span class="hint">' +
          esc(c.ru.short) +
          (blocked ? ' · Сначала подтвердите печать.' : '') +
          '</span></div><span class="spacer"></span>' +
          '<label class="sr-only" for="pub-' +
          c.slug +
          '">Опубликовать «' +
          esc(c.ru.name) +
          '»</label>' +
          '<input class="switch" type="checkbox" id="pub-' +
          c.slug +
          '" data-publish="' +
          c.slug +
          '"' +
          (c.published ? ' checked' : '') +
          (blocked ? ' disabled' : '') +
          '></div>' +
          '<details><summary>Тексты категории</summary><div class="cat-edit"><div class="cols">' +
          col('ru', 'РУССКИЙ') +
          col('uz', 'O‘ZBEKCHA') +
          '</div>' +
          '<div class="form-foot"><button class="btn btn-primary" type="button" data-cat-save="' +
          c.slug +
          '">Сохранить тексты</button><button class="btn btn-ghost" type="button" data-cat-reset="' +
          c.slug +
          '">Вернуть исходные</button></div></div></details></article>'
        );
      })
      .join('');
  }
  $('#cap-printing').addEventListener('change', function () {
    var el = this;
    var on = el.checked;
    if (on && !confirm('Подтверждаете, что QADOQLAB выполняет печать на коробках?')) {
      el.checked = false;
      return;
    }
    el.disabled = true;
    api('PUT', '/admin/api/settings', { capabilities: { printing: on } })
      .then(function (j) {
        afterSave(j, on ? 'Печать подтверждена' : 'Печать выключена');
      })
      .catch(function (e) {
        el.checked = !on;
        handleError(e);
      })
      .finally(function () {
        el.disabled = false;
      });
  });
  $('#catalog-list').addEventListener('change', function (e) {
    var el = e.target;
    if (!el.hasAttribute('data-publish')) return;
    var slug = el.getAttribute('data-publish');
    var c = S.catalog.filter(function (x) {
      return x.slug === slug;
    })[0];
    var on = el.checked;
    if (
      on &&
      !confirm('Подтверждаете, что QADOQLAB выпускает «' + c.ru.name + '»? Категория появится в каталоге на сайте.')
    ) {
      el.checked = false;
      return;
    }
    var patch = {};
    patch[slug] = on;
    el.disabled = true;
    api('PUT', '/admin/api/settings', { catalogPublished: patch })
      .then(function (j) {
        afterSave(j, on ? 'Категория опубликована' : 'Категория скрыта');
      })
      .catch(function (x) {
        el.checked = !on;
        handleError(x);
      })
      .finally(function () {
        el.disabled = false;
      });
  });
  $('#catalog-list').addEventListener('click', function (e) {
    var save = e.target.closest('[data-cat-save]');
    var reset = e.target.closest('[data-cat-reset]');
    if (reset) {
      var slug = reset.getAttribute('data-cat-reset');
      var c = S.catalog.filter(function (x) {
        return x.slug === slug;
      })[0];
      ['ru', 'uz'].forEach(function (lang) {
        ['name', 'short', 'intro', 'uses', 'alt'].forEach(function (f) {
          var el = document.querySelector('[data-cfield="' + slug + '.' + lang + '.' + f + '"]');
          el.value = f === 'uses' ? c.defaults[lang].uses.join('\n') : c.defaults[lang][f];
        });
      });
      toast('Исходные тексты подставлены. Нажмите «Сохранить тексты».');
      return;
    }
    if (!save) return;
    var s2 = save.getAttribute('data-cat-save');
    var box = save.closest('.cat');
    clearErrors(box);
    var payload = {};
    payload[s2] = { ru: {}, uz: {} };
    $$('[data-cfield]', box).forEach(function (el) {
      var parts = el.getAttribute('data-cfield').split('.');
      payload[s2][parts[1]][parts[2]] =
        parts[2] === 'uses'
          ? el.value
              .split('\n')
              .map(function (x) {
                return x.trim();
              })
              .filter(Boolean)
          : el.value;
    });
    busy(save, function () {
      return api('PUT', '/admin/api/catalog', payload)
        .then(function (j) {
          afterSave(j);
        })
        .catch(function (x) {
          handleError(x, box, function (field) {
            return box.querySelector('[data-cfield="' + field + '"]');
          });
        });
    });
  });

  // --- texts ---
  function renderTextsGroups() {
    var sel = $('#t-group');
    var cur = sel.value || 'hero';
    var groups = [];
    S.texts.forEach(function (t) {
      var g = t.path.split('.')[0];
      if (groups.indexOf(g) === -1) groups.push(g);
    });
    sel.innerHTML = groups
      .map(function (g) {
        return '<option value="' + g + '">' + esc(GROUP_LABELS[g] || g) + '</option>';
      })
      .join('');
    sel.value = groups.indexOf(cur) !== -1 ? cur : groups[0];
  }
  function rowsFor(v) {
    return Math.min(8, Math.max(1, Math.ceil(String(v).length / 60)));
  }
  function renderTexts() {
    var group = $('#t-group').value;
    var q = $('#t-search').value.trim().toLowerCase();
    var onlyChanged = $('#t-changed').checked;
    var list = S.texts.filter(function (t) {
      if (onlyChanged && !t.changed && !textDirty[t.path]) return false;
      if (q) return (t.path + ' ' + t.ru + ' ' + t.uz).toLowerCase().indexOf(q) !== -1;
      return t.path.split('.')[0] === group;
    });
    if (!list.length) {
      $('#texts-list').innerHTML = '<p class="empty">Ничего не найдено.</p>';
      return;
    }
    $('#texts-list').innerHTML =
      list
        .slice(0, 200)
        .map(function (t) {
          var d = textDirty[t.path] || {};
          var ru = d.ru != null ? d.ru : t.ru;
          var uz = d.uz != null ? d.uz : t.uz;
          var id = 't-' + t.path.replace(/\./g, '-');
          return (
            '<div class="trow' +
            (textDirty[t.path] ? ' is-dirty' : '') +
            '" data-path="' +
            esc(t.path) +
            '">' +
            '<div class="trow-head"><span class="trow-key">' +
            esc(t.path) +
            '</span>' +
            (t.changed ? '<span class="badge badge-warn">Изменено</span>' : '') +
            (t.changed || textDirty[t.path]
              ? '<button type="button" class="btn btn-ghost" data-t-reset>Вернуть исходный</button>'
              : '') +
            '</div>' +
            '<div class="cols"><div><label class="label" for="' +
            id +
            '-ru">RU</label><textarea class="input" id="' +
            id +
            '-ru" data-lang="ru" rows="' +
            rowsFor(ru) +
            '">' +
            esc(ru) +
            '</textarea></div>' +
            '<div><label class="label" for="' +
            id +
            '-uz">UZ</label><textarea class="input" id="' +
            id +
            '-uz" data-lang="uz" rows="' +
            rowsFor(uz) +
            '">' +
            esc(uz) +
            '</textarea></div></div></div>'
          );
        })
        .join('') + (list.length > 200 ? '<p class="empty">Показаны первые 200 строк. Уточните поиск.</p>' : '');
  }
  function updateDirtyBar() {
    var n = Object.keys(textDirty).length;
    $('#texts-save').hidden = n === 0;
    $('#texts-dirty').textContent = 'Изменено строк: ' + n;
  }
  // "input" only: a "change" on blur would re-render the list under the textarea being clicked.
  $('#t-search').addEventListener('input', renderTexts);
  $('#t-group').addEventListener('change', function () {
    $('#t-search').value = '';
    renderTexts();
  });
  $('#t-changed').addEventListener('change', renderTexts);
  $('#texts-list').addEventListener('input', function (e) {
    var ta = e.target;
    if (!ta.matches('textarea')) return;
    var row = ta.closest('.trow');
    var p = row.getAttribute('data-path');
    var t = S.texts.filter(function (x) {
      return x.path === p;
    })[0];
    var ru = $('textarea[data-lang=ru]', row).value;
    var uz = $('textarea[data-lang=uz]', row).value;
    if (ru === t.ru && uz === t.uz) delete textDirty[p];
    else textDirty[p] = { ru: ru, uz: uz };
    row.classList.toggle('is-dirty', Boolean(textDirty[p]));
    updateDirtyBar();
  });
  $('#texts-list').addEventListener('click', function (e) {
    if (!e.target.closest('[data-t-reset]')) return;
    var row = e.target.closest('.trow');
    var p = row.getAttribute('data-path');
    var t = S.texts.filter(function (x) {
      return x.path === p;
    })[0];
    $('textarea[data-lang=ru]', row).value = t.ruDefault;
    $('textarea[data-lang=uz]', row).value = t.uzDefault;
    if (t.ru === t.ruDefault && t.uz === t.uzDefault) delete textDirty[p];
    else textDirty[p] = { ru: t.ruDefault, uz: t.uzDefault };
    row.classList.toggle('is-dirty', Boolean(textDirty[p]));
    updateDirtyBar();
  });
  $('#form-texts').addEventListener('submit', function (e) {
    e.preventDefault();
    var payload = { ru: {}, uz: {} };
    Object.keys(textDirty).forEach(function (p) {
      var t = S.texts.filter(function (x) {
        return x.path === p;
      })[0];
      var d = textDirty[p];
      payload.ru[p] = d.ru === t.ruDefault ? null : d.ru;
      payload.uz[p] = d.uz === t.uzDefault ? null : d.uz;
    });
    var btn = $('#texts-save button');
    clearErrors($('#texts-list'));
    busy(btn, function () {
      return api('PUT', '/admin/api/texts', payload)
        .then(function (j) {
          textDirty = {};
          updateDirtyBar();
          afterSave(j, 'Тексты сохранены');
        })
        .catch(function (x) {
          handleError(x, $('#texts-list'), function (field) {
            var m = /^(ru|uz):(.+)$/.exec(field || '');
            if (!m) return null;
            return document.querySelector('.trow[data-path="' + m[2] + '"] textarea[data-lang=' + m[1] + ']');
          });
        });
    });
  });

  // --- photos ---
  function renderMedia() {
    var sel = $('#m-section');
    if (!sel.options.length)
      sel.innerHTML = S.mediaSections
        .map(function (k) {
          return '<option value="' + k + '">' + esc(MEDIA_LABELS[k] || k) + '</option>';
        })
        .join('');
    var s = S.settings;
    var html = S.mediaSections
      .map(function (k) {
        var parts = k.split('.');
        var items = parts[0] === 'gallery' ? s.gallery[parts[1]] : s.aboutPhotos[parts[1]];
        if (!items || !items.length) return '';
        return (
          '<div class="panel media-group"><h3>' +
          esc(MEDIA_LABELS[k]) +
          '</h3><div class="media-grid">' +
          items
            .map(function (it) {
              return (
                '<figure class="media-item"><img src="' +
                esc(it.src) +
                '" alt="' +
                esc(it.alt.ru) +
                '" width="' +
                it.width +
                '" height="' +
                it.height +
                '" loading="lazy">' +
                '<figcaption class="media-meta"><span>' +
                esc(it.alt.ru) +
                '</span><span class="muted">' +
                it.width +
                '×' +
                it.height +
                (it.illustration ? ' · иллюстрация' : '') +
                '</span>' +
                '<button type="button" class="btn btn-danger" data-media-del="' +
                esc(it.src) +
                '" data-section="' +
                k +
                '">Удалить</button></figcaption></figure>'
              );
            })
            .join('') +
          '</div></div>'
        );
      })
      .join('');
    $('#media-list').innerHTML =
      html || '<p class="empty">Изображений пока нет — разделы галереи и фото производства на сайте скрыты.</p>';
  }
  $('#form-media').addEventListener('submit', function (e) {
    e.preventDefault();
    var form = this;
    clearErrors(form);
    var file = $('#m-file').files[0];
    if (!file) {
      showFieldError($('#m-file'), 'file_required');
      return;
    }
    if (file.size > 6 * 1024 * 1024) {
      showFieldError($('#m-file'), 'file_size');
      return;
    }
    if (!$('#m-alt-ru').value.trim()) {
      showFieldError($('#m-alt-ru'), 'required');
      return;
    }
    if (!$('#m-alt-uz').value.trim()) {
      showFieldError($('#m-alt-uz'), 'required');
      return;
    }
    var btn = $('button[type=submit]', form);
    busy(btn, function () {
      return api('POST', '/admin/api/media', new FormData(form), true)
        .then(function (j) {
          form.reset();
          afterSave(j, 'Изображение добавлено');
        })
        .catch(function (x) {
          handleError(x, form, function (field) {
            return {
              file: $('#m-file'),
              alt_ru: $('#m-alt-ru'),
              alt_uz: $('#m-alt-uz'),
              caption_ru: $('#m-cap-ru'),
              caption_uz: $('#m-cap-uz'),
            }[field];
          });
        });
    });
  });
  $('#media-list').addEventListener('click', function (e) {
    var b = e.target.closest('[data-media-del]');
    if (!b || !confirm('Удалить изображение с сайта?')) return;
    busy(b, function () {
      return api('DELETE', '/admin/api/media', {
        section: b.getAttribute('data-section'),
        src: b.getAttribute('data-media-del'),
      })
        .then(function (j) {
          afterSave(j, 'Изображение удалено');
        })
        .catch(function (x) {
          handleError(x);
        });
    });
  });

  window.addEventListener('beforeunload', function (e) {
    if (Object.keys(textDirty).length) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  load();
})();
