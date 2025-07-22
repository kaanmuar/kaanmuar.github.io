// cypress/support/commands.js

/**
 * A robust login command that uses cy.session for efficiency.
 * It performs the login steps only once and restores the session
 * for subsequent tests, making the suite much faster.
 */
Cypress.Commands.add('loginWithSession', () => {
    cy.session('adminUser', () => {
        // 1. Visit the admin page directly
        cy.visit('/admin.html');

        // 2. Perform the login using direct Cypress commands
        cy.get('#email').type('kaanmuar@gmail.com');
        cy.get('#password').type('Krlos.8403', { log: false });
        cy.get('#login-form button[type="submit"]').click();

        // 3. Verify login was successful
        cy.get('#dashboard').should('be.visible');
    }, {
        // Ensures the session is cleared when the spec file finishes
        cacheAcrossSpecs: false
    });
});
