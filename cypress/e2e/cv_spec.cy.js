// cypress/e2e/cv_spec.cy.js

// =============================================================================
// PAGE OBJECT MODEL (A single, clean class for all interactions)
// =============================================================================
class CVPage {
    // --- Visit Method ---
    visit(options = { suppressTour: true }) {
        cy.visit('index.html', {
            onBeforeLoad(win) {
                // This hook allows us to control the tour's visibility for tests
                if (options.suppressTour) {
                    win.sessionStorage.setItem('hasSeenTour', 'true');
                } else {
                    win.sessionStorage.removeItem('hasSeenTour');
                }
            },
        });
        // A reliable check to ensure the main content is ready
        cy.get('.main-container').should('be.visible');
    }

    // --- Getters for all interactive elements ---
    get html() { return cy.get('html'); }
    get themeToggle() { return cy.get('#theme-toggle'); }
    get languageSelector() { return cy.get('#language-selector'); }
    get profilePhoto() { return cy.get('#profile-photo'); }
    get imageModal() { return cy.get('#image-modal'); }
    get printBtn() { return cy.get('#print-btn'); }
    get shareSelector() { return cy.get('#social-share-selector'); }
    get expandAllToolkitBtn() { return cy.get('#expand-all-toolkit'); }
    get expandAllExperienceBtn() { return cy.get('#expand-all-exp'); }
    get allToolkitBodies() { return cy.get('.toolkit-section .toolkit-body'); }
    get allExperienceBodies() { return cy.get('.experience-item .experience-body'); }
    get tourStartBtn() { return cy.get('#tour-start-btn'); }
    get tourTooltip() { return cy.get('#tour-tooltip'); }
    get contactWidgetFab() { return cy.get('#contact-widget-fab'); }
    get contactWidget() { return cy.get('#contact-widget'); }
    get messageForm() { return cy.get('#message-form'); }
    get ratingForm() { return cy.get('#rating-form'); }
    get competenciesRadarChart() { return cy.get('#competencies-radar-chart'); }
    get timelineContainer() { return cy.get('#timeline-container'); }
    get educationSection() { return cy.get('section[aria-labelledby="education-heading"]'); }
    get testimonialsSection() { return cy.get('#testimonials-section'); }

    // --- Action Methods ---
    selectLanguage(langCode) {
        this.languageSelector.click();
        cy.get(`[data-lang="${langCode}"]`).click();
    }

    startTour() {
        this.visit({ suppressTour: false });
        this.tourTooltip.should('be.visible');
    }
}

// =============================================================================
// TEST SUITE
// =============================================================================

const cvPage = new CVPage();

describe('Interactive CV - Full QA Coverage Test Suite', () => {

    beforeEach(() => {
        cy.clearLocalStorage();
        cvPage.visit();
    });

    context('Core UI Functionality & Visuals', () => {
        it('[Positive] should correctly toggle dark mode regardless of initial state and persist the setting', () => {
            cy.get('html').then($html => {
                const isInitiallyDark = $html.hasClass('dark-mode');
                cy.log(`Initial theme detected: ${isInitiallyDark ? 'Dark' : 'Light'}`);
                cvPage.themeToggle.click();
                if (isInitiallyDark) cy.get('html').should('not.have.class', 'dark-mode');
                else cy.get('html').should('have.class', 'dark-mode');
                cy.reload();
                if (isInitiallyDark) cy.get('html').should('not.have.class', 'dark-mode');
                else cy.get('html').should('have.class', 'dark-mode');
            });
        });

        it('[Positive & Random] should switch to two random languages and verify content', () => {
            cy.window().its('CarlosMunozCV.data.translations').then(translations => {
                const availableLangs = Object.keys(translations).filter(lang => lang !== 'en');
                const lang1 = availableLangs.splice(Math.floor(Math.random() * availableLangs.length), 1)[0];
                const lang2 = availableLangs[Math.floor(Math.random() * availableLangs.length)];

                // Test first random language
                cy.log(`Testing translation for: ${lang1.toUpperCase()}`);
                cvPage.selectLanguage(lang1);
                cy.get('[data-translate-key="summary_title"]').should('contain.text', translations[lang1].summary_title);
                cy.get('[data-translate-key="contact_title"]').should('contain.text', translations[lang1].contact_title);

                // Test second random language
                cy.log(`Testing translation for: ${lang2.toUpperCase()}`);
                cvPage.selectLanguage(lang2);
                cy.get('[data-translate-key="summary_title"]').should('contain.text', translations[lang2].summary_title);
                cy.get('[data-translate-key="experience_title"]').should('contain.text', translations[lang2].experience_title);
            });
        });

        it('[Positive] should open and close the profile photo modal', () => {
            cvPage.profilePhoto.click();
            cvPage.imageModal.should('be.visible').and('have.class', 'visible');
            cy.get('.modal-close').click();
            cvPage.imageModal.should('not.be.visible');
        });
    });

    context('Interactive Features & User Flows', () => {
        it('[Positive & Random] should filter timeline and experiences by a random skill', () => {
            cvPage.expandAllToolkitBtn.click();
            cy.get('.tech-tag').then($tags => {
                const randomTag = $tags.get(Math.floor(Math.random() * $tags.length));
                cy.wrap(randomTag).click();

                // Verify filtering on Experience section
                cy.get('.experience-item.filter-match').should('exist');
                cy.get('.experience-item.filter-no-match').should('exist');

                // Verify filtering on Timeline section
                cvPage.timelineContainer.find('.timeline-item.filtered-out').should('exist');
            });
        });

        it('[Positive] should navigate from timeline to the correct experience section', () => {
            cvPage.timelineContainer.find('.timeline-item a').first().as('firstTimelineLink').click();
            cy.get('@firstTimelineLink').invoke('attr', 'href').then(href => {
                const experienceId = href.substring(1); // Remove the '#'
                cy.get(`#${experienceId}`).find('.experience-body').should('be.visible');
            });
        });

        it('[Positive] should load radar graphs and verify tooltips are present', () => {
            cvPage.competenciesRadarChart.scrollIntoView().should('be.visible');
            // Check for the <title> element which browsers use for native tooltips
            cvPage.competenciesRadarChart.find('.radar-label').first().find('title').should('not.be.empty');
        });
    });

    context('Content Verification', () => {
        it('[Positive] should load the Education & Certifications section', () => {
            cvPage.educationSection.scrollIntoView().should('be.visible');
            cvPage.educationSection.should('contain.text', 'Key Certifications');
        });

        it('[Positive] should correctly handle the testimonials section', () => {
            cvPage.testimonialsSection.scrollIntoView();
            // This test is robust: it checks the state of the section.
            // If testimonials load, it verifies them. If not, it verifies the section is hidden.
            cy.get('body').then($body => {
                if ($body.find('#testimonials-container .testimonial-card').length > 0) {
                    cy.log('Testimonials found, verifying content.');
                    cvPage.testimonialsSection.should('be.visible');
                    cy.get('#average-rating-display').should('be.visible').and('contain.text', 'Avg:');
                } else {
                    cy.log('No testimonials found, verifying section is hidden.');
                    cvPage.testimonialsSection.should('not.be.visible');
                }
            });
        });
    });

    context('Contact Widget & Form Validation', () => {
        beforeEach(() => {
            cvPage.contactWidgetFab.click({ force: true });
            cvPage.contactWidget.should('be.visible');
        });

        it('[Negative] should show validation errors for an empty message form', () => {
            cvPage.messageForm.find('button[type="submit"]').should('be.disabled');
            cvPage.messageForm.find('#sender-name').focus().blur().should('have.class', 'invalid');
            cvPage.messageForm.find('#sender-email').type('invalid-email').blur().should('have.class', 'invalid');
        });

        it('[Positive] should allow successful submission of the message form', () => {
            cvPage.messageForm.find('#sender-name').type('Cypress Test');
            cvPage.messageForm.find('#sender-email').type('test@cypress.io');
            cvPage.messageForm.find('#message-topic').select('CV Feedback');
            cvPage.messageForm.find('#sender-message').type('This is an automated test message.');
            cvPage.messageForm.find('button[type="submit"]').should('not.be.disabled').click();
            cy.get('#widget-status-container').should('be.visible').and('contain.text', 'Message Sent!');
        });
    });

    context('Onboarding Tour', () => {
        it('[Positive] should step through the entire tour and verify each step', () => {
            const totalSteps = 9;
            cvPage.startTour();

            for (let i = 1; i <= totalSteps; i++) {
                cy.log(`--- Verifying Tour Step ${i} ---`);
                cy.window().its('CarlosMunozCV.tourSteps').then(tourSteps => {
                    const currentStep = tourSteps[i-1];
                    cy.window().its('CarlosMunozCV.data.translations.en').then(translations => {
                        const expectedTitle = translations[currentStep.titleKey];
                        cvPage.tourTooltip.should('be.visible').and('contain', expectedTitle);
                    });
                });

                cy.get('#tour-step-counter').should('contain.text', `${i} / ${totalSteps}`);

                if (i < totalSteps) {
                    cy.get('#tour-next-btn').click();
                    cy.wait(500);
                } else {
                    cy.get('#tour-next-btn').should('contain.text', 'Finish').click();
                }
            }
            cvPage.tourTooltip.should('not.be.visible');
        });
    });

    context('Accessibility & Health Checks', () => {
        it('[Accessibility] should have no detectable accessibility violations on page load', () => {
            cy.injectAxe();
            cy.checkA11y({ exclude: ['#contact-widget'] });
        });
    });
});
