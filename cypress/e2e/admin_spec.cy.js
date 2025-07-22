// =============================================================================
// CONSOLIDATED PAGE OBJECTS (WORKAROUND)
// We are defining the classes directly in this file to bypass Webpack issues.
// =============================================================================

class BasePage {
    visit(path) {
        cy.visit(`/${path}`, {
            /*onBeforeLoad(win) {
                // Restore the logic to hide the tour before the page loads
                win.sessionStorage.setItem('hasSeenTour', 'true');
            },*/
        });
    }
}

class CVPage extends BasePage {
    visitCV() {
        super.visit('');
    }
}

class ContactWidget {
    get contactWidgetFab() { return cy.get('#contact-widget-fab'); }
    get ratingForm() { return cy.get('#rating-form'); }
    get messageForm() { return cy.get('#message-form'); }

    get successMessage() { return cy.get('#widget-status-container'); } // Corrected success message container
    get errorMessage() { return cy.get('#widget-status-container'); } // The same container shows errors
    get ratingTab() { return cy.get('#rating-tab'); }
    get messageTab() { return cy.get('#message-tab'); }


    open() {
        this.contactWidgetFab.click();
        return this;
    }

    switchToRatingTab() {
        this.ratingTab.click({ force: true });
        cy.wait(100);
        this.ratingForm.should('be.visible');
        return this;
    }

    switchToMessageTab() {
        this.messageTab.click({ force: true });
        cy.wait(100);
        this.messageForm.should('be.visible');
        return this;
    }

    submitRating(data) {
        if (data.name) this.ratingForm.find('input[name="name"]').type(data.name);
        if (data.email) this.ratingForm.find('input[name="email"]').type(data.email);
        if (data.stars) cy.get(`#star-rating .star[data-value="${data.stars}"]`).click({ force: true });
        if (data.comment) this.ratingForm.find('textarea[name="comment"]').type(data.comment);
        this.ratingForm.find('button[type="submit"]').click();
        return this;
    }

    submitMessage(data) {
        if (data.name) this.messageForm.find('input[name="name"]').type(data.name);
        if (data.email) this.messageForm.find('input[name="email"]').type(data.email);
        if (data.topic) this.messageForm.find('select[name="topic"]').select(data.topic);
        if (data.message) this.messageForm.find('textarea[name="message"]').type(data.message);
        this.messageForm.find('button[type="submit"]').click();
        return this;
    }

    verifySuccessMessageIsVisible() {
        this.successMessage.should('be.visible');
        return this;
    }

    verifyErrorMessageIsVisible() {
        this.errorMessage.should('be.visible');
        return this;
    }
}

class LoginPage extends BasePage {
    get emailInput() { return cy.get('#email'); }
    get passwordInput() { return cy.get('#password'); }
    get submitButton() { return cy.get('#login-form button[type="submit"]'); }
    get loginOverlay() { return cy.get('#login-overlay'); }
    get loginError() { return cy.get('#login-error'); }

    visitAdminPage() {
        super.visit('admin.html');
        this.loginOverlay.should('be.visible');
    }

    login(email, password) {
        this.emailInput.type(email);
        this.passwordInput.type(password, { log: false });
        this.submitButton.click();
    }

    verifyLoginErrorIsVisible() {
        this.loginError.should('be.visible')
            .and('contain.text', 'Login failed');
    }

    verifyIsLoggedOut() {
        this.loginOverlay.should('be.visible');
    }
}

class AdminDashboardPage {
    get dashboard() { return cy.get('#dashboard'); }
    get ratingsTab() { return cy.get('#ratings-tab-btn'); }
    get messagesTab() { return cy.get('#messages-tab-btn'); }
    get blocklistTab() { return cy.get('#blocked-senders-tab-btn'); }
    get logoutButton() { return cy.contains('button', 'Logout'); }

    visitDashboard() {
        cy.visit('/admin.html');
    }
    verifyDashboardIsVisible() {
        this.dashboard.should('be.visible', { timeout: 10000 });
    }
    logout() {
        this.logoutButton.click();
    }
    navigateToRatingsTab() {
        this.ratingsTab.click();
    }
    navigateToMessagesTab() {
        this.messagesTab.click();
    }
    navigateToBlocklistTab() {
        this.blocklistTab.click();
    }
    findCardByContent(text) {
        return cy.get(`.item-card:contains("${text}")`);
    }

    // --- UPDATED ACTION METHODS ---
    // Each method now re-queries for the card after the click to avoid detached DOM errors.
    approveTestimonial(comment) {
        this.findCardByContent(comment).find('button[id^="approve-"]:not([id*="-anon-"])').click();
        this.findCardByContent(comment).find('.status-approved').should('be.visible');
    }
    approveTestimonialAnonymously(comment) {
        this.findCardByContent(comment).find('button[id^="approve-anon-"]').click();
        this.findCardByContent(comment).find('.status-approved').should('be.visible');
    }
    retractTestimonial(comment) {
        this.findCardByContent(comment).find('button[id^="retract-"]').click();
        this.findCardByContent(comment).find('.status-pending').should('be.visible');
    }
    rejectTestimonial(comment) {
        this.findCardByContent(comment).find('button[id^="reject-"]').click();
        this.findCardByContent(comment).find('.status-rejected').should('be.visible');
    }

    // --- VERIFICATION METHODS ---
    verifyCardStatus(comment, status) {
        this.findCardByContent(comment).find(`.status-${status}`).should('be.visible');
    }
    verifyTestimonialIsPublic(comment) {
        const cvPage = new CVPage();
        cvPage.visitCV();
        cy.get('#testimonials-section').scrollIntoView();
        cy.get('body', { timeout: 10000 }).should('contain', comment);
        cy.contains(comment).scrollIntoView().should('be.visible');
    }
    verifyTestimonialIsRemoved(comment) {
        const cvPage = new CVPage();
        cvPage.visitCV();
        cy.get('#testimonials-section').scrollIntoView();
        cy.get('body', { timeout: 10000 }).should('not.contain', comment);
    }
    verifyTestimonialIsAnonymous(comment) {
        const cvPage = new CVPage();
        cvPage.visitCV();
        cy.get('#testimonials-section').scrollIntoView();
        cy.get('#testimonials-container .testimonial-card', { timeout: 10000 })
            .should('have.length.greaterThan', 0);
        cy.contains(comment).parents('.testimonial-card').scrollIntoView().should('contain.text', 'Anonymous');
    }
    blockSenderFromCard(message) {
        cy.on('window:confirm', () => true);
        this.findCardByContent(message).find('button[id^="block-msg-"]').click(); // Corrected selector

        // After click, verify the card is gone (or some other UI change)
        //this.findCardByContent(message).should('not.exist');
    }
    verifyUserInBlocklist(email) {
        this.navigateToBlocklistTab();
        cy.get('#blocklist-pane').contains(email).should('be.visible');
    }
    unblockUser(email) {
        cy.get('#blocklist-pane').contains('.blocklist-item', email).find('.unblock-btn').click();
    }
    verifyUserNotInBlocklist(email) {
        cy.get('#blocklist-pane').contains(email).should('not.exist');
    }
}


// =============================================================================
// TEST SUITE
// =============================================================================

const loginPage = new LoginPage();
const adminDashboard = new AdminDashboardPage();
const contactWidget = new ContactWidget();
const cvPage = new CVPage();

describe('Admin Panel Test Suite @regression', () => {
    // --- Helper Functions ---
    const createTestimonial = (data) => {
        cy.log(`--- Creating Testimonial: ${data.comment} ---`);
        cvPage.visitCV();
        contactWidget.open().switchToRatingTab().submitRating(data);
        contactWidget.verifySuccessMessageIsVisible();
    };

    const createMessage = (data) => {
        cy.log(`--- Creating Message: ${data.message} ---`);
        cvPage.visitCV();
        contactWidget.open().switchToMessageTab().submitMessage(data);
        contactWidget.verifySuccessMessageIsVisible();
    };

    // --- Test Contexts ---
    context('Admin Authentication @auth', () => {
        afterEach(() => {
            // Clear the specific session we used to prevent it from affecting other tests
            Cypress.session.clearAllSavedSessions();
        });

        it('should fail to login with incorrect credentials', () => {
            loginPage.visitAdminPage();
            loginPage.login('wrong@user.com', 'wrongpassword');
            loginPage.verifyLoginErrorIsVisible();
        });

        it('should successfully log in and log out @smoke', () => {
            cy.loginWithSession();
            adminDashboard.visitDashboard();
            adminDashboard.verifyDashboardIsVisible();
            adminDashboard.logout();
            loginPage.verifyIsLoggedOut();
        });
    });

    context('Admin Dashboard and E2E Flows @e2e', () => {
        beforeEach(() => {
            cy.loginWithSession();
            cy.visit('/admin.html');
            //adminDashboard.visitDashboard();
            adminDashboard.verifyDashboardIsVisible();
            //cy.log('Executing manual login...');

           /* const loginPage = new LoginPage();
            const adminDashboard = new AdminDashboardPage();

            loginPage.visitAdminPage();
            loginPage.login('kaanmuar@gmail.com', 'Krlos.8403'); // Using credentials directly

            // Now, we wait for the dashboard to become visible after the click.
            adminDashboard.verifyDashboardIsVisible();
            cy.log('Manual login successful. Dashboard is visible.');*/
        });

        it('should switch between all tabs @smoke @ui', () => {
            adminDashboard.navigateToRatingsTab();
            cy.get('#ratings-pane').should('be.visible');
            adminDashboard.navigateToBlocklistTab();
            cy.get('#blocklist-pane').should('be.visible');
            adminDashboard.navigateToMessagesTab();
            cy.get('#messages-pane').should('be.visible');
        });

        it('should display the correct action buttons based on the rating status @ui', () => {
            const testData = {
                name: 'Cypress User',
                email: `test-${Date.now()}@cypress.io`,
                stars: 5,
                comment: `Button State Test ${Date.now()}`
            };
            createTestimonial(testData);
            adminDashboard.visitDashboard();
            adminDashboard.navigateToRatingsTab();
            //const card = adminDashboard.findCardByContent(testData.comment);

            cy.log('Verifying buttons for PENDING state');
            adminDashboard.findCardByContent(testData.comment).within(() => {
                cy.get('button[id^="approve-"]').should('be.visible');
                cy.get('button[id^="approve-anon-"]').should('be.visible');
                cy.get('button[id^="reject-"]').should('be.visible');
            });

            adminDashboard.approveTestimonial(testData.comment);
            cy.log('Verifying buttons for APPROVED state');
            adminDashboard.findCardByContent(testData.comment).within(() => {
                cy.get('button[id^="retract-"]').should('be.visible');
                cy.get('button[id^="approve-"]:not([id*="-anon-"])').should('not.exist');
            });
        });

        it('should handle the full standard testimonial lifecycle (Submit > Approve > Retract)', () => {
            const testData = {
                name: 'Lifecycle Tester',
                email: `lifecycle-${Date.now()}@cypress.io`,
                stars: 5,
                comment: `Standard Lifecycle ${Date.now()}`
            };
            //const testData = { stars: 5, comment: `Standard Lifecycle ${Date.now()}` };
            createTestimonial(testData);

            adminDashboard.visitDashboard();
            adminDashboard.navigateToRatingsTab();
            adminDashboard.approveTestimonial(testData.comment);
            adminDashboard.verifyCardStatus(testData.comment, 'approved');
            cy.wait(2500);
            adminDashboard.verifyTestimonialIsPublic(testData.comment);

            adminDashboard.visitDashboard();
            adminDashboard.navigateToRatingsTab();
            adminDashboard.retractTestimonial(testData.comment);
            adminDashboard.verifyCardStatus(testData.comment, 'pending');
            cy.wait(2500);
            adminDashboard.verifyTestimonialIsRemoved(testData.comment);
        });

        it('should handle the anonymous approval lifecycle', () => {
            const testData = { email: `lifecycle-${Date.now()}@cypress.io`, stars: 4, name: 'Anon Tester', comment: `Anonymous Lifecycle ${Date.now()}` };
            createTestimonial(testData);
            adminDashboard.visitDashboard();
            adminDashboard.navigateToRatingsTab();
            adminDashboard.approveTestimonialAnonymously(testData.comment);
            cy.wait(1000);
            adminDashboard.verifyTestimonialIsAnonymous(testData.comment);
        });

        it('should handle the rejection lifecycle', () => {
            const testData = { name: 'Lifecycle Tester', email: `lifecycle-${Date.now()}@cypress.io`, stars: 1, comment: `Rejection Lifecycle ${Date.now()}` };
            createTestimonial(testData);
            adminDashboard.visitDashboard();
            adminDashboard.navigateToRatingsTab();
            adminDashboard.rejectTestimonial(testData.comment);
            adminDashboard.verifyCardStatus(testData.comment, 'rejected');
            cy.wait(1000);
            adminDashboard.verifyTestimonialIsRemoved(testData.comment);
        });

        it('should handle the message receipt lifecycle @smoke', () => {
            const messageData = { name: 'Message Sender', email: `lifecycle-${Date.now()}@cypress.io`, topic: 'Other', message: `Message Lifecycle Test ${Date.now()}` };
            createMessage(messageData);
            adminDashboard.visitDashboard();
            adminDashboard.navigateToMessagesTab();
            adminDashboard.findCardByContent(messageData.message).should('be.visible');
        });

        it('should handle the full block/unblock sender lifecycle', () => {
            const emailToBlock = `block-me-${Date.now()}@test.com`;
            const messageData = { name: 'Email to Block', email: emailToBlock, topic: 'Other', message: `Block/Unblock Test ${Date.now()}` };
            createMessage(messageData);
            adminDashboard.visitDashboard();
            adminDashboard.navigateToMessagesTab();
            cy.on('window:confirm', () => true);
            adminDashboard.blockSenderFromCard(messageData.message);
            adminDashboard.navigateToBlocklistTab();
            adminDashboard.verifyUserInBlocklist(emailToBlock);
            adminDashboard.unblockUser(emailToBlock);
            adminDashboard.verifyUserNotInBlocklist(emailToBlock);
        });

        it('should prevent a blocked user from submitting a message', () => {
            const blockedEmail = `blocked-user-${Date.now()}@test.com`;
            const initialMessage = { name: 'Email to Block', email: blockedEmail, topic: 'Other', message: 'This message will lead to a block.' };
            createMessage(initialMessage);

            adminDashboard.visitDashboard();
            adminDashboard.navigateToMessagesTab();

            // Note: The window:confirm handler is now correctly placed inside the blockSenderFromCard method
            adminDashboard.blockSenderFromCard(initialMessage.message);
            adminDashboard.verifyUserInBlocklist(blockedEmail);

            // FIXED: Provided a complete, valid message object
            const secondMessage = {
                name: 'Blocked User',
                email: blockedEmail,
                topic: 'Project Inquiry',
                message: 'This message should be blocked by the server functionality.'
            };

            cy.log('--- Attempting to send message from BLOCKED email ---');
            cvPage.visitCV();
            contactWidget.open().switchToMessageTab().submitMessage(secondMessage);

            // Assert that the error message is shown, proving the block worked
            contactWidget.verifyErrorMessageIsVisible();
            contactWidget.successMessage.should('not.be.visible');
        });
    });

    context('Public Form Validation', () => {
        beforeEach(() => {
            cvPage.visitCV();
            contactWidget.open();
        });

        it('should show validation errors for an empty rating form', () => {
            contactWidget.switchToRatingTab();

            // 1. First, verify the button is correctly disabled.
            contactWidget.ratingForm.find('button[type="submit"]').should('be.disabled');

            // 2. Trigger validation for the name field.
            contactWidget.ratingForm.find('input[name="name"]').focus().blur();
            contactWidget.ratingForm.find('#rater-name-error').should('be.visible');

            // 3. Trigger validation for the email field.
            contactWidget.ratingForm.find('input[name="email"]').focus().blur();
            contactWidget.ratingForm.find('#rater-email-error').should('be.visible');
        });

        it('should show validation errors for an empty message form', () => {
            contactWidget.switchToMessageTab();

            // 1. First, verify the button is correctly disabled.
            contactWidget.messageForm.find('button[type="submit"]').should('be.disabled');

            // 2. Trigger validation for the name field.
            contactWidget.messageForm.find('input[name="name"]').focus().blur();
            contactWidget.messageForm.find('#sender-name-error').should('be.visible');

            // 3. Trigger validation for the topic field.
            contactWidget.messageForm.find('select[name="topic"]').focus().blur();
            contactWidget.messageForm.find('#message-topic-error').should('be.visible');
        });

        it('should correctly display and interact with the social share feature', () => {
            cvPage.visitCV();

            // The main share icon should be visible
            cy.get('#social-share-toggle-icon').should('be.visible');

            // The options container should exist but not be visible because of the 'collapsed' class logic
            cy.get('#social-share-options').should('not.be.visible');

            // Click the icon to expand the menu
            cy.get('#social-share-selector').click();

            // Now the options should be visible
            cy.get('#social-share-options').should('be.visible');

            // --- Robust Link Verification ---
            // Get all share links (<a> tags), but exclude the copy button
            cy.get('#social-share-options a').then($links => {
                // Pick a random link to test from the list
                const randomIndex = Math.floor(Math.random() * $links.length);
                const randomLink = $links.eq(randomIndex);
                const socialNetwork = randomLink.data('analytics-label');

                cy.log(`--- Randomly testing share link for: ${socialNetwork} ---`);

                // Check that it has a valid href
                cy.wrap(randomLink)
                    .should('have.attr', 'href')
                    .and('not.be.empty');

                // Check that it opens in a new tab
                cy.wrap(randomLink)
                    .should('have.attr', 'target', '_blank');
            });

            // --- Specific Test for Copy Link Button ---
            cy.get('#copy-link-btn').should('be.visible').click();
            cy.get('#copy-link-tooltip').should('contain.text', 'Copied!');

            // Verify the tooltip resets
            cy.get('#copy-link-tooltip', { timeout: 3000 }).should('contain.text', 'Copy Link');
        });
    });
});