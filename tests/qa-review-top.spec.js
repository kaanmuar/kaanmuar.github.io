const { test, expect } = require('@playwright/test');

const items = Array.from({ length: 6 }, (_, i) => ({ href: 'https://example.com/' + i, title: 'Headline ' + (i + 1), meta: 'Desk · ' + (i + 1) + 'h ago' }));

async function prime(page, { terms = true } = {}) {
  await page.addInitScript((accepted) => {
    try {
      if (accepted) sessionStorage.setItem('qa-review-terms', '2026-10-21');
      localStorage.setItem('hasSeenReviewTour', 'true');
      localStorage.setItem('qa-review-analytics', 'necessary');
      localStorage.setItem('cv-preferred-lang', 'en');
    } catch (e) { /* storage is optional */ }
  }, terms);
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
    await expect(page.locator('#live-reports.is-docked')).toHaveCount(0);
  });
});
