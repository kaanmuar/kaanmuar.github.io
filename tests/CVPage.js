// tests/CVPage.js
const { expect } = require('@playwright/test');

exports.CVPage = class CVPage {

    /**
     * @param {import('@playwright/test').Page} page
     */
    constructor(page) {
        this.page = page;
        // --- Getters for all interactive elements ---
        this.html = page.locator('html');
        this.themeToggle = page.locator('#theme-toggle');
        this.languageSelector = page.locator('#language-selector');
        this.exportSelector = page.locator('#export-selector');
        this.profilePhoto = page.locator('#profile-photo');
        this.imageModal = page.locator('#image-modal');
        this.competenciesRadarChart = page.locator('#competencies-radar-chart');
        this.timelineContainer = page.locator('#timeline-container');
        this.experienceContainer = page.locator('#experience-container');

        // Mobile-specific getters
        this.mobileToolbar = page.locator('.mobile-toolbar-wrapper .mobile-toolbar');
        this.mobileThemeToggle = page.locator('#theme-toggle-mobile');
        this.mobileShareSelector = page.locator('#social-share-selector-mobile');
    }

    /**
     * @param {boolean} suppressTour
     */
    async visit(suppressTour = true) {
        await this.page.goto('/index.html');
        if (suppressTour) {
            await this.page.evaluate(() => sessionStorage.setItem('hasSeenTour', 'true'));
            // Reload to apply the session storage change before the tour can initialize
            await this.page.reload();
        }
        await expect(this.page.locator('.main-container')).toBeVisible();
    }

    async selectLanguage(langCode) {
        await this.languageSelector.click();
        await this.page.locator(`#language-options [data-lang="${langCode}"]`).click();
    }
};