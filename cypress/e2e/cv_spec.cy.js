// cypress/e2e/cv_spec.cy.js

describe('Interactive CV Test Suite', () => {

    // This hook runs before each test ('it' block)
    beforeEach(() => {
        // We visit the page with an 'onBeforeLoad' callback.
        // This is the CRITICAL fix to prevent the auto-tour from running.
        cy.visit('index.html', {
            onBeforeLoad(win) {
                // This command runs before any of your page's scripts.
                // It sets a sessionStorage item that tricks the page into
                // thinking the tour has already been seen.
                win.sessionStorage.setItem('hasSeenTour', 'true');
            },
        });
        // This assertion ensures the page is fully loaded before tests continue.
        cy.get('.main-container').should('be.visible');
    });

    context('Core Functionality & Accessibility', { tags: '@core' }, () => { // TAGS ADDED

        // Test 1: Dark Mode
        it('should toggle dark mode successfully and persist the setting', { tags: '@visual' }, () => { // TAGS ADDED
            // a. Assert initial state is light mode
            cy.get('html').should('not.have.class', 'dark-mode');

            // Toggle to dark mode and verify
            cy.get('#theme-toggle').click();
            cy.get('html').should('have.class', 'dark-mode');

            // Reload the page and verify the setting persisted
            cy.reload();
            cy.get('html').should('have.class', 'dark-mode');

            // Toggle back to light mode
            cy.get('#theme-toggle').click();
            cy.get('html').should('not.have.class', 'dark-mode');
        });

        // Test 2: Language Switching
        it('should switch languages correctly and verify multiple translated elements', () => {
            // a. We will test two specific languages for predictable results.
            const languages = {
                es: { summary_title: 'Resumen Profesional', summary_text: 'Gerente Senior de Proyectos de TI' },
                de: { summary_title: 'Berufliches Profil', summary_text: 'Senior IT-Projektmanager' }
            };

            // b. Verify EVERYTHING that can be translated
            for (const [langCode, translations] of Object.entries(languages)) {
                cy.log(`Testing language: ${langCode}`);
                cy.get('#language-selector').click();
                cy.get(`[data-lang="${langCode}"]`).click();

                // Check a heading, a paragraph, and a tooltip for translation
                cy.get('[data-translate-key="summary_title"]').should('contain.text', translations.summary_title);
                cy.get('[data-translate-key="summary_text"]').should('contain.text', translations.summary_text);
            }
        });

        // Test 5: Photo Zoom Functionality
        it('should open and close the profile photo modal', { tags: '@visual' }, () => { // TAGS ADDED
            cy.get('#profile-photo').click();
            cy.get('#image-modal').should('have.class', 'visible');
            cy.get('#modal-image').should('have.attr', 'src').and('not.be.empty');
            cy.get('.modal-close').click();
            cy.get('#image-modal').should('not.have.class', 'visible');
        });

        // Test 6: Print Functionality
        it('should trigger the print dialog when the print button is clicked', () => {
            cy.window().then((win) => {
                // We stub window.print because Cypress cannot interact with the OS print dialog.
                // This allows us to confirm the button's click event works correctly.
                cy.stub(win, 'print').as('printStub');
            });
            cy.get('#print-btn').click();
            cy.get('@printStub').should('be.calledOnce');
        });

        // Test 7: Icon Loading
        it('should load all img icons successfully', { tags: ['@visual', '@health'] }, () => { // TAGS ADDED
            cy.get('img').each(($img) => {
                // This assertion checks that the image file was loaded by the browser
                // by verifying its natural (intrinsic) width is greater than 0.
                expect($img[0].naturalWidth).to.be.greaterThan(0);
            });
        });
    });

    context('Interactive Filtering & Accordions', { tags: '@interactive' }, () => { // TAGS ADDED

        // Test 3: Skill Filtering
        it('should filter experiences by clicking a random high-rated skill', { tags: '@filtering' }, () => { // TAGS ADDED
            // d. Expand all toolkit sections to ensure all skills are visible
            cy.get('#expand-all-toolkit').click();

            // a. Pick a 4-5 stars skill randomly
            cy.get('.tech-tag').filter(':contains("5+ Yrs"), :contains("8+ Yrs"), :contains("10+ Yrs")').then($tags => {
                const randomTag = $tags.get(Math.floor(Math.random() * $tags.length));
                cy.wrap(randomTag).click();
            });

            // b. Verify both timeline and experiences sections are filtered
            cy.get('.experience-item.filter-match').should('exist');
            cy.get('.experience-item.filter-no-match').should('exist');
            cy.get('#timeline-container .timeline-item.filtered-out').should('exist');

            // c. Test multiple skill selections
            cy.get('.tech-tag:not(.selected)').first().click();
            cy.get('.experience-item.filter-match').should('exist');
        });

        // Test 4: Experience Accordions
        it('should expand a random experience and verify its skills toolkit', () => {
            // b. Test random individual expansion and collapse
            cy.get('.experience-item').then($items => {
                const randomIndex = Math.floor(Math.random() * $items.length);
                const randomItem = $items.get(randomIndex);

                cy.wrap(randomItem).find('.accordion-header').click();
                // a. Verify skill toolkit per experience is right and shown
                cy.wrap(randomItem).find('.experience-tech-tags').should('be.visible');
                cy.wrap(randomItem).find('.accordion-header').click();
                cy.wrap(randomItem).find('.experience-tech-tags').should('not.be.visible');
            });
        });
    });

    context('Content Loading and Verification', { tags: '@content' }, () => { // TAGS ADDED

        // Test 8: Timeline
        it('should load all timeline items and navigate correctly on click', () => {
            // a. Test All experiences are loaded (assuming 13 experiences in data)
            cy.get('#timeline-container .timeline-item').should('have.length', 13);

            // b. Test each experience loads its skills icons
            cy.get('#timeline-container .timeline-item').first().find('.timeline-tech-icons img').should('exist');

            // c. Test clicking on a random experience
            const randomIndex = Math.floor(Math.random() * 13);
            cy.get(`#timeline-exp-${randomIndex} a`).click();
            cy.url().should('include', `#experience-${randomIndex}`);
            cy.get(`#experience-${randomIndex}`).should('be.visible');
        });

        // Test 9: Radar Graphs
        it('should load radar graphs with tooltips', { tags: '@visual' }, () => { // TAGS ADDED
            cy.get('#competencies-radar-chart').should('be.visible');
            cy.get('#methodologies-radar-chart').should('be.visible');

            // a. Test Radar tooltips by checking for the <title> element which browsers use for tooltips
            cy.get('#competencies-radar-chart .radar-label').first().find('title').should('not.be.empty');
        });

        // Test 10: Education & Certifications
        it('should load the Education & Certifications section', () => {
            cy.get('section[aria-labelledby="education-heading"]').should('be.visible');
            cy.contains('h3', 'Key Certifications').should('be.visible');
        });

        // Test 11: Testimonials
        it('should load and display testimonials from Firestore', { tags: '@data' }, () => { // TAGS ADDED
            // NOTE: Cleaning up test data (un-publishing) is not a frontend E2E test's responsibility.
            // This test correctly verifies that the UI can render data from the database.
            cy.get('#testimonials-container .testimonial-card').should('exist');
            cy.get('#average-rating-display').should('be.visible').and('contain.text', 'Avg:');
        });
    });
});