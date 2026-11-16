// Every guided tour, walked step by step on a phone and a desktop: each step's target has to be on the page, visible and scrolled into view (#3332).
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { test, expect } = require('./net-guard');
const { skipSiteTours, openCV } = require('./helpers.js');

const TERMS = fs.readFileSync(path.join(__dirname, '../js/qa-review.js'), 'utf8').match(/TERMS_VERSION = "([^"]+)"/)[1];
const SCREENS = { phone: { width: 390, height: 844 }, desktop: { width: 1280, height: 800 } };
const LANGS = ['en', 'es', 'pt', 'de', 'fr', 'it'];

async function primeReview(page) {
  await page.addInitScript((version) => {
    try {
      sessionStorage.setItem('qa-review-terms', version);
      localStorage.setItem('hasSeenReviewTour', 'true');
      localStorage.setItem('qa-review-analytics', 'necessary');
      localStorage.setItem('cv-preferred-lang', 'en');
    } catch (e) { /* storage is optional */ }
  }, TERMS);
  await page.route(/\/news\?/, (route) => route.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"items":[]}' }));
  await page.route('http://127.0.0.1:8768/**', (route) => route.fulfill({ status: 503, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"error":"not in this test"}' }));
}

// At least 24px of the target (or all of a smaller one) shows between a sticky top bar and, on a phone, the tour card pinned to the bottom.
function uncovered(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    const rect = el.getBoundingClientRect();
    let top = 0;
    document.querySelectorAll('body > header, .topbar').forEach((bar) => {
      const pos = getComputedStyle(bar).position;
      if ((pos !== 'fixed' && pos !== 'sticky') || bar.contains(el)) return;
      const box = bar.getBoundingClientRect();
      if (box.top <= 1) top = Math.max(top, box.bottom);
    });
    if (getComputedStyle(el).position === 'fixed') top = 0;
    const bottom = innerWidth < 768 ? document.getElementById('site-tour-tooltip').getBoundingClientRect().top : innerHeight;
    return Math.min(rect.bottom, bottom) - Math.max(rect.top, top) >= Math.min(rect.height, 24) - 1;
  }, selector);
}

// Keeps the options SiteTour.start receives, then steps with SiteTour.next() so the demo hold does not slow the walk.
async function walkSiteTour(page) {
  await page.evaluate(() => {
    const start = window.SiteTour.start;
    window.SiteTour.start = function (options) {
      window.__tourOptions = options;
      return start.call(this, options);
    };
  });
  await page.locator('#tour-start-btn').filter({ visible: true }).first().click();
  await expect(page.locator('#site-tour-tooltip')).toBeVisible();
  const steps = await page.evaluate(() => window.__tourOptions.steps.map((step) => ({ selector: step.selector, title: step.title, body: step.body })));
  expect(steps.length).toBeGreaterThan(0);
  for (let i = 0; i < steps.length; i += 1) {
    const { selector, title, body } = steps[i];
    if (i) await page.evaluate(() => window.SiteTour.next());
    await expect(page.locator('#site-tour-title'), 'step ' + (i + 1)).toHaveText(title);
    expect(body.trim().length, 'step ' + (i + 1) + ' body').toBeGreaterThan(0);
    const target = page.locator(selector).first();
    await expect(target, 'step ' + (i + 1) + ' "' + title + '" targets ' + selector).toBeVisible();
    await expect(target, 'step ' + (i + 1) + ' "' + title + '" scrolls ' + selector + ' into view').toBeInViewport();
    await expect(page.locator('.site-tour-hit'), 'step ' + (i + 1) + ' highlights its target').toHaveCount(1);
    await expect.poll(() => uncovered(page, selector), { message: 'step ' + (i + 1) + ' "' + title + '": ' + selector + ' stays clear of the top bar and the tour card' }).toBe(true);
  }
  return steps;
}

for (const [screen, viewport] of Object.entries(SCREENS)) {
  test.describe('Tour targets on a ' + screen, () => {
    test.use({ viewport, hasTouch: screen === 'phone', isMobile: screen === 'phone' });

    test('the URL review tour points at real, visible controls', async ({ page }) => {
      test.setTimeout(90000);
      await primeReview(page);
      await page.goto('/qa-review.html');
      const steps = await walkSiteTour(page);
      const titles = steps.map((step) => step.title);
      for (const title of ['What every report checks', 'Ask us to fix it', 'If a review cannot finish']) expect(titles).toContain(title);
    });

    test('the QA Lab tour points at real, visible controls', async ({ page }) => {
      test.setTimeout(90000);
      await skipSiteTours(page);
      await page.addInitScript(() => localStorage.setItem('cv-preferred-lang', 'en'));
      await page.goto('/qa-lab.html');
      await walkSiteTour(page);
    });

    test('the studio tour points at real, visible controls', async ({ page }) => {
      test.setTimeout(90000);
      await skipSiteTours(page);
      await page.goto('/simulador.html');
      await walkSiteTour(page);
    });

    // The CV tour runs its own engine with long demos, so its targets are checked in place, and a step whose target has no box must be skipped.
    test('the CV tour names elements that are on the page, and skips the ones not shown', async ({ page }) => {
      await openCV(page);
      const steps = await page.evaluate(() => window.CarlosMunozCV.tourSteps.map((step) => {
        const selector = typeof step.element === 'function' ? step.element.call(window.CarlosMunozCV) : step.element;
        const el = document.querySelector(selector);
        return { selector, exists: !!el, shown: !!el && el.getClientRects().length > 0 };
      }));
      expect(steps.length).toBeGreaterThan(0);
      for (const { selector, exists, shown } of steps) {
        expect(exists, 'CV tour targets ' + selector).toBe(true);
        if (!shown) continue;
        const target = page.locator(selector).first();
        await target.scrollIntoViewIfNeeded();
        await expect(target, 'CV tour targets ' + selector).toBeVisible();
      }
      const hidden = steps.findIndex((step) => !step.shown);
      if (hidden < 0) return;
      const landed = await page.evaluate((i) => {
        const cv = window.CarlosMunozCV;
        cv.startTour();
        cv.state.tourDemoReady = true;
        cv.state.currentTourStep = i;
        cv.showTourStep(i, false);
        const forward = cv.state.currentTourStep;
        cv.state.currentTourStep = i + 1;
        cv.prevTourStep();
        return { forward, back: cv.state.currentTourStep };
      }, hidden);
      expect(landed.forward, 'Next skips the hidden ' + steps[hidden].selector).toBeGreaterThan(hidden);
      expect(landed.back, 'Back skips the hidden ' + steps[hidden].selector).toBeLessThan(hidden);
    });
  });
}

test('the URL review tour copy has every step in all six languages', () => {
  const source = fs.readFileSync(path.join(__dirname, '../js/qa-review-report-copy.js'), 'utf8');
  const tours = {};
  for (const lang of LANGS) {
    const sandbox = { window: {}, document: { documentElement: { lang }, querySelectorAll: () => [] } };
    vm.runInNewContext(source, sandbox);
    const copy = sandbox.window.QAReviewReportCopy;
    tours[lang] = copy;
  }
  const keys = ['terms', 'counts', 'signIn', 'name', 'reasons', 'url', 'frameworks', 'scope', 'start', 'log', 'stop', 'report', 'checks', 'fix', 'promise', 'ask', 'compare', 'chatbot', 'account', 'lang', 'again'];
  for (const lang of LANGS) {
    for (const key of keys) {
      const pair = tours[lang].word('tour', key);
      expect(Array.isArray(pair) && pair.length === 2 && pair.every((text) => text.trim().length > 0), lang + ' tour.' + key).toBe(true);
      if (lang !== 'en') expect(pair[1], lang + ' tour.' + key + ' is translated').not.toBe(tours.en.word('tour', key)[1]);
    }
  }
});
