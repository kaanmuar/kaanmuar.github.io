const { test, expect } = require('@playwright/test');
const auth = require('../functions/url-review-auth');

const ANA = 'a'.repeat(64);

const items = Array.from({ length: 6 }, (_, i) => ({ href: 'https://example.com/' + i, title: 'Headline ' + (i + 1), meta: 'Desk · ' + (i + 1) + 'h ago' }));

const TERMS = require('fs').readFileSync(require('path').join(__dirname, '../js/qa-review.js'), 'utf8').match(/TERMS_VERSION = "([^"]+)"/)[1];

async function prime(page, { terms = true } = {}) {
  await page.addInitScript(({ accepted, version }) => {
    try {
      if (accepted) sessionStorage.setItem('qa-review-terms', version);
      localStorage.setItem('hasSeenReviewTour', 'true');
      localStorage.setItem('qa-review-analytics', 'necessary');
      localStorage.setItem('cv-preferred-lang', 'en');
    } catch (e) { /* storage is optional */ }
  }, { accepted: terms, version: TERMS });
  await page.route(/\/news\?/, (route) => route.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ items }) }));
  await page.route(/ipwho\.is/, (route) => route.fulfill({ contentType: 'application/json', body: '{"success":false}' }));
}

test.describe('Review page top', () => {
  test('the wire, the hero, and the live reports come before the request', async ({ page }) => {
    await prime(page);
    await page.goto('/qa-review.html');
    const order = await page.evaluate(() => ['.wire', '.stage', '#live-reports', '#review-app'].map((s) => document.querySelector(s).getBoundingClientRect().top + scrollY));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    await expect(page.locator('.wire')).not.toHaveAttribute('inert', '');
    await expect(page.locator('.stage')).not.toHaveAttribute('inert', '');
  });

  test('the wire fills each row with no gap and pauses on hover', async ({ page }) => {
    await prime(page);
    await page.goto('/qa-review.html');
    await expect(page.locator('.wire-track.run')).toHaveCount(2);
    const rows = await page.evaluate(() => [...document.querySelectorAll('.wire-row')].map((row) => {
      const sets = row.querySelectorAll('.wire-set');
      return { sets: sets.length, same: sets[0].scrollWidth === sets[1].scrollWidth, covers: sets[0].scrollWidth >= row.clientWidth, hidden: sets[1].getAttribute('aria-hidden') };
    }));
    for (const row of rows) expect(row).toEqual({ sets: 2, same: true, covers: true, hidden: 'true' });
    const state = () => page.evaluate(() => getComputedStyle(document.querySelector('.wire-track')).animationPlayState);
    expect(await state()).toBe('running');
    await page.locator('.wire').hover();
    expect(await state()).toBe('paused');
  });

  test('live reports sit in two columns on wide screens and stack on narrow ones', async ({ page }) => {
    await prime(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/qa-review.html');
    await expect(page.locator('.live-card.is-active')).toBeVisible();
    const wide = await page.evaluate(() => {
      const f = document.querySelector('#live-filters').getBoundingClientRect();
      const s = document.querySelector('#live-stage').getBoundingClientRect();
      return { filtersLeft: f.right <= s.left, sideBySide: Math.abs(f.top - s.top) < s.height };
    });
    expect(wide).toEqual({ filtersLeft: true, sideBySide: true });
    await page.setViewportSize({ width: 1024, height: 900 });
    const narrow = await page.evaluate(() => document.querySelector('#live-filters').getBoundingClientRect().bottom <= document.querySelector('#live-stage').getBoundingClientRect().top);
    expect(narrow).toBe(true);
  });

  test('the hero link scrolls to live reports without covering the page', async ({ page }) => {
    await prime(page);
    await page.goto('/qa-review.html');
    await expect(page.locator('.live-card.is-active')).toBeVisible();
    await page.locator('.live-jump').click();
    await expect(page).toHaveURL(/#live-reports$/);
    await expect(page.locator('#gate')).toBeHidden();
  });
});

async function signedIn(page) {
  const store = auth.memoryStore();
  const started = await auth.startEmail(store, { email: 'ana@example.com', deviceKey: ANA, ip: '1.1.1.1' });
  const signed = await auth.finishEmail(store, { id: started.id, code: started.code, deviceKey: ANA });
  await page.addInitScript(({ session }) => {
    localStorage.setItem('qa-review-session', JSON.stringify({ session, email: 'ana@example.com', provider: 'email' }));
    localStorage.setItem('qa-review-device-key', JSON.stringify('a'.repeat(64)));
  }, { session: signed.session });
  return store;
}

// Records each call to the local review service; /auth/session answers from `store` when there is one.
async function backend(page, store, { providers = [] } = {}) {
  const calls = [];
  await page.route('http://127.0.0.1:8768/**', async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    const cors = { 'access-control-allow-origin': req.headers().origin || '*', 'access-control-allow-credentials': 'true', 'access-control-allow-headers': 'content-type' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: Object.assign({ 'access-control-allow-methods': 'GET,POST' }, cors) });
    calls.push(path);
    const json = (status, data) => route.fulfill({ status, contentType: 'application/json', headers: cors, body: JSON.stringify(data) });
    if (path === '/auth/session' && store) {
      const checked = await auth.checkSession(store, Object.assign({}, JSON.parse(req.postData() || '{}'), { deviceKey: ANA }));
      return json(checked.ok ? 200 : checked.status, checked);
    }
    if (path === '/auth/providers') return json(200, { providers });
    return json(503, { error: 'not in this test' });
  });
  return calls;
}

test.describe('Terms on submit (#1090)', () => {
  test('a first visit shows the hero, the request and live reports, with no terms in the way', async ({ page }) => {
    await prime(page, { terms: false });
    await page.goto('/qa-review.html');
    await expect(page.locator('#gate')).toBeHidden();
    await expect(page.locator('#studio-title')).toBeVisible();
    await expect(page.locator('#review-app')).not.toHaveAttribute('inert', '');
    await expect(page.locator('.live-card.is-active')).toBeVisible();
    await page.locator('#url').fill('example.com');
    await expect(page.locator('#url')).toHaveValue('example.com');
    await expect(page.locator('#stage-sample-open')).toBeVisible();
    await expect(page.locator('#stage-guide')).toHaveAttribute('href', 'qa-review-guide.html');
  });

  test('signing in asks for the terms first, and goes on once they are accepted', async ({ page }) => {
    await prime(page, { terms: false });
    const calls = await backend(page);
    await page.goto('/qa-review.html');
    await page.locator('#sign-in-email').fill('ana@example.com');
    await page.locator('#sign-in-send').click();
    await expect(page.locator('#gate')).toBeVisible();
    await expect(page.locator('#gate .gate-card')).toBeFocused();
    await expect(page.locator('#gate-waiting')).toBeHidden();
    await page.keyboard.press('Escape');
    await expect(page.locator('#gate')).toBeHidden();
    await expect(page.locator('#sign-in-send')).toBeFocused();
    expect(calls).not.toContain('/auth/email');

    await page.locator('#sign-in-send').click();
    await page.locator('#terms-all').check();
    const sent = page.waitForRequest((req) => req.url().endsWith('/auth/email') && req.method() === 'POST');
    await page.locator('#accept').click();
    await sent;
    await expect(page.locator('#gate')).toBeHidden();
  });

  test('a review asks for the terms with its address kept, and runs once they are accepted', async ({ page }) => {
    await prime(page, { terms: false });
    const store = await signedIn(page);
    await backend(page, store);
    await page.goto('/qa-review.html');
    await page.locator('#name').fill('Ana');
    await page.locator('#url').fill('example.com/docs');
    await expect(page.locator('#review-btn')).toBeEnabled();
    await page.locator('#review-btn').click();
    await expect(page.locator('#gate')).toBeVisible();
    await expect(page.locator('#gate-waiting')).toHaveText('The review of example.com/docs starts as soon as you accept.');
    await expect(page.locator('.stage')).toHaveAttribute('inert', '');
    await expect(page.locator('#form-status')).toHaveText('');

    await page.locator('#terms-all').check();
    await page.locator('#accept').click();
    await expect(page.locator('#gate')).toBeHidden();
    await expect(page.locator('.stage')).not.toHaveAttribute('inert', '');
    await expect(page.locator('#url')).toHaveValue('example.com/docs');
    await expect(page.locator('#form-status')).not.toHaveText('');
    expect(await page.evaluate(() => sessionStorage.getItem('qa-review-terms'))).toBe(TERMS);
  });

  test('a shared report opens without the terms', async ({ page }) => {
    await prime(page, { terms: false });
    const calls = await backend(page);
    await page.goto('/qa-review.html?report=cd34ef56ab12');
    await expect.poll(() => calls.includes('/review/open')).toBe(true);
    await expect(page.locator('#gate')).toBeHidden();
  });
});

test.describe('A first review from the hero (#2756)', () => {
  test('the hero takes the address and goes to sign-in, with the steps left named', async ({ page }) => {
    await prime(page, { terms: false });
    await backend(page);
    await page.goto('/qa-review.html');
    await expect(page.locator('#stage-url')).toBeInViewport();
    await expect(page.locator('#share-open')).toBeHidden();
    await page.locator('#stage-url').fill('https://example.com/docs');
    await page.locator('#stage-start button[type="submit"]').click();
    await expect(page.locator('#url')).toHaveValue('example.com/docs');
    await expect(page.locator('#sign-in-email')).toBeFocused();
    await expect(page.locator('#gate')).toBeHidden();
    await expect(page.locator('#req-page')).toHaveClass(/done/);
    await expect(page.locator('#review-needs button')).toHaveText(['2 You', '3 Why this review']);
    await page.locator('#review-needs button[data-step="why"]').click();
    await expect(page.locator('#reasons input[type="radio"]').first()).toBeFocused();
  });

  test('an empty hero field stays put', async ({ page }) => {
    await prime(page);
    await backend(page);
    await page.goto('/qa-review.html');
    await page.locator('#stage-start button[type="submit"]').click();
    await expect(page.locator('#stage-url')).toBeFocused();
  });

  test('Review can be pressed signed out: the terms come first, then it asks to sign in', async ({ page }) => {
    await prime(page, { terms: false });
    const calls = await backend(page);
    await page.goto('/qa-review.html');
    await page.locator('#url').fill('example.com');
    await expect(page.locator('#review-btn')).toBeEnabled();
    await page.locator('#review-btn').click();
    await expect(page.locator('#gate')).toBeVisible();
    await page.locator('#terms-all').check();
    await page.locator('#accept').click();
    await expect(page.locator('#form-status')).toHaveText(/^Sign in above to run a review/);
    await expect(page.locator('#sign-in-email')).toBeFocused();
    expect(calls).not.toContain('/review');
  });

  test('every step reads done once signed in with a name and a reason, and the steps line goes away', async ({ page }) => {
    await prime(page);
    const store = await signedIn(page);
    await backend(page, store);
    await page.goto('/qa-review.html');
    await expect(page.locator('#sign-in-done')).toBeVisible();
    await page.locator('#url').fill('example.com');
    await page.locator('#name').fill('Ana');
    await page.locator('#reasons input[type="radio"]').first().check();
    await expect(page.locator('#review-needs')).toBeHidden();
  });

  test('a first visit stays on the hero: the tour waits for its button', async ({ page }) => {
    await prime(page);
    await page.addInitScript(() => localStorage.removeItem('hasSeenReviewTour'));
    await backend(page);
    await page.goto('/qa-review.html');
    await page.waitForTimeout(2500);
    await expect(page.locator('#site-tour-tooltip')).toHaveCount(0);
    expect(await page.evaluate(() => scrollY)).toBe(0);
    await page.locator('#tour-start-btn').click();
    await expect(page.locator('#site-tour-tooltip')).toBeVisible();
  });

  test('the sample report takes focus, and Escape closes it back to its button', async ({ page }) => {
    await prime(page);
    await backend(page);
    await page.goto('/qa-review.html');
    await page.locator('#stage-sample-open').click();
    await expect(page.locator('#dash-overlay')).toHaveClass(/open/);
    await expect(page.locator('.dash-modal')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('#dash-overlay')).not.toHaveClass(/open/);
    await expect(page.locator('#stage-sample-open')).toBeFocused();
  });

  test('on a phone the terms open at the top, Accept comes into view once all are ticked, and Close stays on screen in a report', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await prime(page, { terms: false });
    await backend(page);
    await page.goto('/qa-review.html');
    await page.locator('#url').fill('example.com');
    await page.locator('#review-btn').click();
    await expect(page.locator('#gate-close')).toBeInViewport();
    await page.locator('#terms-all').check();
    await expect(page.locator('#accept')).toBeInViewport();
    await page.keyboard.press('Escape');
    await page.locator('#stage-sample-open').click();
    await expect(page.locator('#dash-overlay')).toHaveClass(/open/);
    await page.locator('#dash-overlay').evaluate((el) => { el.scrollTop = 3000; });
    await expect(page.locator('#dash-close')).toBeInViewport();
  });

  test('each language page carries the hero field and its own steps line', async ({ page }) => {
    const lead = { es: 'Falta antes de Revisar', pt: 'Falta antes de Revisar', de: 'Noch offen vor „Prüfen“', fr: 'Reste à remplir avant Analyser', it: 'Manca prima di Analizza' };
    for (const lang of Object.keys(lead)) {
      await prime(page);
      await backend(page);
      await page.goto('/qa-review-' + lang + '.html');
      await expect(page.locator('#stage-url')).toBeVisible();
      await expect(page.locator('#review-needs')).toContainText(lead[lang]);
      await expect(page.locator('#log-next li').first()).toHaveAttribute('lang', lang);
    }
  });
});

test.describe('The You step (#2769)', () => {
  test('one Email field shows, signed out and signed in', async ({ page }) => {
    await prime(page);
    await backend(page);
    await page.goto('/qa-review.html');
    await expect(page.locator('#req-you input[type="email"]:visible')).toHaveCount(1);
    await expect(page.locator('#sign-in-email')).toBeVisible();

    const store = await signedIn(page);
    await backend(page, store);
    await page.reload();
    await expect(page.locator('#sign-in-done')).toBeVisible();
    await expect(page.locator('#req-you input[type="email"]:visible')).toHaveCount(0);
    await expect(page.locator('#sign-in-who')).toHaveText('ana@example.com');
    await expect(page.locator('#email')).toHaveValue('ana@example.com');
  });

  test('a mailbox at another domain than the site, for a review of your own site, shows its error', async ({ page }) => {
    await prime(page);
    const store = await signedIn(page);
    await backend(page, store);
    await page.goto('/qa-review.html');
    await expect(page.locator('#sign-in-done')).toBeVisible();
    await page.locator('#url').fill('carlosandmunoz.com');
    await page.locator('#name').fill('Ana');
    await page.locator('#reasons input[value="own"]').check();
    await expect(page.locator('#own-note')).toBeVisible();
    await page.locator('#review-btn').click();
    await expect(page.locator('#email-error')).toBeVisible();
    await expect(page.locator('#email-error')).toHaveText(/^Use an email at the same domain as the site\./);
  });

  test('the Google note is short and links to the full list in the disclaimers', async ({ page }) => {
    await prime(page);
    await backend(page, null, { providers: [{ id: 'email' }, { id: 'google.com', oauth: true }] });
    await page.goto('/qa-review.html');
    const note = page.locator('#sign-in-google-note');
    await expect(note).toBeVisible();
    await expect(note).toHaveText('Google shares your profile details, which your account keeps; the full list is in the disclaimers. To share only your address, use email.');
    await note.getByRole('link', { name: 'disclaimers' }).click();
    await expect(page).toHaveURL(/\/qa-review-legal\.html#personal-data$/);
    await expect(page.locator('#personal-data')).toHaveText('Personal data of the person who asks');
    await expect(page.locator('#personal-data')).toBeInViewport();
  });
});

async function providers(page, list, answers = {}) {
  await page.route(/127\.0\.0\.1:8768\/auth\/(providers|email)$/, (route) => {
    const req = route.request();
    const cors = { 'access-control-allow-origin': req.headers().origin || '*', 'access-control-allow-headers': 'content-type' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: Object.assign({ 'access-control-allow-methods': 'GET,POST' }, cors) });
    const path = new URL(req.url()).pathname;
    const [status, body] = path === '/auth/providers' ? [200, { providers: list }] : answers[path] || [503, { error: 'not in this test' }];
    return route.fulfill({ status, contentType: 'application/json', headers: cors, body: JSON.stringify(body) });
  });
}

test.describe('The tour and the sign-in box in the page language (#2768)', () => {
  const PROVIDERS = [{ id: 'email' }, { id: 'google.com' }, { id: 'microsoft.com', oauth: true }];

  test('on the Spanish page the provider buttons, the sign-in messages and the tour read in Spanish', async ({ page }) => {
    await prime(page);
    await page.addInitScript(() => localStorage.removeItem('hasSeenReviewTour'));
    await backend(page);
    await providers(page, PROVIDERS, { '/auth/email': [400, { error: 'This address cannot receive email. Check it for typos.', field: 'email' }] });
    await page.goto('/qa-review-es.html');
    await expect(page.locator('#sign-in-providers button')).toHaveText(['Continuar con Google', 'Continuar con Microsoft']);

    await page.locator('#sign-in-send').click();
    await expect(page.locator('#sign-in-status')).toHaveText('Escribe tu correo.');
    await page.locator('#sign-in-email').fill('ana@example.invalid');
    await page.locator('#sign-in-send').click();
    await expect(page.locator('#sign-in-status')).toHaveText('Esta dirección no puede recibir correos. Revisa que esté bien escrita.');

    await page.locator('#tour-start-btn').click();
    await expect(page.locator('#site-tour-title')).toHaveText(/^(No eres el primero|Iniciar sesión)$/);
    await expect(page.locator('#site-tour-close')).toHaveText('Cerrar');
    await expect(page.locator('#site-tour-next')).toHaveText('Siguiente');
    await expect(page.locator('#site-tour-step-label')).toHaveText(/^Paso 1 de \d+\.$/);
    await expect(page.locator('#site-tour-progress')).toHaveAttribute('aria-label', 'Progreso del paso');
    await page.locator('#site-tour-next').click({ timeout: 4000 });
    await expect(page.locator('#site-tour-back')).toHaveText('Atrás');
    await expect(page.locator('#site-tour-step-label')).toHaveText(/^Paso 2 de \d+\.$/);
  });

  test('each language page names its provider buttons and its tour buttons in its own language', async ({ page }) => {
    test.setTimeout(120000);
    const words = {
      es: ['Continuar con Google', 'Cerrar', 'Siguiente'], pt: ['Continuar com Google', 'Fechar', 'Próximo'], de: ['Weiter mit Google', 'Schließen', 'Weiter'],
      fr: ['Continuer avec Google', 'Fermer', 'Suivant'], it: ['Continua con Google', 'Chiudi', 'Avanti']
    };
    await prime(page);
    await backend(page);
    await providers(page, PROVIDERS.slice(0, 2));
    for (const [lang, [button, close, next]] of Object.entries(words)) {
      await page.goto('/qa-review-' + lang + '.html');
      await expect(page.locator('#sign-in-providers button')).toHaveText([button]);
      await page.locator('#tour-start-btn').click();
      await expect(page.locator('#site-tour-close')).toHaveText(close);
      await expect(page.locator('#site-tour-next')).toHaveText(next);
    }
  });

  test('the English page keeps its English tour and buttons', async ({ page }) => {
    await prime(page);
    await backend(page);
    await providers(page, PROVIDERS.slice(0, 2));
    await page.goto('/qa-review.html');
    await expect(page.locator('#sign-in-providers button')).toHaveText(['Continue with Google']);
    await page.locator('#tour-start-btn').click();
    await expect(page.locator('#site-tour-title')).toHaveText(/^(You are not the first|Sign in)$/);
    await expect(page.locator('#site-tour-close')).toHaveText('Close');
    await expect(page.locator('#site-tour-step-label')).toHaveText(/^Step 1 of \d+\.$/);
  });
});

test.describe('Report section index (#2770)', () => {
  async function openSample(page, path = '/qa-review.html') {
    await prime(page);
    await backend(page);
    await page.goto(path);
    await page.locator('#stage-sample-open').click();
    await expect(page.locator('#report-index')).toBeVisible();
  }

  const shownSections = (page) => page.evaluate(() => [...document.querySelectorAll('#report .fold-toggle')]
    .filter((button) => button.getClientRects().length).map((button) => button.textContent.trim()));

  test('the sample report lists only the sections it shows, and an entry takes focus to its heading below the toolbar', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openSample(page);
    const entries = await page.locator('#report-index a').allTextContents();
    expect(entries).toEqual(await shownSections(page));
    expect(entries).toContain('Security and email');
    expect(entries).not.toContain('Tools that apply');
    expect(entries).not.toContain('A login you are allowed to use');
    await expect(page.locator('#report-top')).toBeHidden();

    await page.locator('#report-index a', { hasText: 'Security and email' }).click();
    const heading = page.locator('#report h2', { hasText: 'Security and email' });
    await expect(heading.locator('.fold-toggle')).toBeFocused();
    await expect(heading).toBeInViewport();
    await expect.poll(() => page.evaluate(() => {
      const top = [...document.querySelectorAll('#report h2')].find((h) => h.textContent.trim() === 'Security and email').getBoundingClientRect().top;
      return top >= document.querySelector('#dash-overlay .report-toolbar').getBoundingClientRect().bottom && top < 200;
    })).toBe(true);

    await page.locator('#report-top').click();
    await expect.poll(() => page.locator('#dash-overlay').evaluate((el) => el.scrollTop)).toBe(0);
    await expect(page.locator('#report-index a').first()).toBeFocused();
    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('#report-index')).toBeHidden();
  });

  test('a collapsed section opens when its entry is chosen', async ({ page }) => {
    await openSample(page);
    await page.locator('#fold-all').click();
    await page.locator('#report-index a', { hasText: 'Fix kit' }).click();
    await expect(page.locator('#fixkit')).toBeVisible();
    await expect(page.locator('#report h2', { hasText: 'Fix kit' }).locator('.fold-toggle')).toHaveAttribute('aria-expanded', 'true');
  });

  test('on a phone the index scrolls sideways, its entries and filters are tappable, and a heading lands below Close', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openSample(page);
    const list = await page.locator('#report-index-list').evaluate((el) => ({ rows: new Set([...el.children].map((li) => li.offsetTop)).size, scrolls: el.scrollWidth > el.clientWidth }));
    expect(list).toEqual({ rows: 1, scrolls: true });
    const heights = await page.evaluate(() => [...document.querySelectorAll('#report-index a, #report .filters button')]
      .filter((el) => el.getClientRects().length).map((el) => el.getBoundingClientRect().height));
    expect(Math.min(...heights)).toBeGreaterThanOrEqual(32);

    await page.locator('#report-index a', { hasText: 'Every check, with its verdict' }).click();
    await expect(page.locator('#report h2', { hasText: 'Every check, with its verdict' }).locator('.fold-toggle')).toBeFocused();
    await expect.poll(() => page.evaluate(() => {
      const top = [...document.querySelectorAll('#report h2')].find((h) => h.textContent.trim() === 'Every check, with its verdict').getBoundingClientRect().top;
      return top >= document.getElementById('dash-close').getBoundingClientRect().bottom && top < 200;
    })).toBe(true);
    await expect(page.locator('#report-top')).toBeInViewport();
  });

  test('each language page labels the index and its entries in its language', async ({ page }) => {
    const copy = {
      es: ['En este informe', 'Resumen en una página', 'De un vistazo'],
      pt: ['Neste relatório', 'Resumo em uma página', 'Visão geral'],
      de: ['In diesem Bericht', 'Zusammenfassung auf einer Seite', 'Auf einen Blick'],
      fr: ['Dans ce rapport', 'Résumé sur une page', 'En un coup d’œil'],
      it: ['In questo report', 'Riepilogo in una pagina', 'In breve']
    };
    for (const [lang, [label, first, glance]] of Object.entries(copy)) {
      await openSample(page, '/qa-review-' + lang + '.html');
      await expect(page.locator('#report-index-label')).toHaveText(label);
      await expect(page.locator('#report-index a').first()).toHaveText(first);
      await expect(page.locator('#report-index a', { hasText: glance })).toHaveCount(1);
      expect(await page.locator('#report-index a').allTextContents()).toEqual(await shownSections(page));
    }
  });
});
