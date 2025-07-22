// In cypress/support/e2e.js

import 'cypress-axe';
import '@/support/commands';
import 'cypress-mochawesome-reporter/register';

// This custom command is the single source of truth for logging in.
// It uses cy.session() to cache the login, making tests much faster.
Cypress.Commands.add('login', () => {
    cy.session(
        'admin-user',
        () => {
            // This part runs only once to log in and save the session
            cy.visit('admin.html');
            cy.get('#email').type('kaanmuar@gmail.com');
            cy.get('#password').type('Krlos.8403', { log: false });
            cy.get('#login-form button[type="submit"]').click();
            // Wait for the direct result of a successful login
            cy.get('#dashboard').should('be.visible');
        },
        {
            // This validation runs before each test using the session
            // to ensure the session is still valid.
            validate() {
                cy.visit('admin.html');
                cy.get('#login-overlay').should('not.be.visible');
                cy.get('#dashboard').should('be.visible');
            },
        }
    );
});
