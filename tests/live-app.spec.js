const { test, expect } = require('@playwright/test');

// live.html: the Live reports ring on its own, as a Telegram Mini App and in the Reddit app (#2549).
// telegram.org is stubbed: the Mini App script only exists inside Telegram's web view.
function telegram(page, { lang = 'es', start = '' } = {}) {
  return page.route('https://telegram.org/**', (route) => route.fulfill({
    contentType: 'text/javascript',
    body: `window.__tg = { opened: [], back: false, onBack: null, swipes: true };
      window.Telegram = { WebApp: {
        initData: 'query_id=x', initDataUnsafe: { user: { language_code: ${JSON.stringify(lang)} }, start_param: ${JSON.stringify(start)} },
        isVersionAtLeast: () => true, ready() {}, expand() {}, setHeaderColor() {}, setBackgroundColor() {}, setBottomBarColor() {},
        disableVerticalSwipes() { __tg.swipes = false; },
        openLink(url) { __tg.opened.push(url); }, openTelegramLink(url) { __tg.opened.push(url); },
        BackButton: { show() { __tg.back = true; }, hide() { __tg.back = false; }, onClick(fn) { __tg.onBack = fn; } }
      } };`
  }));
}

function watch(page) {
  const errors = [];
  page.on('console', (msg) => { if (/Content Security Policy|Refused to/i.test(msg.text())) errors.push(msg.text()); });
  page.on('pageerror', (err) => errors.push('pageerror ' + err.message));
  return errors;
}

test.describe('Live reports app page', () => {
  test('on the web it shows the ring, and filters fold away on phones', async ({ page }) => {
    const errors = watch(page);
    await page.route('https://telegram.org/**', (route) => route.fulfill({ contentType: 'text/javascript', body: '' }));
    await page.setViewportSize({ width: 390, height: 760 });
    await page.goto('/live.html');
    await expect(page.locator('#live-reports .live-card:not([hidden])').first()).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-live-host', 'web');
    await expect(page.locator('.live-filters')).toBeHidden();
    await page.locator('[data-lapp-filters] > summary').click();
    await expect(page.locator('.live-filters')).toBeVisible();
    await expect(page.locator('.live-next')).toBeInViewport();
    expect(errors).toEqual([]);
  });

  test('in Telegram it speaks the user language, opens the startapp report, and leaves through Telegram', async ({ page }) => {
    const errors = watch(page);
    await telegram(page, { lang: 'es', start: 'govuk' });
    await page.goto('/live.html');
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
    await expect(page.locator('html')).toHaveAttribute('data-live-host', 'telegram');
    await expect(page.locator('#lv-name')).toHaveText('GOV.UK');
    expect(await page.evaluate(() => ({ back: __tg.back, swipes: __tg.swipes }))).toEqual({ back: true, swipes: false });

    await page.locator('.lv-host a').click();
    expect(await page.evaluate(() => __tg.opened.pop())).toBe('https://www.gov.uk/');
    await page.locator('[data-act="native"]').click();
    expect(await page.evaluate(() => __tg.opened.pop())).toMatch(/^https:\/\/t\.me\/share\/url\?url=https%3A%2F%2Ft\.me%2Fqalab_live_bot%2Flive%3Fstartapp%3Dgovuk&/);
    await page.locator('[data-act="own"]').click();
    expect(await page.evaluate(() => __tg.opened.pop())).toBe('https://carlosandmunoz.com/qa-review-es.html?utm_source=telegram&utm_medium=app&utm_campaign=live-reports#intake');

    await page.evaluate(() => __tg.onBack());
    await expect(page.locator('#lv-name')).toBeHidden();
    expect(await page.evaluate(() => __tg.back)).toBe(false);
    expect(errors).toEqual([]);
  });

  test('a host that sets LIVE_HOST_OPEN, like the Reddit app, gets every link', async ({ page }) => {
    await page.route('https://telegram.org/**', (route) => route.fulfill({ contentType: 'text/javascript', body: '' }));
    // reddit/live-reports/scripts/build.mjs marks its copy of live.html the same way.
    await page.route('**/live.html?*', async (route) => {
      const res = await route.fetch();
      route.fulfill({ response: res, body: (await res.text()).replace('<html lang="en">', '<html lang="en" data-live-host="reddit">') });
    });
    await page.addInitScript(() => {
      window.__opened = [];
      window.LIVE_HOST_OPEN = (url) => window.__opened.push(url);
    });
    await page.goto('/live.html?live=govuk');
    await expect(page.locator('#lv-name')).toHaveText('GOV.UK');
    await page.locator('[data-act="net"][data-net="linkedin"]').click();
    expect(await page.evaluate(() => window.__opened.pop())).toMatch(/^https:\/\/www\.linkedin\.com\/sharing\/share-offsite\/\?url=https%3A%2F%2Fcarlosandmunoz\.com%2Fqa-review\.html%3Flive%3Dgovuk/);
    await expect(page).toHaveURL(/live\.html/);
  });
});
