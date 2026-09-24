const { test, expect } = require('@playwright/test');
const { CVPage } = require('./CVPage.js');
const { forceGlancePair, prepareCV, waitForCVApp } = require('./helpers.js');

const TOPICS = ['pm', 'qa', 'lead', 'devops', 'cloud', 'strategy', 'relations'];

test.describe('Core competency filters', () => {
  test.beforeEach(async ({ page }) => {
    const cv = new CVPage(page);
    await cv.visit({ theme: 'light' });
  });

  test('exposes seven clickable competency buttons', async ({ page }) => {
    const items = page.locator('.competency-item');
    await expect(items).toHaveCount(7);
    for (const id of TOPICS) {
      await expect(page.locator(`.competency-item[data-competency="${id}"]`)).toBeVisible();
      await expect(page.locator(`.competency-item[data-competency="${id}"]`)).toHaveAttribute('aria-pressed', 'false');
    }
  });

  for (const id of TOPICS) {
    test(`applies highlight and dim for ${id}`, async ({ page }) => {
      await page.locator(`.competency-item[data-competency="${id}"]`).click();
      await expect(page.locator('html')).toHaveClass(/topic-focus/);
      await expect(page.locator(`.competency-item[data-competency="${id}"]`)).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('.competency-item.topic-match')).toHaveCount(1);
      await expect(page.locator('.competency-item.topic-dim')).toHaveCount(6);
      await expect(page.locator('.experience-item.topic-match')).not.toHaveCount(0);
      await expect(page.locator('.experience-item.topic-dim')).not.toHaveCount(0);
      await expect(page.locator('.timeline-item.topic-match')).not.toHaveCount(0);
      await expect(page.locator('.timeline-item.filtered-out')).not.toHaveCount(0);
      await expect(page.locator('#languages-section')).toHaveClass(/topic-dim/);
    });
  }

  test('clicking the active competency again restores the CV', async ({ page }) => {
    const btn = page.locator('.competency-item[data-competency="qa"]');
    await btn.click();
    await expect(page.locator('html')).toHaveClass(/topic-focus/);
    await btn.click();
    await expect(page.locator('html')).not.toHaveClass(/topic-focus/);
    await expect(btn).toHaveAttribute('aria-pressed', 'false');
  });

  test('switching from PM to QA moves the highlight', async ({ page }) => {
    await page.locator('.competency-item[data-competency="pm"]').click();
    await page.locator('.competency-item[data-competency="qa"]').click();
    await expect(page.locator('.competency-item[data-competency="qa"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.competency-item[data-competency="pm"]')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('.tech-tag[data-skill-name="Selenium"]')).toHaveClass(/selected/);
    await expect(page.locator('.tech-tag[data-skill-name="MS Project"]')).not.toHaveClass(/selected/);
  });

  test('outside click restores while a related match click does not', async ({ page }) => {
    await page.locator('.competency-item[data-competency="pm"]').click();
    await expect(page.locator('html')).toHaveClass(/topic-focus/);
    await page.locator('.experience-item.topic-match').first().click();
    await expect(page.locator('html')).toHaveClass(/topic-focus/);
    await page.locator('#languages-heading').click({ force: true });
    await expect(page.locator('html')).not.toHaveClass(/topic-focus/);
  });

  test('Reset Filters clears competency focus and toolkit selection', async ({ page }) => {
    await page.locator('.competency-item[data-competency="qa"]').click();
    await expect(page.locator('.tech-tag[data-skill-name="Selenium"]')).toHaveClass(/selected/);
    await page.locator('#reset-filter').click();
    await expect(page.locator('html')).not.toHaveClass(/topic-focus/);
    await expect(page.locator('.tech-tag.selected')).toHaveCount(0);
  });

  test('theme toggle does not clear an active competency', async ({ page }) => {
    await page.locator('.competency-item[data-competency="cloud"]').click();
    await page.locator('#theme-toggle').click();
    await expect(page.locator('html')).toHaveClass(/topic-focus/);
    await expect(page.locator('.competency-item[data-competency="cloud"]')).toHaveAttribute('aria-pressed', 'true');
  });

  test('QA focus highlights ISTQB and selects Selenium', async ({ page }) => {
    await page.locator('.competency-item[data-competency="qa"]').click();
    await expect(page.locator('[data-topic="qa"]')).toHaveClass(/topic-match/);
    await expect(page.locator('[data-topic="qa"]')).toContainText('ISTQB');
    await expect(page.locator('.tech-tag[data-skill-name="Selenium"]')).toHaveClass(/selected/);
    await expect(page.locator('.tech-tag[data-skill-name="Cypress"]')).toHaveClass(/selected/);
  });

  test('radar QA label applies the same competency focus', async ({ page }) => {
    await forceGlancePair(page, 0);
    await page.locator('#competencies-radar-chart').scrollIntoViewIfNeeded();
    await page.locator('#competencies-radar-chart g.radar-label:has-text("QA & Automation")').click();
    await expect(page.locator('html')).toHaveClass(/topic-focus/);
    await expect(page.locator('.competency-item[data-competency="qa"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.experience-item.topic-dim')).not.toHaveCount(0);
  });

  test('?topic=qa deep-links the filter', async ({ page }) => {
    await prepareCV(page, { theme: 'light' });
    await page.goto('/index.html?topic=qa');
    await waitForCVApp(page);
    await expect(page.locator('html')).toHaveClass(/topic-focus/);
    await expect(page.locator('.competency-item[data-competency="qa"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-topic="qa"]')).toHaveClass(/topic-match/);
  });

  test('unknown ?topic= leaves the CV unfiltered', async ({ page }) => {
    await prepareCV(page, { theme: 'light' });
    await page.goto('/index.html?topic=nope');
    await waitForCVApp(page);
    await expect(page.locator('html')).not.toHaveClass(/topic-focus/);
  });

  test('?competency=qa is an alias of ?topic=qa', async ({ page }) => {
    await prepareCV(page, { theme: 'light' });
    await page.goto('/index.html?competency=qa');
    await waitForCVApp(page);
    await expect(page.locator('html')).toHaveClass(/topic-focus/);
    await expect(page.locator('.competency-item[data-competency="qa"]')).toHaveAttribute('aria-pressed', 'true');
  });

  test('empty ?topic= leaves the CV unfiltered', async ({ page }) => {
    await prepareCV(page, { theme: 'light' });
    await page.goto('/index.html?topic=');
    await waitForCVApp(page);
    await expect(page.locator('html')).not.toHaveClass(/topic-focus/);
  });

  test('header chrome clicks keep an active competency', async ({ page }) => {
    await page.locator('.competency-item[data-competency="qa"]').click();
    await page.locator('#tour-start-btn').click();
    await expect(page.locator('html')).toHaveClass(/topic-focus/);
    await page.locator('#export-selector').click();
    await expect(page.locator('html')).toHaveClass(/topic-focus/);
    await page.locator('#language-selector').click();
    await expect(page.locator('html')).toHaveClass(/topic-focus/);
  });

  test('clicking a matching toolkit tag keeps competency focus', async ({ page }) => {
    await page.locator('.competency-item[data-competency="qa"]').click();
    await page.locator('.tech-tag[data-skill-name="Selenium"]').click();
    await expect(page.locator('html')).toHaveClass(/topic-focus/);
  });

  test('language switch keeps an active competency', async ({ page }) => {
    const cv = new CVPage(page);
    await page.locator('.competency-item[data-competency="qa"]').click();
    await cv.selectLanguage('es');
    await expect(page.locator('html')).toHaveClass(/topic-focus/);
    await expect(page.locator('.competency-item[data-competency="qa"]')).toHaveAttribute('aria-pressed', 'true');
  });

  test('ships competency SEO chrome', async ({ page }) => {
    const json = await page.locator('#competencies-structured-data').textContent();
    expect(json).toContain('DefinedTerm');
    expect(json).toContain('IT Project Management');
    expect(json).toContain('topic=pm');
    for (const id of TOPICS) {
      expect(json).toContain(`topic=${id}`);
    }
    await expect(page.locator('meta[name="keywords"]')).toHaveAttribute('content', /IT Project Management/);
    const person = await page.locator('#person-structured-data').textContent();
    expect(person).toContain('CI/CD & DevOps Strategy');
    await expect(page.locator('#filter-status')).toHaveText('');
    await page.locator('.competency-item[data-competency="pm"]').click();
    await expect(page.locator('#filter-status')).toContainText(/Focusing|Project/i);
  });

  test('tour order places competencies after glance', async ({ page }) => {
    const keys = await page.evaluate(() => window.CarlosMunozCV.tourSteps.map((s) => s.titleKey));
    expect(keys.indexOf('tour_title_competencies')).toBe(keys.indexOf('tour_title_glance') + 1);
    expect(keys).toContain('tour_title_competencies');
  });
});

test.describe('Core competency filters on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('QA competency still highlights and restores', async ({ page }) => {
    const cv = new CVPage(page);
    await cv.visit({ theme: 'light' });
    await page.locator('.competency-item[data-competency="qa"]').click();
    await expect(page.locator('html')).toHaveClass(/topic-focus/);
    await expect(page.locator('.experience-item.topic-match')).not.toHaveCount(0);
    await page.locator('#languages-heading').click({ force: true });
    await expect(page.locator('html')).not.toHaveClass(/topic-focus/);
  });
});
