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
    await expect(page.getByRole('button', { name: /Jira board/i })).toBeVisible();
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
    await page.getByRole('button', { name: /Jira board/i }).click();
    await expect(page.getByRole('button', { name: /Jira board/i })).toBeVisible();
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
});
