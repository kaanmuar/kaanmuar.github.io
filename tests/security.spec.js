const { test, expect } = require('@playwright/test');
const { openCV, openAdmin, skipSiteTours } = require('./helpers.js');

test.describe('Security and SEO', () => {
  test('robots.txt allows the CV and disallows admin, tests, and cypress', async ({ request }) => {
    const res = await request.get('/robots.txt');
    expect(res.ok()).toBeTruthy();
    const body = await res.text();
    expect(body).toMatch(/Allow:\s*\//);
    expect(body).toMatch(/Disallow:\s*\/admin\.html/);
    expect(body).toMatch(/Disallow:\s*\/cypress\//);
    expect(body).toMatch(/Disallow:\s*\/tests\//);
    expect(body).toContain('Sitemap:');
  });

  test('sitemap lists CV and simulator and omits admin', async ({ request }) => {
    const res = await request.get('/sitemap.xml');
    expect(res.ok()).toBeTruthy();
    const xml = await res.text();
    expect(xml).toContain('carlosandmunoz.com/');
        expect(xml).toContain('simulador.html');
        expect(xml).toContain('qa-lab.html');
        expect(xml).toContain('qa-lab.html?lang=es');
        expect(xml).toContain('qa-lab.html?lang=it');
        expect(xml).not.toContain('admin.html');
  });

  test('admin is noindex', async ({ page }) => {
    await openAdmin(page);
    const robots = await page.locator('meta[name="robots"]').getAttribute('content');
    expect(robots).toMatch(/noindex/i);
  });

  test('CV is indexable and has canonical plus JSON-LD', async ({ page }) => {
    await openCV(page);
    const robots = await page.locator('meta[name="robots"]').getAttribute('content');
    expect(robots).toMatch(/index/i);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /carlosandmunoz\.com/);
    const siteLd = await page.locator('#site-structured-data').textContent();
    expect(siteLd).toContain('featureList');
    expect(siteLd).toContain('QA regression lab');
    expect(siteLd).toContain('SDLC studio');
    const jsonLd = await page.locator('#person-structured-data').textContent();
    expect(jsonLd).toContain('Carlos');
    expect(jsonLd).toMatch(/18 (years|años)/i);
    const competenciesLd = await page.locator('#competencies-structured-data').textContent();
    expect(competenciesLd).toContain('IT Project Management');
    expect(competenciesLd).toContain('DefinedTerm');
    expect(competenciesLd).toContain('topic=pm');
  });

  test('external profile links use noopener noreferrer', async ({ page }) => {
    await openCV(page);
    const linkedin = page.locator('#contact-linkedin a');
    await expect(linkedin).toHaveAttribute('rel', /noopener/);
    await expect(linkedin).toHaveAttribute('target', '_blank');
  });

  test('lang query does not execute script payloads', async ({ page }) => {
    const hits = [];
    page.on('dialog', (dialog) => {
      hits.push(dialog.message());
      dialog.dismiss();
    });
    await page.goto('/index.html?lang=%3Cscript%3Ealert(1)%3C/script%3E');
    await expect(page.locator('.main-container')).toBeVisible();
    expect(hits).toEqual([]);
  });

  test('the login control is the only public link to admin', async ({ page }) => {
    await openCV(page);
    await expect(page.locator('a[href*="admin.html"]')).toHaveCount(2);
    await expect(page.locator('#admin-login-btn')).toHaveAttribute('href', 'admin.html');
    await expect(page.locator('#admin-login-btn-mobile')).toHaveAttribute('href', 'admin.html');
  });

  test('simulator login control is the only link to admin', async ({ page }) => {
    await skipSiteTours(page);
    await page.goto('/simulador.html');
    await expect(page.locator('a[href*="admin.html"]')).toHaveCount(1);
    await expect(page.locator('#admin-login-btn')).toHaveAttribute('href', 'admin.html');
  });

  test('clip pages name the video, poster, and duration', async ({ request }) => {
    const clips = [
      ['media/qa-lab-running.html', 'QA Lab running', 'PT54S', 'media/qa-lab-running.mp4', 'media/qa-lab-running.jpg'],
      ['media/qa-lab-tour.html', 'QA Lab tour', 'PT41S', 'media/qa-lab-tour.mp4', 'media/qa-lab-tour.jpg'],
      ['media/sdlc-studio-running.html', 'SDLC Studio sprint', 'PT1M33S', 'media/sdlc-studio-running.mp4', 'media/sdlc-studio-running.jpg'],
      ['media/sdlc-studio-tour.html', 'SDLC Studio tour', 'PT26S', 'media/sdlc-studio-tour.mp4', 'media/sdlc-studio-tour.jpg']
    ];
    const sitemap = await (await request.get('/sitemap.xml')).text();
    for (const [page, title, duration, video, poster] of clips) {
      const html = await (await request.get('/' + page)).text();
      expect(html).toContain('<h1>' + title + '</h1>');
      expect(html).toContain('href="https://carlosandmunoz.com/' + page + '"');
      expect(html).toContain('src="' + video.split('/').pop() + '"');
      expect(html).toContain('poster="' + poster.split('/').pop() + '"');
      expect(html).toContain('"duration": "' + duration + '"');
      expect(html).not.toContain('admin.html');
      expect(sitemap).toContain('https://carlosandmunoz.com/' + page);
      const film = await request.head('/' + video);
      expect(film.status()).toBe(200);
      expect(film.headers()['content-type'] || '').toContain('video/mp4');
      const still = await request.head('/' + poster);
      expect(still.status()).toBe(200);
      expect(still.headers()['content-type'] || '').toContain('image/jpeg');
    }
  });

  test('sitemap hreflang lists every language and omits admin', async ({ request }) => {
    const xml = await (await request.get('/sitemap.xml')).text();
    expect(xml).not.toContain('admin.html');
    for (const loc of ['https://carlosandmunoz.com/', 'https://carlosandmunoz.com/simulador.html', 'https://carlosandmunoz.com/qa-lab.html']) {
      for (const code of ['en', 'es', 'pt', 'de', 'fr', 'it', 'x-default']) {
        expect(xml).toContain('hreflang="' + code + '"');
      }
      expect(xml).toContain('hreflang="es" href="' + loc + '?lang=es"');
      expect(xml).toContain('hreflang="it" href="' + loc + '?lang=it"');
    }
  });
});
