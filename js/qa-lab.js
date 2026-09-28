(function (global) {
  const HISTORY_KEY = 'qa-lab-history';
  const AXE_SRC = 'https://cdn.jsdelivr.net/npm/axe-core@4.10.3/axe.min.js';

  function assert(ok, message) {
    if (!ok) throw new Error(message);
  }

  async function fetchText(path) {
    const res = await fetch(path, { cache: 'no-store' });
    assert(res.ok, path + ' returned HTTP ' + res.status);
    return res.text();
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function withTimeout(work, ms, label) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(label + ' timed out after ' + ms + 'ms')), ms);
      Promise.resolve(work).then(
        (value) => { clearTimeout(timer); resolve(value); },
        (err) => { clearTimeout(timer); reject(err); }
      );
    });
  }

  const NATIVE_LANGS = ['en', 'es', 'pt', 'de', 'fr', 'it'];
  const LANG_TITLE = {
    en: /Professional Summary/i,
    es: /Resumen Profesional/i,
    pt: /Resumo Profissional/i,
    de: /Berufliches Profil/i,
    fr: /Résumé Professionnel/i,
    it: /Riepilogo Professionale/i
  };
  const PRINT_SKILLS = {
    en: 'Skills',
    es: 'Habilidades',
    pt: 'Competências',
    de: 'Fähigkeiten',
    fr: 'Compétences',
    it: 'Competenze'
  };
  const PRINT_HREFS = [
    'mailto:kaanmuar@gmail.com',
    'tel:+573209191010',
    'https://www.linkedin.com/in/carlos-andres-m-2a60b8b/',
    'https://carlosandmunoz.com/',
    'https://carlosandmunoz.com/qa-lab.html',
    'https://carlosandmunoz.com/simulador.html'
  ];
  const SHARE_TARGETS = [
    ['linkedin.com', '/sharing/share-offsite/'],
    ['twitter.com', '/intent/tweet'],
    ['facebook.com', '/sharer/sharer.php'],
    ['whatsapp.com', '/send'],
    ['t.me', '/share/url'],
    ['reddit.com', '/submit'],
    ['pinterest.com', '/pin/create/button/']
  ];

  function shuffle(list) {
    const bag = list.slice();
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const swap = bag[i];
      bag[i] = bag[j];
      bag[j] = swap;
    }
    return bag;
  }

  function cvApp(cv) {
    const app = cv.window.CarlosMunozCV;
    assert(app, 'CV app is not ready');
    return app;
  }

  function currentLang(cv) {
    const app = cv.window.CarlosMunozCV;
    return (app && (app.state.dictLang || app.state.lang)) || 'en';
  }

  function clearGoogTrans() {
    const expiry = 'Thu, 01 Jan 1970 00:00:00 UTC';
    document.cookie = 'googtrans=; expires=' + expiry + '; path=/';
    const host = location.hostname;
    if (host) document.cookie = 'googtrans=; expires=' + expiry + '; path=/; domain=' + host;
  }

  function liveCv(cv) {
    const frame = document.getElementById('sut');
    const win = frame && frame.contentWindow;
    const doc = frame && frame.contentDocument;
    if (win && doc && win.CarlosMunozCV) return { window: win, document: doc };
    return cv;
  }

  async function chooseLang(cv, code) {
    clearGoogTrans();
    const page = liveCv(cv);
    const sel = page.document.getElementById('language-selector');
    assert(sel, 'language selector missing');
    let opt = page.document.querySelector('#language-options .lang-option[data-lang="' + code + '"]');
    if (!opt) {
      sel.click();
      await wait(150);
      opt = liveCv(cv).document.querySelector('#language-options .lang-option[data-lang="' + code + '"]');
    }
    assert(opt, 'language option missing: ' + code);
    opt.click();
    const start = Date.now();
    let title = null;
    let seen = '';
    while (Date.now() - start < 4000) {
      const next = liveCv(cv);
      title = next.document.querySelector('[data-translate-key="summary_title"]');
      seen = currentLang(next);
      if (title && LANG_TITLE[code].test(title.textContent || '') && seen === code) return title.textContent.trim();
      await wait(100);
    }
    assert(false, code + ' summary was "' + (title ? title.textContent.trim() : '') + '"');
  }

  function langPath(code) {
    return code && code !== 'en' ? 'index.html?lang=' + code : 'index.html';
  }

  async function summaryTitle(cv, code) {
    const start = Date.now();
    let title = cv.document.querySelector('[data-translate-key="summary_title"]');
    while ((!title || !LANG_TITLE[code].test(title.textContent || '')) && Date.now() - start < 4000) {
      await wait(100);
      title = cv.document.querySelector('[data-translate-key="summary_title"]');
    }
    assert(title && LANG_TITLE[code].test(title.textContent), code + ' summary was "' + (title ? title.textContent.trim() : '') + '"');
    return title.textContent.trim();
  }

  function setDark(cv, want) {
    const html = cv.document.documentElement;
    const btn = cv.document.getElementById('theme-toggle');
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
    const url = new URL(href);
    assert(url.protocol === 'https:', 'link is not https: ' + href);
    assert(url.hostname.length > 0, 'link has no host: ' + href);
  }

  async function printedHrefs(cv) {
    const win = cv.window;
    const original = win.print;
    let hrefs = [];
    win.print = () => {
      hrefs = [...win.document.querySelectorAll('#print-content a[href]')].map((a) => a.getAttribute('href'));
    };
    try {
      const btn = win.document.getElementById('print-btn');
      assert(btn, '#print-btn missing');
      const before = win.location.href;
      btn.click();
      for (let i = 0; i < 30 && hrefs.length === 0; i++) await wait(100);
      assert(win.location.href === before, 'print left the CV');
    } finally {
      win.print = original;
    }
    assert(hrefs.length > 0, 'print did not build the recruiter sheets');
    return hrefs;
  }

  function decodeDataUrl(href) {
    const comma = href.indexOf(',');
    if (comma === -1) return '';
    try { return decodeURIComponent(href.slice(comma + 1)); }
    catch (err) { return href.slice(comma + 1); }
  }

  const PACE_KEY = 'qa-lab-pace';
  const PACE_VALUES = [0.5, 1, 1.5, 2];

  function formatPace(n) {
    return Number(n).toFixed(1).replace('.', ',');
  }

  function readPace() {
    const n = Number(localStorage.getItem(PACE_KEY));
    return PACE_VALUES.some((v) => v === n) ? n : 1;
  }

  const CASES = [
    {
      id: 'SMK-01', layer: 'Smoke', fw: ['Playwright', 'Cypress'],
      title: 'Public surfaces return 200',
      where: 'index.html, simulador.html, admin.html, style.css, css/cv.css, js/cv-data.js, js/cv-app.js, favicon.svg, robots.txt, sitemap.xml',
      when: 'Before any UI interaction — health of the published tree.',
      how: 'GET each path and assert status 200.',
      async run() {
        const paths = ['index.html', 'simulador.html', 'admin.html', 'qa-lab.html', 'style.css', 'css/cv.css', 'js/cv-data.js', 'js/cv-app.js', 'favicon.svg', 'robots.txt', 'sitemap.xml'];
        for (const path of paths) await fetchText(path);
        return paths.length + ' assets answered 200';
      }
    },
    {
      id: 'SMK-02', layer: 'Smoke', fw: ['Playwright'],
      title: 'CV document title and Harbor skin',
      where: 'html[data-skin], document.title',
      when: 'On first paint of the CV.',
      how: 'Title matches Carlos Muñoz; html carries data-skin="harbor".',
      async run({ cv }) {
        const html = cv.document.documentElement;
        assert(/Carlos Muñoz/i.test(cv.document.title), 'Unexpected title: ' + cv.document.title);
        assert(html.getAttribute('data-skin') === 'harbor', 'Harbor skin missing');
        return cv.document.title;
      }
    },
    {
      id: 'FN-01', layer: 'Functional', fw: ['Playwright', 'Cypress', 'Robot'],
      title: 'Dark mode toggle and persistence',
      where: '#theme-toggle → html.dark-mode + localStorage.theme',
      when: 'After a desktop theme click, then iframe reload.',
      how: 'classList contains dark-mode before and after reload.',
      async run({ cv, reloadCv }) {
        const btn = cv.document.getElementById('theme-toggle');
        assert(btn, '#theme-toggle missing');
        cv.document.documentElement.classList.remove('dark-mode');
        localStorage.setItem('theme', 'light');
        btn.click();
        assert(cv.document.documentElement.classList.contains('dark-mode'), 'dark-mode not applied');
        const again = await reloadCv();
        assert(again.document.documentElement.classList.contains('dark-mode'), 'theme did not persist');
        return 'html.dark-mode persisted';
      }
    },
    {
      id: 'FN-02', layer: 'Functional', fw: ['Playwright', 'Cypress', 'Robot'],
      title: 'Language switch to a random language, then back',
      where: '#language-selector / #language-options [data-lang]',
      when: 'After a native language chosen at random.',
      how: 'The summary title matches that language, then the language that was on screen at the start is restored.',
      async run({ cv }) {
        const original = currentLang(cv);
        const chosen = shuffle(NATIVE_LANGS.filter((code) => code !== original))[0];
        try {
          const title = await chooseLang(cv, chosen);
          return chosen + ' · ' + title;
        } finally {
          if (currentLang(cv) !== original) await chooseLang(cv, original);
          assert(currentLang(cv) === original, 'did not return to ' + original);
        }
      }
    },
    {
      id: 'FN-03', layer: 'Functional', fw: ['Playwright', 'Cypress'],
      title: 'A random language loads from the address, then the original returns',
      where: '/index.html?lang= and [data-translate-key=summary_title]',
      when: 'Cold load with a native language chosen at random.',
      how: 'The summary title matches that language, then the language that was on screen at the start is restored.',
      async run({ cv, loadCv }) {
        const original = currentLang(cv);
        const chosen = shuffle(NATIVE_LANGS.filter((code) => code !== original))[0];
        try {
          const next = await loadCv(langPath(chosen));
          const title = await summaryTitle(next, chosen);
          assert(currentLang(next) === chosen, 'loaded language is ' + currentLang(next));
          return chosen + ' · ' + title;
        } finally {
          const restored = await loadCv(langPath(original));
          if (currentLang(restored) !== original) await chooseLang(restored, original);
          assert(currentLang(restored) === original, 'did not return to ' + original);
        }
      }
    },
    {
      id: 'FN-04', layer: 'Functional', fw: ['Playwright', 'Cypress', 'Robot'],
      title: 'Profile photo modal open / close',
      where: '#profile-photo, #image-modal, .modal-close',
      when: 'On photo click, then close control.',
      how: 'Modal gains and loses class visible.',
      async run({ cv }) {
        cv.document.getElementById('profile-photo').click();
        const modal = cv.document.getElementById('image-modal');
        assert(modal.classList.contains('visible'), 'modal did not open');
        cv.document.querySelector('.modal-close').click();
        assert(!modal.classList.contains('visible'), 'modal did not close');
        return 'modal visible class toggled';
      }
    },
    {
      id: 'FN-05', layer: 'Functional', fw: ['Playwright', 'Cypress', 'Robot'],
      title: 'Glance KPIs include 18+ years',
      where: '#glance-kpis .glance-kpi',
      when: 'After CV init renders career stats.',
      how: 'Five KPI tiles; text includes 18+.',
      async run({ cv }) {
        const kpis = cv.document.querySelectorAll('.glance-kpi');
        assert(kpis.length === 5, 'expected 5 KPIs, got ' + kpis.length);
        assert(/18\+/.test(cv.document.getElementById('glance-kpis').textContent), '18+ missing');
        return '5 KPIs, 18+ present';
      }
    },
    {
      id: 'FN-06', layer: 'Functional', fw: ['Playwright', 'Cypress', 'Robot'],
      title: 'Radar label filters toolkit (QA & Automation)',
      where: '#competencies-radar-chart g.radar-label',
      when: 'After forcing glance pair 0, then clicking the QA label.',
      how: 'Selenium and Cypress tags receive class selected.',
      async run({ cv }) {
        const api = cv.window.CarlosMunozCV;
        assert(api && api._showGlancePair, 'CarlosMunozCV API missing');
        api._showGlancePair(0, false);
        await wait(120);
        const labels = [...cv.document.querySelectorAll('#competencies-radar-chart g.radar-label')];
        const qa = labels.find((el) => /QA & Automation/.test(el.querySelector('text')?.textContent || ''));
        assert(qa, 'QA & Automation label not on the radar');
        qa.dispatchEvent(new cv.window.MouseEvent('click', { bubbles: true }));
        await wait(200);
        assert(cv.document.querySelector('.tech-tag[data-skill-name="Selenium"]').classList.contains('selected'), 'Selenium not selected');
        assert(cv.document.querySelector('.tech-tag[data-skill-name="Cypress"]').classList.contains('selected'), 'Cypress not selected');
        return 'Selenium + Cypress selected';
      }
    },
    {
      id: 'FN-15', layer: 'Functional', fw: ['Playwright', 'Cypress', 'Robot'],
      title: 'Core competency filters and dims unrelated CV content',
      where: '#competencies-list .competency-item[data-competency=pm]',
      when: 'After clicking IT Project Management, then clicking Languages.',
      how: 'html.topic-focus with match + dim rows; outside click restores.',
      async run({ cv }) {
        const btn = cv.document.querySelector('.competency-item[data-competency="pm"]');
        assert(btn, 'competency button missing');
        btn.dispatchEvent(new cv.window.MouseEvent('click', { bubbles: true }));
        await wait(120);
        assert(cv.document.documentElement.classList.contains('topic-focus'), 'topic-focus not applied');
        assert(btn.getAttribute('aria-pressed') === 'true', 'competency not pressed');
        assert(cv.document.querySelector('.experience-item.topic-match'), 'no highlighted experience');
        assert(cv.document.querySelector('.experience-item.topic-dim'), 'no dimmed experience');
        cv.document.getElementById('languages-heading').dispatchEvent(new cv.window.MouseEvent('click', { bubbles: true }));
        await wait(80);
        assert(!cv.document.documentElement.classList.contains('topic-focus'), 'topic-focus stayed after outside click');
        return 'pm focus + restore';
      }
    },
    {
      id: 'FN-16', layer: 'Functional', fw: ['Playwright', 'Cypress', 'Robot'],
      title: 'All seven core competencies are clickable filters',
      where: '#competencies-list .competency-item',
      when: 'Sidebar competencies are rendered.',
      how: 'Exactly seven buttons: pm qa lead devops cloud strategy relations.',
      async run({ cv }) {
        const items = [...cv.document.querySelectorAll('.competency-item')];
        const ids = items.map((el) => el.dataset.competency);
        assert(items.length === 7, 'expected 7 competencies, got ' + items.length);
        assert(ids.join(',') === 'pm,qa,lead,devops,cloud,strategy,relations', 'unexpected ids: ' + ids.join(','));
        items.forEach((el) => assert(el.getAttribute('aria-pressed') === 'false', el.dataset.competency + ' should start unpressed'));
        return '7 competency filters';
      }
    },
    {
      id: 'FN-17', layer: 'Functional', fw: ['Playwright', 'Cypress', 'Robot'],
      title: 'Clicking the same competency again restores the CV',
      where: '.competency-item[data-competency=qa]',
      when: 'Second click on the active competency.',
      how: 'topic-focus is removed; aria-pressed is false.',
      async run({ cv }) {
        const btn = cv.document.querySelector('.competency-item[data-competency="qa"]');
        btn.dispatchEvent(new cv.window.MouseEvent('click', { bubbles: true }));
        await wait(80);
        assert(cv.document.documentElement.classList.contains('topic-focus'), 'qa focus missing');
        btn.dispatchEvent(new cv.window.MouseEvent('click', { bubbles: true }));
        await wait(80);
        assert(!cv.document.documentElement.classList.contains('topic-focus'), 'toggle did not restore');
        assert(btn.getAttribute('aria-pressed') === 'false', 'qa still pressed');
        return 'qa toggle restore';
      }
    },
    {
      id: 'FN-18', layer: 'Functional', fw: ['Playwright', 'Cypress'],
      title: 'Switching competencies moves the highlight',
      where: '.competency-item[data-competency=pm], .competency-item[data-competency=qa]',
      when: 'PM then QA without an outside click.',
      how: 'Only QA stays pressed; Selenium is selected; PM is not pressed.',
      async run({ cv }) {
        cv.document.querySelector('.competency-item[data-competency="pm"]').dispatchEvent(new cv.window.MouseEvent('click', { bubbles: true }));
        await wait(80);
        cv.document.querySelector('.competency-item[data-competency="qa"]').dispatchEvent(new cv.window.MouseEvent('click', { bubbles: true }));
        await wait(80);
        assert(cv.document.querySelector('.competency-item[data-competency="qa"]').getAttribute('aria-pressed') === 'true', 'qa not pressed');
        assert(cv.document.querySelector('.competency-item[data-competency="pm"]').getAttribute('aria-pressed') === 'false', 'pm still pressed');
        assert(cv.document.querySelector('.tech-tag[data-skill-name="Selenium"]').classList.contains('selected'), 'Selenium not selected for QA');
        return 'pm → qa';
      }
    },
    {
      id: 'FN-19', layer: 'Functional', fw: ['Playwright', 'Cypress'],
      title: '?topic=qa deep-links the competency filter',
      where: '/index.html?topic=qa',
      when: 'Cold load with a topic query.',
      how: 'html.topic-focus; QA pressed; ISTQB education row is a topic-match.',
      async run({ loadCv }) {
        const cv = await loadCv('index.html?topic=qa');
        await wait(200);
        assert(cv.document.documentElement.classList.contains('topic-focus'), 'deep link did not focus');
        assert(cv.document.querySelector('.competency-item[data-competency="qa"]').getAttribute('aria-pressed') === 'true', 'qa not pressed from URL');
        const cert = cv.document.querySelector('[data-topic="qa"]');
        assert(cert && cert.classList.contains('topic-match'), 'QA certification not highlighted');
        return 'topic=qa deep link';
      }
    },
    {
      id: 'FN-20', layer: 'Functional', fw: ['Playwright', 'Cypress', 'Robot'],
      title: 'Reset Filters clears competency focus',
      where: '#reset-filter',
      when: 'After a QA focus, then Reset Filters.',
      how: 'topic-focus gone; no selected toolkit tags.',
      async run({ cv }) {
        cv.document.querySelector('.competency-item[data-competency="qa"]').dispatchEvent(new cv.window.MouseEvent('click', { bubbles: true }));
        await wait(80);
        cv.document.getElementById('reset-filter').click();
        await wait(80);
        assert(!cv.document.documentElement.classList.contains('topic-focus'), 'reset left topic-focus');
        assert(!cv.document.querySelector('.tech-tag.selected'), 'toolkit tags still selected');
        return 'reset clears topic';
      }
    },
    {
      id: 'FN-21', layer: 'Functional', fw: ['Playwright', 'Cypress'],
      title: 'Clicking a highlighted experience keeps competency focus',
      where: '.experience-item.topic-match',
      when: 'After PM focus, click a matching role.',
      how: 'html.topic-focus remains.',
      async run({ cv }) {
        cv.document.querySelector('.competency-item[data-competency="pm"]').dispatchEvent(new cv.window.MouseEvent('click', { bubbles: true }));
        await wait(80);
        const match = cv.document.querySelector('.experience-item.topic-match');
        assert(match, 'no matching experience');
        match.dispatchEvent(new cv.window.MouseEvent('click', { bubbles: true }));
        await wait(80);
        assert(cv.document.documentElement.classList.contains('topic-focus'), 'match click cleared focus');
        return 'match click keeps focus';
      }
    },
    {
      id: 'FN-22', layer: 'Functional', fw: ['Playwright', 'Cypress', 'Robot'],
      title: 'QA radar label applies the same competency focus',
      where: '#competencies-radar-chart g.radar-label',
      when: 'After glance pair 0, click QA & Automation.',
      how: 'html.topic-focus; Selenium selected; unrelated experience is topic-dim.',
      async run({ cv }) {
        const api = cv.window.CarlosMunozCV;
        api._showGlancePair(0, false);
        await wait(120);
        const labels = [...cv.document.querySelectorAll('#competencies-radar-chart g.radar-label')];
        const qa = labels.find((el) => /QA & Automation/.test(el.querySelector('text')?.textContent || ''));
        qa.dispatchEvent(new cv.window.MouseEvent('click', { bubbles: true }));
        await wait(200);
        assert(cv.document.documentElement.classList.contains('topic-focus'), 'radar did not apply topic-focus');
        assert(cv.document.querySelector('.competency-item[data-competency="qa"]').getAttribute('aria-pressed') === 'true', 'sidebar QA not pressed');
        assert(cv.document.querySelector('.experience-item.topic-dim'), 'no dimmed experience from radar');
        return 'radar → competency focus';
      }
    },
    {
      id: 'FN-07', layer: 'Functional', fw: ['Playwright', 'Cypress'],
      title: 'Skill tag filters experience list',
      where: '#expand-all-toolkit, .tech-tag[data-skill-name=Selenium]',
      when: 'After expanding toolkit and selecting Selenium.',
      how: 'At least one .filter-match and one .filter-no-match exist.',
      async run({ cv }) {
        cv.document.getElementById('expand-all-toolkit').click();
        cv.document.querySelector('.tech-tag[data-skill-name="Selenium"]').click();
        await wait(80);
        assert(cv.document.querySelector('.experience-item.filter-match'), 'no matching experience');
        assert(cv.document.querySelector('.experience-item.filter-no-match'), 'no excluded experience');
        return 'match + no-match classes applied';
      }
    },
    {
      id: 'FN-08', layer: 'Functional', fw: ['Playwright', 'Cypress'],
      title: 'Timeline jump opens the matching role',
      where: '#timeline-container a[href^="#experience-"]',
      when: 'On timeline item click.',
      how: 'Target .experience-item gets is-open.',
      async run({ cv }) {
        const link = cv.document.querySelector('#timeline-container .timeline-item a');
        const id = link.getAttribute('href').slice(1);
        link.dispatchEvent(new cv.window.MouseEvent('click', { bubbles: true }));
        await wait(80);
        assert(cv.document.getElementById(id).classList.contains('is-open'), id + ' did not open');
        return id + ' is-open';
      }
    },
    {
      id: 'FN-09', layer: 'Functional', fw: ['Playwright', 'Cypress', 'Robot'],
      title: 'Export menu lists five formats',
      where: '#export-selector → #export-options button',
      when: 'After opening the export control.',
      how: 'At least five option buttons are present.',
      async run({ cv }) {
        cv.document.getElementById('export-selector').click();
        const n = cv.document.querySelectorAll('#export-options button').length;
        assert(n >= 5, 'expected ≥5 export options, got ' + n);
        return n + ' export handlers listed';
      }
    },
    {
      id: 'FN-10', layer: 'Functional', fw: ['Playwright', 'Cypress', 'Robot'],
      title: 'Print and studio launch controls exist',
      where: '#print-btn, #sim-launch-btn',
      when: 'Desktop chrome is visible.',
      how: 'Both controls are in the DOM.',
      async run({ cv }) {
        assert(cv.document.getElementById('print-btn'), 'print missing');
        assert(cv.document.getElementById('sim-launch-btn'), 'studio launch missing');
        return 'print + studio launch present';
      }
    },
    {
      id: 'FN-11', layer: 'Functional', fw: ['Playwright', 'Cypress'],
      title: 'Read More expands the summary',
      where: '#read-more-btn[aria-expanded]',
      when: 'After clicking Read More.',
      how: 'aria-expanded becomes true.',
      async run({ cv }) {
        const btn = cv.document.getElementById('read-more-btn');
        btn.click();
        assert(btn.getAttribute('aria-expanded') === 'true', 'summary did not expand');
        return 'aria-expanded=true';
      }
    },
    {
      id: 'FN-12', layer: 'Functional', fw: ['Playwright', 'Cypress'],
      title: 'Education lists ISTQB',
      where: 'section[aria-labelledby=education-heading], #certs-subheading',
      when: 'Education section is in the document.',
      how: 'Heading visible; ISTQB in the section text.',
      async run({ cv }) {
        const section = cv.document.querySelector('section[aria-labelledby="education-heading"]');
        assert(cv.document.getElementById('certs-subheading'), 'certs heading missing');
        assert(/ISTQB/.test(section.textContent), 'ISTQB missing');
        return 'ISTQB listed under certifications';
      }
    },
    {
      id: 'FN-13', layer: 'Functional', fw: ['Playwright', 'Cypress'],
      title: 'Empty message form stays disabled',
      where: '#contact-widget-fab, #message-form #send-message-btn',
      when: 'Widget opened, no fields filled.',
      how: 'Submit button disabled; name marked invalid on blur.',
      async run({ cv }) {
        cv.document.getElementById('contact-widget-fab').click();
        const form = cv.document.getElementById('message-form');
        const send = cv.document.getElementById('send-message-btn');
        assert(send.disabled, 'send should be disabled');
        const name = form.querySelector('#sender-name');
        name.focus();
        name.dispatchEvent(new cv.window.FocusEvent('focusout'));
        await wait(40);
        assert(name.classList.contains('invalid'), 'name not marked invalid');
        cv.document.getElementById('widget-close-btn').click();
        return 'submit disabled; name invalid';
      }
    },
    {
      id: 'FN-14', layer: 'Functional', fw: ['Playwright', 'Cypress'],
      title: 'Tour starts, waits for Next, then closes',
      where: '#tour-start-btn, #tour-tooltip, #tour-next-btn, #tour-close-btn',
      when: 'Manual start; Next stays disabled until tourDemoReady.',
      how: 'Counter shows 1 /, Next enables, step 2 after click, tooltip hidden on Close.',
      async run({ cv }) {
        const start = [...cv.document.querySelectorAll('#tour-start-btn')].find((el) => el.offsetParent !== null) || cv.document.getElementById('tour-start-btn');
        start.click();
        const tip = cv.document.getElementById('tour-tooltip');
        const shown = Date.now();
        while (!tip.classList.contains('visible') && Date.now() - shown < 3000) await wait(50);
        assert(tip.classList.contains('visible'), 'tour tooltip not shown');
        assert(/1\s*\//.test(cv.document.getElementById('tour-step-counter').textContent), 'step 1 missing');
        const next = cv.document.getElementById('tour-next-btn');
        const startWait = Date.now();
        while (next.disabled && Date.now() - startWait < 16000) await wait(200);
        assert(!next.disabled, 'Next never enabled (demo gate)');
        next.click();
        const advanced = Date.now();
        const counter = cv.document.getElementById('tour-step-counter');
        while (!/2\s*\//.test(counter.textContent) && Date.now() - advanced < 3000) await wait(50);
        assert(/2\s*\//.test(counter.textContent), 'did not advance');
        cv.document.getElementById('tour-close-btn').click();
        const closed = Date.now();
        while (tip.classList.contains('visible') && Date.now() - closed < 2000) await wait(50);
        assert(!tip.classList.contains('visible'), 'tour still open');
        return 'demo-gated Next, then closed';
      }
    },
    {
      id: 'SEC-01', layer: 'Security', fw: ['Playwright', 'Cypress', 'Robot'],
      title: 'robots.txt allows CV and blocks admin / tests',
      where: '/robots.txt',
      when: 'Crawler fetch, no session.',
      how: 'Allow: / and Disallow for admin.html, cypress/, tests/.',
      async run() {
        const body = await fetchText('robots.txt');
        assert(/Allow:\s*\//.test(body), 'Allow / missing');
        assert(/Disallow:\s*\/admin\.html/.test(body), 'admin not disallowed');
        assert(/Disallow:\s*\/cypress\//.test(body), 'cypress not disallowed');
        assert(/Disallow:\s*\/tests\//.test(body), 'tests not disallowed');
        return 'Allow / · admin/cypress/tests disallowed';
      }
    },
    {
      id: 'SEC-02', layer: 'Security', fw: ['Playwright', 'Cypress', 'Robot'],
      title: 'Sitemap includes CV + studio, omits admin',
      where: '/sitemap.xml',
      when: 'Crawler fetch.',
      how: 'Contains simulador.html and qa-lab.html; no admin.html.',
      async run() {
        const xml = await fetchText('sitemap.xml');
        assert(xml.includes('simulador.html'), 'studio missing from sitemap');
        assert(xml.includes('qa-lab.html'), 'qa-lab missing from sitemap');
        assert(xml.includes('hreflang="en" href="https://carlosandmunoz.com/qa-lab.html"'), 'english hreflang missing');
        ['es', 'pt', 'de', 'fr', 'it'].forEach((lang) => {
          assert(xml.includes('qa-lab.html?lang=' + lang), 'qa-lab hreflang missing for ' + lang);
        });
        assert(!xml.includes('admin.html'), 'admin leaked into sitemap');
        return 'public URLs + hreflang';
      }
    },
    {
      id: 'SEC-03', layer: 'Security', fw: ['Playwright', 'Cypress', 'Robot'],
      title: 'Admin is noindex',
      where: 'admin.html meta[name=robots]',
      when: 'Unauthenticated GET of the admin document.',
      how: 'content includes noindex.',
      async run() {
        const html = await fetchText('admin.html');
        assert(/name="robots"[^>]*noindex/i.test(html), 'admin robots meta missing noindex');
        return 'noindex, nofollow';
      }
    },
    {
      id: 'SEC-04', layer: 'Security', fw: ['Playwright', 'Cypress'],
      title: 'CV is indexable with canonical and JSON-LD',
      where: 'meta robots, link[rel=canonical], #person-structured-data',
      when: 'CV head is parsed.',
      how: 'index present; canonical points at carlosandmunoz.com; JSON-LD names Carlos and 18 years/años.',
      async run({ cv }) {
        const robots = cv.document.querySelector('meta[name="robots"]').content;
        assert(/index/i.test(robots), 'CV not indexable');
        const canonical = cv.document.querySelector('link[rel="canonical"]').href;
        assert(/carlosandmunoz\.com/.test(canonical), 'canonical host unexpected');
        const json = cv.document.getElementById('person-structured-data').textContent;
        assert(/Carlos/.test(json), 'JSON-LD name missing');
        assert(/18 (years|años)/i.test(json), '18 years missing from JSON-LD');
        return 'index + canonical + Person JSON-LD';
      }
    },
    {
      id: 'SEC-05', layer: 'Security', fw: ['Playwright', 'Cypress', 'Robot'],
      title: 'LinkedIn uses noopener + _blank',
      where: '#contact-linkedin a',
      when: 'Contact chrome is rendered.',
      how: 'rel contains noopener; target is _blank.',
      async run({ cv }) {
        const a = cv.document.querySelector('#contact-linkedin a');
        assert(/noopener/.test(a.getAttribute('rel') || ''), 'noopener missing');
        assert(a.getAttribute('target') === '_blank', 'target is not _blank');
        return a.getAttribute('rel');
      }
    },
    {
      id: 'SEC-06', layer: 'Security', fw: ['Playwright', 'Cypress'],
      title: 'lang query does not execute script',
      where: 'index.html?lang=<script>alert(1)</script>',
      when: 'Hostile query is applied on load.',
      how: 'No dialog; main container still renders.',
      async run({ loadCv }) {
        const hits = [];
        const cv = await loadCv('index.html?lang=%3Cscript%3Ealert(1)%3C/script%3E', (win) => {
          win.alert = (msg) => hits.push(msg);
        });
        assert(cv.document.querySelector('.main-container'), 'CV failed to render');
        assert(hits.length === 0, 'alert fired: ' + hits.join(','));
        return 'no dialog; page intact';
      }
    },
    {
      id: 'SEC-07', layer: 'Security', fw: ['Playwright', 'Cypress'],
      title: 'Public chrome does not link to admin.html',
      where: 'index.html and simulador.html anchors',
      when: 'Static parse of public pages.',
      how: 'Zero hrefs containing admin.html.',
      async run() {
        const cv = await fetchText('index.html');
        const studio = await fetchText('simulador.html');
        assert(!/href\s*=\s*["'][^"']*admin\.html/.test(cv), 'CV links to admin');
        assert(!/href\s*=\s*["'][^"']*admin\.html/.test(studio), 'studio links to admin');
        return 'no public admin href';
      }
    },
    {
      id: 'SEC-08', layer: 'Security', fw: ['Playwright', 'Cypress', 'Robot'],
      title: 'Core competencies ship ItemList JSON-LD and topic URLs',
      where: '#competencies-structured-data, meta keywords',
      when: 'CV head is parsed.',
      how: 'DefinedTerm list includes IT Project Management and ?topic=pm; keywords mention Core competency topics.',
      async run({ cv }) {
        const json = cv.document.getElementById('competencies-structured-data').textContent;
        assert(/DefinedTerm/.test(json), 'DefinedTerm missing');
        assert(/IT Project Management/.test(json), 'PM term missing');
        assert(/topic=pm/.test(json), 'topic=pm URL missing');
        const keys = cv.document.querySelector('meta[name="keywords"]').content;
        assert(/IT Project Management/.test(keys), 'keywords omit IT Project Management');
        assert(/knowsAbout/.test(cv.document.getElementById('person-structured-data').textContent), 'Person knowsAbout missing');
        return 'competency ItemList + keywords';
      }
    },
    {
      id: 'A11Y-01', layer: 'Accessibility', fw: ['Playwright', 'Cypress'],
      title: 'No serious WCAG 2 A/AA axe findings (overlays excluded)',
      where: 'CV document except #contact-widget and .skiptranslate. The tour card is checked in A11Y-04 while it is open.',
      when: 'After load, axe-core 4.10 injected into the iframe.',
      how: 'Zero violations with impact serious or critical, color-contrast off (same as CI).',
      async run({ cv }) {
        await injectAxe(cv.window, cv.document);
        const results = await cv.window.axe.run(
          { exclude: [['#contact-widget'], ['.skiptranslate']] },
          { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] }, rules: { 'color-contrast': { enabled: false } } }
        );
        const serious = results.violations.filter((v) => ['serious', 'critical'].includes(v.impact));
        assert(serious.length === 0, serious.map((v) => v.id).join(', ') || 'axe failed');
        return results.violations.length + ' non-blocking / 0 serious';
      }
    },
    {
      id: 'A11Y-02', layer: 'Accessibility', fw: ['Playwright', 'Cypress'],
      title: 'Main landmark and named heading',
      where: 'main.main-content, h1#main-name',
      when: 'CV structure on load.',
      how: 'Exactly one main; h1 contains Carlos.',
      async run({ cv }) {
        assert(cv.document.querySelectorAll('main.main-content').length === 1, 'main landmark missing');
        assert(/Carlos/i.test(cv.document.getElementById('main-name').textContent), 'name heading missing');
        return 'main + h1 Carlos';
      }
    },
    {
      id: 'A11Y-03', layer: 'Accessibility', fw: ['Playwright', 'Cypress'],
      title: 'Theme toggle is focusable; photo has alt',
      where: '#theme-toggle, #profile-photo[alt]',
      when: 'Keyboard users tab into chrome.',
      how: 'Button can take focus; alt is non-empty.',
      async run({ cv }) {
        const toggle = cv.document.getElementById('theme-toggle');
        toggle.focus();
        assert(cv.document.activeElement === toggle, 'theme toggle not focused');
        const alt = cv.document.getElementById('profile-photo').getAttribute('alt') || '';
        assert(alt.length > 0, 'profile alt empty');
        return alt;
      }
    },
    {
      id: 'A11Y-04', layer: 'Accessibility', fw: ['Playwright', 'Cypress'],
      title: 'CV tour card is a labelled dialog and takes keyboard focus',
      where: '#tour-tooltip, #tour-title, #tour-description, #tour-close-btn',
      when: 'How this Online CV works is opened.',
      how: 'The card is a dialog, focus is inside it, the step title and instructions are text, and Escape closes it.',
      async run({ cv }) {
        const start = [...cv.document.querySelectorAll('#tour-start-btn')].find((el) => el.offsetParent !== null) || cv.document.getElementById('tour-start-btn');
        start.click();
        const tip = cv.document.getElementById('tour-tooltip');
        const shown = Date.now();
        while (!tip.classList.contains('visible') && Date.now() - shown < 3000) await wait(50);
        assert(tip.getAttribute('role') === 'dialog', 'tour card is not a dialog');
        assert(tip === cv.document.activeElement, 'focus did not move to the tour card');
        assert(cv.document.getElementById('tour-title').textContent.trim().length > 0, 'tour title empty');
        assert(cv.document.getElementById('tour-description').textContent.trim().length > 0, 'tour instructions empty');
        cv.document.body.dispatchEvent(new cv.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        assert(!tip.classList.contains('visible'), 'Escape did not close the tour');
        return 'dialog focused, then closed';
      }
    },
    {
      id: 'A11Y-05', layer: 'Accessibility', fw: ['Playwright', 'Cypress'],
      title: 'Studio tour card is a labelled dialog and takes keyboard focus',
      where: 'simulador.html #site-tour-tooltip',
      when: 'How this studio works is opened.',
      how: 'The card is a dialog, focus is inside it, the step has a title and instructions, and Escape closes it.',
      async run({ loadCv }) {
        const studio = await loadCv('simulador.html');
        studio.document.getElementById('tour-start-btn').click();
        const tip = studio.document.getElementById('site-tour-tooltip');
        const shown = Date.now();
        while (shown && (!tip || tip.offsetParent === null) && Date.now() - shown < 2000) await wait(40);
        assert(tip && tip.getAttribute('role') === 'dialog', 'studio tour card is not a dialog');
        assert(studio.document.activeElement === tip, 'focus did not move to the studio tour');
        assert(studio.document.getElementById('site-tour-title').textContent.trim() === 'Sprint views', 'first studio step missing');
        assert(studio.document.getElementById('site-tour-body').textContent.trim().length > 0, 'studio instructions empty');
        studio.document.dispatchEvent(new studio.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        assert(!studio.document.documentElement.classList.contains('site-tour-on'), 'Escape did not close the studio tour');
        return 'studio dialog focused, then closed';
      }
    },
    {
      id: 'A11Y-06', layer: 'Accessibility', fw: ['Playwright', 'Cypress'],
      title: 'Lab tour card is a labelled dialog and takes keyboard focus',
      where: 'qa-lab.html #site-tour-tooltip',
      when: 'How this lab works is opened.',
      how: 'The card is a dialog, focus is inside it, the catalog step has instructions, and Escape closes it.',
      async run() {
        document.getElementById('tour-start-btn').click();
        const tip = document.getElementById('site-tour-tooltip');
        assert(tip && tip.getAttribute('role') === 'dialog', 'lab tour card is not a dialog');
        assert(document.activeElement === tip, 'focus did not move to the lab tour');
        assert(document.getElementById('site-tour-title').textContent.trim() === 'The catalog', 'first lab step missing');
        assert(document.getElementById('site-tour-body').textContent.trim().length > 0, 'lab instructions empty');
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        assert(!document.documentElement.classList.contains('site-tour-on'), 'Escape did not close the lab tour');
        return 'lab dialog focused, then closed';
      }
    },
    {
      id: 'ADM-01', layer: 'Admin', fw: ['Playwright', 'Cypress', 'Robot'],
      title: 'Login overlay shown; dashboard hidden',
      where: 'admin.html #login-overlay, #dashboard',
      when: 'Unauthenticated visit.',
      how: 'Overlay in document; dashboard has class hidden.',
      async run({ loadAdmin }) {
        const admin = await loadAdmin();
        assert(admin.document.getElementById('login-overlay'), 'overlay missing');
        assert(admin.document.getElementById('dashboard').classList.contains('hidden'), 'dashboard visible');
        return 'login wall up';
      }
    },
    {
      id: 'ADM-02', layer: 'Admin', fw: ['Playwright', 'Cypress'],
      title: 'Empty login is blocked by HTML5 required',
      where: '#login-form #email',
      when: 'Submit with empty fields.',
      how: 'email.validity.valueMissing is true.',
      async run({ loadAdmin }) {
        const admin = await loadAdmin();
        admin.document.querySelector('#login-form button[type="submit"]').click();
        assert(admin.document.getElementById('email').validity.valueMissing, 'valueMissing not set');
        return 'native required caught empty email';
      }
    },
    {
      id: 'ADM-03', layer: 'Admin', fw: ['Playwright', 'Cypress'],
      title: 'Login fields are labeled',
      where: 'label[for=email], label[for=password]',
      when: 'Login form paint.',
      how: 'Both labels exist.',
      async run({ loadAdmin }) {
        const admin = await loadAdmin();
        assert(admin.document.querySelector('label[for="email"]'), 'email label missing');
        assert(admin.document.querySelector('label[for="password"]'), 'password label missing');
        return 'email + password labelled';
      }
    },
    {
      id: 'STU-01', layer: 'Studio', fw: ['Playwright', 'Cypress', 'Robot'],
      title: 'Sprint studio loads board and run control',
      where: 'simulador.html #runBtn, .ticket',
      when: 'Studio first paint.',
      how: 'Run 4-agent sprint button exists; at least one ticket.',
      async run() {
        const html = await fetchText('simulador.html');
        assert(html.includes('Run 4-agent sprint'), 'run control copy missing');
        assert(html.includes('class="ticket') || html.includes("class='ticket"), 'ticket markup missing');
        return 'board + run control present';
      }
    },
    {
      id: 'STU-02', layer: 'Studio', fw: ['Playwright', 'Cypress'],
      title: 'Studio nav exposes Xray, lab, and this regression lab',
      where: 'simulador.html nav',
      when: 'Static parse of studio chrome.',
      how: 'Xray / TestRail, Automation lab, and qa-lab.html are referenced.',
      async run() {
        const html = await fetchText('simulador.html');
        assert(/Xray \/ TestRail/.test(html), 'Xray nav missing');
        assert(/Automation lab/.test(html), 'automation lab nav missing');
        assert(/qa-lab\.html/.test(html), 'regression lab link missing');
        assert(/github\.com\/kaanmuar\/kaanmuar\.github\.io\/tree\/main\/tests/.test(html), 'test suite GitHub link missing');
        return 'Xray + lab + regression lab + GitHub suite';
      }
    },
    {
      id: 'STU-03', layer: 'Studio', fw: ['Playwright', 'Cypress', 'Robot'],
      title: 'Studio ships a guided tour of its features',
      where: 'simulador.html #tour-start-btn, js/site-tour.js, hasSeenStudioTour',
      when: 'Static parse of studio chrome.',
      how: 'How this studio works control and site-tour.js are present.',
      async run() {
        const html = await fetchText('simulador.html');
        assert(/id="tour-start-btn"/.test(html), 'studio tour button missing');
        assert(/How this studio works/.test(html), 'studio tour copy missing');
        assert(/js\/site-tour\.js/.test(html), 'site-tour.js not loaded');
        assert(/hasSeenStudioTour/.test(html), 'studio tour session key missing');
        return 'studio tour wired';
      }
    },
    {
      id: 'MOB-01', layer: 'Mobile', fw: ['Playwright', 'Cypress', 'Robot'],
      title: 'CV phone chrome shows tools, studio, and lab',
      where: 'index.html @ 390×844 · .mobile-toolbar, #sim-launch-btn-mobile, #qa-lab-btn-mobile',
      when: 'Narrow viewport — md breakpoint hidden desktop header.',
      how: 'iframe innerWidth ≤ 430; mobile toolbar displayed; studio and lab launchers present.',
      async run({ loadCv, setPhoneFrame }) {
        setPhoneFrame();
        const cv = await loadCv('index.html');
        assert(cv.window.innerWidth <= 430, 'iframe not phone-wide: ' + cv.window.innerWidth);
        const tb = cv.document.querySelector('.mobile-toolbar');
        assert(tb, 'mobile toolbar missing');
        assert(cv.window.getComputedStyle(tb).display !== 'none', 'mobile toolbar hidden');
        assert(cv.document.getElementById('sim-launch-btn-mobile'), 'studio launcher missing');
        assert(cv.document.getElementById('qa-lab-btn-mobile'), 'lab launcher missing');
        return 'toolbar + launchers at ' + cv.window.innerWidth + 'px';
      }
    },
    {
      id: 'MOB-02', layer: 'Mobile', fw: ['Playwright', 'Cypress', 'Robot'],
      title: 'CV does not spill sideways on a phone',
      where: 'index.html documentElement.scrollWidth vs innerWidth',
      when: 'After first paint at 390px.',
      how: 'scrollWidth ≤ innerWidth + 2.',
      async run({ loadCv, setPhoneFrame }) {
        setPhoneFrame();
        const cv = await loadCv('index.html');
        const extra = cv.document.documentElement.scrollWidth - cv.window.innerWidth;
        assert(extra <= 2, 'horizontal overflow ' + extra + 'px');
        return 'overflow-x ' + extra + 'px';
      }
    },
    {
      id: 'MOB-03', layer: 'Mobile', fw: ['Playwright', 'Cypress', 'Robot'],
      title: 'Studio topbar stacks without clipping Run',
      where: 'simulador.html .topbar #runBtn #homeBtn',
      when: 'Phone width after header wrap.',
      how: 'Run button bottom stays inside the topbar; home control is visible.',
      async run({ loadCv, setPhoneFrame }) {
        setPhoneFrame();
        const stu = await loadCv('simulador.html');
        const bar = stu.document.querySelector('.topbar');
        const run = stu.document.getElementById('runBtn');
        const home = stu.document.getElementById('homeBtn');
        assert(bar && run && home, 'studio chrome missing');
        const br = bar.getBoundingClientRect();
        const rr = run.getBoundingClientRect();
        assert(rr.height > 0 && rr.bottom <= br.bottom + 2, 'run control clipped');
        assert(home.getBoundingClientRect().width > 0, 'back control not painted');
        assert(br.height > 56, 'topbar did not wrap (height ' + Math.round(br.height) + ')');
        return 'topbar ' + Math.round(br.height) + 'px · run inside';
      }
    },
    {
      id: 'MOB-04', layer: 'Mobile', fw: ['Playwright', 'Cypress'],
      title: 'Studio page scrolls instead of locking the board',
      where: 'simulador.html body overflow-y, .nav',
      when: 'After the mobile media query applies.',
      how: 'body overflow-y is auto; nav is a horizontal scroller.',
      async run({ loadCv, setPhoneFrame }) {
        setPhoneFrame();
        const stu = await loadCv('simulador.html');
        const overflowY = stu.window.getComputedStyle(stu.document.body).overflowY;
        assert(overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'visible', 'body still locks scroll: ' + overflowY);
        const nav = stu.document.querySelector('.nav');
        assert(nav, 'nav missing');
        assert(stu.window.getComputedStyle(nav).display === 'flex', 'nav not row on phone');
        return 'overflow-y ' + overflowY;
      }
    },
    {
      id: 'MOB-05', layer: 'Mobile', fw: ['Playwright', 'Cypress', 'Robot'],
      title: 'QA lab header does not cover the heading',
      where: 'qa-lab.html .topbar vs .intro h1, pace, #homeBtn',
      when: 'Phone width with wrapped actions.',
      how: 'h1 top ≥ topbar bottom; pace 1,0, Watch, and back control exist.',
      async run({ loadCv, setPhoneFrame }) {
        setPhoneFrame();
        const lab = await loadCv('qa-lab.html');
        const bar = lab.document.querySelector('.topbar');
        const h1 = lab.document.querySelector('.intro h1');
        assert(bar && h1, 'lab header/heading missing');
        assert(h1.getBoundingClientRect().top >= bar.getBoundingClientRect().bottom - 1, 'heading sits under the topbar');
        assert(lab.document.getElementById('homeBtn'), 'lab back missing');
        assert(lab.document.querySelector('[data-pace="1"]'), 'pace control missing');
        assert(lab.document.querySelector('[data-view="watch"]'), 'watch control missing');
        return 'heading below ' + Math.round(bar.getBoundingClientRect().height) + 'px header';
      }
    },
    {
      id: 'MOB-06', layer: 'Mobile', fw: ['Playwright', 'Cypress', 'Robot'],
      title: 'Admin login and back control fit the phone',
      where: 'admin.html #login-overlay #admin-home',
      when: 'Unauthenticated visit at 390px.',
      how: 'Overlay visible; back link present; overlay width covers the iframe.',
      async run({ loadAdmin, setPhoneFrame }) {
        setPhoneFrame();
        const admin = await loadAdmin();
        const overlay = admin.document.getElementById('login-overlay');
        const home = admin.document.getElementById('admin-home');
        assert(overlay, 'login overlay missing');
        assert(home, 'admin back link missing');
        const style = admin.window.getComputedStyle(overlay);
        assert(style.display !== 'none', 'overlay hidden');
        assert(overlay.getBoundingClientRect().width >= Math.min(admin.window.innerWidth, 300), 'overlay does not span the phone');
        return 'login + back at ' + admin.window.innerWidth + 'px';
      }
    },
    {
      id: 'FN-23', layer: 'Functional', fw: ['Playwright', 'Cypress', 'Robot'],
      title: 'Dark, light, then back to the original theme',
      where: '#theme-toggle, html.dark-mode',
      when: 'After forcing dark, then light, then dark again.',
      how: 'The class follows each step and the theme that was open at the start is restored.',
      async run({ cv }) {
        const html = cv.document.documentElement;
        const original = html.classList.contains('dark-mode');
        try {
          setDark(cv, true);
          setDark(cv, false);
          setDark(cv, true);
          setDark(cv, original);
          return (original ? 'started dark' : 'started light') + ' and restored';
        } finally {
          if (html.classList.contains('dark-mode') !== original) setDark(cv, original);
        }
      }
    },
    {
      id: 'FN-24', layer: 'Functional', fw: ['Playwright', 'Cypress', 'Robot'],
      title: 'Three random languages, then the original',
      where: '#language-selector, [data-translate-key=summary_title]',
      when: 'After three native languages chosen at random.',
      how: 'Each summary title matches that language, then the starting language is restored.',
      async run({ cv }) {
        const original = currentLang(cv);
        const picks = shuffle(NATIVE_LANGS.filter((code) => code !== original)).slice(0, 3);
        assert(picks.length === 3, 'need three languages besides ' + original);
        try {
          for (const code of picks) await chooseLang(cv, code);
          await chooseLang(cv, original);
          return picks.join(' → ') + ' → ' + original;
        } finally {
          if (currentLang(cv) !== original) await chooseLang(cv, original);
        }
      }
    },
    {
      id: 'FN-25', layer: 'Functional', fw: ['Playwright', 'Cypress', 'Robot'],
      title: 'Every share link targets its network',
      where: '#social-share-options, #social-share-options-mobile-container, #copy-link-btn-desktop',
      when: 'After the share menu is built.',
      how: 'LinkedIn, X, Facebook, WhatsApp, Telegram, Reddit, and Pinterest are https links carrying this CV URL. Copy stays on the page.',
      async run({ cv }) {
        const pageUrl = cv.window.location.href.split('?')[0];
        const encoded = encodeURIComponent(pageUrl);
        ['social-share-options', 'social-share-options-mobile-container'].forEach((id) => {
          const links = [...cv.document.querySelectorAll('#' + id + ' a[href]')].filter((a) => a.getAttribute('href') !== '#');
          assert(links.length === SHARE_TARGETS.length, id + ' has ' + links.length + ' share links');
          SHARE_TARGETS.forEach(([host, path]) => {
            const link = links.find((a) => a.href.indexOf(host) !== -1 && a.href.indexOf(path) !== -1);
            assert(link, id + ' is missing ' + host + path);
            assert(link.target === '_blank', host + ' does not open in a new tab');
            assert(/noopener/i.test(link.rel), host + ' is missing noopener');
            assert(link.href.indexOf(encoded) !== -1, host + ' does not carry ' + pageUrl);
            assertAddress(link.href);
          });
        });
        const copy = cv.document.getElementById('copy-link-btn-desktop');
        assert(copy, 'copy link missing');
        const before = cv.window.location.href;
        let copied = '';
        const nav = cv.window.navigator;
        const clip = nav && nav.clipboard;
        const originalWrite = clip && clip.writeText;
        if (clip) {
          try { clip.writeText = (text) => { copied = String(text); return Promise.resolve(); }; } catch (err) { /* clipboard may be locked */ }
        }
        copy.click();
        await wait(40);
        if (clip && originalWrite) {
          try { clip.writeText = originalWrite; } catch (err) { /* leave the stub */ }
        }
        assert(cv.window.location.href === before, 'copy link navigated away');
        if (copied) assert(copied.split('?')[0] === pageUrl, 'copied ' + copied);
        return SHARE_TARGETS.length + ' networks on desktop and phone';
      }
    },
    {
      id: 'FN-26', layer: 'Functional', fw: ['Playwright', 'Cypress', 'Robot'],
      title: 'Print runs under a random language',
      where: '#print-btn, #print-content .sheet',
      when: 'After a native language chosen at random, then Print.',
      how: 'The recruiter sheets use that language’s skills heading and the CV stays on this page. The starting language returns.',
      async run({ cv }) {
        const original = currentLang(cv);
        const chosen = shuffle(NATIVE_LANGS.filter((code) => code !== original))[0];
        try {
          await chooseLang(cv, chosen);
          const hrefs = await printedHrefs(cv);
          const sheets = cv.document.querySelectorAll('#print-content .sheet');
          assert(sheets.length > 0, 'print sheets missing');
          const text = [...sheets].map((sheet) => sheet.textContent).join('\n');
          assert(text.indexOf(PRINT_SKILLS[chosen]) !== -1, 'print sheets missing ' + PRINT_SKILLS[chosen]);
          assert(hrefs.length >= PRINT_HREFS.length, 'print built ' + hrefs.length + ' links');
          return chosen + ' · ' + sheets.length + ' sheets';
        } finally {
          if (currentLang(cv) !== original) await chooseLang(cv, original);
        }
      }
    },
    {
      id: 'FN-27', layer: 'Functional', fw: ['Playwright', 'Cypress', 'Robot'],
      title: 'Print hyperlinks are real and the site pages respond',
      where: '#print-content a[href], /, /qa-lab.html, /simulador.html',
      when: 'During Print, before the sheets are cleared.',
      how: 'Mail, phone, LinkedIn, and carlosandmunoz.com links are well formed. The CV, lab, and studio answer on this server.',
      async run({ cv }) {
        const hrefs = await printedHrefs(cv);
        PRINT_HREFS.forEach((expected) => {
          const found = hrefs.find((href) => href === expected);
          assert(found, 'print is missing ' + expected);
          assertAddress(found);
        });
        const pages = [
          ['https://carlosandmunoz.com/', '/'],
          ['https://carlosandmunoz.com/qa-lab.html', '/qa-lab.html'],
          ['https://carlosandmunoz.com/simulador.html', '/simulador.html']
        ];
        for (const [href, path] of pages) {
          const res = await fetch(path, { cache: 'no-store' });
          assert(res.ok, path + ' returned HTTP ' + res.status + ' for ' + href);
        }
        return hrefs.length + ' print links';
      }
    },
    {
      id: 'FN-28', layer: 'Functional', fw: ['Playwright', 'Cypress', 'Robot'],
      title: 'Downloads run under a random language',
      where: '#export-options button',
      when: 'After a native language chosen at random, then each export.',
      how: 'Text, Word, and JSON carry that language and the public links. PDF and JPG start a file download. The starting language returns.',
      async run({ cv }) {
        const original = currentLang(cv);
        const chosen = shuffle(NATIVE_LANGS.filter((code) => code !== original))[0];
        const win = cv.window;
        const files = [];
        const proto = win.HTMLAnchorElement.prototype;
        const origClick = proto.click;
        const realCanvas = win.html2canvas;
        const realAlert = win.alert;
        proto.click = function () {
          const name = this.getAttribute('download') || '';
          if (name) files.push({ name: name, href: this.getAttribute('href') || '' });
        };
        win.html2canvas = () => {
          const canvas = win.document.createElement('canvas');
          canvas.width = 12;
          canvas.height = 12;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, 12, 12);
          }
          return Promise.resolve(canvas);
        };
        const notes = [];
        const origConsoleError = win.console.error.bind(win.console);
        win.console.error = function () {
          notes.push([...arguments].map((item) => (item && item.message) || String(item)).join(' '));
          return origConsoleError.apply(win.console, arguments);
        };
        win.alert = (msg) => { notes.push(String(msg)); };
        try {
          await chooseLang(cv, chosen);
          assert(typeof realCanvas === 'function', 'html2canvas missing');
          assert(typeof win.jsPDF === 'function', 'jsPDF missing');
          const buttons = [...cv.document.querySelectorAll('#export-options button')];
          assert(buttons.length === 5, 'export menu has ' + buttons.length + ' actions');
          const app = cvApp(cv);
          const RealPdf = win.jsPDF;
          function WrappedPdf(options) {
            const doc = new RealPdf(options);
            const origSave = doc.save;
            doc.save = function (filename) {
              files.push({ name: filename, href: 'application/pdf' });
              return origSave.apply(doc, arguments);
            };
            return doc;
          }
          WrappedPdf.API = RealPdf.API;
          win.jsPDF = WrappedPdf;
          try {
            await app._exportAsPDF_jsPDF();
            await app._exportAsJPG();
          } finally {
            win.jsPDF = RealPdf;
          }
          app._exportAsATS();
          app._exportAsJSON();
          app._exportAsText();
          assert(notes.length === 0, notes.join(' | '));
          const names = files.map((file) => file.name);
          ['CarlosMunozCV_Export.pdf', 'CarlosMunozCV.jpg', 'CarlosMunozCV_ATS.doc', 'CarlosMunozCV_Export.txt', 'carlos_munoz_cv_' + chosen + '.json'].forEach((name) => {
            assert(names.indexOf(name) !== -1, 'download missing ' + name + ' (got ' + names.join(', ') + ')');
          });
          const text = decodeDataUrl((files.find((file) => file.name === 'CarlosMunozCV_Export.txt') || {}).href || '');
          const json = decodeDataUrl((files.find((file) => /\.json$/.test(file.name)) || {}).href || '');
          assert(text.indexOf(PRINT_SKILLS[chosen]) !== -1, 'text export missing ' + PRINT_SKILLS[chosen]);
          assert(text.indexOf('https://carlosandmunoz.com/') !== -1, 'text export missing the public site');
          assert(text.indexOf('https://carlosandmunoz.com/qa-lab.html') !== -1, 'text export missing the lab');
          assert(text.indexOf('https://carlosandmunoz.com/simulador.html') !== -1, 'text export missing the studio');
          assert(json.indexOf('"language": "' + chosen + '"') !== -1, 'JSON language is not ' + chosen);
          const word = cvApp(cv)._recruiterWordHtml();
          PRINT_HREFS.forEach((href) => assert(word.indexOf(href) !== -1, 'Word export missing ' + href));
          return chosen + ' · ' + names.length + ' files';
        } finally {
          proto.click = origClick;
          win.html2canvas = realCanvas;
          win.alert = realAlert;
          win.console.error = origConsoleError;
          if (currentLang(cv) !== original) await chooseLang(cv, original);
        }
      }
    },
    {
      id: 'FN-29', layer: 'Functional', fw: ['Playwright', 'Cypress'],
      title: 'Send Message stays inside the contact panel',
      where: '#contact-widget-fab, #contact-widget, #send-message-btn',
      when: 'After the contact widget opens on a laptop-height page.',
      how: 'The send control’s box sits inside the widget, not past its bottom edge.',
      async run({ cv }) {
        cv.document.getElementById('contact-widget-fab').click();
        await wait(60);
        const widget = cv.document.getElementById('contact-widget');
        const send = cv.document.getElementById('send-message-btn');
        const wr = widget.getBoundingClientRect();
        const sr = send.getBoundingClientRect();
        assert(sr.height > 0, 'send button has no box');
        assert(sr.top >= wr.top - 1, 'send button is above the widget');
        assert(sr.bottom <= wr.bottom + 1, 'send button sits below the widget');
        cv.document.getElementById('widget-close-btn').click();
        return 'send button inside the panel';
      }
    },
    {
      id: 'FN-30', layer: 'Functional', fw: ['Playwright', 'Cypress'],
      title: 'Tour Back returns to the previous step',
      where: '#tour-start-btn, #tour-next-btn, #tour-back-btn',
      when: 'After Next advances the CV tour.',
      how: 'Back shows step 1 again, then Close hides the tooltip.',
      async run({ cv }) {
        const start = [...cv.document.querySelectorAll('#tour-start-btn')].find((el) => el.offsetParent !== null) || cv.document.getElementById('tour-start-btn');
        start.click();
        const tip = cv.document.getElementById('tour-tooltip');
        const shown = Date.now();
        while (!tip.classList.contains('visible') && Date.now() - shown < 3000) await wait(50);
        const next = cv.document.getElementById('tour-next-btn');
        const startWait = Date.now();
        while (next.disabled && Date.now() - startWait < 16000) await wait(200);
        next.click();
        const counter = cv.document.getElementById('tour-step-counter');
        const advanced = Date.now();
        while (!/2\s*\//.test(counter.textContent) && Date.now() - advanced < 3000) await wait(50);
        cv.document.getElementById('tour-back-btn').click();
        const backed = Date.now();
        while (!/1\s*\//.test(counter.textContent) && Date.now() - backed < 3000) await wait(50);
        assert(/1\s*\//.test(counter.textContent), 'Back did not return to step 1');
        cv.document.getElementById('tour-close-btn').click();
        return 'Back restored step 1';
      }
    },
    {
      id: 'FN-31', layer: 'Functional', fw: ['Playwright', 'Cypress'],
      title: 'The CV states the contract and advisory offer',
      where: '#engagement-offer',
      when: 'CV first paint.',
      how: 'The offer paragraph is present and names contract work.',
      async run({ cv }) {
        const offer = cv.document.getElementById('engagement-offer');
        assert(offer, 'engagement offer missing');
        assert(/contract/i.test(offer.textContent), 'offer does not mention contract');
        return 'offer visible';
      }
    },
    {
      id: 'FN-32', layer: 'Functional', fw: ['Playwright'],
      title: 'Lab asks which runners to use and remembers the tour',
      where: 'qa-lab.html #fw-picker, #runner-deck, #view-slider; js/site-tour.js',
      when: 'Static parse of the lab page and the shared tour.',
      how: 'The framework ask, native runner deck, and watch slider are in the page. A finished tour is stored in localStorage.',
      async run() {
        const html = await fetchText('qa-lab.html');
        const tour = await fetchText('js/site-tour.js');
        assert(html.includes('id="fw-picker"'), 'framework picker missing');
        assert(html.includes('id="fw-ask"'), 'framework ask missing');
        assert(html.includes('id="runner-drawer"'), 'native runner view missing');
        assert(html.includes('id="view-slider"'), 'watch switch missing');
        assert(html.includes('id="browser-ask-list"'), 'browser ask missing');
        assert(html.includes('id="device-ask-list"'), 'device ask missing');
        assert(html.includes('QA LAB · CARLOS MUÑOZ') || html.includes('QA LAB'), 'report watermark missing');
        assert(html.includes('id="suite-repo"'), 'suite repo control missing');
        assert(html.includes('id="studio-link"'), 'sprint studio control missing');
        assert(tour.includes('localStorage.setItem(key, \'true\')'), 'finished tour is not remembered');
        return 'picker, runners, slider, remembered tour';
      }
    },
    {
      id: 'STU-04', layer: 'Studio', fw: ['Playwright', 'Cypress'],
      title: 'Studio asks which board the sprint should use',
      where: 'simulador.html BOARDS',
      when: 'Static parse of the studio script.',
      how: 'Jira, Azure DevOps, Monday.com, Trello, Linear, and Asana are offered.',
      async run() {
        const html = await fetchText('simulador.html');
        ['Jira', 'Azure DevOps', 'Monday.com', 'Trello', 'Linear', 'Asana'].forEach((name) => {
          assert(html.includes(name), name + ' board missing');
        });
        assert(html.includes('data-board'), 'board choice missing');
        return 'six boards offered';
      }
    },
    {
      id: 'FN-33', layer: 'Functional', fw: ['Playwright', 'Cypress'],
      title: 'Rate CV offers five stars',
      where: '#contact-widget-fab, #rating-tab, #star-rating',
      when: 'After opening the contact widget and the Rate CV pane.',
      how: 'Five stars are shown. Choosing the fifth sets the rating to 5. The widget closes.',
      async run({ cv }) {
        cv.document.getElementById('contact-widget-fab').click();
        await wait(40);
        cv.document.getElementById('rating-tab').click();
        const stars = cv.document.querySelectorAll('#star-rating .star');
        assert(stars.length === 5, 'expected five stars, saw ' + stars.length);
        stars[4].click();
        assert(cv.document.getElementById('rating-value').value === '5', 'rating value is not 5');
        cv.document.getElementById('widget-close-btn').click();
        return 'five stars, fifth selected';
      }
    },
    {
      id: 'STU-05', layer: 'Studio', fw: ['Playwright', 'Cypress'],
      title: 'Studio slides a runner console in from the right',
      where: 'simulador.html #runner-edge #runner-drawer',
      when: 'Static parse of the studio page.',
      how: 'A Runners edge opens a drawer split into the case list and that runner’s console.',
      async run() {
        const html = await fetchText('simulador.html');
        assert(html.includes('id="runner-edge"'), 'runner edge missing');
        assert(html.includes('id="runner-drawer"'), 'runner drawer missing');
        assert(html.includes('runner-cases'), 'case list missing');
        assert(html.includes('runner-console'), 'runner console missing');
        return 'studio runner drawer';
      }
    },
    {
      id: 'STU-06', layer: 'Studio', fw: ['Playwright', 'Cypress'],
      title: 'Studio report stays English until a language is chosen',
      where: 'simulador.html #studio-report-open #studio-report-lang',
      when: 'Static parse of the studio page.',
      how: 'Report opens a preview with graphs, and English is the selected language.',
      async run() {
        const html = await fetchText('simulador.html');
        assert(html.includes('id="studio-report-open"'), 'report button missing');
        assert(html.includes('id="studio-report-lang"'), 'report language missing');
        assert(html.includes('value="en" selected'), 'English is not the default report language');
        assert(html.includes('id="studio-opt-graphs"'), 'graph option missing');
        return 'studio report options';
      }
    },
    {
      id: 'STU-07', layer: 'Studio', fw: ['Playwright', 'Cypress', 'Robot'],
      title: 'Sprint board holds six stories including refunds and webhooks',
      where: 'simulador.html TICKETS',
      when: 'Static parse of the studio script.',
      how: 'PAY-241, PAY-246, PAY-251, PAY-255, PAY-260, and PAY-264 are on the board.',
      async run() {
        const html = await fetchText('simulador.html');
        ['PAY-241', 'PAY-246', 'PAY-251', 'PAY-255', 'PAY-260', 'PAY-264'].forEach((key) => {
          assert(html.includes("key: '" + key + "'"), key + ' missing');
        });
        return 'six sprint stories';
      }
    },
    {
      id: 'FN-34', layer: 'Functional', fw: ['Playwright'],
      title: 'Lab report opens in English with graphs',
      where: 'qa-lab.html #report-open #report-lang #opt-graphs',
      when: 'Static parse of the lab page.',
      how: 'Report is present, English is selected, and the graphs option is checked.',
      async run() {
        const html = await fetchText('qa-lab.html');
        assert(html.includes('id="report-open"'), 'report button missing');
        assert(html.includes('id="report-lang"'), 'report language missing');
        assert(html.includes('value="en" selected'), 'English is not the default report language');
        assert(html.includes('id="opt-graphs" checked'), 'graphs are not on by default');
        return 'lab report options';
      }
    }
  ];

  const REPO = 'https://github.com/kaanmuar/kaanmuar.github.io';
  const BRANCH = 'main';
  const LAB_LINE = {
    'SMK-01': 33, 'SMK-02': 45,
    'FN-01': 58, 'FN-02': 76, 'FN-03': 98, 'FN-04': 111, 'FN-05': 126,     'FN-06': 139, 'FN-15': 160, 'FN-16': 181, 'FN-17': 196, 'FN-18': 214, 'FN-19': 231,
    'FN-20': 247, 'FN-21': 263, 'FN-22': 280,
    'FN-07': 298, 'FN-08': 313, 'FN-09': 328, 'FN-10': 341, 'FN-11': 353, 'FN-12': 366,
    'FN-13': 379, 'FN-14': 399,
    'FN-23': 917, 'FN-24': 937, 'FN-25': 956, 'FN-26': 997, 'FN-27': 1020, 'FN-28': 1045,
    'FN-29': 1139, 'FN-30': 1159, 'FN-31': 1186, 'FN-32': 1199, 'FN-33': 1228, 'FN-34': 1292,
    'STU-04': 1217, 'STU-05': 1248, 'STU-06': 1263, 'STU-07': 1278,
    'SEC-01': 426, 'SEC-02': 441, 'SEC-03': 458, 'SEC-04': 470, 'SEC-05': 487, 'SEC-06': 500,
    'SEC-07': 516, 'SEC-08': 530,
    'A11Y-01': 684, 'A11Y-02': 701, 'A11Y-03': 713, 'A11Y-04': 728, 'A11Y-05': 749, 'A11Y-06': 770,
    'ADM-01': 591, 'ADM-02': 604, 'ADM-03': 617,
    'STU-01': 630, 'STU-02': 643, 'STU-03': 658,
    'MOB-01': 500, 'MOB-02': 518, 'MOB-03': 532, 'MOB-04': 553, 'MOB-05': 570, 'MOB-06': 588
  };
  const SRC = {
    'SMK-01': { Playwright: ['tests/smoke.spec.js', 5] },
    'SMK-02': { Playwright: ['tests/smoke.spec.js', 12] },
    'FN-01': { Playwright: ['tests/cv.spec.js', 11], Cypress: ['cypress/e2e/cv_spec.cy.js', 43], Robot: ['tests/robot/cv_suite.robot', 6] },
    'FN-02': { Playwright: ['tests/cv.spec.js', 20], Cypress: ['cypress/e2e/cv_spec.cy.js', 51], Robot: ['tests/robot/cv_suite.robot', 14] },
    'FN-03': { Playwright: ['tests/cv.spec.js', 28], Cypress: ['cypress/e2e/cv_spec.cy.js', 58] },
    'FN-04': { Playwright: ['tests/cv.spec.js', 34], Cypress: ['cypress/e2e/cv_spec.cy.js', 63], Robot: ['tests/robot/cv_suite.robot', 33] },
    'FN-05': { Playwright: ['tests/cv.spec.js', 42], Cypress: ['cypress/e2e/cv_spec.cy.js', 70], Robot: ['tests/robot/cv_suite.robot', 27] },
    'FN-06': { Playwright: ['tests/cv.spec.js', 49], Cypress: ['cypress/e2e/cv_spec.cy.js', 75], Robot: ['tests/robot/cv_suite.robot', 21] },
    'FN-15': { Playwright: ['tests/cv.spec.js', 59], Cypress: ['cypress/e2e/cv_spec.cy.js', 84], Robot: ['tests/robot/cv_suite.robot', 28] },
    'FN-16': { Playwright: ['tests/competency.spec.js', 12], Cypress: ['cypress/e2e/competency_spec.cy.js', 12], Robot: ['tests/robot/cv_suite.robot', 38] },
    'FN-17': { Playwright: ['tests/competency.spec.js', 24], Cypress: ['cypress/e2e/competency_spec.cy.js', 22], Robot: ['tests/robot/cv_suite.robot', 46] },
    'FN-18': { Playwright: ['tests/competency.spec.js', 34], Cypress: ['cypress/e2e/competency_spec.cy.js', 32] },
    'FN-19': { Playwright: ['tests/competency.spec.js', 45], Cypress: ['cypress/e2e/competency_spec.cy.js', 42] },
    'FN-20': { Playwright: ['tests/competency.spec.js', 55], Cypress: ['cypress/e2e/competency_spec.cy.js', 51], Robot: ['tests/robot/cv_suite.robot', 54] },
    'FN-21': { Playwright: ['tests/competency.spec.js', 64], Cypress: ['cypress/e2e/competency_spec.cy.js', 59] },
    'FN-22': { Playwright: ['tests/competency.spec.js', 74], Cypress: ['cypress/e2e/competency_spec.cy.js', 68], Robot: ['tests/robot/cv_suite.robot', 21] },
    'FN-07': { Playwright: ['tests/cv.spec.js', 79], Cypress: ['cypress/e2e/cv_spec.cy.js', 95] },
    'FN-08': { Playwright: ['tests/cv.spec.js', 66], Cypress: ['cypress/e2e/cv_spec.cy.js', 91] },
    'FN-09': { Playwright: ['tests/cv.spec.js', 75], Cypress: ['cypress/e2e/cv_spec.cy.js', 99], Robot: ['tests/robot/cv_suite.robot', 41] },
    'FN-10': { Playwright: ['tests/cv.spec.js', 85], Cypress: ['cypress/e2e/cv_spec.cy.js', 121], Robot: ['tests/robot/cv_suite.robot', 49] },
    'FN-11': { Playwright: ['tests/cv.spec.js', 100], Cypress: ['cypress/e2e/cv_spec.cy.js', 127] },
    'FN-12': { Playwright: ['tests/cv.spec.js', 105], Cypress: ['cypress/e2e/cv_spec.cy.js', 132] },
    'FN-13': { Playwright: ['tests/cv.spec.js', 111], Cypress: ['cypress/e2e/cv_spec.cy.js', 138] },
    'FN-14': { Playwright: ['tests/cv.spec.js', 119], Cypress: ['cypress/e2e/cv_spec.cy.js', 146] },
    'SEC-01': { Playwright: ['tests/security.spec.js', 5], Cypress: ['cypress/e2e/security_spec.cy.js', 2], Robot: ['tests/robot/security_admin.robot', 18] },
    'SEC-02': { Playwright: ['tests/security.spec.js', 16], Cypress: ['cypress/e2e/security_spec.cy.js', 12], Robot: ['tests/robot/security_admin.robot', 24] },
    'SEC-03': { Playwright: ['tests/security.spec.js', 28], Cypress: ['cypress/e2e/security_spec.cy.js', 22], Robot: ['tests/robot/security_admin.robot', 12] },
    'SEC-04': { Playwright: ['tests/security.spec.js', 34], Cypress: ['cypress/e2e/security_spec.cy.js', 27] },
    'SEC-05': { Playwright: ['tests/security.spec.js', 44], Cypress: ['cypress/e2e/security_spec.cy.js', 34], Robot: ['tests/robot/security_admin.robot', 32] },
    'SEC-06': { Playwright: ['tests/security.spec.js', 51], Cypress: ['cypress/e2e/security_spec.cy.js', 40] },
    'SEC-07': { Playwright: ['tests/security.spec.js', 62], Cypress: ['cypress/e2e/security_spec.cy.js', 48] },
    'SEC-08': { Playwright: ['tests/security.spec.js', 34], Cypress: ['cypress/e2e/security_spec.cy.js', 27], Robot: ['tests/robot/security_admin.robot', 24] },
    'A11Y-01': { Playwright: ['tests/a11y.spec.js', 5], Cypress: ['cypress/e2e/a11y_spec.cy.js', 2] },
    'A11Y-02': { Playwright: ['tests/a11y.spec.js', 12], Cypress: ['cypress/e2e/a11y_spec.cy.js', 11] },
    'A11Y-03': { Playwright: ['tests/a11y.spec.js', 18], Cypress: ['cypress/e2e/a11y_spec.cy.js', 17] },
    'A11Y-04': { Playwright: ['tests/a11y.spec.js', 30], Cypress: ['cypress/e2e/a11y_spec.cy.js', 27] },
    'A11Y-05': { Playwright: ['tests/a11y.spec.js', 48], Cypress: ['cypress/e2e/a11y_spec.cy.js', 37] },
    'A11Y-06': { Playwright: ['tests/a11y.spec.js', 62], Cypress: ['cypress/e2e/a11y_spec.cy.js', 48] },
    'ADM-01': { Playwright: ['tests/admin.spec.js', 9], Cypress: ['cypress/e2e/admin_spec.cy.js', 18], Robot: ['tests/robot/security_admin.robot', 6] },
    'ADM-02': { Playwright: ['tests/admin.spec.js', 17], Cypress: ['cypress/e2e/admin_spec.cy.js', 24] },
    'ADM-03': { Playwright: ['tests/a11y.spec.js', 79], Cypress: ['cypress/e2e/a11y_spec.cy.js', 63] },
    'STU-01': { Playwright: ['tests/simulator.spec.js', 9], Cypress: ['cypress/e2e/simulator_spec.cy.js', 10], Robot: ['tests/robot/security_admin.robot', 38] },
    'STU-02': { Playwright: ['tests/simulator.spec.js', 26], Cypress: ['cypress/e2e/simulator_spec.cy.js', 27] },
    'STU-03': { Playwright: ['tests/simulator.spec.js', 42], Cypress: ['cypress/e2e/simulator_spec.cy.js', 36], Robot: ['tests/robot/mobile_suite.robot', 20] },
    'MOB-01': { Playwright: ['tests/mobile.spec.js', 11], Cypress: ['cypress/e2e/mobile_spec.cy.js', 6], Robot: ['tests/robot/mobile_suite.robot', 6] },
    'MOB-02': { Playwright: ['tests/cv.spec.js', 147], Cypress: ['cypress/e2e/cv_spec.cy.js', 180], Robot: ['tests/robot/mobile_suite.robot', 14] },
    'MOB-03': { Playwright: ['tests/mobile.spec.js', 28], Cypress: ['cypress/e2e/mobile_spec.cy.js', 17], Robot: ['tests/robot/mobile_suite.robot', 20] },
    'MOB-04': { Playwright: ['tests/mobile.spec.js', 28], Cypress: ['cypress/e2e/mobile_spec.cy.js', 17] },
    'MOB-05': { Playwright: ['tests/mobile.spec.js', 49], Cypress: ['cypress/e2e/mobile_spec.cy.js', 36], Robot: ['tests/robot/mobile_suite.robot', 28] },
    'MOB-06': { Playwright: ['tests/mobile.spec.js', 63], Cypress: ['cypress/e2e/mobile_spec.cy.js', 53], Robot: ['tests/robot/mobile_suite.robot', 36] }
  };

  function blob(path, line) {
    return REPO + '/blob/' + BRANCH + '/' + path + (line ? '#L' + line : '');
  }

  const FW_TREE = {
    Playwright: 'tests',
    Cypress: 'cypress/e2e',
    Robot: 'tests/robot',
    Selenium: 'selenium',
    WebDriverIO: 'wdio',
    Appium: 'appium'
  };

  const NATIVE_SPEC = {
    Selenium: {
      Smoke: 'selenium/smoke.spec.js', Functional: 'selenium/cv.spec.js', Security: 'selenium/security.spec.js',
      Accessibility: 'selenium/a11y.spec.js', Studio: 'selenium/studio.spec.js', Admin: 'selenium/admin.spec.js',
      Mobile: 'selenium/mobile.spec.js'
    },
    WebDriverIO: {
      Smoke: 'wdio/smoke.spec.js', Functional: 'wdio/cv.spec.js', Security: 'wdio/security.spec.js',
      Accessibility: 'wdio/a11y.spec.js', Studio: 'wdio/studio.spec.js', Admin: 'wdio/admin.spec.js',
      Mobile: 'wdio/mobile.spec.js'
    },
    Appium: {
      Smoke: 'appium/smoke.spec.js', Functional: 'appium/cv.spec.js', Security: 'appium/security.spec.js',
      Accessibility: 'appium/a11y.spec.js', Studio: 'appium/studio.spec.js', Admin: 'appium/admin.spec.js',
      Mobile: 'appium/mobile.spec.js'
    }
  };

  const ALL_FW = ['Playwright', 'Cypress', 'Robot', 'Selenium', 'WebDriverIO', 'Appium'];
  const BASE_BROWSERS = [
    { id: 'chrome', label: 'Chrome' },
    { id: 'firefox', label: 'Firefox' },
    { id: 'edge', label: 'Edge' },
    { id: 'safari', label: 'Safari' }
  ];
  const BASE_DEVICES = [
    { platform: 'here', id: 'here', group: 'here', label: 'This device' },
    { platform: 'profile', id: 's26u', group: 'phone', label: 'Samsung Galaxy S26 Ultra · Android 16', width: 384, height: 832, api: 36 }
  ];
  const FW_KEY = 'qa-lab-frameworks';

  function runnersFor(c) {
    const list = c.fw.slice();
    if (c.layer === 'Mobile') {
      if (!list.includes('Appium')) list.push('Appium');
    } else if (list.includes('Playwright')) {
      if (!list.includes('Selenium')) list.push('Selenium');
      if (!list.includes('WebDriverIO')) list.push('WebDriverIO');
    }
    return list;
  }

  function readFrameworks() {
    try {
      const saved = JSON.parse(localStorage.getItem(FW_KEY) || 'null');
      if (Array.isArray(saved) && saved.length) return saved.filter((name) => ALL_FW.includes(name));
    } catch (err) { /* ignore */ }
    return ALL_FW.slice();
  }

  const FW_MARK = {
    Lab: '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M6.4 10.6 3.8 8l-1.1 1.1 3.7 3.7 7-7-1.1-1.1z"/></svg>',
    Playwright: '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M2.2 11.6 8 1.8l5.8 9.8H2.2zm5.8-6.2 2.6 4.4H5.4L8 5.4z"/></svg>',
    Cypress: '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 1.4a6.6 6.6 0 1 0 0 13.2A6.6 6.6 0 0 0 8 1.4zm0 1.6c1.8 1.5 2.8 3.2 2.8 5s-1 3.5-2.8 5c-1.8-1.5-2.8-3.2-2.8-5s1-3.5 2.8-5z"/></svg>',
    Robot: '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M7.2 1.6h1.6V3h1.8A1.6 1.6 0 0 1 12.2 4.6v4.2A1.6 1.6 0 0 1 10.6 10.4H5.4A1.6 1.6 0 0 1 3.8 8.8V4.6A1.6 1.6 0 0 1 5.4 3h1.8V1.6zM6 6.1a.9.9 0 1 0 0 1.8.9.9 0 0 0 0-1.8zm4 0a.9.9 0 1 0 0 1.8.9.9 0 0 0 0-1.8zM6.2 12h3.6v1.4H6.2z"/></svg>',
    Selenium: '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 1.2 2.2 4.4v7.2L8 14.8l5.8-3.2V4.4L8 1.2zm0 2.1 3.6 2v4.2L8 11.5 4.4 9.5V5.3L8 3.3z"/></svg>',
    WebDriverIO: '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M2 3.2h12v1.6H2zm0 4h8v1.6H2zm0 4h10v1.6H2z"/></svg>',
    Appium: '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M5 1.4h6v1.2H5zM4 3.2h8a1 1 0 0 1 1 1v8.2a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4.2a1 1 0 0 1 1-1zm3 9.2h2v.8H7z"/></svg>'
  };

  function sourceEntries(c) {
    const items = [{ label: 'Lab', href: blob('js/qa-lab.js', LAB_LINE[c.id]) }];
    const row = SRC[c.id] || {};
    runnersFor(c).forEach((fw) => {
      if (row[fw]) items.push({ label: fw, href: blob(row[fw][0], row[fw][1]) });
      else if (NATIVE_SPEC[fw] && NATIVE_SPEC[fw][c.layer]) items.push({ label: fw, href: blob(NATIVE_SPEC[fw][c.layer]) });
      else items.push({ label: fw, href: REPO + '/tree/' + BRANCH + '/' + FW_TREE[fw] });
    });
    return items;
  }

  function sourceHtml(c, extraClass) {
    return `<span class="src-links ${extraClass || ''}">${sourceEntries(c).map((item) =>
      `<a class="src-link" href="${item.href}" target="_blank" rel="noopener noreferrer">${FW_MARK[item.label] || ''}<span>${item.label}</span></a>`
    ).join('')}</span>`;
  }

  const VIEW_KEY = 'qa-lab-view';

  function readView() {
    return localStorage.getItem(VIEW_KEY) === 'background' ? 'background' : 'watch';
  }

  async function injectAxe(win, doc) {
    if (win.axe) return;
    await new Promise((resolve, reject) => {
      const s = doc.createElement('script');
      s.src = AXE_SRC;
      s.onload = resolve;
      s.onerror = () => reject(new Error('axe-core failed to load'));
      doc.head.appendChild(s);
    });
  }

  function layerColor(layer) {
    return {
      Smoke: '#4a5560',
      Functional: '#0d6e76',
      Security: '#b45309',
      Accessibility: '#3d7a82',
      Admin: '#b42318',
      Studio: '#0f766e',
      Mobile: '#08545b'
    }[layer] || '#4a5560';
  }

  function readHistory() {
    try {
      return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    } catch (e) {
      return [];
    }
  }

  function writeHistory(entry) {
    const list = readHistory();
    list.push(entry);
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(-24)));
    } catch (err) { /* ignore quota */ }
  }

  function escHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function formatWhen(ts) {
    try {
      return new Date(ts).toLocaleString(undefined, {
        year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
      });
    } catch (err) {
      return String(ts);
    }
  }

  function runKey(run) {
    return run && (run.id || String(run.ts));
  }

  function meter(pct, color) {
    const n = Math.max(0, Math.min(100, Math.round(pct || 0)));
    return '<div class="h-meter" aria-hidden="true"><span style="width:' + n + '%;background:' + (color || '#0d6e76') + '"></span></div>';
  }

  function caseMeta(id) {
    return CASES.find((item) => item.id === id) || { id: id, title: id, layer: '', where: '', when: '', how: '' };
  }

  function analyzeRuns(runs) {
    const ordered = runs.slice().sort((a, b) => (a.ts || 0) - (b.ts || 0));
    const withCases = ordered.filter((run) => Array.isArray(run.cases) && run.cases.length);
    const ids = [];
    withCases.forEach((run) => run.cases.forEach((row) => { if (!ids.includes(row.id)) ids.push(row.id); }));
    const matrix = ids.map((id) => {
      const meta = caseMeta(id);
      const cells = ordered.map((run) => (run.cases || []).find((row) => row.id === id) || null);
      const present = cells.filter(Boolean);
      const first = present[0];
      const last = present[present.length - 1];
      const passes = present.filter((row) => row.ok).length;
      const fails = present.length - passes;
      let verdict = 'partial';
      if (present.length >= 2 && first && last && first.ok && !last.ok) verdict = 'regression';
      else if (present.length >= 2 && first && last && !first.ok && last.ok) verdict = 'fixed';
      else if (passes && fails) verdict = 'flaky';
      else if (present.length === ordered.length && fails === 0) verdict = 'stable pass';
      else if (present.length === ordered.length && passes === 0) verdict = 'stable fail';
      else if (present.length === 1) verdict = last && last.ok ? 'pass' : 'fail';
      return {
        id,
        title: meta.title,
        layer: (last && last.layer) || meta.layer || '',
        where: meta.where || '',
        how: meta.how || '',
        cells,
        verdict,
        delta: first && last ? (last.ms || 0) - (first.ms || 0) : 0,
        note: (last && last.note) || ''
      };
    });
    const rates = ordered.map((run) => Number(run.rate) || 0);
    const durations = ordered.map((run) => Number(run.ms) || 0).filter((ms) => ms > 0);
    const mean = (list) => (list.length ? Math.round(list.reduce((sum, n) => sum + n, 0) / list.length) : 0);
    const best = ordered.slice().sort((a, b) => (b.rate || 0) - (a.rate || 0) || (a.ms || 0) - (b.ms || 0))[0];
    const weakest = ordered.slice().sort((a, b) => (a.rate || 0) - (b.rate || 0) || (b.ms || 0) - (a.ms || 0))[0];
    const fastest = durations.length ? ordered.filter((run) => run.ms).slice().sort((a, b) => a.ms - b.ms)[0] : null;
    const slowest = durations.length ? ordered.filter((run) => run.ms).slice().sort((a, b) => b.ms - a.ms)[0] : null;
    const first = ordered[0];
    const latest = ordered[ordered.length - 1];
    const layers = [];
    matrix.forEach((row) => { if (row.layer && !layers.includes(row.layer)) layers.push(row.layer); });
    return {
      ordered,
      matrix,
      layers,
      meanRate: mean(rates),
      meanMs: mean(durations),
      spread: rates.length ? Math.max(...rates) - Math.min(...rates) : 0,
      change: ordered.length > 1 ? (latest.rate || 0) - (first.rate || 0) : 0,
      best,
      weakest,
      fastest,
      slowest,
      regressions: matrix.filter((row) => row.verdict === 'regression'),
      fixes: matrix.filter((row) => row.verdict === 'fixed'),
      flaky: matrix.filter((row) => row.verdict === 'flaky'),
      stablePass: matrix.filter((row) => row.verdict === 'stable pass'),
      stableFail: matrix.filter((row) => row.verdict === 'stable fail')
    };
  }

  function runnerStats(run) {
    const names = run.runners && run.runners.length ? run.runners : [];
    return names.map((name) => {
      const ran = (run.cases || []).filter((row) => {
        const meta = caseMeta(row.id);
        return runnersFor(meta).includes(name);
      });
      const passed = ran.filter((row) => row.ok).length;
      const avg = ran.length ? Math.round(ran.reduce((sum, row) => sum + (row.ms || 0), 0) / ran.length) : 0;
      return { name, ran: ran.length, passed, avg, rate: ran.length ? Math.round((passed / ran.length) * 100) : 0 };
    });
  }

  const REPORT_LANG_KEY = 'qa-lab-report-lang';
  const REPORT_LANGS = ['en', 'es', 'pt', 'de', 'fr', 'it'];
  const REPORT_EN = {
    docTitle: 'QA Lab report · Carlos Muñoz',
    title: 'CV regression lab',
    produced: 'Produced by the QA lab of Carlos Muñoz',
    environment: 'Environment',
    runners: 'Runners',
    graphs: 'Graphs',
    passRate: 'Pass rate',
    passRateCap: 'Passed and failed in this session',
    byType: 'Cases by type',
    byTypeCap: 'Count of cases in the published suite',
    byRunner: 'Cases mirrored in each runner',
    byRunnerCap: 'Cases shown for the runners left on',
    fwPerf: 'Runner performance',
    fwPerfCap: 'Same browser run. A lower average is the faster runner this session.',
    slowest: 'Slowest checks (ms)',
    slowestCap: 'Wall time inside this browser',
    historyRate: 'Pass rate across saved runs',
    historyCap: 'Saved in this browser',
    historyEmpty: 'No saved runs in this browser yet.',
    runnerComparison: 'Runner comparison',
    tied: 'Each bar is that framework’s own process.',
    fastestLead: 'was fastest this session at',
    msAverage: 'ms average',
    mirroredOnly: 'no native log yet',
    passedOf: 'passed',
    colId: 'ID', colTitle: 'Title', colResult: 'Result', colMs: 'ms', colEvidence: 'Evidence',
    colType: 'Type', colWhere: 'Where', colHow: 'How',
    pass: 'PASSED', fail: 'FAILED',
    security: 'Security mark: QA Lab · Carlos A. Muñoz',
    footer: 'Produced by the QA lab of Carlos Muñoz · https://carlosandmunoz.com · not a third-party certificate',
    empty: 'Run the suite to generate case lines. Saved runs can still be included from history.',
    selectedRuns: 'Selected runs',
    durationMissing: 'duration not stored',
    pace: 'Pace', view: 'View', watch: 'Watch', background: 'Background', origin: 'Origin',
    noCaseLines: 'Case lines were not stored for this run.',
    analysis: 'Run analysis', caseLines: 'case lines', indicators: 'Indicators',
    runsCompared: 'Runs compared', meanPass: 'Mean pass rate', bestPass: 'Best pass rate',
    weakestPass: 'Weakest pass rate', passChange: 'Pass-rate change', passSpread: 'Pass-rate spread',
    meanDuration: 'Mean duration', fastestRun: 'Fastest run', slowestRun: 'Slowest run',
    regressions: 'Regressions', fixes: 'Fixes', flaky: 'Flaky cases',
    stablePass: 'Stable passes', stableFail: 'Stable failures',
    runIndex: 'Run index', run: 'Run', when: 'When', rate: 'Rate', duration: 'Duration',
    movement: 'Movement',
    noRegression: 'No case passed earlier and failed in the latest of these runs.',
    noFix: 'No case failed earlier and passed in the latest of these runs.',
    noFlaky: 'No case both passed and failed across these runs.',
    runnersEach: 'Runners on each run',
    runnersNote: 'Times are this browser’s wall clock. A bar counts the cases that runner mirrors inside that run.',
    runnersMissing: 'runners were not stored for this run.',
    caseIndex: 'Case index', verdict: 'Verdict', delta: 'Δ ms', latestEvidence: 'Latest evidence',
    whereHow: 'Where and how',
    olderOnly: 'These runs have totals only. New runs store every case.',
    noStored: 'No case lines stored.',
    typeNeed: 'Type totals need case lines. Older runs stored only the pass rate.',
    noHistory: 'Select at least one saved run in Run history.',
    pt: 'pt',
    verdicts: {
      regression: 'regression', fixed: 'fixed', flaky: 'flaky', 'stable pass': 'stable pass',
      'stable fail': 'stable fail', partial: 'partial', pass: 'pass', fail: 'fail'
    }
  };
  const REPORT_EXTRA = {
    es: {
      docTitle: 'Informe del laboratorio QA · Carlos Muñoz', title: 'Laboratorio de regresión del CV',
      produced: 'Producido por el laboratorio QA de Carlos Muñoz', environment: 'Entorno', runners: 'Ejecutores',
      graphs: 'Gráficas', passRate: 'Tasa de éxito', passRateCap: 'Aprobados y fallidos en esta sesión',
      byType: 'Casos por tipo', byTypeCap: 'Cantidad de casos de la suite publicada',
      byRunner: 'Casos reflejados en cada ejecutor', byRunnerCap: 'Casos de los ejecutores que dejaste activos',
      fwPerf: 'Rendimiento de los ejecutores', fwPerfCap: 'La misma ejecución en el navegador. El promedio más bajo es el ejecutor más rápido.',
      slowest: 'Comprobaciones más lentas (ms)', slowestCap: 'Tiempo real dentro de este navegador',
      historyRate: 'Tasa de éxito de las ejecuciones guardadas', historyCap: 'Guardado en este navegador',
      historyEmpty: 'Aún no hay ejecuciones guardadas en este navegador.',
      runnerComparison: 'Comparación de ejecutores',
      tied: 'Cada barra es el proceso de ese framework.',
      fastestLead: 'fue el más rápido en esta sesión, con', msAverage: 'ms de promedio',
      mirroredOnly: 'aún no hay log nativo',
      passedOf: 'aprobados', colTitle: 'Título', colResult: 'Resultado', colEvidence: 'Evidencia',
      colType: 'Tipo', colWhere: 'Dónde', colHow: 'Cómo', pass: 'APROBADO', fail: 'FALLIDO',
      security: 'Marca de seguridad: QA Lab · Carlos A. Muñoz',
      footer: 'Producido por el laboratorio QA de Carlos Muñoz · https://carlosandmunoz.com · no es un certificado de un tercero',
      empty: 'Ejecuta la suite para generar las líneas de casos. Las ejecuciones guardadas se pueden incluir desde el historial.',
      selectedRuns: 'Ejecuciones seleccionadas', durationMissing: 'duración no guardada',
      pace: 'Ritmo', view: 'Vista', watch: 'Ver', background: 'Segundo plano', origin: 'Origen',
      noCaseLines: 'Esta ejecución no guardó las líneas de casos.',
      analysis: 'Análisis de ejecuciones', caseLines: 'líneas de casos', indicators: 'Indicadores',
      runsCompared: 'Ejecuciones comparadas', meanPass: 'Tasa media de éxito', bestPass: 'Mejor tasa de éxito',
      weakestPass: 'Peor tasa de éxito', passChange: 'Cambio de la tasa', passSpread: 'Amplitud de la tasa',
      meanDuration: 'Duración media', fastestRun: 'Ejecución más rápida', slowestRun: 'Ejecución más lenta',
      regressions: 'Regresiones', fixes: 'Correcciones', flaky: 'Casos inestables',
      stablePass: 'Aprobados estables', stableFail: 'Fallos estables',
      runIndex: 'Índice de ejecuciones', run: 'Ejecución', when: 'Cuándo', rate: 'Tasa', duration: 'Duración',
      movement: 'Movimiento',
      noRegression: 'Ningún caso pasó antes y falló en la última de estas ejecuciones.',
      noFix: 'Ningún caso falló antes y pasó en la última de estas ejecuciones.',
      noFlaky: 'Ningún caso pasó y falló a la vez en estas ejecuciones.',
      runnersEach: 'Ejecutores en cada ejecución',
      runnersNote: 'Los tiempos son el reloj de este navegador. Cada barra cuenta los casos que ese ejecutor refleja en esa ejecución.',
      runnersMissing: 'esta ejecución no guardó los ejecutores.',
      caseIndex: 'Índice de casos', verdict: 'Veredicto', latestEvidence: 'Última evidencia',
      whereHow: 'Dónde y cómo',
      olderOnly: 'Estas ejecuciones solo tienen totales. Las nuevas guardan cada caso.',
      noStored: 'No hay líneas de casos guardadas.',
      typeNeed: 'Los totales por tipo necesitan líneas de casos. Las ejecuciones antiguas solo guardaron la tasa.',
      noHistory: 'Selecciona al menos una ejecución guardada en el historial.',
      verdicts: { regression: 'regresión', fixed: 'corregido', flaky: 'inestable', 'stable pass': 'aprobado estable', 'stable fail': 'fallo estable', partial: 'parcial', pass: 'aprobado', fail: 'fallo' }
    },
    pt: {
      docTitle: 'Relatório do laboratório QA · Carlos Muñoz', title: 'Laboratório de regressão do CV',
      produced: 'Produzido pelo laboratório QA de Carlos Muñoz', environment: 'Ambiente', runners: 'Executores',
      graphs: 'Gráficos', passRate: 'Taxa de aprovação', passRateCap: 'Aprovados e reprovados nesta sessão',
      byType: 'Casos por tipo', byTypeCap: 'Quantidade de casos da suíte publicada',
      byRunner: 'Casos espelhados em cada executor', byRunnerCap: 'Casos dos executores deixados ativos',
      fwPerf: 'Desempenho dos executores', fwPerfCap: 'A mesma execução no navegador. A média menor é o executor mais rápido.',
      slowest: 'Verificações mais lentas (ms)', slowestCap: 'Tempo real neste navegador',
      historyRate: 'Taxa de aprovação das execuções salvas', historyCap: 'Salvo neste navegador',
      historyEmpty: 'Ainda não há execuções salvas neste navegador.',
      runnerComparison: 'Comparação dos executores',
      tied: 'Cada barra é o processo daquele framework.',
      fastestLead: 'foi o mais rápido nesta sessão, com', msAverage: 'ms de média',
      mirroredOnly: 'ainda não há log nativo',
      passedOf: 'aprovados', colTitle: 'Título', colResult: 'Resultado', colEvidence: 'Evidência',
      colType: 'Tipo', colWhere: 'Onde', colHow: 'Como', pass: 'APROVADO', fail: 'REPROVADO',
      security: 'Marca de segurança: QA Lab · Carlos A. Muñoz',
      footer: 'Produzido pelo laboratório QA de Carlos Muñoz · https://carlosandmunoz.com · não é um certificado de terceiros',
      empty: 'Execute a suíte para gerar as linhas dos casos. Execuções salvas ainda podem entrar pelo histórico.',
      selectedRuns: 'Execuções selecionadas', durationMissing: 'duração não salva',
      pace: 'Ritmo', view: 'Vista', watch: 'Assistir', background: 'Segundo plano', origin: 'Origem',
      noCaseLines: 'Esta execução não salvou as linhas dos casos.',
      analysis: 'Análise das execuções', caseLines: 'linhas de casos', indicators: 'Indicadores',
      runsCompared: 'Execuções comparadas', meanPass: 'Taxa média de aprovação', bestPass: 'Melhor taxa de aprovação',
      weakestPass: 'Pior taxa de aprovação', passChange: 'Variação da taxa', passSpread: 'Amplitude da taxa',
      meanDuration: 'Duração média', fastestRun: 'Execução mais rápida', slowestRun: 'Execução mais lenta',
      regressions: 'Regressões', fixes: 'Correções', flaky: 'Casos instáveis',
      stablePass: 'Aprovações estáveis', stableFail: 'Falhas estáveis',
      runIndex: 'Índice de execuções', run: 'Execução', when: 'Quando', rate: 'Taxa', duration: 'Duração',
      movement: 'Movimento',
      noRegression: 'Nenhum caso passou antes e falhou na última destas execuções.',
      noFix: 'Nenhum caso falhou antes e passou na última destas execuções.',
      noFlaky: 'Nenhum caso passou e falhou ao longo destas execuções.',
      runnersEach: 'Executores em cada execução',
      runnersNote: 'Os tempos são o relógio deste navegador. Cada barra conta os casos que aquele executor espelha na execução.',
      runnersMissing: 'esta execução não salvou os executores.',
      caseIndex: 'Índice de casos', verdict: 'Veredito', latestEvidence: 'Última evidência',
      whereHow: 'Onde e como',
      olderOnly: 'Estas execuções só têm totais. As novas guardam cada caso.',
      noStored: 'Não há linhas de casos guardadas.',
      typeNeed: 'Os totais por tipo precisam das linhas dos casos. Execuções antigas só guardaram a taxa.',
      noHistory: 'Selecione pelo menos uma execução salva no histórico.',
      verdicts: { regression: 'regressão', fixed: 'corrigido', flaky: 'instável', 'stable pass': 'aprovação estável', 'stable fail': 'falha estável', partial: 'parcial', pass: 'aprovado', fail: 'falha' }
    },
    de: {
      docTitle: 'QA-Laborbericht · Carlos Muñoz', title: 'CV-Regressionslabor',
      produced: 'Erstellt vom QA-Labor von Carlos Muñoz', environment: 'Umgebung', runners: 'Runner',
      graphs: 'Diagramme', passRate: 'Bestehensquote', passRateCap: 'Bestanden und fehlgeschlagen in dieser Sitzung',
      byType: 'Fälle nach Typ', byTypeCap: 'Anzahl der Fälle in der veröffentlichten Suite',
      byRunner: 'Fälle je Runner', byRunnerCap: 'Fälle der aktiv gelassenen Runner',
      fwPerf: 'Runner-Leistung', fwPerfCap: 'Derselbe Lauf im Browser. Der niedrigere Mittelwert ist der schnellere Runner.',
      slowest: 'Langsamste Prüfungen (ms)', slowestCap: 'Laufzeit in diesem Browser',
      historyRate: 'Bestehensquote der gespeicherten Läufe', historyCap: 'In diesem Browser gespeichert',
      historyEmpty: 'In diesem Browser sind noch keine Läufe gespeichert.',
      runnerComparison: 'Runner-Vergleich',
      tied: 'Jeder Balken ist der eigene Prozess dieses Frameworks.',
      fastestLead: 'war in dieser Sitzung am schnellsten mit', msAverage: 'ms im Mittel',
      mirroredOnly: 'noch kein natives Log',
      passedOf: 'bestanden', colTitle: 'Titel', colResult: 'Ergebnis', colEvidence: 'Nachweis',
      colType: 'Typ', colWhere: 'Wo', colHow: 'Wie', pass: 'BESTANDEN', fail: 'FEHLGESCHLAGEN',
      security: 'Sicherheitszeichen: QA Lab · Carlos A. Muñoz',
      footer: 'Erstellt vom QA-Labor von Carlos Muñoz · https://carlosandmunoz.com · kein Zertifikat eines Dritten',
      empty: 'Führen Sie die Suite aus, um Fallzeilen zu erzeugen. Gespeicherte Läufe können aus dem Verlauf dazukommen.',
      selectedRuns: 'Ausgewählte Läufe', durationMissing: 'Dauer nicht gespeichert',
      pace: 'Tempo', view: 'Ansicht', watch: 'Zuschauen', background: 'Hintergrund', origin: 'Ursprung',
      noCaseLines: 'Für diesen Lauf wurden keine Fallzeilen gespeichert.',
      analysis: 'Laufanalyse', caseLines: 'Fallzeilen', indicators: 'Kennzahlen',
      runsCompared: 'Verglichene Läufe', meanPass: 'Mittlere Bestehensquote', bestPass: 'Beste Bestehensquote',
      weakestPass: 'Schwächste Bestehensquote', passChange: 'Änderung der Quote', passSpread: 'Spanne der Quote',
      meanDuration: 'Mittlere Dauer', fastestRun: 'Schnellster Lauf', slowestRun: 'Langsamster Lauf',
      regressions: 'Regressionen', fixes: 'Behobene Fälle', flaky: 'Instabile Fälle',
      stablePass: 'Stabil bestanden', stableFail: 'Stabil fehlgeschlagen',
      runIndex: 'Laufindex', run: 'Lauf', when: 'Wann', rate: 'Quote', duration: 'Dauer',
      movement: 'Veränderung',
      noRegression: 'Kein Fall bestand früher und schlug im letzten dieser Läufe fehl.',
      noFix: 'Kein Fall schlug früher fehl und bestand im letzten dieser Läufe.',
      noFlaky: 'Kein Fall bestand und schlug über diese Läufe hinweg fehl.',
      runnersEach: 'Runner je Lauf',
      runnersNote: 'Die Zeiten sind die Uhr dieses Browsers. Ein Balken zählt die Fälle, die der Runner in diesem Lauf spiegelt.',
      runnersMissing: 'für diesen Lauf wurden keine Runner gespeichert.',
      caseIndex: 'Fallindex', verdict: 'Urteil', latestEvidence: 'Letzter Nachweis',
      whereHow: 'Wo und wie',
      olderOnly: 'Diese Läufe haben nur Summen. Neue Läufe speichern jeden Fall.',
      noStored: 'Keine Fallzeilen gespeichert.',
      typeNeed: 'Typ-Summen brauchen Fallzeilen. Ältere Läufe speicherten nur die Quote.',
      noHistory: 'Wählen Sie mindestens einen gespeicherten Lauf im Verlauf.',
      verdicts: { regression: 'Regression', fixed: 'behoben', flaky: 'instabil', 'stable pass': 'stabil bestanden', 'stable fail': 'stabil fehlgeschlagen', partial: 'teilweise', pass: 'bestanden', fail: 'fehlgeschlagen' }
    },
    fr: {
      docTitle: 'Rapport du laboratoire QA · Carlos Muñoz', title: 'Laboratoire de régression du CV',
      produced: 'Produit par le laboratoire QA de Carlos Muñoz', environment: 'Environnement', runners: 'Exécuteurs',
      graphs: 'Graphiques', passRate: 'Taux de réussite', passRateCap: 'Réussis et échoués dans cette session',
      byType: 'Cas par type', byTypeCap: 'Nombre de cas de la suite publiée',
      byRunner: 'Cas reflétés par chaque exécuteur', byRunnerCap: 'Cas des exécuteurs laissés actifs',
      fwPerf: 'Performance des exécuteurs', fwPerfCap: 'La même exécution dans le navigateur. La moyenne la plus basse est l’exécuteur le plus rapide.',
      slowest: 'Contrôles les plus lents (ms)', slowestCap: 'Temps réel dans ce navigateur',
      historyRate: 'Taux de réussite des exécutions enregistrées', historyCap: 'Enregistré dans ce navigateur',
      historyEmpty: 'Aucune exécution enregistrée dans ce navigateur.',
      runnerComparison: 'Comparaison des exécuteurs',
      tied: 'Chaque barre est le processus de ce framework.',
      fastestLead: 'a été le plus rapide cette session, à', msAverage: 'ms en moyenne',
      mirroredOnly: 'pas encore de journal natif',
      passedOf: 'réussis', colTitle: 'Titre', colResult: 'Résultat', colEvidence: 'Preuve',
      colType: 'Type', colWhere: 'Où', colHow: 'Comment', pass: 'RÉUSSI', fail: 'ÉCHOUÉ',
      security: 'Marque de sécurité : QA Lab · Carlos A. Muñoz',
      footer: 'Produit par le laboratoire QA de Carlos Muñoz · https://carlosandmunoz.com · pas un certificat tiers',
      empty: 'Lancez la suite pour produire les lignes de cas. Les exécutions enregistrées peuvent encore être ajoutées depuis l’historique.',
      selectedRuns: 'Exécutions sélectionnées', durationMissing: 'durée non enregistrée',
      pace: 'Rythme', view: 'Vue', watch: 'Regarder', background: 'Arrière-plan', origin: 'Origine',
      noCaseLines: 'Les lignes de cas n’ont pas été enregistrées pour cette exécution.',
      analysis: 'Analyse des exécutions', caseLines: 'lignes de cas', indicators: 'Indicateurs',
      runsCompared: 'Exécutions comparées', meanPass: 'Taux moyen de réussite', bestPass: 'Meilleur taux de réussite',
      weakestPass: 'Taux de réussite le plus faible', passChange: 'Écart du taux', passSpread: 'Amplitude du taux',
      meanDuration: 'Durée moyenne', fastestRun: 'Exécution la plus rapide', slowestRun: 'Exécution la plus lente',
      regressions: 'Régressions', fixes: 'Corrections', flaky: 'Cas instables',
      stablePass: 'Réussites stables', stableFail: 'Échecs stables',
      runIndex: 'Index des exécutions', run: 'Exécution', when: 'Quand', rate: 'Taux', duration: 'Durée',
      movement: 'Mouvement',
      noRegression: 'Aucun cas n’a réussi plus tôt puis échoué dans la dernière de ces exécutions.',
      noFix: 'Aucun cas n’a échoué plus tôt puis réussi dans la dernière de ces exécutions.',
      noFlaky: 'Aucun cas n’a à la fois réussi et échoué sur ces exécutions.',
      runnersEach: 'Exécuteurs de chaque exécution',
      runnersNote: 'Les temps sont l’horloge de ce navigateur. Une barre compte les cas que l’exécuteur reflète dans cette exécution.',
      runnersMissing: 'les exécuteurs n’ont pas été enregistrés pour cette exécution.',
      caseIndex: 'Index des cas', verdict: 'Verdict', latestEvidence: 'Dernière preuve',
      whereHow: 'Où et comment',
      olderOnly: 'Ces exécutions n’ont que des totaux. Les nouvelles enregistrent chaque cas.',
      noStored: 'Aucune ligne de cas enregistrée.',
      typeNeed: 'Les totaux par type exigent les lignes de cas. Les anciennes exécutions n’ont gardé que le taux.',
      noHistory: 'Sélectionnez au moins une exécution enregistrée dans l’historique.',
      verdicts: { regression: 'régression', fixed: 'corrigé', flaky: 'instable', 'stable pass': 'réussite stable', 'stable fail': 'échec stable', partial: 'partiel', pass: 'réussi', fail: 'échec' }
    },
    it: {
      docTitle: 'Report del laboratorio QA · Carlos Muñoz', title: 'Laboratorio di regressione del CV',
      produced: 'Prodotto dal laboratorio QA di Carlos Muñoz', environment: 'Ambiente', runners: 'Esecutori',
      graphs: 'Grafici', passRate: 'Tasso di superamento', passRateCap: 'Superati e falliti in questa sessione',
      byType: 'Casi per tipo', byTypeCap: 'Numero di casi della suite pubblicata',
      byRunner: 'Casi rispecchiati da ogni esecutore', byRunnerCap: 'Casi degli esecutori lasciati attivi',
      fwPerf: 'Prestazioni degli esecutori', fwPerfCap: 'La stessa esecuzione nel browser. La media più bassa è l’esecutore più veloce.',
      slowest: 'Controlli più lenti (ms)', slowestCap: 'Tempo reale in questo browser',
      historyRate: 'Tasso di superamento delle esecuzioni salvate', historyCap: 'Salvato in questo browser',
      historyEmpty: 'Nessuna esecuzione salvata in questo browser.',
      runnerComparison: 'Confronto degli esecutori',
      tied: 'Ogni barra è il processo di quel framework.',
      fastestLead: 'è stato il più veloce in questa sessione, con', msAverage: 'ms di media',
      mirroredOnly: 'nessun log nativo ancora',
      passedOf: 'superati', colTitle: 'Titolo', colResult: 'Risultato', colEvidence: 'Evidenza',
      colType: 'Tipo', colWhere: 'Dove', colHow: 'Come', pass: 'SUPERATO', fail: 'FALLITO',
      security: 'Marchio di sicurezza: QA Lab · Carlos A. Muñoz',
      footer: 'Prodotto dal laboratorio QA di Carlos Muñoz · https://carlosandmunoz.com · non è un certificato di terzi',
      empty: 'Esegui la suite per generare le righe dei casi. Le esecuzioni salvate si possono includere dalla cronologia.',
      selectedRuns: 'Esecuzioni selezionate', durationMissing: 'durata non salvata',
      pace: 'Ritmo', view: 'Vista', watch: 'Guarda', background: 'Sfondo', origin: 'Origine',
      noCaseLines: 'Per questa esecuzione non sono state salvate le righe dei casi.',
      analysis: 'Analisi delle esecuzioni', caseLines: 'righe dei casi', indicators: 'Indicatori',
      runsCompared: 'Esecuzioni confrontate', meanPass: 'Tasso medio di superamento', bestPass: 'Miglior tasso di superamento',
      weakestPass: 'Tasso di superamento più basso', passChange: 'Variazione del tasso', passSpread: 'Ampiezza del tasso',
      meanDuration: 'Durata media', fastestRun: 'Esecuzione più veloce', slowestRun: 'Esecuzione più lenta',
      regressions: 'Regressioni', fixes: 'Correzioni', flaky: 'Casi instabili',
      stablePass: 'Superamenti stabili', stableFail: 'Fallimenti stabili',
      runIndex: 'Indice delle esecuzioni', run: 'Esecuzione', when: 'Quando', rate: 'Tasso', duration: 'Durata',
      movement: 'Movimento',
      noRegression: 'Nessun caso è passato prima e fallito nell’ultima di queste esecuzioni.',
      noFix: 'Nessun caso è fallito prima e passato nell’ultima di queste esecuzioni.',
      noFlaky: 'Nessun caso è sia passato sia fallito in queste esecuzioni.',
      runnersEach: 'Esecutori di ogni esecuzione',
      runnersNote: 'I tempi sono l’orologio di questo browser. Una barra conta i casi che l’esecutore rispecchia in quell’esecuzione.',
      runnersMissing: 'gli esecutori non sono stati salvati per questa esecuzione.',
      caseIndex: 'Indice dei casi', verdict: 'Verdetto', latestEvidence: 'Ultima evidenza',
      whereHow: 'Dove e come',
      olderOnly: 'Queste esecuzioni hanno solo i totali. Quelle nuove salvano ogni caso.',
      noStored: 'Nessuna riga di caso salvata.',
      typeNeed: 'I totali per tipo richiedono le righe dei casi. Le esecuzioni vecchie hanno salvato solo il tasso.',
      noHistory: 'Seleziona almeno un’esecuzione salvata nella cronologia.',
      verdicts: { regression: 'regressione', fixed: 'corretto', flaky: 'instabile', 'stable pass': 'superamento stabile', 'stable fail': 'fallimento stabile', partial: 'parziale', pass: 'superato', fail: 'fallito' }
    }
  };

  function readReportLang() {
    try {
      const saved = localStorage.getItem(REPORT_LANG_KEY);
      if (REPORT_LANGS.includes(saved)) return saved;
    } catch (err) { /* ignore */ }
    return 'en';
  }

  function reportCopy(lang) {
    const code = REPORT_LANGS.includes(lang) ? lang : 'en';
    const extra = REPORT_EXTRA[code] || {};
    return Object.assign({}, REPORT_EN, extra, {
      verdicts: Object.assign({}, REPORT_EN.verdicts, extra.verdicts || {})
    });
  }

  function analysisBody(runs, lang) {
    const c = reportCopy(lang);
    const model = analyzeRuns(runs);
    const kpi = (label, value) => '<article class="card compare-kpi"><b>' + escHtml(value) + '</b><span>' + escHtml(label) + '</span></article>';
    const signed = (n) => (n > 0 ? '+' : '') + n;
    const indexRows = model.ordered.map((run) => '<tr><td>' + escHtml(runKey(run)) + '</td><td>' + escHtml(formatWhen(run.ts)) + '</td><td>' + escHtml((run.runners || []).join(', ') || '—') + '</td><td>' + escHtml(run.pace != null ? run.pace + 's' : '—') + '</td><td>' + escHtml(run.view || '—') + '</td><td>' + (run.passed || 0) + '/' + (run.total || 0) + '</td><td>' + (run.rate || 0) + '%</td><td>' + (run.ms ? (run.ms / 1000).toFixed(1) + 's' : '—') + '</td></tr>').join('');
    const rateBars = model.ordered.map((run) => '<div class="fw-row"><strong>' + escHtml(runKey(run)) + '</strong>' + meter(run.rate || 0, '#0d6e76') + '<span class="fw-meta">' + (run.rate || 0) + '% · ' + (run.passed || 0) + '/' + (run.total || 0) + '</span></div>').join('');
    const maxMs = Math.max(...model.ordered.map((run) => run.ms || 0), 1);
    const timeBars = model.ordered.map((run) => '<div class="fw-row"><strong>' + escHtml(runKey(run)) + '</strong>' + meter(((run.ms || 0) / maxMs) * 100, '#08545b') + '<span class="fw-meta">' + (run.ms ? (run.ms / 1000).toFixed(1) + 's' : '—') + '</span></div>').join('');
    const head = model.ordered.map((run) => '<th>' + escHtml(runKey(run)) + '</th>').join('');
    const matrixRows = model.matrix.map((row) => {
      const cells = row.cells.map((cell) => {
        if (!cell) return '<td class="muted">—</td>';
        return '<td class="' + (cell.ok ? 'pass' : 'fail') + '">' + (cell.ok ? c.pass : c.fail) + ' · ' + (cell.ms || 0) + 'ms</td>';
      }).join('');
      return '<tr><td>' + escHtml(row.id) + '</td><td>' + escHtml(row.title) + '</td><td>' + escHtml(row.layer) + '</td>' + cells + '<td>' + escHtml(c.verdicts[row.verdict] || row.verdict) + '</td><td>' + signed(row.delta) + 'ms</td><td>' + escHtml(row.note) + '</td></tr>';
    }).join('');
    const layerRows = model.layers.map((layer) => {
      const cells = model.ordered.map((run) => {
        const rows = (run.cases || []).filter((item) => (item.layer || caseMeta(item.id).layer) === layer);
        if (!rows.length) return '<td>—</td>';
        const passed = rows.filter((item) => item.ok).length;
        return '<td>' + passed + '/' + rows.length + '</td>';
      }).join('');
      return '<tr><td>' + escHtml(layer) + '</td>' + cells + '</tr>';
    }).join('');
    const runnerBlocks = model.ordered.map((run) => {
      const stats = runnerStats(run);
      if (!stats.length) return '<p><strong>' + escHtml(runKey(run)) + '</strong> · ' + escHtml(c.runnersMissing) + '</p>';
      const lines = stats.map((row) => '<div class="fw-row"><strong>' + escHtml(row.name) + '</strong>' + meter(row.rate, '#0d6e76') + '<span class="fw-meta">' + row.passed + '/' + row.ran + ' ' + escHtml(c.passedOf) + ' · ' + row.rate + '% · avg ' + row.avg + ' ms</span></div>').join('');
      return '<h4>' + escHtml(runKey(run)) + ' · ' + escHtml(formatWhen(run.ts)) + '</h4><div class="fw-compare">' + lines + '</div>';
    }).join('');
    const list = (rows, empty) => (rows.length ? '<ul>' + rows.map((row) => '<li><strong>' + escHtml(row.id) + '</strong> ' + escHtml(row.title) + ' · ' + escHtml(row.note) + '</li>').join('') + '</ul>' : '<p class="muted">' + empty + '</p>');
    const from = formatWhen(model.ordered[0].ts);
    const to = formatWhen(model.ordered[model.ordered.length - 1].ts);
    const payload = {
      producedBy: 'QA lab of Carlos Muñoz',
      site: 'https://carlosandmunoz.com',
      runs: model.ordered.map((run) => ({
        id: runKey(run), ts: run.ts, rate: run.rate || 0, passed: run.passed || 0, failed: run.failed || 0,
        total: run.total || 0, ms: run.ms || 0, pace: run.pace, view: run.view, origin: run.origin || '',
        runners: run.runners || [], cases: run.cases || []
      })),
      indicators: {
        runs: model.ordered.length,
        meanPassRate: model.meanRate,
        passRateSpread: model.spread,
        passRateChange: model.change,
        meanDurationMs: model.meanMs,
        bestRun: model.best ? runKey(model.best) : '',
        weakestRun: model.weakest ? runKey(model.weakest) : '',
        regressions: model.regressions.map((row) => row.id),
        fixes: model.fixes.map((row) => row.id),
        flaky: model.flaky.map((row) => row.id),
        stablePass: model.stablePass.map((row) => row.id),
        stableFail: model.stableFail.map((row) => row.id)
      }
    };
    return `
      <p><strong>${escHtml(c.analysis)}</strong> · ${escHtml(from)} → ${escHtml(to)}<br>
      ${escHtml(c.produced)} · carlosandmunoz.com<br>
      ${model.ordered.length} · ${escHtml(c.caseLines)} ${model.matrix.length}</p>
      <h3>${escHtml(c.indicators)}</h3>
      <div class="compare-kpis">
        ${kpi(c.runsCompared, model.ordered.length)}
        ${kpi(c.meanPass, model.meanRate + '%')}
        ${kpi(c.bestPass, (model.best ? model.best.rate : 0) + '%')}
        ${kpi(c.weakestPass, (model.weakest ? model.weakest.rate : 0) + '%')}
        ${kpi(c.passChange, signed(model.change) + ' ' + c.pt)}
        ${kpi(c.passSpread, model.spread + ' ' + c.pt)}
        ${kpi(c.meanDuration, model.meanMs ? (model.meanMs / 1000).toFixed(1) + 's' : '—')}
        ${kpi(c.fastestRun, model.fastest ? (model.fastest.ms / 1000).toFixed(1) + 's' : '—')}
        ${kpi(c.slowestRun, model.slowest ? (model.slowest.ms / 1000).toFixed(1) + 's' : '—')}
        ${kpi(c.regressions, model.regressions.length)}
        ${kpi(c.fixes, model.fixes.length)}
        ${kpi(c.flaky, model.flaky.length)}
        ${kpi(c.stablePass, model.stablePass.length)}
        ${kpi(c.stableFail, model.stableFail.length)}
      </div>
      <h3>${escHtml(c.runIndex)}</h3>
      <div class="matrix-wrap"><table>
        <thead><tr><th>${escHtml(c.run)}</th><th>${escHtml(c.when)}</th><th>${escHtml(c.runners)}</th><th>${escHtml(c.pace)}</th><th>${escHtml(c.view)}</th><th>${escHtml(c.pass)}</th><th>${escHtml(c.rate)}</th><th>${escHtml(c.duration)}</th></tr></thead>
        <tbody>${indexRows}</tbody>
      </table></div>
      <h3>${escHtml(c.passRate)}</h3>
      <div class="fw-compare">${rateBars}</div>
      <h3>${escHtml(c.duration)}</h3>
      <div class="fw-compare">${timeBars}</div>
      <h3>${escHtml(c.movement)}</h3>
      <h4>${escHtml(c.regressions)}</h4>${list(model.regressions, c.noRegression)}
      <h4>${escHtml(c.fixes)}</h4>${list(model.fixes, c.noFix)}
      <h4>${escHtml(c.flaky)}</h4>${list(model.flaky, c.noFlaky)}
      <h3>${escHtml(c.byType)}</h3>
      <div class="matrix-wrap"><table>
        <thead><tr><th>${escHtml(c.colType)}</th>${head}</tr></thead>
        <tbody>${layerRows || '<tr><td colspan="' + (model.ordered.length + 1) + '">' + escHtml(c.typeNeed) + '</td></tr>'}</tbody>
      </table></div>
      <h3>${escHtml(c.runnersEach)}</h3>
      <p class="muted">${escHtml(c.runnersNote)}</p>
      ${runnerBlocks}
      <h3>${escHtml(c.caseIndex)}</h3>
      <div class="matrix-wrap"><table>
        <thead><tr><th>${escHtml(c.colId)}</th><th>${escHtml(c.colTitle)}</th><th>${escHtml(c.colType)}</th>${head}<th>${escHtml(c.verdict)}</th><th>${escHtml(c.delta)}</th><th>${escHtml(c.latestEvidence)}</th></tr></thead>
        <tbody>${matrixRows || '<tr><td colspan="6">' + escHtml(c.olderOnly) + '</td></tr>'}</tbody>
      </table></div>
      <h3>${escHtml(c.whereHow)}</h3>
      <div class="matrix-wrap"><table>
        <thead><tr><th>${escHtml(c.colId)}</th><th>${escHtml(c.colWhere)}</th><th>${escHtml(c.colHow)}</th></tr></thead>
        <tbody>${model.matrix.map((row) => '<tr><td>' + escHtml(row.id) + '</td><td>' + escHtml(row.where) + '</td><td>' + escHtml(row.how) + '</td></tr>').join('') || '<tr><td colspan="3">' + escHtml(c.noStored) + '</td></tr>'}</tbody>
      </table></div>
      <script type="application/json" id="qa-lab-analysis">${JSON.stringify(payload).replace(/</g, '\\u003c')}</script>`;
  }

  function runsBody(runs, lang) {
    const c = reportCopy(lang);
    const ordered = runs.slice().sort((a, b) => (a.ts || 0) - (b.ts || 0));
    const index = ordered.map((run) => '<li><a href="#run-' + escHtml(runKey(run)) + '">' + escHtml(runKey(run)) + '</a> · ' + escHtml(formatWhen(run.ts)) + ' · ' + (run.passed || 0) + '/' + (run.total || 0) + ' ' + escHtml(c.passedOf) + ' · ' + (run.rate || 0) + '%</li>').join('');
    const sections = ordered.map((run) => {
      const rows = (run.cases || []).map((row) => {
        const meta = caseMeta(row.id);
        return '<tr><td>' + escHtml(row.id) + '</td><td>' + escHtml(meta.title) + '</td><td class="' + (row.ok ? 'pass' : 'fail') + '">' + (row.ok ? c.pass : c.fail) + '</td><td>' + (row.ms || 0) + '</td><td>' + escHtml(row.layer || meta.layer) + '</td><td>' + escHtml(row.note || '') + '</td></tr>';
      }).join('');
      const stats = runnerStats(run).map((row) => '<li>' + escHtml(row.name) + ' · ' + row.passed + '/' + row.ran + ' · avg ' + row.avg + ' ms</li>').join('');
      const view = run.view === 'background' ? c.background : (run.view === 'watch' ? c.watch : (run.view || '—'));
      return `<section id="run-${escHtml(runKey(run))}">
        <h2>${escHtml(runKey(run))} · ${escHtml(formatWhen(run.ts))}</h2>
        <p>${run.passed || 0}/${run.total || 0} ${escHtml(c.passedOf)} · ${run.rate || 0}% · ${run.ms ? (run.ms / 1000).toFixed(1) + 's' : escHtml(c.durationMissing)} · ${escHtml(c.pace)} ${escHtml(run.pace != null ? run.pace + 's' : '—')} · ${escHtml(view)}<br>
        ${escHtml(c.runners)}: ${escHtml((run.runners || []).join(', ') || '—')}<br>
        ${escHtml(c.origin)}: ${escHtml(run.origin || '')}</p>
        ${stats ? '<ul>' + stats + '</ul>' : ''}
        <table><thead><tr><th>${escHtml(c.colId)}</th><th>${escHtml(c.colTitle)}</th><th>${escHtml(c.colResult)}</th><th>${escHtml(c.colMs)}</th><th>${escHtml(c.colType)}</th><th>${escHtml(c.colEvidence)}</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="6">' + escHtml(c.noCaseLines) + '</td></tr>'}</tbody></table>
      </section>`;
    }).join('');
    return `<h2>${escHtml(c.selectedRuns)}</h2><ol>${index}</ol>${sections}`;
  }

  function brandedFile(title, body, lang) {
    const code = REPORT_LANGS.includes(lang) ? lang : 'en';
    return `<!DOCTYPE html><html lang="${code}" translate="no" class="notranslate"><head><meta charset="utf-8"><meta name="google" content="notranslate"><title>${escHtml(title)}</title>
      <style>
        body { font-family: Georgia, serif; color: #12181f; margin: 32px; }
        .mark { position: fixed; inset: 30% 0 auto; text-align: center; font-weight: 800; letter-spacing: .14em;
          font-size: 28px; color: rgba(13,110,118,.28); transform: rotate(-18deg); pointer-events: none; }
        table { border-collapse: collapse; width: 100%; font-family: sans-serif; font-size: 12px; margin: 8px 0 18px; }
        td, th { border-bottom: 1px solid #d5dce3; padding: 6px 8px; text-align: left; vertical-align: top; }
        .pass { color: #0d6e76; font-weight: 700; } .fail { color: #b42318; font-weight: 700; }
        .muted { color: #5c6b76; font-size: 12px; }
        .compare-kpis, .chart-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px; }
        .compare-kpi, .chart-card { border: 1px solid #d5dce3; border-radius: 8px; padding: 8px 10px; break-inside: avoid; }
        .compare-kpi b { display: block; font-size: 1.25rem; }
        .compare-kpi span, .chart-cap { color: #5c6b76; font-size: 11px; }
        .chart-card h3 { margin: 0 0 8px; font-size: 14px; }
        .chart-svg { width: 100%; max-width: 420px; height: auto; display: block; }
        .h-meter, .fw-track { height: 10px; border-radius: 999px; background: #e6ebf0; overflow: hidden; }
        .h-meter span, .fw-track span { display: block; height: 100%; border-radius: 999px; }
        .fw-row { display: grid; grid-template-columns: 110px 1fr; gap: 4px 8px; align-items: center; font-size: 12px; margin: 6px 0; font-family: sans-serif; }
        .fw-meta { grid-column: 2; color: #5c6b76; }
        footer { margin-top: 28px; font-size: 12px; }
        h2, h3 { break-after: avoid; }
        @media print { a { color: inherit; text-decoration: none; } .chart-card, .fw-row, .h-meter { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
      </style></head><body>
      <div class="mark">QA LAB · CARLOS MUÑOZ</div>
      <h1>${escHtml(title)}</h1>
      ${body}
      <footer>${escHtml(reportCopy(code).footer)}</footer>
      </body></html>`;
  }

  function svgEl(name, attrs, text) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', name);
    Object.entries(attrs || {}).forEach(([k, v]) => el.setAttribute(k, v));
    if (text != null) el.textContent = text;
    return el;
  }

  function donut(passed, failed, skipped) {
    const total = Math.max(passed + failed + skipped, 1);
    const r = 42;
    const c = 2 * Math.PI * r;
    const segs = [
      { n: passed, color: '#0f766e' },
      { n: failed, color: '#b42318' },
      { n: skipped, color: '#4a5560' }
    ];
    let offset = 0;
    const svg = svgEl('svg', { viewBox: '0 0 120 120', class: 'chart-svg', role: 'img', 'aria-label': 'Pass fail skip distribution' });
    svg.appendChild(svgEl('circle', { cx: 60, cy: 60, r, fill: 'none', stroke: 'var(--line)', 'stroke-width': 12 }));
    segs.forEach((seg) => {
      const len = (seg.n / total) * c;
      const circle = svgEl('circle', {
        cx: 60, cy: 60, r, fill: 'none', stroke: seg.color, 'stroke-width': 12,
        'stroke-dasharray': len + ' ' + (c - len),
        'stroke-dashoffset': -offset,
        transform: 'rotate(-90 60 60)'
      });
      svg.appendChild(circle);
      offset += len;
    });
    const label = svgEl('text', { x: 60, y: 64, 'text-anchor': 'middle', fill: 'var(--text)', 'font-size': '16', 'font-weight': '700' }, Math.round((passed / total) * 100) + '%');
    svg.appendChild(label);
    return svg;
  }

  function frameworkCompare(results, copy) {
    const tones = [
      { name: 'Playwright', color: '#2f9e8f' },
      { name: 'Cypress', color: '#3d9a6a' },
      { name: 'Robot', color: '#c4a574' },
      { name: 'Selenium', color: '#43b02a' },
      { name: 'WebDriverIO', color: '#ea5907' },
      { name: 'Appium', color: '#662d91' }
    ];
    const chosen = readFrameworks();
    const summaries = (typeof Lab !== 'undefined' && Lab.nativeSummaries) || {};
    const rows = tones.filter((tone) => chosen.includes(tone.name)).map((tone) => {
      const native = summaries[tone.name];
      const ranCases = native && Array.isArray(native.cases) ? native.cases : [];
      const passed = ranCases.filter((item) => item.ok).length;
      const ran = ranCases.length;
      const avg = ran ? Math.round(ranCases.reduce((sum, item) => sum + (item.ms || 0), 0) / ran) : 0;
      const rate = ran ? Math.round((passed / ran) * 100) : 0;
      return { ...tone, ran, passed, avg, rate };
    });
    const ranked = rows.filter((row) => row.ran).slice().sort((a, b) => a.avg - b.avg);
    const fastest = ranked[0];
    const tied = ranked.length > 1 && ranked.every((row) => row.avg === ranked[0].avg);
    const maxAvg = Math.max(...rows.map((row) => row.avg), 1);
    const wrap = document.createElement('div');
    wrap.className = 'fw-compare';
    rows.forEach((row) => {
      const line = document.createElement('div');
      line.className = 'fw-row';
      const width = row.ran ? Math.max(8, Math.round((row.avg / maxAvg) * 100)) : 0;
      const detail = row.ran
        ? row.passed + '/' + row.ran + ' ' + (copy ? copy.passedOf : 'passed') + ' · ' + row.rate + '% · avg ' + row.avg + ' ms'
        : (copy ? copy.mirroredOnly : 'no native log yet');
      line.innerHTML = '<strong>' + row.name + '</strong><div class="fw-track"><span style="width:' + width + '%;background:' + row.color + '"></span></div><span class="fw-meta">' + detail + '</span>';
      wrap.appendChild(line);
    });
    if (fastest) {
      const note = document.createElement('p');
      note.className = 'chart-cap';
      note.textContent = tied
        ? (copy ? copy.tied : 'Each bar is that framework’s own process.')
        : (copy ? fastest.name + ' ' + copy.fastestLead + ' ' + fastest.avg + ' ' + copy.msAverage + '.' : fastest.name + ' was fastest this session at ' + fastest.avg + ' ms average.');
      wrap.appendChild(note);
    }
    return wrap;
  }

  function bars(rows, title) {
    const max = Math.max(...rows.map((r) => r.value), 1);
    const h = 22;
    const svg = svgEl('svg', {
      viewBox: `0 0 320 ${rows.length * (h + 10) + 8}`,
      class: 'chart-svg',
      role: 'img',
      'aria-label': title
    });
    rows.forEach((row, i) => {
      const y = i * (h + 10);
      svg.appendChild(svgEl('text', { x: 0, y: y + 15, fill: 'var(--muted)', 'font-size': '11' }, row.label));
      svg.appendChild(svgEl('rect', { x: 108, y: y + 4, width: Math.max(4, (row.value / max) * 180), height: 14, rx: 3, fill: row.color || '#0d6e76' }));
      svg.appendChild(svgEl('text', { x: 294, y: y + 15, fill: 'var(--text)', 'font-size': '11', 'text-anchor': 'end' }, String(row.value)));
    });
    return svg;
  }

  function sparkline(values) {
    const w = 320;
    const h = 72;
    const svg = svgEl('svg', { viewBox: `0 0 ${w} ${h}`, class: 'chart-svg', role: 'img', 'aria-label': 'Pass rate across recent lab runs' });
    if (!values.length) {
      svg.appendChild(svgEl('text', { x: 8, y: 40, fill: 'var(--muted)', 'font-size': '12' }, 'No previous lab runs on this browser yet.'));
      return svg;
    }
    const max = 100;
    const step = values.length === 1 ? w : (w - 16) / (values.length - 1);
    const pts = values.map((v, i) => {
      const x = 8 + i * step;
      const y = h - 10 - (v / max) * (h - 20);
      return x + ',' + y;
    }).join(' ');
    svg.appendChild(svgEl('polyline', { fill: 'none', stroke: '#0d6e76', 'stroke-width': 2, points: pts }));
    values.forEach((v, i) => {
      const x = 8 + i * step;
      const y = h - 10 - (v / max) * (h - 20);
      svg.appendChild(svgEl('circle', { cx: x, cy: y, r: 3, fill: '#0d6e76' }));
    });
    return svg;
  }

  function freezeSvg(node) {
    const clone = node.cloneNode(true);
    const map = { 'var(--text)': '#12181f', 'var(--muted)': '#5c6b76', 'var(--line)': '#d5dce3' };
    clone.querySelectorAll('*').forEach((el) => {
      ['fill', 'stroke'].forEach((attr) => {
        const value = el.getAttribute(attr);
        if (map[value]) el.setAttribute(attr, map[value]);
      });
    });
    return clone.outerHTML;
  }

  function chartCard(title, inner, caption) {
    return '<article class="chart-card"><h3>' + escHtml(title) + '</h3>' + inner + (caption ? '<p class="chart-cap">' + escHtml(caption) + '</p>' : '') + '</article>';
  }

  function sessionChartsHtml(results, copy) {
    const passed = results.filter((row) => row.ok).length;
    const failed = results.filter((row) => !row.ok).length;
    const byLayer = {};
    CASES.forEach((item) => { byLayer[item.layer] = (byLayer[item.layer] || 0) + 1; });
    const chosen = readFrameworks();
    const byFw = {};
    chosen.forEach((name) => { byFw[name] = 0; });
    CASES.forEach((item) => runnersFor(item).forEach((name) => { if (byFw[name] != null) byFw[name] += 1; }));
    const durations = results.slice().sort((a, b) => (b.ms || 0) - (a.ms || 0)).slice(0, 8).map((row) => ({
      label: row.id, value: row.ms || 0, color: row.ok ? '#0d6e76' : '#b42318'
    }));
    const history = readHistory().map((run) => Number(run.rate) || 0);
    const cards = [
      chartCard(copy.passRate, freezeSvg(donut(passed, failed, 0)), copy.passRateCap),
      chartCard(copy.byType, freezeSvg(bars(Object.entries(byLayer).map(([label, value]) => ({ label: label, value: value, color: layerColor(label) })), copy.byType)), copy.byTypeCap),
      chartCard(copy.byRunner, freezeSvg(bars(Object.entries(byFw).map(([label, value]) => ({ label: label, value: value, color: '#0d6e76' })), copy.byRunner)), copy.byRunnerCap),
      chartCard(copy.fwPerf, frameworkCompare(results, copy).outerHTML, copy.fwPerfCap),
      chartCard(copy.historyRate, freezeSvg(sparkline(history)), history.length ? copy.historyCap : copy.historyEmpty)
    ];
    if (durations.length) cards.splice(4, 0, chartCard(copy.slowest, freezeSvg(bars(durations, copy.slowest)), copy.slowestCap));
    return '<div class="chart-grid">' + cards.join('') + '</div>';
  }

  function buildReport(results, opts, picked) {
    const copy = reportCopy(opts && opts.lang);
    const stamp = new Date().toISOString();
    const passed = results.filter((row) => row.ok).length;
    let body = '<p><strong>' + escHtml(copy.title) + '</strong> · ' + escHtml(stamp) + '<br>'
      + escHtml(copy.produced) + ' · carlosandmunoz.com<br>'
      + escHtml(copy.environment) + ': ' + escHtml(location.origin) + ' · ' + passed + '/' + results.length + ' ' + escHtml(copy.passedOf) + '</p>';
    if (!opts || opts.graphs !== false) body += '<h2>' + escHtml(copy.graphs) + '</h2>' + sessionChartsHtml(results, copy);
    if (!opts || opts.runners !== false) body += '<h2>' + escHtml(copy.runnerComparison) + '</h2>' + frameworkCompare(results, copy).outerHTML;
    if (!opts || opts.cases !== false) {
      const rows = results.map((row) => '<tr><td>' + escHtml(row.id) + '</td><td class="' + (row.ok ? 'pass' : 'fail') + '">' + (row.ok ? copy.pass : copy.fail) + '</td><td>' + (row.ms || 0) + '</td><td>' + escHtml(row.detail || row.error || '') + '</td></tr>').join('');
      body += '<h2>' + escHtml(copy.colResult) + '</h2><table><thead><tr><th>' + escHtml(copy.colId) + '</th><th>' + escHtml(copy.colResult) + '</th><th>' + escHtml(copy.colMs) + '</th><th>' + escHtml(copy.colEvidence) + '</th></tr></thead><tbody>'
        + (rows || '<tr><td colspan="4">' + escHtml(copy.empty) + '</td></tr>') + '</tbody></table><p class="muted">' + escHtml(copy.security) + ' · ' + escHtml(stamp) + '</p>';
    }
    if (opts && opts.history) body += (picked && picked.length) ? runsBody(picked, opts.lang) : '<p>' + escHtml(copy.noHistory) + '</p>';
    if (opts && opts.analysis) body += (picked && picked.length) ? analysisBody(picked, opts.lang) : '<p>' + escHtml(copy.noHistory) + '</p>';
    return brandedFile(copy.docTitle, body, opts && opts.lang);
  }

  const GUIDE_KEY = 'lab-guide-seen';

  function guideSeen() {
    try { return new Set(JSON.parse(localStorage.getItem(GUIDE_KEY) || '[]')); }
    catch (err) { return new Set(); }
  }

  function dismissGuide(id) {
    const seen = guideSeen();
    const key = String(id);
    if (seen.has(key)) return;
    seen.add(key);
    localStorage.setItem(GUIDE_KEY, JSON.stringify([...seen]));
    const el = document.querySelector('[data-guide="' + key + '"]');
    if (el) el.classList.remove('lab-guide');
  }

  function mountLabGuide() {
    const seen = guideSeen();
    document.querySelectorAll('[data-guide]').forEach((el) => {
      const id = el.getAttribute('data-guide');
      if (seen.has(id)) return;
      el.classList.add('lab-guide');
      el.addEventListener('click', () => dismissGuide(id));
    });
    const runFiltered = document.getElementById('run-visible');
    if (runFiltered && !seen.has('5')) runFiltered.addEventListener('click', () => dismissGuide('5'));
  }

  const Lab = {
    cases: CASES,
    results: [],
    running: false,
    filter: 'All',
    selectedId: CASES[0].id,
    logLines: [],
    pace: readPace(),
    view: readView(),
    historyPick: new Set(),
    nativeLogs: {},
    nativeSummaries: {},
    activeRunner: null,
    runnerPinned: false,

    filtered() {
      if (this.filter === 'All') return CASES;
      return CASES.filter((c) => c.layer === this.filter);
    },

    log(html) {
      this.logLines.push(html);
      const el = document.getElementById('run-log');
      if (!el) return;
      const row = document.createElement('div');
      row.innerHTML = html;
      el.appendChild(row);
      el.scrollTop = el.scrollHeight;
      if (global.LabObserver) global.LabObserver.pulse();
    },

    renderCatalog() {
      const list = document.getElementById('case-list');
      if (!list) return;
      list.innerHTML = this.filtered().map((c) => `
        <article class="case-item">
          <button type="button" class="case-row${c.id === this.selectedId ? ' on' : ''}" data-id="${c.id}">
            <span class="case-id">${c.id}</span>
            <span class="case-title">${String(c.title).replace(/&/g, '&amp;').replace(/</g, '&lt;')}</span>
            <span class="pill" style="border-color:${layerColor(c.layer)};color:${layerColor(c.layer)}">${c.layer}</span>
          </button>
          ${sourceHtml(c, 'src-links-row')}
        </article>`).join('');
      list.querySelectorAll('.case-row').forEach((btn) => {
        btn.onclick = () => {
          this.selectedId = btn.dataset.id;
          this.renderCatalog();
          this.renderDetail();
          this.focusCase(this.selectedId);
        };
      });
      document.getElementById('case-count').textContent = this.filtered().length + ' / ' + CASES.length + ' cases';
    },

    renderDetail() {
      const c = CASES.find((x) => x.id === this.selectedId);
      const el = document.getElementById('case-detail');
      if (!c || !el) return;
      const result = this.results.find((r) => r.id === c.id);
      el.innerHTML = `
        <h3>${c.id} · ${c.title}</h3>
        <p class="muted">${runnersFor(c).join(' · ')}</p>
        ${sourceHtml(c, 'src-links-detail')}
        <dl class="spec">
          <dt>Where</dt><dd>${c.where}</dd>
          <dt>When</dt><dd>${c.when}</dd>
          <dt>How</dt><dd>${c.how}</dd>
        </dl>
        ${result ? `<p class="${result.ok ? 'pass' : 'fail'}">${result.ok ? 'PASSED' : 'FAILED'} · ${result.ms} ms${result.detail ? ' · ' + result.detail : ''}</p>` : '<p class="muted">Not executed in this session yet.</p>'}
        <button type="button" class="btn btn-ghost" id="run-one">Run this case</button>`;
      document.getElementById('run-one').onclick = () => {
        dismissGuide('5');
        this.runIds([c.id]);
      };
    },

    renderDashboard() {
      const wrap = document.getElementById('dash-charts');
      if (!wrap) return;
      const passed = this.results.filter((r) => r.ok).length;
      const failed = this.results.filter((r) => !r.ok && r.status !== 'skip').length;
      const skipped = this.results.filter((r) => r.status === 'skip').length;
      const byLayer = {};
      CASES.forEach((c) => { byLayer[c.layer] = (byLayer[c.layer] || 0) + 1; });
      const byFw = {};
      readFrameworks().forEach((name) => { byFw[name] = 0; });
      Object.keys(byFw).forEach((name) => {
        const native = this.nativeSummaries[name];
        byFw[name] = native && native.cases ? native.cases.filter((item) => item.ok).length : 0;
      });
      const durations = this.results.slice().sort((a, b) => b.ms - a.ms).slice(0, 8).map((r) => ({
        label: r.id, value: r.ms, color: r.ok ? '#0d6e76' : '#b42318'
      }));
      const history = readHistory();
      wrap.innerHTML = '';
      const cards = [
        { title: 'This run — pass rate', caption: 'Source: in-browser lab vs live pages · current session', node: donut(passed, failed, skipped) },
        { title: 'Catalog by test type', caption: 'Count of cases in the published suite map', node: bars(Object.entries(byLayer).map(([label, value]) => ({ label, value, color: layerColor(label) })), 'Cases by type') },
        { title: 'Native framework results', caption: 'Pass counts from each framework’s own process. Empty until that process reports.', node: bars(Object.entries(byFw).map(([label, value]) => ({ label, value })), 'Native results') },
        { title: 'Automation frameworks — performance', caption: 'Each bar is that framework’s own log. The lab catalog does not fill these bars.', node: frameworkCompare(this.results) }
      ];
      if (durations.length) {
        cards.push({ title: 'Slowest checks this run (ms)', caption: 'Wall time inside this browser, not CI agents', node: bars(durations, 'Duration ms') });
      }
      cards.push({
        title: 'Pass rate — last lab runs here',
        caption: 'Saved in this browser. Select runs above to download, print, or compare.',
        node: sparkline(history.map((h) => h.rate))
      });
      this.renderHistory();
      cards.forEach((card) => {
        const div = document.createElement('article');
        div.className = 'card chart-card';
        div.innerHTML = `<h3>${card.title}</h3>`;
        div.appendChild(card.node);
        const cap = document.createElement('p');
        cap.className = 'chart-cap';
        cap.textContent = card.caption;
        div.appendChild(cap);
        wrap.appendChild(div);
      });
      document.getElementById('kpi-pass').textContent = String(passed);
      document.getElementById('kpi-fail').textContent = String(failed);
      document.getElementById('kpi-skip').textContent = String(skipped);
      const ms = this.results.reduce((s, r) => s + (r.ms || 0), 0);
      document.getElementById('kpi-ms').textContent = ms ? (ms / 1000).toFixed(1) + 's' : '—';
    },

    reportMarkup() {
      const passed = this.results.filter((r) => r.ok).length;
      const stamp = new Date().toISOString();
      const runners = this.selectedFrameworks().join(', ') || 'none selected';
      const compare = frameworkCompare(this.results);
      return {
        stamp,
        passed,
        runners,
        compare,
        html: `
        <p><strong>CV regression lab</strong> · ${stamp}<br>
        Produced by the QA lab of Carlos Muñoz · carlosandmunoz.com<br>
        Environment: ${location.origin} · ${passed}/${this.results.length} passed · runners: ${runners}</p>
        <h3>Runner comparison</h3>
        <div class="report-compare"></div>
        <table>
          <thead><tr><th>ID</th><th>Result</th><th>ms</th><th>Where / evidence</th></tr></thead>
          <tbody>${this.results.map((r) => `<tr>
            <td>${r.id}</td>
            <td class="${r.ok ? 'pass' : 'fail'}">${r.ok ? 'PASSED' : 'FAILED'}</td>
            <td>${r.ms}</td>
            <td>${(r.detail || r.error || '').replace(/</g, '&lt;')}${r.explain ? ' · ' + String(r.explain).replace(/</g, '&lt;') : ''}</td>
          </tr>`).join('')}</tbody>
        </table>
        <p class="muted">Security mark: QA Lab · Carlos A. Muñoz · ${stamp}</p>`
      };
    },

    renderReport() {
      const el = document.getElementById('report-body');
      if (!el) return;
      el.classList.add('qa-mark');
      if (!this.results.length) {
        el.innerHTML = '<p class="muted">The donut is this browser catalog. Each framework bar fills only after that framework’s own process reports.</p>';
        return;
      }
      const doc = this.reportMarkup();
      el.innerHTML = doc.html;
      const slot = el.querySelector('.report-compare');
      if (slot) slot.appendChild(doc.compare);
    },

    reportChoices() {
      const langEl = document.getElementById('report-lang');
      const on = (id, fallback) => {
        const el = document.getElementById(id);
        return el ? el.checked : fallback;
      };
      return {
        lang: langEl && REPORT_LANGS.includes(langEl.value) ? langEl.value : readReportLang(),
        graphs: on('opt-graphs', true),
        cases: on('opt-cases', true),
        runners: on('opt-runners', true),
        history: on('opt-history', false),
        analysis: on('opt-analysis', false)
      };
    },

    reportDocument(opts) {
      return buildReport(this.results, opts || this.reportChoices(), this.pickedRuns());
    },

    refreshReportPreview() {
      const frame = document.getElementById('report-preview');
      if (!frame) return;
      frame.srcdoc = this.reportDocument(this.reportChoices());
    },

    openReportOptions(preset) {
      const box = document.getElementById('report-options');
      const langEl = document.getElementById('report-lang');
      if (!box) return;
      if (langEl) langEl.value = readReportLang();
      const set = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.checked = value;
      };
      set('opt-graphs', !(preset && preset.graphs === false));
      set('opt-cases', !(preset && preset.cases === false));
      set('opt-runners', !(preset && preset.runners === false));
      set('opt-history', !!(preset && preset.history));
      set('opt-analysis', !!(preset && preset.analysis));
      box.hidden = false;
      this.refreshReportPreview();
    },

    closeReportOptions() {
      const box = document.getElementById('report-options');
      const frame = document.getElementById('report-preview');
      if (box) box.hidden = true;
      if (frame) frame.srcdoc = '';
    },

    reportFile() {
      return this.reportDocument(this.reportChoices());
    },

    async withTargets(fn) {
      const iframe = document.getElementById('sut');
      const frameStyle = {
        width: iframe.style.width,
        height: iframe.style.height,
        maxWidth: iframe.style.maxWidth
      };
      const setPhoneFrame = () => {
        const picked = this.deviceFrame && this.deviceFrame.width && this.deviceFrame.width <= 500 ? this.deviceFrame : null;
        iframe.style.width = (picked ? picked.width : 390) + 'px';
        iframe.style.height = (picked ? picked.height : 844) + 'px';
        iframe.style.maxWidth = '100%';
      };
      const clearPhoneFrame = () => {
        iframe.style.width = frameStyle.width;
        iframe.style.height = frameStyle.height;
        iframe.style.maxWidth = frameStyle.maxWidth;
      };
      const snapshot = {
        theme: localStorage.getItem('theme'),
        lang: localStorage.getItem('cv-preferred-lang'),
        tour: sessionStorage.getItem('hasSeenTour'),
        labTour: sessionStorage.getItem('hasSeenLabTour'),
        studioTour: sessionStorage.getItem('hasSeenStudioTour')
      };
      const loadCv = (path, before) => new Promise((resolve, reject) => {
        sessionStorage.setItem('hasSeenTour', 'true');
        sessionStorage.setItem('hasSeenLabTour', 'true');
        sessionStorage.setItem('hasSeenStudioTour', 'true');
        if (!/lang=/.test(path)) localStorage.setItem('cv-preferred-lang', 'en');
        iframe.onload = () => {
          const win = iframe.contentWindow;
          const doc = iframe.contentDocument;
          if (before) before(win);
          const start = Date.now();
          const isCv = /index\.html/i.test(path) || path === '' || path === '/';
          const tick = () => {
            const chrome = doc.getElementById('login-overlay') || doc.getElementById('runBtn') || doc.getElementById('run-all');
            const cvReady = doc.querySelector('.main-container') && (!isCv || (win.CarlosMunozCV && win.CarlosMunozCV.tourSteps));
            if (chrome || cvReady || Date.now() - start > 12000) {
              resolve({ window: win, document: doc });
              return;
            }
            setTimeout(tick, 80);
          };
          tick();
        };
        iframe.onerror = () => reject(new Error('iframe failed ' + path));
        iframe.src = path;
      });
      const loadAdmin = () => new Promise((resolve, reject) => {
        iframe.onload = () => resolve({ window: iframe.contentWindow, document: iframe.contentDocument });
        iframe.onerror = () => reject(new Error('admin iframe failed'));
        iframe.src = 'admin.html';
      });
      try {
        let cv = await loadCv('index.html');
        await fn({
          cv,
          loadCv: async (path, before) => {
            cv = await loadCv(path, before);
            return cv;
          },
          reloadCv: async () => {
            cv = await loadCv(iframe.src.replace(location.origin + '/', '') || 'index.html');
            return cv;
          },
          loadAdmin,
          setPhoneFrame,
          clearPhoneFrame
        });
      } finally {
        iframe.style.width = frameStyle.width;
        iframe.style.height = frameStyle.height;
        iframe.style.maxWidth = frameStyle.maxWidth;
        if (snapshot.theme != null) localStorage.setItem('theme', snapshot.theme);
        else localStorage.removeItem('theme');
        if (snapshot.lang != null) localStorage.setItem('cv-preferred-lang', snapshot.lang);
        else localStorage.removeItem('cv-preferred-lang');
        if (snapshot.tour != null) sessionStorage.setItem('hasSeenTour', snapshot.tour);
        if (snapshot.labTour != null) sessionStorage.setItem('hasSeenLabTour', snapshot.labTour);
        else sessionStorage.removeItem('hasSeenLabTour');
        if (snapshot.studioTour != null) sessionStorage.setItem('hasSeenStudioTour', snapshot.studioTour);
        else sessionStorage.removeItem('hasSeenStudioTour');
        if (global.SiteTheme) global.SiteTheme.apply(snapshot.theme === 'dark', false);
      }
    },

    selectedBrowsers() {
      try {
        const saved = JSON.parse(localStorage.getItem('qa-lab-browsers') || '[]');
        if (Array.isArray(saved) && saved.length) return saved;
      } catch (err) { /* ignore */ }
      return ['chrome'];
    },

    selectedDevices() {
      try {
        const saved = JSON.parse(localStorage.getItem('qa-lab-devices') || '[]');
        if (Array.isArray(saved)) return saved;
      } catch (err) { /* ignore */ }
      return [];
    },

    runFrames() {
      const picked = this.selectedDevices().filter((item) => item.platform === 'here' || item.platform === 'profile');
      if (!picked.length) return [null];
      return picked.map((item) => {
        if (item.platform === 'here') {
          if (window.innerWidth <= 820) {
            return { label: 'This device', width: Math.max(320, Math.min(window.innerWidth, 430)), height: Math.max(700, window.innerHeight) };
          }
          return { label: 'This device', width: 0, height: 0 };
        }
        return { label: item.label, width: Number(item.width) || 390, height: Number(item.height) || 844 };
      });
    },

    async openAsk(ids) {
      this.pendingIds = ids;
      const list = document.getElementById('fw-ask-list');
      const browsers = document.getElementById('browser-ask-list');
      const devices = document.getElementById('device-ask-list');
      const note = document.getElementById('device-ask-note');
      const ask = document.getElementById('fw-ask');
      if (!list || !ask || !browsers || !devices) return;
      const chosen = new Set(this.selectedFrameworks());
      list.innerHTML = ALL_FW.map((name) => {
        const label = name === 'WebDriverIO' ? 'WebdriverIO' : name;
        return '<label class="' + (chosen.has(name) ? 'on' : '') + '"><input type="checkbox" value="' + name + '"' + (chosen.has(name) ? ' checked' : '') + '> ' + label + '</label>';
      }).join('');
      let targets = {
        browsers: BASE_BROWSERS.slice(),
        devices: BASE_DEVICES.slice(),
        androidNote: 'Android 15 (API 35) and Android 16 (API 36). This computer’s SDK platform is API 37. The phones run at their screen size in this browser.'
      };
      try {
        const file = await fetch('js/lab-devices.json', { cache: 'no-store' });
        if (file.ok) targets.devices = await file.json();
      } catch (err) { /* the short list above still works */ }
      try {
        const res = await fetch('http://127.0.0.1:8770/targets');
        if (res.ok) {
          const remote = await res.json();
          const browserIds = new Set(targets.browsers.map((item) => item.id));
          (remote.browsers || []).forEach((item) => {
            if (!browserIds.has(item.id)) targets.browsers.push(item);
          });
          const deviceIds = new Set(targets.devices.map((item) => item.id));
          (remote.devices || []).forEach((item) => {
            if (!deviceIds.has(item.id)) targets.devices.push(item);
          });
          if (remote.androidNote) targets.androidNote = remote.androidNote;
        }
      } catch (err) { /* the built-in list still runs in this browser */ }
      const savedBrowsers = new Set(this.selectedBrowsers());
      browsers.innerHTML = (targets.browsers || []).map((item) => {
        const on = savedBrowsers.has(item.id);
        return '<label class="' + (on ? 'on' : '') + '"><input type="checkbox" value="' + item.id + '"' + (on ? ' checked' : '') + '> ' + item.label + '</label>';
      }).join('') || '<span class="muted">Chrome</span>';
      this.askDevices = targets.devices || [];
      const savedDevices = new Set(this.selectedDevices().map((item) => item.id));
      const bucket = (item) => {
        if (item.group === 'here' || item.platform === 'here') return 'here';
        if (item.group === 'tablet') return 'tablet';
        if (item.group === 'phone' || item.platform === 'profile') return 'phone';
        if (item.platform === 'ios') return 'ios';
        if (item.platform === 'android') return 'android';
        if (String(item.id).indexOf('skin:') === 0) return 'skin';
        return 'phone';
      };
      const titles = { here: 'This screen', phone: 'Current phones', tablet: 'Tablets', ios: 'iOS simulators', android: 'Android emulators', skin: 'Device Manager skins' };
      const grouped = {};
      this.askDevices.forEach((item, index) => {
        const key = bucket(item);
        grouped[key] = grouped[key] || [];
        const on = savedDevices.has(item.id);
        grouped[key].push('<label class="' + (on ? 'on' : '') + '"><input type="checkbox" value="' + index + '"' + (on ? ' checked' : '') + '> ' + item.label + '</label>');
      });
      const order = ['here', 'phone', 'tablet', 'ios', 'android'];
      devices.innerHTML = order.filter((key) => grouped[key]).map((key) =>
        '<section class="fw-ask-group"><b>' + titles[key] + '</b><div class="fw-ask-list">' + grouped[key].join('') + '</div></section>'
      ).join('') + (grouped.skin
        ? '<details class="fw-ask-more"><summary>Device Manager skins</summary><div class="fw-ask-list">' + grouped.skin.join('') + '</div></details>'
        : '');
      if (note) note.textContent = targets.androidNote || 'Pick a browser and, if you want, a phone. The catalog runs in the browser you have open.';
      ask.querySelectorAll('.fw-ask-list label input').forEach((box) => {
        box.addEventListener('change', () => box.parentElement.classList.toggle('on', box.checked));
      });
      ask.hidden = false;
    },

    closeAsk() {
      const ask = document.getElementById('fw-ask');
      if (ask) ask.hidden = true;
    },

    confirmAsk() {
      const picked = [...document.querySelectorAll('#fw-ask-list input:checked')].map((box) => box.value);
      if (!picked.length) return;
      const browsers = [...document.querySelectorAll('#browser-ask-list input:checked')].map((box) => box.value);
      const deviceIdx = [...document.querySelectorAll('#device-ask-list input:checked')].map((box) => Number(box.value));
      const devices = deviceIdx.map((index) => (this.askDevices || [])[index]).filter(Boolean);
      try {
        localStorage.setItem('qa-lab-browsers', JSON.stringify(browsers.length ? browsers : ['chrome']));
        localStorage.setItem('qa-lab-devices', JSON.stringify(devices));
      } catch (err) { /* ignore */ }
      document.querySelectorAll('#fw-picker input').forEach((box) => {
        box.checked = picked.includes(box.value);
      });
      this.saveFrameworks();
      this.closeAsk();
      try { sessionStorage.setItem('qa-lab-fw-asked', '1'); } catch (err) { /* ignore */ }
      const ids = this.pendingIds || [];
      this.pendingIds = null;
      if (ids.length) this.runIds(ids);
    },

    openRunners() {
      const drawer = document.getElementById('runner-drawer');
      if (drawer) drawer.classList.add('open');
      this.renderRunners(this.runnerTab);
    },

    closeRunners() {
      const drawer = document.getElementById('runner-drawer');
      if (drawer) drawer.classList.remove('open');
    },

    async runIds(ids) {
      if (this.running) return;
      if (!sessionStorage.getItem('qa-lab-fw-asked')) {
        this.openAsk(ids);
        return;
      }
      const chosen = this.selectedFrameworks();
      if (!chosen.length) {
        this.openAsk(ids);
        return;
      }
      this.running = true;
      this.holdLabLanguage();
      document.documentElement.classList.add('lab-running');
      this.openRunners();
      this.launchNative(chosen, ids);
      if (global.LabObserver) global.LabObserver.watch(this);
      const frames = this.runFrames();
      this.pace = readPace();
      this.view = readView();
      this.syncViewUi();
      document.getElementById('run-all').disabled = true;
      document.getElementById('run-visible').disabled = true;
      document.querySelectorAll('[data-pace]').forEach((b) => { b.disabled = true; });
      const pack = CASES.filter((c) => ids.includes(c.id));
      const holdMs = Math.round(this.pace * 1000);
      const frameNames = frames.filter(Boolean).map((frame) => frame.label).join(', ');
      this.log(`<b>LAB</b> Starting ${pack.length} case${pack.length === 1 ? '' : 's'} against ${location.origin}` + (frameNames ? ' · ' + frameNames : '') + ` · pace ${formatPace(this.pace)} s · ${this.view === 'watch' ? 'Watch' : 'Background'}`);
      const unlock = () => {
        this.running = false;
        document.documentElement.classList.remove('lab-running');
        document.getElementById('run-all').disabled = false;
        document.getElementById('run-visible').disabled = false;
        document.querySelectorAll('[data-pace]').forEach((b) => { b.disabled = false; });
      };
      try {
        for (const frame of frames) {
        this.deviceFrame = frame && frame.width ? frame : null;
        if (frames.length > 1 && frame) this.log('<b>LAB</b> ' + frame.label);
        await this.withTargets(async (ctx) => {
          const iframe = document.getElementById('sut');
          const baseLang = currentLang(ctx.cv);
          const desktopFrame = {
            width: iframe.style.width,
            height: iframe.style.height,
            maxWidth: iframe.style.maxWidth
          };
          for (const c of pack) {
            if (this.deviceFrame && this.deviceFrame.width) {
              iframe.style.width = this.deviceFrame.width + 'px';
              iframe.style.height = this.deviceFrame.height + 'px';
              iframe.style.maxWidth = '100%';
            } else {
              iframe.style.width = desktopFrame.width;
              iframe.style.height = desktopFrame.height;
              iframe.style.maxWidth = desktopFrame.maxWidth;
            }
            const src = iframe.getAttribute('src') || '';
            if (!/index\.html/i.test(src)) ctx.cv = await ctx.loadCv('index.html');
            else ctx.cv = { window: iframe.contentWindow, document: iframe.contentDocument };
            this.selectedId = c.id;
            this.renderCatalog();
            this.renderDetail();
            this.focusCase(c.id);
            const row = document.querySelector(`.case-row[data-id="${c.id}"]`);
            if (row) row.classList.add('running');
            this.log(`<span class="k">${c.id}</span> ${c.title}<div class="muted">where ${c.where}</div><div class="muted">when ${c.when}</div><div class="muted">how ${c.how}</div>`);
            this.activeCase = c.id;
            if (global.LabObserver) global.LabObserver.pulse();
            this.renderRunners(this.runnerTab);
            await wait(holdMs);
            const t0 = performance.now();
            try {
              const detail = await withTimeout(c.run(ctx), 40000, c.id) || 'ok';
              const ms = Math.round(performance.now() - t0);
              this.results = this.results.filter((r) => r.id !== c.id);
              this.results.push({ id: c.id, ok: true, ms, detail, layer: c.layer });
              this.log(`<span class="ok">PASS</span> ${c.id} · ${ms} ms · ${String(detail).replace(/</g, '&lt;')}`);
            } catch (err) {
              const ms = Math.round(performance.now() - t0);
              this.results = this.results.filter((r) => r.id !== c.id);
              const result = { id: c.id, ok: false, ms, error: err.message, layer: c.layer };
              this.results.push(result);
              this.log(`<span class="fail">FAIL</span> ${c.id} · ${ms} ms · ${String(err.message).replace(/</g, '&lt;')}`);
              if (global.LabObserver) await global.LabObserver.caseEnd(this, c, result);
            }
            if (row) row.classList.remove('running');
            this.activeCase = '';
            const live = { window: iframe.contentWindow, document: iframe.contentDocument };
            if (live.document && currentLang(live) !== baseLang) {
              ctx.cv = await ctx.loadCv(langPath(baseLang));
            }
            try {
              this.renderDetail();
              this.renderDashboard();
              this.renderReport();
              this.renderRunners(this.runnerTab);
            } catch (renderErr) {
              this.log(`<span class="fail">RENDER</span> ${c.id} · ${String(renderErr.message).replace(/</g, '&lt;')}`);
            }
            await wait(holdMs);
          }
        });
        }
        const passed = this.results.filter((r) => ids.includes(r.id) && r.ok).length;
        const failed = this.results.filter((r) => ids.includes(r.id) && !r.ok).length;
        writeHistory(this.snapshotRecord(ids));
        this.renderDashboard();
        this.log(`<b>LAB</b> Finished · ${passed} passed · ${failed} failed · ${pack.length} ran`);
        this.openDashboard();
        if (global.LabObserver) global.LabObserver.runEnd(this, ids);
        if (global.SiteAnalytics) {
          global.SiteAnalytics.trackEvent('qa_lab_run', 'QA Lab', `${passed}/${pack.length}`, { passed, failed, pace: this.pace });
        }
      } catch (err) {
        this.log(`<span class="fail">LAB</span> stopped · ${String(err.message).replace(/</g, '&lt;')}`);
      } finally {
        if (global.LabObserver) global.LabObserver.stop();
        this.releaseLabLanguage();
        unlock();
      }
    },

    snapshotRecord(ids) {
      const slice = this.results.filter((r) => ids.includes(r.id));
      const passed = slice.filter((r) => r.ok).length;
      const ms = slice.reduce((sum, r) => sum + (r.ms || 0), 0);
      return {
        id: 'R' + Date.now().toString(36),
        ts: Date.now(),
        passed,
        failed: slice.length - passed,
        total: slice.length,
        rate: slice.length ? Math.round((passed / slice.length) * 100) : 0,
        ms,
        pace: this.pace,
        view: this.view,
        origin: location.origin,
        runners: this.selectedFrameworks(),
        cases: slice.map((r) => ({
          id: r.id,
          ok: !!r.ok,
          ms: r.ms || 0,
          layer: r.layer || '',
          note: String(r.detail || r.error || '').slice(0, 220)
        }))
      };
    },

    renderHistory() {
      const list = document.getElementById('history-list');
      if (!list) return;
      const runs = readHistory().slice().reverse();
      if (!runs.length) {
        list.innerHTML = '<p class="muted">No saved runs in this browser yet. Finish a pass and it will be listed here.</p>';
        return;
      }
      list.innerHTML = runs.map((run) => {
        const key = runKey(run);
        const on = this.historyPick.has(key) ? ' checked' : '';
        const runners = (run.runners || []).join(', ');
        return '<label class="history-row"><input type="checkbox" value="' + escHtml(key) + '"' + on + '><span><strong>' + escHtml(formatWhen(run.ts)) + '</strong> · ' + escHtml(key) + '<br>' + (run.passed || 0) + '/' + (run.total || 0) + ' passed · ' + (run.rate || 0) + '% · ' + (run.ms ? (run.ms / 1000).toFixed(1) + 's' : 'duration not stored') + (runners ? ' · ' + escHtml(runners) : '') + '</span></label>';
      }).join('');
    },

    historyNote(text) {
      const note = document.getElementById('history-note');
      if (note) note.textContent = text;
    },

    pickedRuns() {
      const wanted = new Set([...document.querySelectorAll('#history-list input:checked')].map((box) => box.value));
      return readHistory().filter((run) => wanted.has(runKey(run)));
    },

    saveHtml(filename, html) {
      const file = new Blob([html], { type: 'text/html' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(file);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
    },

    printHtml(html) {
      const frame = document.createElement('iframe');
      frame.setAttribute('title', 'QA lab report print');
      frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
      document.body.appendChild(frame);
      const doc = frame.contentDocument;
      doc.open();
      doc.write(html);
      doc.close();
      setTimeout(() => {
        frame.contentWindow.focus();
        frame.contentWindow.print();
        setTimeout(() => frame.remove(), 800);
      }, 60);
    },

    downloadRuns() {
      if (!this.pickedRuns().length) {
        this.historyNote('Select at least one run to download.');
        return;
      }
      this.openReportOptions({ history: true, analysis: false });
    },

    printRuns() {
      if (!this.pickedRuns().length) {
        this.historyNote('Select at least one run to print.');
        return;
      }
      this.openReportOptions({ history: true, analysis: false });
    },

    compareRuns() {
      const runs = this.pickedRuns();
      const board = document.getElementById('compare-board');
      if (!board) return;
      if (!runs.length) {
        this.historyNote('Select at least one run to compare. Two or more show movement.');
        return;
      }
      board.hidden = false;
      board.className = 'compare-board card qa-mark';
      board.innerHTML = '<div class="history-head"><h3>Run analysis</h3><div class="history-actions"><button class="btn btn-ghost" type="button" id="analysis-download">Download analysis</button><button class="btn btn-ghost" type="button" id="analysis-print">Print analysis</button></div></div>' + analysisBody(runs);
      const download = document.getElementById('analysis-download');
      const print = document.getElementById('analysis-print');
      if (download) download.onclick = () => this.openReportOptions({ history: true, analysis: true });
      if (print) print.onclick = () => this.openReportOptions({ history: true, analysis: true });
      this.historyNote(runs.length === 1 ? 'One run is open as an analysis. Select another to see regressions, fixes, and flaky cases.' : 'Analysis covers ' + runs.length + ' runs.');
      board.scrollIntoView({ block: 'nearest' });
    },

    downloadReport() {
      const file = new Blob([this.reportFile()], { type: 'text/html' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(file);
      a.download = 'qa-lab-carlos-munoz-report.html';
      a.click();
      URL.revokeObjectURL(a.href);
    },

    printReport() {
      const frame = document.createElement('iframe');
      frame.setAttribute('title', 'QA lab report print');
      frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
      document.body.appendChild(frame);
      const doc = frame.contentDocument;
      doc.open();
      doc.write(this.reportFile());
      doc.close();
      setTimeout(() => {
        frame.contentWindow.focus();
        frame.contentWindow.print();
        setTimeout(() => frame.remove(), 800);
      }, 60);
    },

    focusCase(id) {
      const row = document.querySelector(`.case-row[data-id="${id}"]`);
      const item = row && (row.closest('.case-item') || row);
      const list = document.getElementById('case-list');
      if (item && list) {
        const ir = item.getBoundingClientRect();
        const lr = list.getBoundingClientRect();
        const top = list.scrollTop + (ir.top - lr.top) - (list.clientHeight / 2) + (ir.height / 2);
        list.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
      }
      const detail = document.getElementById('case-detail');
      if (detail) detail.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      if (this.view === 'watch') {
        const wrap = document.getElementById('sut-wrap');
        if (wrap) wrap.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    },

    openDashboard() {
      const el = document.getElementById('dash-overlay');
      if (!el) return;
      document.documentElement.classList.add('report-open');
      if (global.SiteTour) global.SiteTour.hold();
      el.classList.add('open');
      document.body.style.overflow = 'hidden';
    },

    closeDashboard() {
      const el = document.getElementById('dash-overlay');
      if (!el) return;
      el.classList.remove('open');
      document.documentElement.classList.remove('report-open');
      document.body.style.overflow = '';
      if (global.SiteTour) global.SiteTour.release();
    },

    labTour() {
      return {
        name: 'QA Lab',
        key: 'hasSeenLabTour',
        steps: [
          { selector: '#case-list', title: 'The catalog', body: 'Every check is a row: where it looks, when it runs, and how it asserts. A pulse marks the control for this step. The chips under the row open that same case in the lab and in each runner on GitHub.', demoMs: 1800 },
          { selector: '.filters', title: 'Filter by type', body: 'Smoke, Functional, Security, A11y, Admin, Studio, or Mobile. Run filtered runs only the rows still on screen.', demoMs: 1500 },
          { selector: '#case-list .src-links', title: 'Scripts and cases', body: 'Each chip is a real file: the lab check, then Playwright, Cypress, Robot, Selenium, WebdriverIO, or Appium. Click a chip to open that script.', demoMs: 1600 },
          { selector: '#langWrap', title: 'Language', body: 'A language chosen here is the language on the CV, the studio, this lab, and admin. The same choice sticks when you move between them.', demoMs: 1600 },
          { selector: '#suite-repo', title: 'Suite repo', body: 'Suite repo opens the GitHub project that holds these checks. The chips on each row jump to the file. This link opens the whole project.', demoMs: 1400 },
          { selector: '#studio-link', title: 'Sprint studio', body: 'Sprint studio opens the four-agent board. The language you picked here is the language the studio opens in.', demoMs: 1400 },
          { selector: '.kpis', title: 'Suite run indicators', body: 'Passed, failed, skipped, and duration update as the catalog runs. They are the totals for this session, before the dashboard charts.', demoMs: 1500 },
          { selector: '.pace', title: 'Pace', body: 'The line runs from faster on the left to slower on the right. 0.5 holds the least between actions, 2.0 holds the most, so a first look is easier on the right.', demoMs: 1500 },
          { selector: '#view-slider', title: 'Watch or Background', body: 'The slider keeps one side on. Watch shows the live page. Background is the idle side until you choose it, and then the checks run off-screen.', demoMs: 1600 },
          { selector: '#fw-picker', title: 'Which runners', body: 'Leave on the frameworks you want this pass to show: Playwright, Cypress, Robot, Selenium, WebdriverIO, Appium, or several. A run with none selected waits until you pick one.', demoMs: 1700 },
          { selector: '#run-all', title: 'Run', body: 'Run this case, Run filtered, or Run full catalog. The active row stays in view while the checks proceed.', demoMs: 1600 },
          { selector: '#sut-wrap', title: 'Live system under test', body: 'The frame is the real CV, studio, or admin page. The checks act here, then the log under the frame records each one.', demoMs: 4000, preview: 'lab' },
          { selector: '#runner-drawer', title: 'Native runners', body: 'Open Runners on the right edge. Each tab streams that framework’s own process across the catalog, in the browsers and devices chosen in the ask. A result from one is not copied into the others.', demoMs: 1800, prepare: () => { if (global.QALab) global.QALab.openRunners(); } },
          { selector: '#report-open', title: 'Report file', body: 'Report opens the file options. English is the default. Pick another language, leave the graphs on, check the preview, then download or print.', demoMs: 1500 },
          { selector: '#dash-open', title: 'Dashboard', body: 'When the run finishes, the dashboard opens: charts, this session’s report, and the run history. Select past runs to download, print, or compare.', demoMs: 1800 },
          { selector: '#tour-start-btn', title: 'Open this tour again', body: 'This walkthrough stays closed after the first visit. How this lab works brings it back whenever you want it.', demoMs: 1600 }
        ]
      };
    },

    syncPaceUi() {
      document.querySelectorAll('[data-pace]').forEach((btn) => {
        btn.classList.toggle('on', Number(btn.dataset.pace) === this.pace);
      });
    },

    setPace(value, track) {
      const n = Number(value);
      this.pace = PACE_VALUES.some((v) => v === n) ? n : 1;
      localStorage.setItem(PACE_KEY, String(this.pace));
      this.syncPaceUi();
      if (track && global.SiteAnalytics) {
        global.SiteAnalytics.trackEvent('qa_lab_pace', 'QA Lab', formatPace(this.pace));
      }
    },

    syncViewUi() {
      const mode = this.view === 'background' ? 'background' : 'watch';
      this.view = mode;
      document.documentElement.classList.toggle('lab-watch', mode === 'watch');
      document.documentElement.classList.toggle('lab-background', mode === 'background');
      const knob = document.getElementById('view-switch');
      if (knob) {
        knob.setAttribute('aria-checked', mode === 'watch' ? 'true' : 'false');
        knob.setAttribute('aria-label', mode === 'watch' ? 'Watch on, Background off' : 'Background on, Watch off');
      }
      document.querySelectorAll('[data-view]').forEach((btn) => {
        const on = btn.dataset.view === mode;
        btn.classList.toggle('on', on);
        btn.classList.toggle('is-idle', !on);
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
    },

    setView(value, track) {
      this.view = value === 'background' ? 'background' : 'watch';
      localStorage.setItem(VIEW_KEY, this.view);
      this.syncViewUi();
      if (track && global.SiteAnalytics) {
        global.SiteAnalytics.trackEvent('qa_lab_view', 'QA Lab', this.view);
      }
    },

    selectedFrameworks() {
      const boxes = [...document.querySelectorAll('#fw-picker input')];
      if (!boxes.length) return readFrameworks();
      return boxes.filter((box) => box.checked).map((box) => box.value);
    },

    saveFrameworks() {
      const chosen = this.selectedFrameworks();
      localStorage.setItem(FW_KEY, JSON.stringify(chosen));
      document.querySelectorAll('#fw-picker label').forEach((label) => {
        const box = label.querySelector('input');
        label.classList.toggle('on', !!(box && box.checked));
      });
      this.renderRunners();
      this.renderDashboard();
    },

    mountFrameworkPicker() {
      const host = document.getElementById('fw-picker');
      if (!host) return;
      const chosen = new Set(readFrameworks());
      host.innerHTML = '<span class="pace-label">Run with</span>' + ALL_FW.map((name) =>
        '<label class="' + (chosen.has(name) ? 'on' : '') + '"><input type="checkbox" value="' + name + '"' + (chosen.has(name) ? ' checked' : '') + '> ' + (name === 'WebDriverIO' ? 'WebdriverIO' : name) + '</label>'
      ).join('');
      host.querySelectorAll('input').forEach((box) => {
        box.addEventListener('change', () => this.saveFrameworks());
      });
    },

    fwLabel(name) {
      return name === 'WebDriverIO' ? 'WebdriverIO' : (name || '');
    },

    paintRunnerMarks() {
      const live = this.activeRunner;
      document.querySelectorAll('#fw-picker label').forEach((label) => {
        const input = label.querySelector('input');
        const name = input && input.value;
        const on = !!live && name === live;
        label.classList.toggle('is-running', on);
        let badge = label.querySelector('.runner-live');
        if (on && !badge) {
          badge = document.createElement('em');
          badge.className = 'runner-live';
          badge.innerHTML = '<i class="runner-dot" aria-hidden="true"></i> Running';
          label.appendChild(badge);
        } else if (!on && badge) badge.remove();
      });
      const edge = document.getElementById('runner-edge');
      if (edge) {
        edge.textContent = live ? this.fwLabel(live) : 'Runners';
        edge.classList.toggle('is-running', !!live);
        edge.setAttribute('aria-label', live ? this.fwLabel(live) + ' is running' : 'Runners');
      }
      const head = document.querySelector('#runner-drawer .stage-head strong');
      if (head) head.textContent = live ? this.fwLabel(live) + ' is running' : 'Native runners';
    },

    renderRunners(active) {
      const tabs = document.getElementById('runner-tabs');
      const stage = document.getElementById('runner-stage');
      if (!tabs || !stage) return;
      const chosen = this.selectedFrameworks();
      const current = chosen.includes(active) ? active : (chosen.includes(this.runnerTab) ? this.runnerTab : chosen[0]);
      this.runnerTab = current || '';
      tabs.innerHTML = chosen.map((name) => {
        const running = name === this.activeRunner;
        const label = this.fwLabel(name);
        const cls = (name === current ? 'on' : '') + (running ? ' is-running' : '');
        return '<button type="button" role="tab" data-runner="' + name + '" class="' + cls.trim() + '" aria-selected="' + (name === current ? 'true' : 'false') + '" aria-label="' + label + (running ? ', running' : '') + '">'
          + (running ? '<i class="runner-dot" aria-hidden="true"></i>' : '')
          + '<span>' + label + '</span>'
          + (running ? '<em class="runner-live">Running</em>' : '')
          + '</button>';
      }).join('') || '<span class="muted">Pick at least one runner.</span>';
      tabs.querySelectorAll('[data-runner]').forEach((btn) => {
        btn.onclick = () => {
          const name = btn.dataset.runner;
          this.runnerPinned = !!(this.activeRunner && name !== this.activeRunner);
          this.renderRunners(name);
        };
      });
      stage.innerHTML = current ? this.runnerBanner(current) + this.runnerSkin(current) : '';
      const log = stage.querySelector('.runner-console');
      if (log) log.scrollTop = log.scrollHeight;
      const tab = tabs.querySelector('[data-runner="' + current + '"]');
      if (tab && tab.scrollIntoView) tab.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      this.paintRunnerMarks();
    },

    runnerBanner(name) {
      const live = this.activeRunner;
      if (!live) return '';
      const label = this.fwLabel(live);
      if (live === name) return '<p class="runner-now"><i class="runner-dot" aria-hidden="true"></i> ' + label + ' is running</p>';
      return '<p class="runner-now runner-now-other"><i class="runner-dot" aria-hidden="true"></i> ' + label + ' is running</p>';
    },

    noteNative(msg) {
      if (!msg || !msg.fw || !this.nativeLogs[msg.fw]) return;
      if (msg.line) this.nativeLogs[msg.fw].push(msg.line);
      const changed = this.activeRunner !== msg.fw;
      if (changed) {
        this.activeRunner = msg.fw;
        this.runnerPinned = false;
        this.openRunners();
      }
      if (msg.summary) {
        this.nativeSummaries[msg.fw] = msg.summary;
        this.renderDashboard();
        this.renderReport();
      }
      if (!this.runnerPinned || changed || this.runnerTab === msg.fw) {
        this.renderRunners((!this.runnerPinned || changed) ? msg.fw : this.runnerTab);
      } else this.paintRunnerMarks();
      if (msg.summary && this.activeRunner === msg.fw) {
        this.activeRunner = null;
        this.renderRunners(this.runnerTab);
      }
    },

    runnerRows(name) {
      const summary = this.nativeSummaries[name];
      return summary && Array.isArray(summary.cases) ? summary.cases : [];
    },

    launchNative(frameworks, ids) {
      this.nativeLogs = {};
      frameworks.forEach((name) => { this.nativeLogs[name] = []; });
      this.activeRunner = frameworks[0] || null;
      this.runnerPinned = false;
      this.renderRunners(frameworks[0] || this.runnerTab);
      const fail = (message) => {
        this.log('<span class="fail">NATIVE</span> ' + message);
        frameworks.forEach((name) => {
          this.nativeLogs[name] = this.nativeLogs[name] || [];
          this.nativeLogs[name].push(message);
        });
        this.activeRunner = null;
        this.renderRunners(this.runnerTab);
      };
      fetch('http://127.0.0.1:8770/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          frameworks,
          ids: ids || [],
          browsers: this.selectedBrowsers(),
          devices: this.selectedDevices()
        })
      }).then((res) => {
        if (res.status === 409) {
          fail('A native run is already in progress.');
          return null;
        }
        if (!res.ok || !res.body) {
          fail('This browser is running the catalog against the site. Framework processes start when the runner is up, and that runner downloads Chrome, Firefox, and WebKit instead of using whatever is installed.');
          return null;
        }
        return res.body.getReader();
      }).then((reader) => {
        if (!reader) return;
        const dec = new TextDecoder();
        let buf = '';
        const pump = () => reader.read().then(({ done, value }) => {
          if (done) {
            this.activeRunner = null;
            this.runnerPinned = false;
            this.renderRunners(this.runnerTab);
            return;
          }
          buf += dec.decode(value, { stream: true });
          const parts = buf.split('\n');
          buf = parts.pop();
          parts.forEach((line) => {
            if (!line.trim()) return;
            let msg;
            try { msg = JSON.parse(line); } catch (err) { return; }
            this.noteNative(msg);
          });
          return pump();
        });
        return pump();
      }).catch(() => {
        fail('This browser is running the catalog against the site. Chrome, Firefox, Edge, and Safari do not have to be installed for that. Framework processes start when the runner is up.');
      });
    },

    runnerConsole(name) {
      const esc = (value) => String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;');
      const banner = {
        Playwright: 'playwright test',
        Cypress: 'cypress run',
        Robot: 'robot',
        Selenium: 'mocha selenium',
        WebDriverIO: 'wdio run',
        Appium: 'appium + wdio'
      }[name] || name;
      const lines = this.nativeLogs[name] || [];
      const blocks = ['<div>' + esc(banner) + '</div>'];
      if (!lines.length) {
        blocks.push('<div class="run">This process has not printed yet. A result from another runner is not copied here.</div>');
        return blocks.join('');
      }
      lines.forEach((line) => {
        const fail = /fail|error|exit [1-9]/i.test(line);
        const ok = /passing|✓|passed/i.test(line) && !fail;
        blocks.push('<div class="' + (fail ? 'fail' : (ok ? 'ok' : 'run')) + '">' + esc(line) + '</div>');
      });
      return blocks.join('');
    },

    runnerSkin(name) {
      const rows = this.runnerRows(name);
      const items = rows.length
        ? rows.map((row) => '<li class="' + (row.ok ? 'ok' : 'fail') + '">' + (row.ok ? '✓' : '✗') + ' ' + String(row.title || '').replace(/</g, '&lt;') + '</li>')
        : ['<li class="run">waiting for this process</li>'];
      const titles = {
        Playwright: ['Playwright', 'Process log'],
        Cypress: ['Cypress', 'Process log'],
        Robot: ['Robot', 'Process log'],
        Selenium: ['Selenium WebDriver', 'Process log'],
        WebDriverIO: ['WebdriverIO', 'Process log'],
        Appium: ['Appium', 'Process log']
      };
      const pair = titles[name] || [name, 'Process log'];
      const klass = {
        Playwright: 'runner-play',
        Cypress: 'runner-cy',
        Robot: 'runner-robot',
        Selenium: 'runner-ide',
        WebDriverIO: 'runner-wdio',
        Appium: 'runner-appium'
      }[name] || 'runner-play';
      return '<div class="runner-split ' + klass + '"><section class="runner-cases"><b>' + pair[0] + '</b><ul>' + items.join('') + '</ul></section><section class="runner-console" aria-label="' + pair[1] + '"><b>' + pair[1] + '</b><div class="runner-log">' + this.runnerConsole(name) + '</div></section></div>';
    },

    holdLabLanguage() {
      if (!global.SiteI18n) return;
      this.labLangHeld = SiteI18n.current() || document.documentElement.lang || 'en';
      this.applyLabLanguage(this.labLangHeld, false);
    },

    releaseLabLanguage() {
      const lang = this.labLangHeld || (global.SiteI18n && SiteI18n.current()) || 'en';
      this.labLangHeld = lang;
      this.applyLabLanguage(lang, true);
    },

    applyLabLanguage(code, persist) {
      const lang = (global.SiteI18n && SiteI18n.normalize(code)) || code || 'en';
      document.documentElement.lang = lang;
      const flag = document.getElementById('langFlag');
      if (flag && global.SiteI18n) {
        flag.src = SiteI18n.flagUrl(lang);
        flag.alt = SiteI18n.displayName(lang);
      }
      if (!global.SiteI18n) return;
      if (persist && SiteI18n.saved() !== lang) SiteI18n.persist(lang);
      SiteI18n.applyMachineTranslate(lang);
    },

    mountLanguageMenu() {
      const wrap = document.getElementById('langWrap');
      const toggle = document.getElementById('langToggle');
      const menu = document.getElementById('langMenu');
      const flag = document.getElementById('langFlag');
      if (!wrap || !global.SiteI18n) return;
      const syncFlag = (code) => {
        flag.src = SiteI18n.flagUrl(code);
        flag.alt = SiteI18n.displayName(code);
      };
      const render = (query) => {
        const list = menu.querySelector('.lang-options-list');
        if (!list) return;
        list.innerHTML = '';
        SiteI18n.orderedLanguages().forEach((meta) => {
          if (!SiteI18n.matchesQuery(meta, query)) return;
          const option = document.createElement('div');
          option.className = 'lang-option';
          option.dataset.lang = meta.code;
          option.innerHTML = `<img src="${SiteI18n.flagUrl(meta.code)}" alt=""><span>${meta.native}</span>`;
          option.onclick = () => {
            if (global.SiteAnalytics) global.SiteAnalytics.trackEvent('qa_lab_language_change', 'QA Lab', meta.code);
            this.labLangHeld = meta.code;
            SiteI18n.selectLanguage(meta.code);
            document.documentElement.lang = meta.code;
          };
          list.appendChild(option);
        });
      };
      menu.innerHTML = '<input class="lang-search" type="search" placeholder="Search language" aria-label="Search language"><div class="lang-options-list"></div>';
      const search = menu.querySelector('.lang-search');
      search.addEventListener('input', () => render(search.value));
      search.addEventListener('click', (e) => e.stopPropagation());
      render('');
      toggle.addEventListener('click', (e) => {
        e.stopPropagation();
        wrap.classList.toggle('open');
      });
      document.addEventListener('click', () => wrap.classList.remove('open'));
      SiteI18n.resolve().then((lang) => {
        this.labLangHeld = lang || 'en';
        syncFlag(this.labLangHeld);
        document.documentElement.lang = this.labLangHeld;
        SiteI18n.loadWidget();
        SiteI18n.applyMachineTranslate(this.labLangHeld);
      });
      SiteI18n.follow((lang) => {
        const keep = this.running ? (this.labLangHeld || 'en') : (lang || 'en');
        if (!this.running) this.labLangHeld = keep;
        syncFlag(keep);
        this.applyLabLanguage(keep, !this.running);
      });
    },

    boot() {
      if (global.LabObserver) global.LabObserver.boot();
      this.pace = readPace();
      this.view = readView();
      this.syncPaceUi();
      this.syncViewUi();
      this.renderCatalog();
      this.renderDetail();
      this.renderDashboard();
      this.renderReport();
      this.mountFrameworkPicker();
      this.renderRunners();
      document.querySelectorAll('[data-filter]').forEach((btn) => {
        btn.onclick = () => {
          this.filter = btn.dataset.filter;
          document.querySelectorAll('[data-filter]').forEach((b) => b.classList.toggle('on', b === btn));
          this.renderCatalog();
        };
      });
      document.querySelectorAll('[data-pace]').forEach((btn) => {
        btn.onclick = () => {
          if (this.running) return;
            this.setPace(btn.dataset.pace, true);
        };
      });
      document.querySelectorAll('[data-view]').forEach((btn) => {
        btn.onclick = () => this.setView(btn.dataset.view, true);
      });
      const viewSwitch = document.getElementById('view-switch');
      if (viewSwitch) {
        viewSwitch.onclick = () => this.setView(this.view === 'watch' ? 'background' : 'watch', true);
      }
      const edge = document.getElementById('runner-edge');
      const runnerClose = document.getElementById('runner-close');
      if (edge) edge.onclick = () => {
        const drawer = document.getElementById('runner-drawer');
        if (drawer && drawer.classList.contains('open')) this.closeRunners();
        else this.openRunners();
      };
      if (runnerClose) runnerClose.onclick = () => this.closeRunners();
      const askGo = document.getElementById('fw-ask-go');
      const askCancel = document.getElementById('fw-ask-cancel');
      if (askGo) askGo.onclick = () => this.confirmAsk();
      if (askCancel) askCancel.onclick = () => this.closeAsk();
      const reportOpen = document.getElementById('report-open');
      if (reportOpen) reportOpen.onclick = () => this.openReportOptions();
      const reportClose = document.getElementById('report-options-close');
      const reportPrint = document.getElementById('report-options-print');
      const reportDownload = document.getElementById('report-options-download');
      if (reportClose) reportClose.onclick = () => this.closeReportOptions();
      if (reportPrint) reportPrint.onclick = () => this.printReport();
      if (reportDownload) reportDownload.onclick = () => this.downloadReport();
      const reportLang = document.getElementById('report-lang');
      const reportRefresh = () => {
        if (reportLang && REPORT_LANGS.includes(reportLang.value)) {
          try { localStorage.setItem(REPORT_LANG_KEY, reportLang.value); } catch (err) { /* ignore */ }
        }
        this.refreshReportPreview();
      };
      if (reportLang) reportLang.addEventListener('change', reportRefresh);
      document.querySelectorAll('#report-checks input').forEach((box) => box.addEventListener('change', reportRefresh));
      const home = document.getElementById('homeBtn');
      if (home) {
        home.onclick = (e) => {
          e.preventDefault();
          if (global.SiteI18n) SiteI18n.goHome();
          else location.href = 'index.html';
        };
      }
      const studio = document.getElementById('studio-link');
      if (studio) {
        studio.addEventListener('click', (e) => {
          if (!global.SiteI18n) return;
          e.preventDefault();
          location.href = 'simulador.html?lang=' + encodeURIComponent(SiteI18n.current());
        });
      }
      document.getElementById('run-all').onclick = () => this.runIds(CASES.map((c) => c.id));
      document.getElementById('run-visible').onclick = () => this.runIds(this.filtered().map((c) => c.id));
      const legacyDownload = document.getElementById('download-report');
      if (legacyDownload) legacyDownload.onclick = () => this.openReportOptions();
      const historyList = document.getElementById('history-list');
      if (historyList) {
        historyList.addEventListener('change', (e) => {
          const box = e.target;
          if (!box || box.type !== 'checkbox') return;
          if (box.checked) this.historyPick.add(box.value);
          else this.historyPick.delete(box.value);
        });
      }
      const historyAll = document.getElementById('history-all');
      if (historyAll) {
        historyAll.onclick = () => {
          readHistory().forEach((run) => this.historyPick.add(runKey(run)));
          this.renderHistory();
        };
      }
      const historyDownload = document.getElementById('history-download');
      const historyPrint = document.getElementById('history-print');
      const historyCompare = document.getElementById('history-compare');
      if (historyDownload) historyDownload.onclick = () => this.downloadRuns();
      if (historyPrint) historyPrint.onclick = () => this.printRuns();
      if (historyCompare) historyCompare.onclick = () => this.compareRuns();
      const dashOpen = document.getElementById('dash-open');
      const dashClose = document.getElementById('dash-close');
      const dashOverlay = document.getElementById('dash-overlay');
      if (dashOpen) dashOpen.onclick = () => this.openDashboard();
      if (dashClose) dashClose.onclick = () => this.closeDashboard();
      if (dashOverlay) {
        dashOverlay.addEventListener('click', (e) => {
          if (e.target === dashOverlay) this.closeDashboard();
        });
      }
      document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        const report = document.getElementById('report-options');
        if (report && !report.hidden) {
          this.closeReportOptions();
          return;
        }
        this.closeDashboard();
      });
      if (global.SiteTour) {
        const tour = this.labTour();
        SiteTour.bind(document.getElementById('tour-start-btn'), tour);
        SiteTour.autoStart(tour);
      }
      mountLabGuide();
      this.mountLanguageMenu();
      const sut = document.getElementById('sut');
      if (sut && !sut.getAttribute('src')) sut.src = 'index.html';
      if (/autorun=1/.test(location.search)) this.runIds(CASES.map((c) => c.id));
    }
  };

  global.QALab = Lab;
})(window);
