const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { openCV, openAdmin, prepareCV, skipSiteTours, runAxe } = require('./helpers.js');

test.describe('Accessibility', () => {
  test('CV has no serious WCAG 2 A/AA axe violations outside the widget', async ({ page }) => {
    await openCV(page, { theme: 'light' });
    const results = await runAxe(page, { exclude: ['#contact-widget', '.skiptranslate'] });
    const serious = results.violations.filter((v) => ['serious', 'critical'].includes(v.impact));
    expect(serious, JSON.stringify(serious.map((v) => v.id))).toEqual([]);
  });

  test('primary landmark and skippable name heading exist', async ({ page }) => {
    await openCV(page);
    await expect(page.locator('main.main-content, main')).toHaveCount(1);
    await expect(page.getByRole('heading', { name: /Carlos/i }).first()).toBeVisible();
  });

  test('interactive controls are keyboard-focusable', async ({ page }) => {
    await openCV(page);
    await page.locator('#theme-toggle').focus();
    await expect(page.locator('#theme-toggle')).toBeFocused();
    await page.keyboard.press('Tab');
  });

  test('images that convey content have accessible names', async ({ page }) => {
    await openCV(page);
    await expect(page.locator('#profile-photo')).toHaveAttribute('alt', /.+/);
  });

  test('CV tour card is a labelled dialog and takes focus', async ({ page }) => {
    await openCV(page);
    await page.locator('#tour-start-btn').first().click();
    const card = page.locator('#tour-tooltip');
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute('role', 'dialog');
    await expect(card).toBeFocused();
    await expect(page.locator('#tour-title')).not.toHaveText('');
    await expect(page.locator('#tour-description')).not.toHaveText('');
    await expect(page.locator('#tour-close-btn')).toHaveText('Close');
    await expect(page.locator('#tour-next-btn')).toHaveText('Next');
    const tourAxe = await runAxe(page, { include: '#tour-tooltip', contrast: true });
    const serious = tourAxe.violations.filter((v) => ['serious', 'critical'].includes(v.impact));
    expect(serious, JSON.stringify(serious.map((v) => v.id))).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(card).toBeHidden();
  });

  test('studio tour card is a labelled dialog and takes focus', async ({ page }) => {
    await page.addInitScript(() => sessionStorage.setItem('hasSeenStudioTour', 'true'));
    await page.goto('/simulador.html');
    await page.locator('#tour-start-btn').click();
    const card = page.locator('#site-tour-tooltip');
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute('role', 'dialog');
    await expect(card).toBeFocused();
    await expect(page.locator('#site-tour-title')).toHaveText('Sprint views');
    await expect(page.locator('#site-tour-body')).not.toHaveText('');
    await page.keyboard.press('Escape');
    await expect(card).toBeHidden();
  });

  test('lab tour card is a labelled dialog and takes focus', async ({ page }) => {
    await page.addInitScript(() => {
      sessionStorage.setItem('hasSeenLabTour', 'true');
      sessionStorage.setItem('qa-lab-fw-asked', '1');
    });
    await page.goto('/qa-lab.html');
    await page.locator('#tour-start-btn').click();
    const card = page.locator('#site-tour-tooltip');
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute('role', 'dialog');
    await expect(card).toBeFocused();
    await expect(page.locator('#site-tour-title')).toHaveText('The catalog');
    await expect(page.locator('#site-tour-body')).not.toHaveText('');
    await page.keyboard.press('Escape');
    await expect(card).toBeHidden();
  });

  test('admin login form has labels', async ({ page }) => {
    await openAdmin(page);
    await expect(page.locator('label[for="email"]')).toBeVisible();
    await expect(page.locator('label[for="password"]')).toBeVisible();
  });
});

const REVIEW_TERMS = fs.readFileSync(path.join(__dirname, '../js/qa-review.js'), 'utf8').match(/TERMS_VERSION = "([^"]+)"/)[1];

function primeReview(page, { terms = true } = {}) {
  return page.addInitScript(({ accepted, version }) => {
    try {
      if (accepted) sessionStorage.setItem('qa-review-terms', version);
      localStorage.setItem('hasSeenReviewTour', 'true');
      localStorage.setItem('qa-review-analytics', 'necessary');
      localStorage.setItem('cv-preferred-lang', 'en');
    } catch (e) { /* storage is optional */ }
  }, { accepted: terms, version: REVIEW_TERMS });
}

test.describe('Skip link', () => {
  const pages = [
    { url: '/index.html', text: 'Skip to main content', target: '#main' },
    { url: '/qa-lab.html', text: 'Skip to main content', target: '#lab-tools' },
    { url: '/simulador.html', text: 'Skip to main content', target: '#main' },
    { url: '/qa-review.html', text: 'Skip to main content', target: '#review-app' },
    { url: '/qa-review-guide.html', text: 'Skip to main content', target: '#main' },
    { url: '/accessibility.html', text: 'Skip to main content', target: '#main' },
    { url: '/qa-review-social-de.html', text: 'Zum Hauptinhalt springen', target: '#main' },
    { url: '/media/sdlc-studio-tour.html', text: 'Skip to main content', target: '#main' }
  ];

  for (const { url, text, target } of pages) {
    test(`${url} starts with a skip link to the main content`, async ({ page }) => {
      if (url === '/index.html') await prepareCV(page);
      else await skipSiteTours(page);
      await primeReview(page);
      await page.goto(url);
      await page.locator(target).waitFor({ state: 'attached' });
      const link = page.locator('.skip-link');
      await expect(link).toHaveCount(1);
      await expect(link).not.toBeInViewport();
      await page.keyboard.press('Tab');
      await expect(link).toBeFocused();
      await expect(link).toBeInViewport();
      await expect(link).toHaveText(text);
      await page.keyboard.press('Enter');
      await expect(page.locator(target)).toBeFocused();
    });
  }

  test('the CV skip link follows the chosen language', async ({ page }) => {
    await openCV(page);
    await page.evaluate(() => window.CarlosMunozCV._handleLanguageChange('fr'));
    await expect(page.locator('.skip-link')).toHaveText('Aller au contenu principal');
  });

  test('the review skip link goes to the disclaimers while they are shown', async ({ page }) => {
    await primeReview(page, { terms: false });
    await page.goto('/qa-review-es.html');
    await expect(page.locator('#gate')).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(page.locator('.skip-link')).toHaveText('Saltar al contenido principal');
    await page.keyboard.press('Enter');
    await expect(page.locator('#gate .gate-card')).toBeFocused();
  });

  test('the skip link has enough contrast in light and dark themes', async ({ page }) => {
    await skipSiteTours(page);
    await page.goto('/accessibility.html');
    for (const dark of [false, true]) {
      await page.evaluate((on) => document.documentElement.classList.toggle('dark-mode', on), dark);
      await page.locator('.skip-link').focus();
      const results = await runAxe(page, { include: '.skip-link', contrast: true });
      expect(results.violations.map((v) => v.id), dark ? 'dark' : 'light').toEqual([]);
    }
  });
});

test.describe('Language menu by keyboard', () => {
  for (const url of ['/qa-review-guide.html', '/qa-review-legal.html', '/accessibility.html', '/qa-lab.html', '/simulador.html']) {
    test(`${url} language menu works with the keyboard alone`, async ({ page }) => {
      await skipSiteTours(page);
      await page.goto(url);
      const toggle = page.locator('#langToggle');
      const options = page.locator('#langMenu button');
      await expect(options.first()).toBeAttached();
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await expect(toggle).toHaveAttribute('aria-controls', 'langMenu');
      await toggle.focus();
      await page.keyboard.press('Enter');
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      await expect(page.locator('#langMenu')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await expect(page.locator('#langMenu')).toBeHidden();
      await expect(toggle).toBeFocused();
      await page.keyboard.press('ArrowDown');
      await expect(options.first()).toBeFocused();
      await page.keyboard.press('ArrowDown');
      await expect(options.nth(1)).toBeFocused();
      await page.keyboard.press('End');
      await expect(options.last()).toBeFocused();
      await page.keyboard.press('ArrowDown');
      await expect(options.first()).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(toggle).toBeFocused();
      await expect(page.locator('#langMenu')).toBeHidden();
    });
  }

  test('a review language is chosen with Tab, the arrows, and Enter', async ({ page }) => {
    await primeReview(page);
    await page.goto('/qa-review.html');
    const toggle = page.locator('#langToggle');
    await toggle.focus();
    await page.keyboard.press('Space');
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Tab');
    await expect(page.locator('#langMenu .lang-search')).toBeFocused();
    await page.keyboard.type('Deutsch');
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('#langMenu button[lang="de"]')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/qa-review-de\.html\?lang=de$/);
  });

  test('tabbing out of the language menu closes it', async ({ page }) => {
    await skipSiteTours(page);
    await page.goto('/qa-review-guide.html');
    await page.locator('#langToggle').focus();
    await page.keyboard.press('Enter');
    const options = page.locator('#langMenu button');
    await page.keyboard.press('Tab');
    await expect(options.first()).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Shift+Tab');
    await expect(page.locator('#langMenu')).toBeHidden();
  });
});

test.describe('Reduced motion', () => {
  test('the studio scan does not animate when reduced motion is asked for', async ({ page }) => {
    await skipSiteTours(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/simulador.html');
    const card = page.locator('.ticket').first();
    await expect(card).toBeVisible();
    const running = () => page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').map((a) => a.animationName || a.constructor.name));
    await page.evaluate(() => { scanElement(document.querySelector('.ticket'), 1500); });
    await expect(card).toHaveClass(/scanning/);
    expect(await running()).toEqual([]);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.waitForTimeout(1600);
    await page.evaluate(() => { scanElement(document.querySelector('.ticket'), 1500); });
    await expect.poll(running).toContain('laserSweep');
  });
});
