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
        super.visit('index.html');
    }

    get testimonialsContainer() { return cy.get('#testimonials-container'); }
}

class ContactWidget {
    get contactWidgetFab() { return cy.get('#contact-widget-fab'); }
    get ratingForm() { return cy.get('#rating-form'); }
    get messageForm() { return cy.get('#message-form'); }
    get successMessage() { return cy.get('#widget-status-container:contains("Success")'); }
    get errorMessage() { return cy.get('#widget-status-container:contains("Error")'); }
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
    // Tabs & Panes
    get messagesPane() { return cy.get('#messages-pane'); }
    get ratingsPane() { return cy.get('#ratings-pane'); }
    get dashboard() { return cy.get('#dashboard'); }
    get logoutButton() { return cy.contains('button', 'Logout'); }

    // NEW: Response Modal
    get responseModal() { return cy.get('#response-modal-overlay'); }
    get responseTextarea() { return this.responseModal.find('#response-message'); }
    get publicCheckbox() { return this.responseModal.find('#response-is-public'); }
    get sendResponseButton() { return this.responseModal.find('#response-send-btn'); }
    get cancelResponseButton() { return this.responseModal.find('#response-cancel-btn'); }

    // Methods
    visitDashboard() { cy.visit('/admin.html'); }
    verifyDashboardIsVisible() { this.dashboard.should('be.visible', { timeout: 10000 }); }
    logout() { this.logoutButton.click(); }
    navigateToTab(tabName) {
        cy.get(`#${tabName}-tab-btn`).click();
        cy.get(`#${tabName}-pane`).should('be.visible');
    }
    findCardByContent(pane, text) { return cy.get(`${pane} .item-card:contains("${text}")`); }

    // Card & Modal Actions
    performActionOnCard(pane, content, action) {
        cy.on('window:confirm', () => true);
        this.findCardByContent(pane, content).find(`button[data-action="${action}"]`).click();
    }

    respondToCard(pane, content, responseData) {
        this.performActionOnCard(pane, content, 'respond');
        this.responseModal.should('be.visible');
        if (responseData.response) this.responseTextarea.type(responseData.response);
        if (responseData.isPublic) this.publicCheckbox.check();
        cy.on('window:alert', () => true); // Handle success alert
        this.sendResponseButton.click();
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
            topic: 'Job Opportunity / Collaboration',
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

    // --- FIXED: Filtering Functionality ---
    context('Filtering Functionality (Fixed)', () => {
        let testMessage, testRating;

        before(() => {
            cy.loginWithSession();
            testMessage = createMessage();
            testRating = createRating();
        });

        it('should filter messages by name after clicking Apply', () => {
            adminDashboard.navigateToTab('messages');
            adminDashboard.messagesPane.find('#msg-filter-name').type(testMessage.name);
            adminDashboard.messagesPane.find('.filter-apply-btn').click(); // FIX: Click apply
            adminDashboard.messagesPane.find('#messages-list').children().should('have.length.at.least', 1);
            adminDashboard.findCardByContent('#messages-pane', testMessage.name).should('be.visible');
        });

        it('should filter ratings by status after clicking Apply', () => {
            adminDashboard.navigateToTab('ratings');
            adminDashboard.ratingsPane.find('#rate-filter-status').select('pending');
            adminDashboard.ratingsPane.find('.filter-apply-btn').click(); // FIX: Click apply
            adminDashboard.ratingsPane.find('#ratings-list').should('contain', testRating.name);
            adminDashboard.findCardByContent('#ratings-pane', testRating.name).should('contain', 'Pending');
        });

        it('should reset filters when Reset button is clicked', () => {
            adminDashboard.navigateToTab('messages');
            adminDashboard.messagesPane.find('#msg-filter-name').type('some-non-existent-name');
            adminDashboard.messagesPane.find('.filter-apply-btn').click();
            adminDashboard.messagesPane.find('#messages-list').should('contain', 'No items to display');

            adminDashboard.messagesPane.find('.filter-reset-btn').click();
            adminDashboard.messagesPane.find('#messages-list').should('not.contain', 'No items to display');
        });
    });

    // --- NEW: Respond and Testimonial Functionality ---
    context('Respond and Public Testimonial Functionality', () => {
        it('should respond to a message privately', () => {
            const msg = createMessage();
            const responseText = 'This is a private response from the admin.';
            adminDashboard.visitDashboard();
            adminDashboard.navigateToTab('messages');

            // Respond privately
            adminDashboard.respondToCard('#messages-pane', msg.message, { response: responseText, isPublic: false });

            // Verify card shows it's been responded to
            adminDashboard.findCardByContent('#messages-pane', msg.message).find('.responded-badge').should('be.visible');

            // Verify it did NOT appear on the public CV page
            cvPage.visitCV();
            cvPage.testimonialsContainer.should('not.contain', msg.message)
                .and('not.contain', responseText);
        });

        it('should respond to an approved rating and make it public', () => {
            const rating = createRating({ stars: 4 });
            const responseText = 'Thank you for the fantastic 4-star review!';
            adminDashboard.visitDashboard();
            adminDashboard.navigateToTab('ratings');

            // First, approve the rating
            adminDashboard.performActionOnCard('#ratings-pane', rating.comment, 'approve');
            adminDashboard.findCardByContent('#ratings-pane', rating.comment).should('contain', 'Approved');

            // Now, respond and make it public
            adminDashboard.respondToCard('#ratings-pane', rating.comment, { response: responseText, isPublic: true });
            adminDashboard.findCardByContent('#ratings-pane', rating.comment).find('.responded-badge').should('be.visible');

            // Verify it appears correctly on the public CV page
            cvPage.visitCV();
            const testimonialCard = cvPage.testimonialsContainer.find(`.testimonial-card:contains("${rating.comment}")`);
            testimonialCard.should('be.visible');
            testimonialCard.should('contain', rating.comment);
            testimonialCard.should('contain', rating.name);
            testimonialCard.find('.testimonial-stars').should('contain', '★★★★');
            testimonialCard.find('.admin-response').should('be.visible').and('contain', responseText);
        });

        it('should respond to a message and make it public', () => {
            const msg = createMessage({ topic: 'Feedback' });
            const responseText = 'We appreciate your feedback and will take it into consideration.';
            adminDashboard.visitDashboard();
            adminDashboard.navigateToTab('messages');

            // Respond and make public
            adminDashboard.respondToCard('#messages-pane', msg.message, { response: responseText, isPublic: true });
            adminDashboard.findCardByContent('#messages-pane', msg.message).find('.responded-badge').should('be.visible');

            // Verify it appears on the public CV page without stars
            cvPage.visitCV();
            const testimonialCard = cvPage.testimonialsContainer.find(`.testimonial-card:contains("${msg.message}")`);
            testimonialCard.should('be.visible');
            testimonialCard.should('contain', msg.message);
            testimonialCard.should('contain', msg.name);
            testimonialCard.find('.testimonial-stars').should('not.exist');
            testimonialCard.find('.admin-response').should('be.visible').and('contain', responseText);
        });
    });

    // Keep existing tests for regression
    context('Single Item Actions (Reject, Restore, Block, Unblock)', () => {
        it('should reject a message and then restore it', () => {
            const msg = createMessage();
            adminDashboard.visitDashboard();
            adminDashboard.navigateToTab('messages');
            adminDashboard.performActionOnCard('#messages-pane', msg.message, 'reject-msg');
            adminDashboard.findCardByContent('#messages-pane', msg.message).should('not.exist');
            adminDashboard.navigateToTab('rejected');
            adminDashboard.findCardByContent('#rejected-pane', msg.message).should('be.visible');
            adminDashboard.performActionOnCard('#rejected-pane', msg.message, 'restore-msg');
            adminDashboard.findCardByContent('#rejected-pane', msg.message).should('not.exist');
            adminDashboard.navigateToTab('messages');
            adminDashboard.findCardByContent('#messages-pane', msg.message).should('be.visible');
        });
    });
});
