// =============================================================================
// CONSOLIDATED PAGE OBJECTS
// =============================================================================

class BasePage {
    visit(path) {
        cy.visit(`/${path}`);
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
    get successMessage() { return cy.get('#widget-status-container'); }
    get errorMessage() { return cy.get('#widget-status-container'); }
    get ratingTab() { return cy.get('#rating-tab'); }
    get messageTab() { return cy.get('#message-tab'); }

    open() { this.contactWidgetFab.click(); return this; }
    switchToRatingTab() { this.ratingTab.click({ force: true }); this.ratingForm.should('be.visible'); return this; }
    switchToMessageTab() { this.messageTab.click({ force: true }); this.messageForm.should('be.visible'); return this; }

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

    verifySuccessMessageIsVisible() { this.successMessage.should('be.visible'); return this; }
    verifyErrorMessageIsVisible() { this.errorMessage.should('be.visible'); return this; }
}

class LoginPage extends BasePage {
    get emailInput() { return cy.get('#email'); }
    get passwordInput() { return cy.get('#password'); }
    get submitButton() { return cy.get('#login-form button[type="submit"]'); }
    get loginOverlay() { return cy.get('#login-overlay'); }
    get loginError() { return cy.get('#login-error'); }

    visitAdminPage() { super.visit('admin.html'); this.loginOverlay.should('be.visible'); }
    login(email, password) { this.emailInput.type(email); this.passwordInput.type(password, { log: false }); this.submitButton.click(); }
    verifyLoginErrorIsVisible() { this.loginError.should('be.visible').and('contain.text', 'Login failed'); }
    verifyIsLoggedOut() { this.loginOverlay.should('be.visible'); }
}

class AdminDashboardPage {
    // Tabs
    get messagesTab() { return cy.get('#messages-tab-btn'); }
    get ratingsTab() { return cy.get('#ratings-tab-btn'); }
    get rejectedTab() { return cy.get('#rejected-tab-btn'); }
    get blockedTab() { return cy.get('#blocked-tab-btn'); }
    get statsTab() { return cy.get('#stats-tab-btn'); }

    // Panes
    get messagesPane() { return cy.get('#messages-pane'); }
    get ratingsPane() { return cy.get('#ratings-pane'); }
    get rejectedPane() { return cy.get('#rejected-pane'); }
    get blockedPane() { return cy.get('#blocked-pane'); }
    get statsPane() { return cy.get('#stats-pane'); }

    // General
    get dashboard() { return cy.get('#dashboard'); }
    get logoutButton() { return cy.contains('button', 'Logout'); }
    findCardByContent(pane, text) { return cy.get(`${pane} .item-card:contains("${text}")`); }
    getBulkActionButton(pane) { return cy.get(`${pane} .bulk-actions-container button`); }
    getBulkActionDropdown(pane) { return cy.get(`${pane} .bulk-actions-dropdown`); }

    // Methods
    visitDashboard() { cy.visit('/admin.html'); }
    verifyDashboardIsVisible() { this.dashboard.should('be.visible', { timeout: 10000 }); }
    logout() { this.logoutButton.click(); }
    navigateToTab(tabName) {
        cy.get(`#${tabName}-tab-btn`).click();
        cy.get(`#${tabName}-pane`).should('be.visible');
    }

    // Card Actions
    performActionOnCard(pane, content, action) {
        cy.on('window:confirm', () => true);
        this.findCardByContent(pane, content).find(`button[data-action="${action}"]`).click();
    }

    // Bulk Actions
    performBulkAction(pane, action) {
        cy.on('window:confirm', (str) => {
            expect(str).to.contain('Are you sure');
            return true;
        });
        cy.on('window:alert', (str) => {
            expect(str).to.contain('Bulk action completed');
        });
        this.getBulkActionButton(pane).click();
        this.getBulkActionDropdown(pane).find(`a[data-bulk-action="${action}"]`).click();
    }
}

// =============================================================================
// TEST SUITE
// =============================================================================

const loginPage = new LoginPage();
const adminDashboard = new AdminDashboardPage();
const contactWidget = new ContactWidget();
const cvPage = new CVPage();

describe('Admin Panel v3 Full Test Coverage', () => {

    // --- Helper Functions ---
    const generateRandomString = (length = 8) => Math.random().toString(20).substr(2, length);
    const generateRandomEmail = () => `test-${Date.now()}@${generateRandomString(5)}.com`;

    const createMessage = (overrides = {}) => {
        const messageData = {
            name: `MsgUser ${generateRandomString()}`,
            email: generateRandomEmail(),
            topic: 'General Inquiry',
            message: `Test message content ${Date.now()}`,
            ...overrides,
        };
        cvPage.visitCV();
        contactWidget.open().switchToMessageTab().submitMessage(messageData);
        contactWidget.verifySuccessMessageIsVisible();
        return messageData;
    };

    const createRating = (overrides = {}) => {
        const ratingData = {
            name: `RateUser ${generateRandomString()}`,
            email: generateRandomEmail(),
            stars: 5,
            comment: `Test rating comment ${Date.now()}`,
            ...overrides,
        };
        cvPage.visitCV();
        contactWidget.open().switchToRatingTab().submitRating(ratingData);
        contactWidget.verifySuccessMessageIsVisible();
        return ratingData;
    };

    beforeEach(() => {
        cy.loginWithSession(); // Custom command for faster login
        adminDashboard.visitDashboard();
        adminDashboard.verifyDashboardIsVisible();
    });

    context('Navigation and UI Elements', () => {
        it('should switch between all tabs and verify panes are visible', () => {
            adminDashboard.navigateToTab('ratings');
            adminDashboard.navigateToTab('rejected');
            adminDashboard.navigateToTab('blocked');
            adminDashboard.navigateToTab('stats');
            adminDashboard.navigateToTab('messages');
        });

        it('should show a new-indicator on Ratings tab when pending ratings exist', () => {
            createRating({ stars: 4 });
            adminDashboard.visitDashboard();
            adminDashboard.ratingsTab.find('.new-indicator').should('be.visible');
        });
    });

    context('Filtering Functionality', () => {
        let testMessage, testRating;

        before(() => {
            cy.loginWithSession();
            testMessage = createMessage();
            testRating = createRating();
        });

        it('should filter messages by name, email, and topic', () => {
            adminDashboard.navigateToTab('messages');
            // Filter by name
            adminDashboard.messagesPane.find('#msg-filter-name').type(testMessage.name);
            adminDashboard.messagesPane.find('#messages-list').children().should('have.length', 1).and('contain', testMessage.name);
            adminDashboard.messagesPane.find('#msg-filter-name').clear();

            // Filter by email
            adminDashboard.messagesPane.find('#msg-filter-email').type(testMessage.email);
            adminDashboard.messagesPane.find('#messages-list').children().should('have.length', 1).and('contain', testMessage.email);
            adminDashboard.messagesPane.find('#msg-filter-email').clear();

            // Filter by topic dropdown
            adminDashboard.messagesPane.find('#msg-filter-topic-select').select(testMessage.topic);
            adminDashboard.messagesPane.find('#messages-list').should('contain', testMessage.topic);
        });

        it('should filter ratings by status, rating, and date range', () => {
            adminDashboard.navigateToTab('ratings');
            // Filter by status
            adminDashboard.ratingsPane.find('#rate-filter-status').select('pending');
            adminDashboard.ratingsPane.find('#ratings-list').should('contain', testRating.name);
            adminDashboard.ratingsPane.find('.item-card').first().should('contain', 'Pending');

            // Filter by rating
            adminDashboard.ratingsPane.find('#rate-filter-status').select(''); // Clear status
            adminDashboard.ratingsPane.find('#rate-filter-rate').select(testRating.stars.toString());
            adminDashboard.ratingsPane.find('#ratings-list').should('contain', testRating.name);

            // Filter by date range (today)
            const today = new Date().toISOString().split('T')[0];
            adminDashboard.ratingsPane.find('#rate-filter-date-start').type(today);
            adminDashboard.ratingsPane.find('#rate-filter-date-end').type(today);
            adminDashboard.ratingsPane.find('#ratings-list').should('contain', testRating.name);
        });
    });

    context('Single Item Actions (Reject, Restore, Block, Unblock)', () => {
        it('should reject a message and then restore it', () => {
            const msg = createMessage();
            adminDashboard.visitDashboard();
            adminDashboard.navigateToTab('messages');

            // Reject
            adminDashboard.performActionOnCard('#messages-pane', msg.message, 'reject-msg');
            adminDashboard.findCardByContent('#messages-pane', msg.message).should('not.exist');

            // Verify in Rejected Tab
            adminDashboard.navigateToTab('rejected');
            adminDashboard.findCardByContent('#rejected-pane', msg.message).should('be.visible');

            // Restore
            adminDashboard.performActionOnCard('#rejected-pane', msg.message, 'restore-msg');
            adminDashboard.findCardByContent('#rejected-pane', msg.message).should('not.exist');

            // Verify back in Messages Tab
            adminDashboard.navigateToTab('messages');
            adminDashboard.findCardByContent('#messages-pane', msg.message).should('be.visible');
        });

        it('should block a sender and then unblock them', () => {
            const msg = createMessage();
            adminDashboard.visitDashboard();
            adminDashboard.navigateToTab('messages');

            // Block
            adminDashboard.performActionOnCard('#messages-pane', msg.message, 'block');
            adminDashboard.findCardByContent('#messages-pane', msg.message).should('not.exist');

            // Verify in Blocked Tab
            adminDashboard.navigateToTab('blocked');
            adminDashboard.findCardByContent('#blocked-pane', msg.email).should('be.visible');

            // Unblock
            adminDashboard.performActionOnCard('#blocked-pane', msg.email, 'unblock');
            adminDashboard.findCardByContent('#blocked-pane', msg.email).should('not.exist');
        });
    });

    context('Bulk Actions Functionality', () => {
        let itemsToTest = [];

        beforeEach(() => {
            // Create 3 new items for each test
            itemsToTest = [createRating({ status: 'pending' }), createRating({ status: 'pending' }), createRating({ status: 'pending' })];
            adminDashboard.visitDashboard();
            adminDashboard.navigateToTab('ratings');
        });

        it('should perform bulk "approve" and skip invalid items', () => {
            // Make one item already approved
            adminDashboard.performActionOnCard('#ratings-pane', itemsToTest[0].comment, 'approve');
            adminDashboard.findCardByContent('#ratings-pane', itemsToTest[0].comment).should('contain', 'Approved');

            // Select all 3
            itemsToTest.forEach(item => {
                adminDashboard.findCardByContent('#ratings-pane', item.comment).find('.bulk-checkbox').check();
            });

            // Perform bulk approve - should skip the already approved one
            cy.on('window:confirm', (str) => {
                expect(str).to.contain('Perform \'approve\' on 2 items?');
                expect(str).to.contain('(1 invalid items will be skipped)');
                return true;
            });
            adminDashboard.performBulkAction('#ratings-pane', 'approve');

            // Verify the other 2 are now approved
            adminDashboard.findCardByContent('#ratings-pane', itemsToTest[1].comment).should('contain', 'Approved');
            adminDashboard.findCardByContent('#ratings-pane', itemsToTest[2].comment).should('contain', 'Approved');
        });

        it('should perform bulk "block sender" and remove items from view', () => {
            // Select all 3
            itemsToTest.forEach(item => {
                adminDashboard.findCardByContent('#ratings-pane', item.comment).find('.bulk-checkbox').check();
            });

            adminDashboard.performBulkAction('#ratings-pane', 'block');

            // Verify all are gone from the ratings list
            itemsToTest.forEach(item => {
                adminDashboard.findCardByContent('#ratings-pane', item.comment).should('not.exist');
            });

            // Verify all emails are in the blocked list
            adminDashboard.navigateToTab('blocked');
            itemsToTest.forEach(item => {
                adminDashboard.findCardByContent('#blocked-pane', item.email).should('be.visible');
            });
        });
    });

    context('Statistics Page', () => {
        it('should allow changing chart type and selecting data sources', () => {
            adminDashboard.navigateToTab('stats');

            // Change chart type
            adminDashboard.statsPane.find('#stats-chart-type').select('line');
            adminDashboard.statsPane.find('#stats-apply-btn').click();
            // Basic check to see if the chart exists
            adminDashboard.statsPane.find('#stats-chart').should('be.visible');

            // Change data selection (deselect all, then select one)
            adminDashboard.statsPane.find('#stats-data-select').select([]);
            adminDashboard.statsPane.find('#stats-data-select').select('blocked');
            adminDashboard.statsPane.find('#stats-apply-btn').click();
            adminDashboard.statsPane.find('#stats-chart').should('be.visible');
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
