// cypress/support/pages/CV/CVPage.js (Robust Timing Workaround)

import { BasePage } from '@/support/pages/BasePage';

/**
 * This version uses chained assertions instead of fixed waits (`cy.wait`)
 * to create more stable and reliable tests that handle UI animations.
 */
export class CVPage extends BasePage {
    // --- Selectors ---
    get htmlTag() { return cy.get('html'); }
    get mainContainer() { return cy.get('.main-container'); }
    get themeToggleButton() { return cy.get('#theme-toggle'); }
    get languageSelector() { return cy.get('#language-selector'); }
    get languageOptionsContainer() { return cy.get('#language-selector-options'); }
    get languageOptions() { return this.languageOptionsContainer.find('[data-lang]'); }
    get contactSection() { return cy.get('section[aria-labelledby="contact-heading"]'); }
    get expandCollapseAllToolkitsBtn() { return cy.get('#expand-all-toolkit'); }
    get allToolkitSections() { return cy.get('.toolkit-section'); }
    get expandCollapseAllExperiencesBtn() { return cy.get('#toggle-all-experiences'); }
    get allExperienceAccordions() { return cy.get('.experience-item .accordion-content'); }
    get tourModal() { return cy.get('.shepherd-element', { timeout: 10000 }); }
    get tourNextButton() { return cy.get('.shepherd-button-primary'); }
    get tourDoneButton() { return cy.get('.shepherd-button-secondary'); }

    // --- Actions ---

    visitCV(withTour = false) {
        if (withTour) {
            // FIX: Use the onBeforeLoad hook to explicitly remove the session storage flag,
            // guaranteeing the application will launch the tour.
            cy.visit('index.html', {
                onBeforeLoad(win) {
                    win.sessionStorage.removeItem('hasSeenTour');
                }
            });
            // The existing check is correct; it just needs the tour to actually start.
            this.tourModal.should('be.visible');
        }
        this.mainContainer.should('be.visible');
    }

    // WORKAROUND: This method is now more "patient".
    switchLanguage(langCode) {
        this.languageSelector.click();
        // It waits for the options container to be visible before trying to find and click a language.
        this.languageOptionsContainer.should('be.visible');
        cy.get(`[data-lang="${langCode}"]`).click();
    }

    switchAndVerifyRandomLanguages(allTranslations) {
        this.languageSelector.scrollIntoView().should('be.visible').click();
        this.languageOptionsContainer.should('be.visible');

        this.languageOptions.then($options => {
            const availableLangs = [...$options].map(opt => opt.dataset.lang).filter(lang => lang !== 'en');
            const lang1 = availableLangs.splice(Math.floor(Math.random() * availableLangs.length), 1)[0];

            cy.log(`Testing random language: ${lang1.toUpperCase()}`);
            cy.get(`[data-lang="${lang1}"]`).click();
            this.verifyLanguageIsSet(allTranslations[lang1]);
        });
    }

    filterBySingleAndMultipleSkillsFromExperience() {
        // FIX: Ensure the button is scrolled into view and visible before clicking it.
        this.expandCollapseAllToolkitsBtn.scrollIntoView().should('be.visible').click();

        // After the robust click, assert that the content has appeared.
        // Cypress will automatically retry this check until it passes or times out.
        this.allToolkitSections.find('.toolkit-content').should('be.visible');


        cy.get('.experience-item:has(.experience-tech-tags .tech-tag)').first().then($item => {
            const skillsToTest = [];
            cy.wrap($item).find('.experience-tech-tags .tech-tag').each($tag => {
                skillsToTest.push($tag.text().trim());
            }).then(() => {
                if (skillsToTest.length < 2) return;

                cy.contains('.toolkit-section .tech-tag', skillsToTest[0]).click();
                cy.wrap($item).should('have.class', 'filter-match');

                cy.contains('.toolkit-section .tech-tag', skillsToTest[1]).click();
                cy.wrap($item).should('have.class', 'filter-match');
            });
        });
    }

    toggleAllToolkits() {
        this.expandCollapseAllToolkitsBtn.click();
    }

    toggleAllExperiences() {
        // WORKAROUND: Scroll the button into view before clicking to ensure it's not obscured.
        this.expandCollapseAllExperiencesBtn.scrollIntoView().click();
    }

    // --- Verifications ---

    verifyFullThemeToggleCycle() {
        this.htmlTag.then(($html) => {
            const wasInitiallyDark = $html.hasClass('dark-mode');
            this.themeToggleButton.click();
            this.htmlTag.should(wasInitiallyDark ? 'not.have.class' : 'have.class', 'dark-mode');
            cy.reload();
            this.mainContainer.should('be.visible');
            this.htmlTag.should(wasInitiallyDark ? 'not.have.class' : 'have.class', 'dark-mode');
            this.themeToggleButton.click();
            this.htmlTag.should(wasInitiallyDark ? 'have.class' : 'not.have.class', 'dark-mode');
        });
    }

    verifyLanguageIsSet(langData) {
        for (const [key, expectedText] of Object.entries(langData)) {
            cy.get(`[data-translate-key="${key}"]`).should('contain.text', expectedText.substring(0, 50));
        }
    }

    verifyContactSection() {
        this.contactSection.scrollIntoView().should('be.visible');
    }

    verifyAllToolkitsAre(state) {
        // FIX: Use the correct assertion based on whether the element is hidden or removed from the DOM.
        if (state === 'expanded') {
            // When expanded, the content element should exist in the DOM and be visible.
            this.allToolkitSections.find('.toolkit-content').should('be.visible');
        } else {
            // When collapsed, the application removes the content element from the DOM, so it should not exist.
            this.allToolkitSections.find('.toolkit-content').should('not.exist');
        }
    }

    verifyAllExperiencesAre(state) {
        const visibility = state === 'expanded' ? 'be.visible' : 'not.be.visible';
        this.allExperienceAccordions.should(visibility);
    }

    verifyTourRunsCorrectly() {
        const expectedTourTexts = [
            "Welcome to my Interactive CV!", "Toggle between light and dark modes", "Switch the language",
            "Filter my experience", "Click on any timeline entry", "Expand and collapse each experience",
            "Get in touch or rate this CV"
        ];

        cy.wrap(expectedTourTexts).each((text, index) => {
            this.tourModal.should('be.visible').and('contain.text', text);
            if (index < expectedTourTexts.length - 1) {
                this.tourNextButton.click();
            } else {
                this.tourDoneButton.click();
            }
        });
        this.tourModal.should('not.exist');
    }
}
