const { test, expect } = require('@playwright/test');

test.describe('Sprint studio', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('theme', 'light'));
    await page.goto('/simulador.html');
  });

  test('loads the board and run control', async ({ page }) => {
    await expect(page.getByRole('button', { name: /Run 4-agent sprint/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Jira board/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /CV regression lab/i })).toBeVisible();
    await expect(page.locator('#homeBtn')).toBeVisible();
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
});
