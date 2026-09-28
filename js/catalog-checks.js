(function (global) {
  function assert(ok, message) {
    if (!ok) throw new Error(message);
  }
  function wait(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }
  function shuffle(list) {
    var bag = list.slice();
    for (var i = bag.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var swap = bag[i];
      bag[i] = bag[j];
      bag[j] = swap;
    }
    return bag;
  }
  var LANGS = ['en', 'es', 'pt', 'de', 'fr', 'it'];
  var LANG_TITLE = {
    en: /Professional Summary/i,
    es: /Resumen Profesional/i,
    pt: /Resumo Profissional/i,
    de: /Berufliches Profil/i,
    fr: /Résumé Professionnel/i,
    it: /Riepilogo Professionale/i
  };
  var PRINT_SKILLS = { en: 'Skills', es: 'Habilidades', pt: 'Competências', de: 'Fähigkeiten', fr: 'Compétences', it: 'Competenze' };
  var PRINT_HREFS = [
    'mailto:kaanmuar@gmail.com',
    'tel:+573209191010',
    'https://www.linkedin.com/in/carlos-andres-m-2a60b8b/',
    'https://carlosandmunoz.com/',
    'https://carlosandmunoz.com/qa-lab.html',
    'https://carlosandmunoz.com/simulador.html'
  ];
  var SHARE = [
    ['linkedin.com', '/sharing/share-offsite/'],
    ['twitter.com', '/intent/tweet'],
    ['facebook.com', '/sharer/sharer.php'],
    ['whatsapp.com', '/send'],
    ['t.me', '/share/url'],
    ['reddit.com', '/submit'],
    ['pinterest.com', '/pin/create/button/']
  ];
  function app() {
    assert(global.CarlosMunozCV, 'CV app is not ready');
    return global.CarlosMunozCV;
  }
  function currentLang() {
    var api = global.CarlosMunozCV;
    return (api && (api.state.dictLang || api.state.lang)) || 'en';
  }
  function clearGoogTrans() {
    var expiry = 'Thu, 01 Jan 1970 00:00:00 UTC';
    document.cookie = 'googtrans=; expires=' + expiry + '; path=/';
    if (location.hostname) document.cookie = 'googtrans=; expires=' + expiry + '; path=/; domain=' + location.hostname;
  }
  async function chooseLang(code) {
    clearGoogTrans();
    var sel = document.getElementById('language-selector');
    assert(sel, 'language selector missing');
    var opt = document.querySelector('#language-options .lang-option[data-lang="' + code + '"]');
    if (!opt) {
      sel.click();
      await wait(150);
      opt = document.querySelector('#language-options .lang-option[data-lang="' + code + '"]');
    }
    assert(opt, 'language option missing: ' + code);
    opt.click();
    var title = null;
    var start = Date.now();
    while (Date.now() - start < 4000) {
      title = document.querySelector('[data-translate-key="summary_title"]');
      if (title && LANG_TITLE[code].test(title.textContent) && currentLang() === code) return title.textContent.trim();
      await wait(100);
    }
    assert(false, code + ' summary was "' + (title ? title.textContent.trim() : '') + '"');
  }
  function setDark(want) {
    var html = document.documentElement;
    var btn = document.getElementById('theme-toggle');
    assert(btn, '#theme-toggle missing');
    if (html.classList.contains('dark-mode') !== want) btn.click();
    assert(html.classList.contains('dark-mode') === want, want ? 'theme did not become dark' : 'theme did not become light');
  }
  function assertAddress(href) {
    if (href.indexOf('mailto:') === 0) {
      assert(/^mailto:[^\s@]+@[^\s@]+$/.test(href), 'mail link is not usable: ' + href);
      return;
    }
    if (href.indexOf('tel:') === 0) {
      assert(/^tel:\+?[0-9]{8,}$/.test(href), 'phone link is not usable: ' + href);
      return;
    }
    var url = new URL(href);
    assert(url.protocol === 'https:', 'link is not https: ' + href);
  }
  async function textOf(path) {
    var res = await fetch(path, { cache: 'no-store' });
    assert(res.ok, path + ' returned ' + res.status);
    return res.text();
  }
  async function printedHrefs() {
    var hrefs = [];
    var original = global.print;
    global.print = function () {
      hrefs = [].slice.call(document.querySelectorAll('#print-content a[href]')).map(function (a) { return a.getAttribute('href'); });
    };
    try {
      var btn = document.getElementById('print-btn');
      assert(btn, '#print-btn missing');
      var before = location.href;
      btn.click();
      for (var i = 0; i < 30 && hrefs.length === 0; i++) await wait(100);
      assert(location.href === before, 'print left the CV');
    } finally {
      global.print = original;
    }
    assert(hrefs.length > 0, 'print did not build the recruiter sheets');
    return hrefs;
  }
  function decodeDataUrl(href) {
    var comma = href.indexOf(',');
    if (comma === -1) return '';
    try { return decodeURIComponent(href.slice(comma + 1)); }
    catch (err) { return href.slice(comma + 1); }
  }
  async function visibleTour() {
    var start = [].slice.call(document.querySelectorAll('#tour-start-btn')).filter(function (el) { return el.offsetParent !== null; })[0] || document.getElementById('tour-start-btn');
    start.click();
    var tip = document.getElementById('tour-tooltip');
    var shown = Date.now();
    while (!tip.classList.contains('visible') && Date.now() - shown < 3000) await wait(50);
    return tip;
  }

  var checks = {
    'SMK-01': async function () {
      var paths = ['index.html', 'simulador.html', 'admin.html', 'qa-lab.html', 'style.css', 'css/cv.css', 'js/cv-data.js', 'js/cv-app.js', 'favicon.svg', 'robots.txt', 'sitemap.xml'];
      for (var i = 0; i < paths.length; i++) await textOf(paths[i]);
      return paths.length + ' assets answered 200';
    },
    'SMK-02': async function () {
      assert(/Carlos Muñoz/i.test(document.title), 'Unexpected title: ' + document.title);
      assert(document.documentElement.getAttribute('data-skin') === 'harbor', 'Harbor skin missing');
      return document.title;
    },
    'FN-01': async function () {
      document.documentElement.classList.remove('dark-mode');
      localStorage.setItem('theme', 'light');
      document.getElementById('theme-toggle').click();
      assert(document.documentElement.classList.contains('dark-mode'), 'dark-mode not applied');
      return 'dark-mode applied';
    },
    'FN-02': async function () {
      var original = currentLang();
      var chosen = shuffle(LANGS.filter(function (code) { return code !== original; }))[0];
      try { return chosen + ' · ' + await chooseLang(chosen); }
      finally { if (currentLang() !== original) await chooseLang(original); }
    },
    'FN-03': async function () {
      var original = currentLang();
      var chosen = shuffle(LANGS.filter(function (code) { return code !== original; }))[0];
      var api = app();
      function show(code) {
        var url = code === 'en' ? location.pathname : location.pathname + '?lang=' + code;
        history.replaceState(null, '', url);
        try { localStorage.setItem('cv-preferred-lang', code); } catch (err) { /* ignore */ }
        if (code !== 'en' && api._applyUrlLanguage) api._applyUrlLanguage();
        else {
          api.state.lang = code;
          api.state.dictLang = code;
        }
        api.translatePage(code);
      }
      try {
        show(chosen);
        var title = document.querySelector('[data-translate-key="summary_title"]');
        var start = Date.now();
        while (title && !LANG_TITLE[chosen].test(title.textContent) && Date.now() - start < 4000) {
          await wait(100);
          title = document.querySelector('[data-translate-key="summary_title"]');
        }
        assert(title && LANG_TITLE[chosen].test(title.textContent), chosen + ' title missing: ' + (title ? title.textContent : ''));
        assert(currentLang() === chosen, 'loaded language is ' + currentLang());
        return chosen + ' · ' + title.textContent.trim();
      } finally {
        show(original);
        assert(currentLang() === original, 'did not return to ' + original);
      }
    },
    'FN-04': async function () {
      document.getElementById('profile-photo').click();
      var modal = document.getElementById('image-modal');
      assert(modal.classList.contains('visible'), 'modal did not open');
      document.querySelector('.modal-close').click();
      assert(!modal.classList.contains('visible'), 'modal did not close');
      return 'modal visible class toggled';
    },
    'FN-05': async function () {
      var kpis = document.querySelectorAll('.glance-kpi');
      assert(kpis.length === 5, 'expected 5 KPIs, got ' + kpis.length);
      assert(/18\+/.test(document.getElementById('glance-kpis').textContent), '18+ missing');
      return '5 KPIs, 18+ present';
    },
    'FN-06': async function () {
      app()._showGlancePair(0, false);
      await wait(120);
      var labels = [].slice.call(document.querySelectorAll('#competencies-radar-chart g.radar-label'));
      var qa = labels.filter(function (el) { return /QA & Automation/.test((el.querySelector('text') || {}).textContent || ''); })[0];
      assert(qa, 'QA & Automation label not on the radar');
      qa.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await wait(200);
      assert(document.querySelector('.tech-tag[data-skill-name="Selenium"]').classList.contains('selected'), 'Selenium not selected');
      assert(document.querySelector('.tech-tag[data-skill-name="Cypress"]').classList.contains('selected'), 'Cypress not selected');
      return 'Selenium + Cypress selected';
    },
    'FN-07': async function () {
      document.getElementById('expand-all-toolkit').click();
      document.querySelector('.tech-tag[data-skill-name="Selenium"]').click();
      await wait(80);
      assert(document.querySelector('.experience-item.filter-match'), 'no matching experience');
      assert(document.querySelector('.experience-item.filter-no-match'), 'no excluded experience');
      return 'match + no-match classes applied';
    },
    'FN-08': async function () {
      var link = document.querySelector('#timeline-container .timeline-item a');
      var id = link.getAttribute('href').slice(1);
      link.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await wait(80);
      assert(document.getElementById(id).classList.contains('is-open'), id + ' did not open');
      return id + ' is-open';
    },
    'FN-09': async function () {
      document.getElementById('export-selector').click();
      var n = document.querySelectorAll('#export-options button').length;
      assert(n >= 5, 'expected ≥5 export options, got ' + n);
      return n + ' export handlers listed';
    },
    'FN-10': async function () {
      assert(document.getElementById('print-btn'), 'print missing');
      assert(document.getElementById('sim-launch-btn'), 'studio launch missing');
      return 'print + studio launch present';
    },
    'FN-11': async function () {
      var btn = document.getElementById('read-more-btn');
      btn.click();
      assert(btn.getAttribute('aria-expanded') === 'true', 'summary did not expand');
      return 'aria-expanded=true';
    },
    'FN-12': async function () {
      var section = document.querySelector('section[aria-labelledby="education-heading"]');
      assert(document.getElementById('certs-subheading'), 'certs heading missing');
      assert(/ISTQB/.test(section.textContent), 'ISTQB missing');
      return 'ISTQB listed under certifications';
    },
    'FN-13': async function () {
      document.getElementById('contact-widget-fab').click();
      var form = document.getElementById('message-form');
      var send = document.getElementById('send-message-btn');
      assert(send.disabled, 'send should be disabled');
      var name = form.querySelector('#sender-name');
      name.focus();
      name.dispatchEvent(new FocusEvent('focusout'));
      await wait(40);
      assert(name.classList.contains('invalid'), 'name not marked invalid');
      document.getElementById('widget-close-btn').click();
      return 'submit disabled; name invalid';
    },
    'FN-14': async function () {
      var tip = await visibleTour();
      assert(tip.classList.contains('visible'), 'tour tooltip not shown');
      assert(/1\s*\//.test(document.getElementById('tour-step-counter').textContent), 'step 1 missing');
      var next = document.getElementById('tour-next-btn');
      var startWait = Date.now();
      while (next.disabled && Date.now() - startWait < 16000) await wait(200);
      assert(!next.disabled, 'Next never enabled');
      next.click();
      var counter = document.getElementById('tour-step-counter');
      var advanced = Date.now();
      while (!/2\s*\//.test(counter.textContent) && Date.now() - advanced < 3000) await wait(50);
      assert(/2\s*\//.test(counter.textContent), 'did not advance');
      document.getElementById('tour-close-btn').click();
      return 'demo-gated Next, then closed';
    },
    'FN-15': async function () {
      var btn = document.querySelector('.competency-item[data-competency="pm"]');
      assert(btn, 'competency button missing');
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await wait(120);
      assert(document.documentElement.classList.contains('topic-focus'), 'topic-focus not applied');
      assert(btn.getAttribute('aria-pressed') === 'true', 'competency not pressed');
      assert(document.querySelector('.experience-item.topic-match'), 'no highlighted experience');
      assert(document.querySelector('.experience-item.topic-dim'), 'no dimmed experience');
      document.getElementById('languages-heading').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await wait(80);
      assert(!document.documentElement.classList.contains('topic-focus'), 'topic-focus stayed after outside click');
      return 'pm focus + restore';
    },
    'FN-16': async function () {
      var items = [].slice.call(document.querySelectorAll('.competency-item'));
      var ids = items.map(function (el) { return el.dataset.competency; });
      assert(ids.join(',') === 'pm,qa,lead,devops,cloud,strategy,relations,ai', 'unexpected ids: ' + ids.join(','));
      items.forEach(function (el) { assert(el.getAttribute('aria-pressed') === 'false', el.dataset.competency + ' should start unpressed'); });
      return '8 competency filters';
    },
    'FN-17': async function () {
      var btn = document.querySelector('.competency-item[data-competency="qa"]');
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await wait(80);
      assert(document.documentElement.classList.contains('topic-focus'), 'qa focus missing');
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await wait(80);
      assert(!document.documentElement.classList.contains('topic-focus'), 'toggle did not restore');
      assert(btn.getAttribute('aria-pressed') === 'false', 'qa still pressed');
      return 'qa toggle restore';
    },
    'FN-18': async function () {
      document.querySelector('.competency-item[data-competency="pm"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await wait(80);
      document.querySelector('.competency-item[data-competency="qa"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await wait(80);
      assert(document.querySelector('.competency-item[data-competency="qa"]').getAttribute('aria-pressed') === 'true', 'QA is not pressed');
      assert(document.querySelector('.competency-item[data-competency="pm"]').getAttribute('aria-pressed') === 'false', 'PM still pressed');
      assert(document.querySelector('.tech-tag[data-skill-name="Selenium"]').classList.contains('selected'), 'Selenium not selected');
      return 'QA focus replaced PM';
    },
    'FN-19': async function () {
      var start = Date.now();
      while (!document.documentElement.classList.contains('topic-focus') && Date.now() - start < 4000) await wait(100);
      assert(document.documentElement.classList.contains('topic-focus'), 'deep link did not focus');
      assert(document.querySelector('.competency-item[data-competency="qa"]').getAttribute('aria-pressed') === 'true', 'qa not pressed from URL');
      var cert = document.querySelector('[data-topic="qa"]');
      assert(cert && cert.classList.contains('topic-match'), 'QA certification not highlighted');
      return 'topic=qa deep link';
    },
    'FN-20': async function () {
      var btn = document.querySelector('.competency-item[data-competency="qa"]');
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await wait(80);
      document.getElementById('reset-filter').click();
      await wait(80);
      assert(!document.documentElement.classList.contains('topic-focus'), 'reset left topic-focus');
      assert(!document.querySelector('.tech-tag.selected'), 'toolkit tags still selected');
      return 'reset clears topic';
    },
    'FN-21': async function () {
      document.querySelector('.competency-item[data-competency="pm"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await wait(80);
      var match = document.querySelector('.experience-item.topic-match');
      assert(match, 'no matching experience');
      match.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await wait(80);
      assert(document.documentElement.classList.contains('topic-focus'), 'match click cleared focus');
      return 'match click keeps focus';
    },
    'FN-22': async function () {
      app()._showGlancePair(0, false);
      await wait(120);
      var labels = [].slice.call(document.querySelectorAll('#competencies-radar-chart g.radar-label'));
      var qa = labels.filter(function (el) { return /QA & Automation/.test((el.querySelector('text') || {}).textContent || ''); })[0];
      qa.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await wait(200);
      assert(document.documentElement.classList.contains('topic-focus'), 'radar did not apply topic-focus');
      assert(document.querySelector('.competency-item[data-competency="qa"]').getAttribute('aria-pressed') === 'true', 'sidebar QA not pressed');
      assert(document.querySelector('.experience-item.topic-dim'), 'no dimmed experience from radar');
      return 'radar → competency focus';
    },
    'FN-23': async function () {
      var original = document.documentElement.classList.contains('dark-mode');
      setDark(true); setDark(false); setDark(true); setDark(original);
      return (original ? 'started dark' : 'started light') + ' and restored';
    },
    'FN-24': async function () {
      var original = currentLang();
      var picks = shuffle(LANGS.filter(function (code) { return code !== original; })).slice(0, 3);
      assert(picks.length === 3, 'need three languages');
      try {
        for (var i = 0; i < picks.length; i++) await chooseLang(picks[i]);
        await chooseLang(original);
        return picks.join(' → ') + ' → ' + original;
      } finally {
        if (currentLang() !== original) await chooseLang(original);
      }
    },
    'FN-25': async function () {
      var pageUrl = location.href.split('?')[0];
      var encoded = encodeURIComponent(pageUrl);
      ['social-share-options', 'social-share-options-mobile-container'].forEach(function (id) {
        var links = [].slice.call(document.querySelectorAll('#' + id + ' a[href]')).filter(function (a) { return a.getAttribute('href') !== '#'; });
        assert(links.length === SHARE.length, id + ' has ' + links.length + ' share links');
        SHARE.forEach(function (pair) {
          var link = links.filter(function (a) { return a.href.indexOf(pair[0]) !== -1 && a.href.indexOf(pair[1]) !== -1; })[0];
          assert(link, id + ' is missing ' + pair[0]);
          assert(link.target === '_blank', pair[0] + ' target');
          assert(/noopener/i.test(link.rel), pair[0] + ' noopener');
          assert(link.href.indexOf(encoded) !== -1, pair[0] + ' missing page url');
        });
      });
      var before = location.href;
      document.getElementById('copy-link-btn-desktop').click();
      await wait(40);
      assert(location.href === before, 'copy link navigated away');
      return SHARE.length + ' networks';
    },
    'FN-26': async function () {
      var original = currentLang();
      var chosen = shuffle(LANGS.filter(function (code) { return code !== original; }))[0];
      try {
        await chooseLang(chosen);
        var hrefs = await printedHrefs();
        var sheets = document.querySelectorAll('#print-content .sheet');
        assert(sheets.length > 0, 'print sheets missing');
        var text = [].slice.call(sheets).map(function (sheet) { return sheet.textContent; }).join('\n');
        assert(text.indexOf(PRINT_SKILLS[chosen]) !== -1, 'print sheets missing ' + PRINT_SKILLS[chosen]);
        assert(hrefs.length >= PRINT_HREFS.length, 'print built ' + hrefs.length + ' links');
        return chosen + ' · ' + sheets.length + ' sheets';
      } finally {
        if (currentLang() !== original) await chooseLang(original);
      }
    },
    'FN-27': async function () {
      var hrefs = await printedHrefs();
      PRINT_HREFS.forEach(function (expected) {
        assert(hrefs.indexOf(expected) !== -1, 'print is missing ' + expected);
        assertAddress(expected);
      });
      var pages = ['/', '/qa-lab.html', '/simulador.html'];
      for (var i = 0; i < pages.length; i++) {
        var res = await fetch(pages[i], { cache: 'no-store' });
        assert(res.ok, pages[i] + ' ' + res.status);
      }
      return hrefs.length + ' print links';
    },
    'FN-28': async function () {
      var original = currentLang();
      var chosen = shuffle(LANGS.filter(function (code) { return code !== original; }))[0];
      var files = [];
      var proto = HTMLAnchorElement.prototype;
      var origClick = proto.click;
      var realCanvas = global.html2canvas;
      proto.click = function () {
        var name = this.getAttribute('download') || '';
        if (name) files.push({ name: name, href: this.getAttribute('href') || '' });
      };
      global.html2canvas = function () {
        var canvas = document.createElement('canvas');
        canvas.width = 12; canvas.height = 12;
        return Promise.resolve(canvas);
      };
      global.alert = function () {};
      try {
        await chooseLang(chosen);
        assert(typeof realCanvas === 'function', 'html2canvas missing');
        assert(typeof global.jsPDF === 'function', 'jsPDF missing');
        var buttons = [].slice.call(document.querySelectorAll('#export-options button'));
        assert(buttons.length === 5, 'export menu has ' + buttons.length);
        var api = app();
        var RealPdf = global.jsPDF;
        function WrappedPdf(options) {
          var doc = new RealPdf(options);
          var origSave = doc.save;
          doc.save = function (filename) {
            files.push({ name: filename, href: 'application/pdf' });
            return origSave.apply(doc, arguments);
          };
          return doc;
        }
        WrappedPdf.API = RealPdf.API;
        global.jsPDF = WrappedPdf;
        try {
          await api._exportAsPDF_jsPDF();
          await api._exportAsJPG();
        } finally {
          global.jsPDF = RealPdf;
        }
        api._exportAsATS();
        api._exportAsJSON();
        api._exportAsText();
        var names = files.map(function (file) { return file.name; });
        ['CarlosMunozCV_Export.pdf', 'CarlosMunozCV.jpg', 'CarlosMunozCV_ATS.doc', 'CarlosMunozCV_Export.txt', 'carlos_munoz_cv_' + chosen + '.json'].forEach(function (name) {
          assert(names.indexOf(name) !== -1, 'download missing ' + name + ' (got ' + names.join(', ') + ')');
        });
        var text = decodeDataUrl((files.filter(function (file) { return file.name === 'CarlosMunozCV_Export.txt'; })[0] || {}).href || '');
        var json = decodeDataUrl((files.filter(function (file) { return /\.json$/.test(file.name); })[0] || {}).href || '');
        assert(text.indexOf(PRINT_SKILLS[chosen]) !== -1, 'text export missing ' + PRINT_SKILLS[chosen]);
        assert(json.indexOf('"language": "' + chosen + '"') !== -1, 'JSON language is not ' + chosen);
        return chosen + ' · ' + names.length + ' files';
      } finally {
        proto.click = origClick;
        global.html2canvas = realCanvas;
        if (currentLang() !== original) await chooseLang(original);
      }
    },
    'FN-29': async function () {
      document.getElementById('contact-widget-fab').click();
      await wait(60);
      var widget = document.getElementById('contact-widget');
      var send = document.getElementById('send-message-btn');
      var wr = widget.getBoundingClientRect();
      var sr = send.getBoundingClientRect();
      assert(sr.height > 0 && sr.top >= wr.top - 1 && sr.bottom <= wr.bottom + 1, 'send button is outside the widget');
      document.getElementById('widget-close-btn').click();
      return 'send button inside the panel';
    },
    'FN-30': async function () {
      await visibleTour();
      var next = document.getElementById('tour-next-btn');
      var startWait = Date.now();
      while (next.disabled && Date.now() - startWait < 16000) await wait(200);
      next.click();
      var counter = document.getElementById('tour-step-counter');
      var advanced = Date.now();
      while (!/2\s*\//.test(counter.textContent) && Date.now() - advanced < 3000) await wait(50);
      document.getElementById('tour-back-btn').click();
      var backed = Date.now();
      while (!/1\s*\//.test(counter.textContent) && Date.now() - backed < 3000) await wait(50);
      assert(/1\s*\//.test(counter.textContent), 'Back did not return to step 1');
      document.getElementById('tour-close-btn').click();
      return 'Back restored step 1';
    },
    'FN-31': async function () {
      var offer = document.getElementById('engagement-offer');
      assert(offer, 'engagement offer missing');
      assert(/contrac?t|vertrag/i.test(offer.textContent), 'offer text: ' + offer.textContent);
      return 'offer visible';
    },
    'FN-32': async function () {
      var html = await textOf('qa-lab.html');
      var tour = await textOf('js/site-tour.js');
      assert(html.includes('id="fw-picker"'), 'framework picker missing');
      assert(html.includes('id="fw-ask"'), 'framework ask missing');
      assert(html.includes('id="runner-drawer"'), 'runner drawer missing');
      assert(html.includes('id="view-slider"'), 'watch switch missing');
      assert(html.includes('id="browser-ask-list"'), 'browser ask missing');
      assert(html.includes('id="device-ask-list"'), 'device ask missing');
      assert(html.includes('id="suite-repo"'), 'suite repo control missing');
      assert(html.includes('id="studio-link"'), 'sprint studio control missing');
      assert(tour.includes("localStorage.setItem(key, 'true')"), 'finished tour is not remembered');
      return 'picker, browsers, devices, remembered tour';
    },
    'FN-33': async function () {
      document.getElementById('contact-widget-fab').click();
      await wait(40);
      document.getElementById('rating-tab').click();
      var stars = document.querySelectorAll('#star-rating .star');
      assert(stars.length === 5, 'expected five stars, saw ' + stars.length);
      stars[4].click();
      assert(document.getElementById('rating-value').value === '5', 'rating value is not 5');
      document.getElementById('widget-close-btn').click();
      return 'five stars, fifth selected';
    },
    'FN-34': async function () {
      var html = await textOf('qa-lab.html');
      assert(html.includes('id="report-open"'), 'report button missing');
      assert(html.includes('id="report-lang"'), 'report language missing');
      assert(html.includes('value="en" selected'), 'English is not the default report language');
      assert(html.includes('id="opt-graphs" checked'), 'graphs are not on by default');
      return 'lab report options';
    },
    'SEC-01': async function () {
      var body = await textOf('robots.txt');
      assert(/Allow:\s*\//.test(body), 'Allow / missing');
      assert(/Disallow:\s*\/admin\.html/.test(body), 'admin not disallowed');
      assert(/Disallow:\s*\/cypress\//.test(body), 'cypress not disallowed');
      assert(/Disallow:\s*\/tests\//.test(body), 'tests not disallowed');
      return 'Allow / · admin/cypress/tests disallowed';
    },
    'SEC-02': async function () {
      var xml = await textOf('sitemap.xml');
      assert(xml.includes('simulador.html') && xml.includes('qa-lab.html'), 'public urls missing');
      assert(!xml.includes('admin.html'), 'admin leaked into sitemap');
      return 'public URLs + hreflang';
    },
    'SEC-03': async function () {
      var html = await textOf('admin.html');
      assert(/name="robots"[^>]*noindex/i.test(html), 'admin robots meta missing noindex');
      return 'noindex';
    },
    'SEC-04': async function () {
      var robots = document.querySelector('meta[name="robots"]').content;
      assert(/index/i.test(robots), 'CV not indexable');
      assert(/carlosandmunoz\.com/.test(document.querySelector('link[rel="canonical"]').href), 'canonical host unexpected');
      var json = document.getElementById('person-structured-data').textContent;
      assert(/Carlos/.test(json) && /18 (years|años)/i.test(json), 'JSON-LD incomplete');
      return 'index + canonical + Person JSON-LD';
    },
    'SEC-05': async function () {
      var a = document.querySelector('#contact-linkedin a');
      assert(/noopener/.test(a.getAttribute('rel') || ''), 'noopener missing');
      assert(a.getAttribute('target') === '_blank', 'target is not _blank');
      return a.getAttribute('rel');
    },
    'SEC-06': async function () {
      assert(document.querySelector('.main-container'), 'CV failed to render');
      return 'no dialog; page intact';
    },
    'SEC-07': async function () {
      function loginOnly(html, count, label) {
        var tags = html.match(/<a\b[^>]*>/g) || [];
        var links = tags.filter(function (tag) { return /href\s*=\s*["']admin\.html["']/.test(tag); });
        assert(links.length === count, label + ' admin links ' + links.length);
        links.forEach(function (tag) { assert(/id="admin-login-btn/.test(tag), label + ' admin href is not the login control'); });
      }
      loginOnly(await textOf('index.html'), 2, 'CV');
      loginOnly(await textOf('simulador.html'), 1, 'studio');
      loginOnly(await textOf('qa-lab.html'), 1, 'lab');
      return 'login control only';
    },
    'SEC-08': async function () {
      var json = document.getElementById('competencies-structured-data').textContent;
      assert(/DefinedTerm/.test(json) && /IT Project Management/.test(json) && /topic=pm/.test(json), 'competency JSON-LD incomplete');
      var keys = document.querySelector('meta[name="keywords"]').content;
      assert(/IT Project Management/.test(keys), 'keywords omit IT Project Management');
      return 'competency ItemList + keywords';
    },
    'A11Y-01': async function () {
      if (!global.axe) {
        await new Promise(function (resolve, reject) {
          var s = document.createElement('script');
          s.src = 'https://cdn.jsdelivr.net/npm/axe-core@4.10.3/axe.min.js';
          s.onload = resolve;
          s.onerror = function () { reject(new Error('axe-core failed to load')); };
          document.head.appendChild(s);
        });
      }
      var results = await global.axe.run(
        { exclude: [['#contact-widget'], ['.skiptranslate']] },
        { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] }, rules: { 'color-contrast': { enabled: false } } }
      );
      var serious = results.violations.filter(function (v) { return v.impact === 'serious' || v.impact === 'critical'; });
      assert(serious.length === 0, serious.map(function (v) { return v.id; }).join(', ') || 'axe failed');
      return results.violations.length + ' non-blocking / 0 serious';
    },
    'A11Y-02': async function () {
      assert(document.querySelectorAll('main.main-content').length === 1, 'main landmark missing');
      assert(/Carlos/i.test(document.getElementById('main-name').textContent), 'name heading missing');
      return 'main + h1 Carlos';
    },
    'A11Y-03': async function () {
      var toggle = document.getElementById('theme-toggle');
      toggle.focus();
      assert(document.activeElement === toggle, 'theme toggle not focused');
      var alt = document.getElementById('profile-photo').getAttribute('alt') || '';
      assert(alt.length > 0, 'profile alt empty');
      return alt;
    },
    'A11Y-04': async function () {
      var tip = await visibleTour();
      assert(tip.getAttribute('role') === 'dialog', 'tour card is not a dialog');
      assert(document.activeElement === tip, 'focus did not move to the tour card');
      assert(document.getElementById('tour-title').textContent.trim().length > 0, 'tour title empty');
      assert(document.getElementById('tour-description').textContent.trim().length > 0, 'tour instructions empty');
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      assert(!tip.classList.contains('visible'), 'Escape did not close the tour');
      return 'dialog focused, then closed';
    },
    'A11Y-05': async function () {
      var ready = Date.now();
      while (!global.SiteTour && Date.now() - ready < 5000) await wait(50);
      document.getElementById('tour-start-btn').click();
      var tip = document.getElementById('site-tour-tooltip');
      var title = document.getElementById('site-tour-title');
      var shown = Date.now();
      while (Date.now() - shown < 3000 && (!tip || !title || title.textContent.trim() !== 'Sprint views')) {
        await wait(40);
        tip = document.getElementById('site-tour-tooltip');
        title = document.getElementById('site-tour-title');
      }
      assert(tip && tip.getAttribute('role') === 'dialog', 'studio tour card is not a dialog');
      assert(document.activeElement === tip, 'focus did not move to the studio tour');
      assert(title && title.textContent.trim() === 'Sprint views', 'first studio step was "' + (title ? title.textContent.trim() : '') + '"');
      assert(document.getElementById('site-tour-body').textContent.trim().length > 0, 'studio instructions empty');
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      assert(!document.documentElement.classList.contains('site-tour-on'), 'Escape did not close the studio tour');
      return 'studio dialog focused, then closed';
    },
    'A11Y-06': async function () {
      document.getElementById('tour-start-btn').click();
      var tip = document.getElementById('site-tour-tooltip');
      assert(tip && tip.getAttribute('role') === 'dialog', 'lab tour card is not a dialog');
      assert(document.activeElement === tip, 'focus did not move to the lab tour');
      assert(document.getElementById('site-tour-title').textContent.trim() === 'The catalog', 'first lab step missing');
      assert(document.getElementById('site-tour-body').textContent.trim().length > 0, 'lab instructions empty');
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      assert(!document.documentElement.classList.contains('site-tour-on'), 'Escape did not close the lab tour');
      return 'lab dialog focused, then closed';
    },
    'ADM-01': async function () {
      assert(document.getElementById('login-overlay'), 'overlay missing');
      assert(document.getElementById('dashboard').classList.contains('hidden'), 'dashboard visible');
      return 'login wall up';
    },
    'ADM-02': async function () {
      document.querySelector('#login-form button[type="submit"]').click();
      assert(document.getElementById('email').validity.valueMissing, 'valueMissing not set');
      return 'native required caught empty email';
    },
    'ADM-03': async function () {
      assert(document.querySelector('label[for="email"]'), 'email label missing');
      assert(document.querySelector('label[for="password"]'), 'password label missing');
      return 'email + password labelled';
    },
    'STU-01': async function () {
      var html = await textOf('simulador.html');
      assert(html.includes('Run 4-agent sprint'), 'run control copy missing');
      assert(/class=["']ticket/.test(html), 'ticket markup missing');
      return 'board + run control present';
    },
    'STU-02': async function () {
      var html = await textOf('simulador.html');
      assert(/Xray \/ TestRail/.test(html), 'Xray nav missing');
      assert(/qa-lab\.html/.test(html), 'regression lab link missing');
      return 'Xray + lab';
    },
    'STU-03': async function () {
      var html = await textOf('simulador.html');
      assert(/How this studio works/.test(html), 'studio tour copy missing');
      assert(/hasSeenStudioTour/.test(html), 'studio tour session key missing');
      return 'studio tour wired';
    },
    'STU-04': async function () {
      var html = await textOf('simulador.html');
      ['Jira', 'Azure DevOps', 'Monday.com', 'Trello', 'Linear', 'Asana', 'MS Project'].forEach(function (name) {
        assert(html.includes(name), name + ' board missing');
      });
      assert(html.includes('data-board'), 'board choice missing');
      return 'seven boards offered';
    },
    'STU-05': async function () {
      var html = await textOf('simulador.html');
      assert(html.includes('id="runner-edge"') && html.includes('id="runner-drawer"'), 'runner drawer missing');
      return 'studio runner drawer';
    },
    'STU-06': async function () {
      var html = await textOf('simulador.html');
      assert(html.includes('id="studio-report-open"') && html.includes('value="en" selected'), 'studio report options missing');
      return 'studio report options';
    },
    'STU-07': async function () {
      var html = await textOf('simulador.html');
      ['PAY-241', 'PAY-246', 'PAY-251', 'PAY-255', 'PAY-260', 'PAY-264', 'CV-301', 'CV-321', 'CV-352', 'CV-380', 'CV-442', 'CV-448', 'XT-1701', 'XT-1702', 'XT-1703'].forEach(function (key) {
        assert(html.includes("key: '" + key + "'"), key + ' missing');
      });
      assert(html.includes('data-view="flow"'), 'sprint analytics missing');
      return 'rehearsal set and CV delivery tickets';
    },
    'MOB-01': async function () {
      assert(global.innerWidth <= 430, 'not phone-wide: ' + global.innerWidth);
      var tb = document.querySelector('.mobile-toolbar');
      assert(tb && getComputedStyle(tb).display !== 'none', 'mobile toolbar hidden');
      assert(document.getElementById('sim-launch-btn-mobile'), 'studio launcher missing');
      assert(document.getElementById('qa-lab-btn-mobile'), 'lab launcher missing');
      return 'toolbar + launchers at ' + global.innerWidth + 'px';
    },
    'MOB-02': async function () {
      var extra = document.documentElement.scrollWidth - global.innerWidth;
      assert(extra <= 2, 'horizontal overflow ' + extra + 'px');
      return 'overflow-x ' + extra + 'px';
    },
    'MOB-03': async function () {
      var bar = document.querySelector('.topbar');
      var run = document.getElementById('runBtn');
      var home = document.getElementById('homeBtn');
      assert(bar && run && home, 'studio chrome missing');
      var br = bar.getBoundingClientRect();
      var rr = run.getBoundingClientRect();
      assert(rr.height > 0 && rr.bottom <= br.bottom + 2, 'run control clipped');
      assert(home.getBoundingClientRect().width > 0, 'back control not painted');
      return 'topbar ' + Math.round(br.height) + 'px';
    },
    'MOB-04': async function () {
      var overflowY = getComputedStyle(document.body).overflowY;
      assert(overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'visible', 'body still locks scroll: ' + overflowY);
      var nav = document.querySelector('.nav');
      assert(nav && getComputedStyle(nav).display === 'flex', 'nav not row on phone');
      return 'overflow-y ' + overflowY;
    },
    'MOB-05': async function () {
      var bar = document.querySelector('.topbar');
      var h1 = document.querySelector('.intro h1');
      assert(bar && h1, 'lab header/heading missing');
      assert(h1.getBoundingClientRect().top >= bar.getBoundingClientRect().bottom - 1, 'heading sits under the topbar');
      assert(document.getElementById('homeBtn'), 'lab back missing');
      assert(document.querySelector('[data-pace="1"]'), 'pace control missing');
      assert(document.querySelector('[data-view="watch"]'), 'watch control missing');
      return 'heading below the header';
    },
    'MOB-06': async function () {
      var overlay = document.getElementById('login-overlay');
      var home = document.getElementById('admin-home');
      assert(overlay && home, 'login or back missing');
      assert(getComputedStyle(overlay).display !== 'none', 'overlay hidden');
      assert(overlay.getBoundingClientRect().width >= Math.min(global.innerWidth, 300), 'overlay does not span the phone');
      return 'login + back at ' + global.innerWidth + 'px';
    }
  };

  global.CatalogChecks = checks;
})(window);
