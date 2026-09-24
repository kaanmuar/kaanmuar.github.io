const { expect } = require('@playwright/test');
const { openCV } = require('./helpers.js');

exports.CVPage = class CVPage {
  /**
   * @param {import('@playwright/test').Page} page
   */
  constructor(page) {
    this.page = page;
    this.html = page.locator('html');
    this.themeToggle = page.locator('#theme-toggle');
    this.languageSelector = page.locator('#language-selector');
    this.exportSelector = page.locator('#export-selector');
    this.profilePhoto = page.locator('#profile-photo');
    this.imageModal = page.locator('#image-modal');
    this.competenciesRadarChart = page.locator('#competencies-radar-chart');
    this.timelineContainer = page.locator('#timeline-container');
    this.experienceContainer = page.locator('#experience-container');
    this.glanceKpis = page.locator('#glance-kpis');
    this.tourStartBtn = page.locator('#tour-start-btn').filter({ visible: true });
    this.tourTooltip = page.locator('#tour-tooltip');
    this.tourNextBtn = page.locator('#tour-next-btn');
    this.simLaunchBtn = page.locator('#sim-launch-btn');
    this.contactWidgetFab = page.locator('#contact-widget-fab');
    this.mobileToolbar = page.locator('.mobile-toolbar-wrapper .mobile-toolbar');
    this.mobileThemeToggle = page.locator('#theme-toggle-mobile');
    this.mobileShareSelector = page.locator('#social-share-selector-mobile');
    this.testimonialsSection = page.locator('#testimonials-section');
  }

  async visit(options = {}) {
    await openCV(this.page, { tour: false, theme: 'light', ...options });
    await expect(this.page.locator('.main-container')).toBeVisible();
  }

  async selectLanguage(langCode) {
    await this.languageSelector.click();
    await this.page.locator(`#language-options .lang-option[data-lang="${langCode}"]`).click();
  }
};
