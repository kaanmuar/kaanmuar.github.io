const { expect } = require('@playwright/test');

exports.AdminPage = class AdminPage {
  /**
   * @param {import('@playwright/test').Page} page
   */
  constructor(page) {
    this.page = page;
    this.emailInput = page.locator('#email');
    this.passwordInput = page.locator('#password');
    this.submitButton = page.locator('#login-form button[type="submit"]');
    this.dashboard = page.locator('#dashboard');
    this.loginOverlay = page.locator('#login-overlay');
    this.loginError = page.locator('#login-error');
    this.messagesPane = page.locator('#messages-pane');
    this.ratingsPane = page.locator('#ratings-pane');
    this.responseModal = page.locator('#response-modal-overlay');
    this.responseTextarea = this.responseModal.locator('#response-message');
    this.publicCheckbox = this.responseModal.locator('#response-is-public');
    this.sendResponseButton = this.responseModal.locator('#response-send-btn');
  }

  async goto() {
    await this.page.goto('/admin.html');
  }

  async login(email, password) {
    await this.goto();
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
    await expect(this.dashboard).toBeVisible({ timeout: 15000 });
  }

  async navigateToTab(tabName) {
    await this.page.locator(`#${tabName}-tab-btn`).click();
    await expect(this.page.locator(`#${tabName}-pane`)).toBeVisible();
  }

  async findCardByContent(paneSelector, text) {
    return this.page.locator(`${paneSelector} .item-card:has-text("${text}")`);
  }

  async performActionOnCard(paneSelector, content, action) {
    this.page.once('dialog', (dialog) => dialog.accept());
    const card = await this.findCardByContent(paneSelector, content);
    await card.locator(`button[data-action="${action}"]`).click();
  }

  async respondToCard(paneSelector, content, responseData) {
    await this.performActionOnCard(paneSelector, content, 'respond');
    await expect(this.responseModal).toBeVisible();
    if (responseData.response) await this.responseTextarea.fill(responseData.response);
    if (responseData.isPublic) await this.publicCheckbox.check();
    this.page.once('dialog', (dialog) => dialog.accept());
    await this.sendResponseButton.click();
  }
};
