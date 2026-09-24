const { test, expect } = require('@playwright/test');
const { CVPage } = require('./CVPage.js');
const { forceGlancePair, prepareCV, waitForCVApp } = require('./helpers.js');

test.describe('CV desktop', () => {
  test.beforeEach(async ({ page }) => {
    const cv = new CVPage(page);
    await cv.visit({ theme: 'light' });
  });

  test('toggles dark mode and persists it', async ({ page }) => {
    const cv = new CVPage(page);
    await expect(cv.html).not.toHaveClass(/dark-mode/);
    await cv.themeToggle.click();
    await expect(cv.html).toHaveClass(/dark-mode/);
    await page.reload();
    await expect(cv.html).toHaveClass(/dark-mode/);
  });

  test('switches language to Spanish and back to English', async ({ page }) => {
    const cv = new CVPage(page);
    await cv.selectLanguage('es');
    await expect(page.locator('[data-translate-key="summary_title"]')).toHaveText(/Resumen/i);
    await cv.selectLanguage('en');
    await expect(page.locator('[data-translate-key="summary_title"]')).toHaveText(/Professional Summary/i);
  });

  test('honors ?lang=de on load', async ({ page }) => {
    await prepareCV(page, { theme: 'light' });
    await page.goto('/index.html?lang=de');
    await waitForCVApp(page);
    await expect(page.locator('[data-translate-key="summary_title"]')).toHaveText(/Berufliches Profil/i);
  });

  test('opens and closes the profile photo modal', async ({ page }) => {
    const cv = new CVPage(page);
    await cv.profilePhoto.click();
    await expect(cv.imageModal).toBeVisible();
    await page.locator('.modal-close').click();
    await expect(cv.imageModal).not.toHaveClass(/visible/);
  });

  test('shows glance KPIs with 18+ years', async ({ page }) => {
    const cv = new CVPage(page);
    await cv.glanceKpis.scrollIntoViewIfNeeded();
    await expect(cv.glanceKpis).toContainText('18+');
    await expect(page.locator('.glance-kpi')).toHaveCount(5);
  });

  test('filters toolkit from a radar label', async ({ page }) => {
    const cv = new CVPage(page);
    await forceGlancePair(page, 0);
    await cv.competenciesRadarChart.scrollIntoViewIfNeeded();
    await cv.competenciesRadarChart.locator('g.radar-label:has-text("QA & Automation")').click();
    await expect(page.locator('#toolkit-heading')).toBeInViewport();
    await expect(page.locator('.tech-tag[data-skill-name="Selenium"]')).toHaveClass(/selected/);
    await expect(page.locator('.tech-tag[data-skill-name="Cypress"]')).toHaveClass(/selected/);
  });

  test('core competency highlights related CV content and restores on outside click', async ({ page }) => {
    await page.locator('.competency-item[data-competency="pm"]').click();
    await expect(page.locator('html')).toHaveClass(/topic-focus/);
    await expect(page.locator('.competency-item[data-competency="pm"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.experience-item.topic-match')).not.toHaveCount(0);
    await expect(page.locator('.experience-item.topic-dim')).not.toHaveCount(0);
    await expect(page.locator('.timeline-item.topic-match')).not.toHaveCount(0);
    await page.locator('#languages-heading').click({ force: true });
    await expect(page.locator('html')).not.toHaveClass(/topic-focus/);
    await expect(page.locator('.competency-item[data-competency="pm"]')).toHaveAttribute('aria-pressed', 'false');
  });

  test('tour includes competencies after glance', async ({ page }) => {
    const keys = await page.evaluate(() => window.CarlosMunozCV.tourSteps.map((s) => s.titleKey));
    expect(keys.indexOf('tour_title_competencies')).toBe(keys.indexOf('tour_title_glance') + 1);
  });

  test('filters experience by a skill tag', async ({ page }) => {
    await page.locator('#expand-all-toolkit').click();
    await page.locator('.tech-tag[data-skill-name="Selenium"]').click();
    await expect(page.locator('.experience-item.filter-match')).not.toHaveCount(0);
    await expect(page.locator('.experience-item.filter-no-match')).not.toHaveCount(0);
  });

  test('timeline link expands the matching experience', async ({ page }) => {
    const cv = new CVPage(page);
    const first = cv.timelineContainer.locator('.timeline-item a').first();
    const href = await first.getAttribute('href');
    await first.click({ force: true });
    await expect(page.locator(`${href}`)).toHaveClass(/is-open/);
    await expect(page.locator(`${href} .experience-body`)).toBeVisible();
  });

  test('export menu lists PDF JPG DOC JSON Text', async ({ page }) => {
    const cv = new CVPage(page);
    await cv.exportSelector.click({ force: true });
    const menu = page.locator('#export-options');
    await expect(menu).toBeVisible();
    for (const label of ['Export as PDF', 'Export as JPG', 'Export as DOC', 'Export as JSON', 'Export as Text']) {
      await expect(menu.getByRole('button', { name: label })).toBeVisible();
    }
  });

  test('print control is present', async ({ page }) => {
    await expect(page.locator('#print-btn')).toBeVisible();
  });

  test('simulator and regression lab launchers exist', async ({ page }) => {
    const cv = new CVPage(page);
    await expect(cv.simLaunchBtn).toBeVisible();
    await expect(page.locator('#qa-lab-btn')).toBeVisible();
  });

  test('tour includes the regression lab after the studio', async ({ page }) => {
    const keys = await page.evaluate(() => window.CarlosMunozCV.tourSteps.map((s) => s.titleKey));
    expect(keys.indexOf('tour_title_qa_lab')).toBe(keys.indexOf('tour_title_simulator') + 1);
  });

  test('summary expands on Read More', async ({ page }) => {
    await page.locator('#read-more-btn').click();
    await expect(page.locator('#read-more-btn')).toHaveAttribute('aria-expanded', 'true');
  });

  test('education section lists key certifications', async ({ page }) => {
    await page.locator('section[aria-labelledby="education-heading"]').scrollIntoViewIfNeeded();
    await expect(page.locator('#certs-subheading')).toBeVisible();
    await expect(page.locator('section[aria-labelledby="education-heading"]')).toContainText('ISTQB');
  });

  test('contact widget validates empty message form', async ({ page }) => {
    await page.locator('#contact-widget-fab').click();
    await expect(page.locator('#contact-widget')).toBeVisible();
    await page.locator('#sender-name').focus();
    await page.locator('#sender-email').focus();
    await expect(page.locator('#send-message-btn, #message-form button[type="submit"]').first()).toBeDisabled();
  });

  test('tour waits for demo then advances and can close', async ({ page }) => {
    const cv = new CVPage(page);
    await cv.tourStartBtn.click();
    await expect(page.locator('#tour-tooltip')).toBeVisible();
    await expect(page.locator('#tour-step-counter')).toContainText('1 /');
    await expect(page.locator('#tour-next-btn')).toBeDisabled();
    await expect(page.locator('#tour-next-btn')).toBeEnabled({ timeout: 16000 });
    await page.locator('#tour-next-btn').click();
    await expect(page.locator('#tour-step-counter')).toContainText('2 /');
    await page.locator('#tour-close-btn').click();
    await expect(page.locator('#tour-tooltip')).not.toBeVisible();
  });
});

test.describe('CV mobile', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test.beforeEach(async ({ page }) => {
    const cv = new CVPage(page);
    await cv.visit({ theme: 'light' });
  });

  test('shows mobile toolbar and hides desktop theme toggle', async ({ page }) => {
    const cv = new CVPage(page);
    await expect(cv.mobileToolbar).toBeVisible();
    await expect(cv.themeToggle).toBeHidden();
  });

  test('mobile toolbar includes studio and lab launchers without sideways spill', async ({ page }) => {
    await expect(page.locator('#sim-launch-btn-mobile')).toBeVisible();
    await expect(page.locator('#qa-lab-btn-mobile')).toBeVisible();
    const extra = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(extra).toBeLessThanOrEqual(2);
  });

  test('mobile toolbar becomes sticky after scroll', async ({ page }) => {
    const cv = new CVPage(page);
    await page.evaluate(() => {
      window.scrollTo(0, 1600);
      window.dispatchEvent(new Event('scroll'));
    });
    await expect(cv.mobileToolbar).toHaveClass(/is-sticky/, { timeout: 8000 });
  });

  test('toggles dark mode from the mobile control', async ({ page }) => {
    const cv = new CVPage(page);
    await cv.mobileThemeToggle.click();
    await expect(cv.html).toHaveClass(/dark-mode/);
  });
});
