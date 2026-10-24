const { test, expect } = require('@playwright/test');
const { skipSiteTours } = require('./helpers.js');

test.describe('Sprint studio', () => {
  test.beforeEach(async ({ page }) => {
    await skipSiteTours(page);
    await page.addInitScript(() => localStorage.setItem('theme', 'light'));
    await page.goto('/simulador.html');
  });

  test('loads the board and run control', async ({ page }) => {
    await expect(page.getByRole('button', { name: /Run 4-agent sprint/i })).toBeVisible();
    await expect(page.locator('#nav').getByRole('button', { name: /Jira board/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /CV regression lab/i })).toBeVisible();
    await expect(page.locator('#homeBtn')).toBeVisible();
    await expect(page.locator('#tour-start-btn')).toBeVisible();
    await expect(page.locator('.ticket, .ticket-wrap').first()).toBeVisible();
  });

  test('follows CV light theme on first load', async ({ page }) => {
    await expect(page.locator('html')).not.toHaveClass(/dark-mode/);
  });

  test('theme toggle flips dark-mode on the studio', async ({ page }) => {
    await page.locator('#theme-toggle').click();
    await expect(page.locator('html')).toHaveClass(/dark-mode/);
  });

  test('nav can open Xray and automation views', async ({ page }) => {
    await page.getByRole('button', { name: /Xray \/ TestRail/i }).click();
    await page.getByRole('button', { name: /Automation lab/i }).click();
    await page.locator('#nav').getByRole('button', { name: /Jira board/i }).click();
    await expect(page.locator('#nav').getByRole('button', { name: /Jira board/i })).toBeVisible();
  });

  test('back control returns to the CV', async ({ page }) => {
    await page.locator('#homeBtn').click();
    await expect(page).toHaveURL(/index\.html/);
    await expect(page.locator('.main-container')).toBeVisible();
  });

  test('guided tour walks the studio controls', async ({ page }) => {
    await page.locator('#tour-start-btn').click();
    await expect(page.locator('#site-tour-overlay')).toHaveClass(/on/);
    await expect(page.locator('#site-tour-title')).toHaveText('Sprint views');
    await expect(page.locator('#nav')).toHaveClass(/site-tour-hit/);
    await page.locator('#site-tour-close').click();
    await expect(page.locator('#site-tour-overlay')).not.toHaveClass(/on/);
  });

  test('studio tour Next advances after the demo hold', async ({ page }) => {
    await page.locator('#tour-start-btn').click();
    await expect(page.locator('#site-tour-next')).toBeDisabled();
    await expect(page.locator('#site-tour-next')).toBeEnabled({ timeout: 4000 });
    await page.locator('#site-tour-next').click();
    await expect(page.locator('#site-tour-title')).toHaveText('Four agents');
    await page.locator('#site-tour-close').click();
  });

  test('Linear renames the columns and keeps PAY-241', async ({ page }) => {
    await page.locator('[data-board-view="linear"]').click();
    await expect(page.locator('#view')).toHaveClass(/board-linear/);
    await expect(page.locator('#view .col h3 span:first-child')).toHaveText(['Todo', 'In Progress', 'In Review', 'In QA', 'Done']);
    await expect(page.locator('#view')).toContainText('PAY-241');
    await expect(page.locator('.nav button[data-view="board"]')).toHaveText('Linear');
  });

  test('Backlog hides Sprint 24 and shows CV-410', async ({ page }) => {
    await page.locator('[data-sprint="Backlog"]').click();
    await expect(page.locator('#view .col h3 span:first-child')).toHaveText(['Backlog']);
    await expect(page.locator('[data-sprint="Backlog"]')).toHaveClass(/on/);
    await expect(page.locator('#view')).toContainText('CV-410');
    await expect(page.locator('#view')).not.toContainText('PAY-241');
  });

  test('sprint report carries run details, failures and steps, and its dialog follows the language', async ({ page }) => {
    const out = await page.evaluate(async () => {
      const at = Date.now();
      state.frameworks = ['Playwright', 'Robot'];
      state.results = [
        { id: 'XT-1400', fw: 'Playwright', ok: true, ms: 610, title: 'Risky card steps up to 3DS', ticket: 'PAY-241', story: 'Enforce 3-D Secure challenge', env: 'staging-eu-1', sprint: 'Sprint 24', steps: ['Open checkout · /checkout'], error: '', at },
        { id: 'XT-1401', fw: 'Robot', ok: false, ms: 930, title: 'Ledger rows match', ticket: 'PAY-242', story: 'Idempotent capture', env: 'staging-us-2', sprint: 'Sprint 24', steps: ['Capture twice · ledger'], error: 'row count did not match the ledger', at: at + 900 }
      ];
      openStudioReport();
      return { html: studioReportHtml(), text: await copyStudioReport(null) };
    });
    for (const want of ['Run details', 'Board', 'Jira', 'Sprint 24', 'staging-us-2', 'Summary by runner', 'Failures', 'row count did not match the ledger', 'PAY-242', 'Steps per case', 'Capture twice']) {
      expect(out.html, want).toContain(want);
    }
    expect(out.text).toContain('row count did not match the ledger');
    expect(out.text).not.toContain('<td');
    const dialog = page.locator('#studio-report');
    await page.locator('#studio-report-lang').selectOption('fr');
    await expect(dialog.locator('#studio-report-title')).toHaveText('Rapport de sprint');
    await expect(dialog.locator('#studio-report-copy')).toHaveText('Copier');
    await expect(dialog.locator('[data-studio-ui="stepsTitle"]')).toHaveText('Étapes par cas');
    await page.locator('#studio-report-lang').selectOption('en');
    await expect(dialog.locator('#studio-report-download')).toHaveText('Download');
  });
});
