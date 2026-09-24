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
      where: 'index.html, simulador.html, admin.html, style.css, favicon.svg, robots.txt, sitemap.xml',
      when: 'Before any UI interaction — health of the published tree.',
      how: 'GET each path and assert status 200.',
      async run() {
        const paths = ['index.html', 'simulador.html', 'admin.html', 'qa-lab.html', 'style.css', 'favicon.svg', 'robots.txt', 'sitemap.xml'];
        for (const path of paths) await fetchText(path);
        return '8 assets answered 200';
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
      title: 'Language switch EN → ES → EN',
      where: '#language-selector / #language-options [data-lang]',
      when: 'After opening the language menu and choosing a code.',
      how: '[data-translate-key=summary_title] contains Resumen then Professional Summary.',
      async run({ cv }) {
        const sel = cv.document.getElementById('language-selector');
        sel.click();
        const es = cv.document.querySelector('#language-options .lang-option[data-lang="es"]');
        assert(es, 'Spanish option missing');
        es.click();
        await wait(200);
        const title = cv.document.querySelector('[data-translate-key="summary_title"]');
        assert(/Resumen/i.test(title.textContent), 'Spanish summary title missing');
        sel.click();
        cv.document.querySelector('#language-options .lang-option[data-lang="en"]').click();
        await wait(200);
        assert(/Professional Summary/i.test(title.textContent), 'English summary title missing');
        return title.textContent.trim();
      }
    },
    {
      id: 'FN-03', layer: 'Functional', fw: ['Playwright', 'Cypress'],
      title: '?lang=de is honored on load',
      where: '/index.html?lang=de',
      when: 'Cold load with a language query.',
      how: 'summary_title reads Berufliches Profil.',
      async run({ loadCv }) {
        const cv = await loadCv('index.html?lang=de');
        const title = cv.document.querySelector('[data-translate-key="summary_title"]');
        assert(/Berufliches Profil/i.test(title.textContent), 'German title missing: ' + title.textContent);
        return title.textContent.trim();
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
        name.blur();
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
        assert(tip.classList.contains('visible') || tip.offsetParent, 'tour tooltip not shown');
        assert(/1\s*\//.test(cv.document.getElementById('tour-step-counter').textContent), 'step 1 missing');
        const next = cv.document.getElementById('tour-next-btn');
        const startWait = Date.now();
        while (next.disabled && Date.now() - startWait < 16000) await wait(200);
        assert(!next.disabled, 'Next never enabled (demo gate)');
        next.click();
        await wait(80);
        assert(/2\s*\//.test(cv.document.getElementById('tour-step-counter').textContent), 'did not advance');
        cv.document.getElementById('tour-close-btn').click();
        await wait(80);
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
        ['en', 'es', 'pt', 'de', 'fr', 'it'].forEach((lang) => {
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
      how: 'index present; canonical points at github.io; JSON-LD names Carlos and 18 years/años.',
      async run({ cv }) {
        const robots = cv.document.querySelector('meta[name="robots"]').content;
        assert(/index/i.test(robots), 'CV not indexable');
        const canonical = cv.document.querySelector('link[rel="canonical"]').href;
        assert(/kaanmuar\.github\.io/.test(canonical), 'canonical host unexpected');
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
      id: 'A11Y-01', layer: 'Accessibility', fw: ['Playwright', 'Cypress'],
      title: 'No serious WCAG 2 A/AA axe findings (overlays excluded)',
      where: 'CV document except #contact-widget, #tour-tooltip, .skiptranslate',
      when: 'After load, axe-core 4.10 injected into the iframe.',
      how: 'Zero violations with impact serious or critical, color-contrast off (same as CI).',
      async run({ cv }) {
        await injectAxe(cv.window, cv.document);
        const results = await cv.window.axe.run(
          { exclude: [['#contact-widget'], ['#tour-tooltip'], ['.skiptranslate']] },
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
    }
  ];

  const REPO = 'https://github.com/kaanmuar/kaanmuar.github.io';
  const BRANCH = 'main';
  const LAB_LINE = {
    'SMK-01': 33, 'SMK-02': 45,
    'FN-01': 58, 'FN-02': 76, 'FN-03': 98, 'FN-04': 111, 'FN-05': 126, 'FN-06': 139,
    'FN-07': 160, 'FN-08': 175, 'FN-09': 190, 'FN-10': 203, 'FN-11': 215, 'FN-12': 228,
    'FN-13': 241, 'FN-14': 261,
    'SEC-01': 286, 'SEC-02': 301, 'SEC-03': 318, 'SEC-04': 330, 'SEC-05': 347, 'SEC-06': 360, 'SEC-07': 376,
    'A11Y-01': 390, 'A11Y-02': 407, 'A11Y-03': 419,
    'ADM-01': 434, 'ADM-02': 447, 'ADM-03': 460,
    'STU-01': 473, 'STU-02': 486,
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
    'FN-07': { Playwright: ['tests/cv.spec.js', 59], Cypress: ['cypress/e2e/cv_spec.cy.js', 84] },
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
    'A11Y-01': { Playwright: ['tests/a11y.spec.js', 5], Cypress: ['cypress/e2e/a11y_spec.cy.js', 2] },
    'A11Y-02': { Playwright: ['tests/a11y.spec.js', 12], Cypress: ['cypress/e2e/a11y_spec.cy.js', 11] },
    'A11Y-03': { Playwright: ['tests/a11y.spec.js', 18], Cypress: ['cypress/e2e/a11y_spec.cy.js', 17] },
    'ADM-01': { Playwright: ['tests/admin.spec.js', 9], Cypress: ['cypress/e2e/admin_spec.cy.js', 18], Robot: ['tests/robot/security_admin.robot', 6] },
    'ADM-02': { Playwright: ['tests/admin.spec.js', 17], Cypress: ['cypress/e2e/admin_spec.cy.js', 24] },
    'ADM-03': { Playwright: ['tests/a11y.spec.js', 30], Cypress: ['cypress/e2e/a11y_spec.cy.js', 27] },
    'STU-01': { Playwright: ['tests/simulator.spec.js', 9], Cypress: ['cypress/e2e/simulator_spec.cy.js', 10], Robot: ['tests/robot/security_admin.robot', 38] },
    'STU-02': { Playwright: ['tests/simulator.spec.js', 26], Cypress: ['cypress/e2e/simulator_spec.cy.js', 27] },
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
    Robot: 'tests/robot'
  };

  function sourceEntries(c) {
    const items = [{ label: 'Lab', href: blob('js/qa-lab.js', LAB_LINE[c.id]) }];
    const row = SRC[c.id] || {};
    ['Playwright', 'Cypress', 'Robot'].forEach((fw) => {
      if (!c.fw.includes(fw)) return;
      if (row[fw]) items.push({ label: fw, href: blob(row[fw][0], row[fw][1]) });
      else items.push({ label: fw, href: REPO + '/tree/' + BRANCH + '/' + FW_TREE[fw] });
    });
    return items;
  }

  function sourceHtml(c, extraClass) {
    return `<span class="src-links ${extraClass || ''}">${sourceEntries(c).map((item) =>
      `<a class="src-link" href="${item.href}" target="_blank" rel="noopener noreferrer">${item.label}</a>`
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
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(-12)));
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

  const Lab = {
    cases: CASES,
    results: [],
    running: false,
    filter: 'All',
    selectedId: CASES[0].id,
    logLines: [],
    pace: readPace(),
    view: readView(),

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
        <p class="muted">${c.fw.join(' · ')}</p>
        ${sourceHtml(c, 'src-links-detail')}
        <dl class="spec">
          <dt>Where</dt><dd>${c.where}</dd>
          <dt>When</dt><dd>${c.when}</dd>
          <dt>How</dt><dd>${c.how}</dd>
        </dl>
        ${result ? `<p class="${result.ok ? 'pass' : 'fail'}">${result.ok ? 'PASSED' : 'FAILED'} · ${result.ms} ms${result.detail ? ' · ' + result.detail : ''}</p>` : '<p class="muted">Not executed in this session yet.</p>'}
        <button type="button" class="btn btn-ghost" id="run-one">Run this case</button>`;
      document.getElementById('run-one').onclick = () => this.runIds([c.id]);
    },

    renderDashboard() {
      const wrap = document.getElementById('dash-charts');
      if (!wrap) return;
      const passed = this.results.filter((r) => r.ok).length;
      const failed = this.results.filter((r) => !r.ok && r.status !== 'skip').length;
      const skipped = this.results.filter((r) => r.status === 'skip').length;
      const byLayer = {};
      CASES.forEach((c) => { byLayer[c.layer] = (byLayer[c.layer] || 0) + 1; });
      const byFw = { Playwright: 0, Cypress: 0, Robot: 0 };
      CASES.forEach((c) => c.fw.forEach((f) => { byFw[f] += 1; }));
      const durations = this.results.slice().sort((a, b) => b.ms - a.ms).slice(0, 8).map((r) => ({
        label: r.id, value: r.ms, color: r.ok ? '#0d6e76' : '#b42318'
      }));
      const history = readHistory();
      wrap.innerHTML = '';
      const cards = [
        { title: 'This run — pass rate', caption: 'Source: in-browser lab vs live pages · current session', node: donut(passed, failed, skipped) },
        { title: 'Catalog by test type', caption: 'Count of cases in the published suite map', node: bars(Object.entries(byLayer).map(([label, value]) => ({ label, value, color: layerColor(label) })), 'Cases by type') },
        { title: 'Mirrored in each runner', caption: 'How many catalog cases also exist in Playwright, Cypress, Robot', node: bars(Object.entries(byFw).map(([label, value]) => ({ label, value })), 'Framework coverage') }
      ];
      if (durations.length) {
        cards.push({ title: 'Slowest checks this run (ms)', caption: 'Wall time inside this browser, not CI agents', node: bars(durations, 'Duration ms') });
      }
      cards.push({
        title: 'Pass rate — last lab runs here',
        caption: 'localStorage qa-lab-history · this browser only',
        node: sparkline(history.map((h) => h.rate))
      });
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

    renderReport() {
      const el = document.getElementById('report-body');
      if (!el) return;
      if (!this.results.length) {
        el.innerHTML = '<p class="muted">Run the suite to generate a report. I keep the same checks in Playwright, Cypress and Robot for CI; this lab is the version a visitor can watch.</p>';
        return;
      }
      const passed = this.results.filter((r) => r.ok).length;
      const stamp = new Date().toISOString();
      el.innerHTML = `
        <p><strong>CV regression lab</strong> · ${stamp}<br>
        Owner: Carlos A. Muñoz · environment: ${location.origin} · ${passed}/${this.results.length} passed</p>
        <table>
          <thead><tr><th>ID</th><th>Result</th><th>ms</th><th>Where / evidence</th></tr></thead>
          <tbody>${this.results.map((r) => `<tr>
            <td>${r.id}</td>
            <td class="${r.ok ? 'pass' : 'fail'}">${r.ok ? 'PASSED' : 'FAILED'}</td>
            <td>${r.ms}</td>
            <td>${(r.detail || r.error || '').replace(/</g, '&lt;')}</td>
          </tr>`).join('')}</tbody>
        </table>`;
    },

    async withTargets(fn) {
      const iframe = document.getElementById('sut');
      const frameStyle = {
        width: iframe.style.width,
        height: iframe.style.height,
        maxWidth: iframe.style.maxWidth
      };
      const setPhoneFrame = () => {
        iframe.style.width = '390px';
        iframe.style.height = '844px';
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
        tour: sessionStorage.getItem('hasSeenTour')
      };
      const loadCv = (path, before) => new Promise((resolve, reject) => {
        sessionStorage.setItem('hasSeenTour', 'true');
        if (!/lang=/.test(path)) localStorage.setItem('cv-preferred-lang', 'en');
        iframe.onload = () => {
          const win = iframe.contentWindow;
          const doc = iframe.contentDocument;
          if (before) before(win);
          const start = Date.now();
          const tick = () => {
            if (doc.querySelector('.main-container') || doc.getElementById('login-overlay') || doc.getElementById('runBtn') || doc.getElementById('run-all') || Date.now() - start > 8000) {
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
        if (global.SiteTheme) global.SiteTheme.apply(snapshot.theme === 'dark', false);
      }
    },

    async runIds(ids) {
      if (this.running) return;
      this.running = true;
      this.pace = readPace();
      this.view = readView();
      this.syncViewUi();
      document.getElementById('run-all').disabled = true;
      document.getElementById('run-visible').disabled = true;
      document.querySelectorAll('[data-pace]').forEach((b) => { b.disabled = true; });
      const pack = CASES.filter((c) => ids.includes(c.id));
      const holdMs = Math.round(this.pace * 1000);
      this.log(`<b>LAB</b> Starting ${pack.length} case${pack.length === 1 ? '' : 's'} against ${location.origin} · pace ${formatPace(this.pace)} s · ${this.view === 'watch' ? 'Watch' : 'Background'}`);
      await this.withTargets(async (ctx) => {
        for (const c of pack) {
          this.selectedId = c.id;
          this.renderCatalog();
          this.renderDetail();
          const row = document.querySelector(`.case-row[data-id="${c.id}"]`);
          if (row) row.classList.add('running');
          this.log(`<span class="k">${c.id}</span> ${c.title}<div class="muted">where ${c.where}</div><div class="muted">when ${c.when}</div><div class="muted">how ${c.how}</div>`);
          await wait(holdMs);
          const t0 = performance.now();
          try {
            const detail = await c.run(ctx) || 'ok';
            const ms = Math.round(performance.now() - t0);
            this.results = this.results.filter((r) => r.id !== c.id);
            this.results.push({ id: c.id, ok: true, ms, detail, layer: c.layer });
            this.log(`<span class="ok">PASS</span> ${c.id} · ${ms} ms · ${String(detail).replace(/</g, '&lt;')}`);
          } catch (err) {
            const ms = Math.round(performance.now() - t0);
            this.results = this.results.filter((r) => r.id !== c.id);
            this.results.push({ id: c.id, ok: false, ms, error: err.message, layer: c.layer });
            this.log(`<span class="fail">FAIL</span> ${c.id} · ${ms} ms · ${String(err.message).replace(/</g, '&lt;')}`);
          }
          if (row) row.classList.remove('running');
          this.renderDetail();
          this.renderDashboard();
          this.renderReport();
          await wait(holdMs);
        }
      });
      const passed = this.results.filter((r) => r.ok).length;
      const failed = this.results.filter((r) => !r.ok).length;
      writeHistory({
        ts: Date.now(),
        passed,
        failed,
        total: this.results.length,
        rate: this.results.length ? Math.round((passed / this.results.length) * 100) : 0
      });
      this.renderDashboard();
      this.log(`<b>LAB</b> Finished · ${passed} passed · ${failed} failed`);
      this.running = false;
      document.getElementById('run-all').disabled = false;
      document.getElementById('run-visible').disabled = false;
      document.querySelectorAll('[data-pace]').forEach((b) => { b.disabled = false; });
      if (global.SiteAnalytics) {
        global.SiteAnalytics.trackEvent('qa_lab_run', 'QA Lab', `${passed}/${this.results.length}`, { passed, failed, pace: this.pace });
      }
    },

    downloadReport() {
      const passed = this.results.filter((r) => r.ok).length;
      const body = `CV regression lab — Carlos A. Muñoz\n${new Date().toISOString()}\nOrigin: ${location.origin}\n${passed}/${this.results.length} passed\n\n` +
        this.results.map((r) => `${r.ok ? 'PASS' : 'FAIL'}  ${r.id.padEnd(8)}  ${String(r.ms).padStart(5)} ms  ${r.detail || r.error || ''}`).join('\n');
      const blob = new Blob([body], { type: 'text/plain' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'cv-regression-lab-report.txt';
      a.click();
      URL.revokeObjectURL(a.href);
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
      document.querySelectorAll('[data-view]').forEach((btn) => {
        btn.classList.toggle('on', btn.dataset.view === mode);
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
            SiteI18n.selectLanguage(meta.code);
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
        syncFlag(lang);
        document.documentElement.lang = lang || 'en';
        SiteI18n.loadWidget();
        SiteI18n.applyMachineTranslate(lang);
      });
    },

    boot() {
      this.pace = readPace();
      this.view = readView();
      this.syncPaceUi();
      this.syncViewUi();
      this.renderCatalog();
      this.renderDetail();
      this.renderDashboard();
      this.renderReport();
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
      const home = document.getElementById('homeBtn');
      if (home) {
        home.onclick = (e) => {
          e.preventDefault();
          if (global.SiteI18n) SiteI18n.goHome();
          else location.href = 'index.html';
        };
      }
      document.getElementById('run-all').onclick = () => this.runIds(CASES.map((c) => c.id));
      document.getElementById('run-visible').onclick = () => this.runIds(this.filtered().map((c) => c.id));
      document.getElementById('download-report').onclick = () => this.downloadReport();
      this.mountLanguageMenu();
      const sut = document.getElementById('sut');
      if (sut && !sut.getAttribute('src')) sut.src = 'index.html';
      if (/autorun=1/.test(location.search)) this.runIds(CASES.map((c) => c.id));
    }
  };

  global.QALab = Lab;
})(window);
