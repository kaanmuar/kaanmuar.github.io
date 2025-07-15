// cypress/e2e/admin_spec.cy.js

describe('Admin Panel Test Suite', { tags: '@admin' }, () => {

    const ADMIN_EMAIL = 'kaanmuar@gmail.com'; // Your admin email
    const ADMIN_PASSWORD = 'YOUR_ADMIN_PASSWORD'; // IMPORTANT: Replace this

    beforeEach(() => {
        cy.visit('admin.html');
    });

    context('Admin Authentication', { tags: '@auth' }, () => {

        it('should fail to login with incorrect credentials', () => {
            cy.get('#email').type('wrong@user.com');
            cy.get('#password').type('wrongpassword');
            cy.get('#login-form button[type="submit"]').click();
            cy.get('#login-error').should('be.visible').and('contain.text', 'Login failed');
        });

        it('should successfully log in and log out', { tags: '@critical' }, () => {
            cy.get('#email').type(ADMIN_EMAIL);
            cy.get('#password').type(ADMIN_PASSWORD, { log: false });
            cy.get('#login-form button[type="submit"]').click();
            cy.get('#dashboard').should('be.visible');
            cy.get('#logout-btn').click();
            cy.get('#login-overlay').should('be.visible');
        });
    });

    context('Admin Dashboard Functionality', () => {

        beforeEach(() => {
            cy.get('#email').type(ADMIN_EMAIL);
            cy.get('#password').type(ADMIN_PASSWORD, { log: false });
            cy.get('#login-form button[type="submit"]').click();
            cy.get('#dashboard').should('be.visible');
        });

        it('should switch between Messages and CV Ratings tabs', () => {
            cy.get('#ratings-tab-btn').click();
            cy.get('#ratings-pane').should('be.visible');
            cy.get('#messages-pane').should('not.be.visible');
        });

        it('should display ratings and allow status changes', { tags: '@regression' }, () => {
            cy.get('#ratings-tab-btn').click();
            cy.get('#ratings-list .item-card').first().as('firstRating');
            cy.get('@firstRating').find('button').contains('Approve').should('be.visible');
            cy.get('@firstRating').find('button').contains('Reject').should('be.visible');
        });
    });
});