// cypress/support/pages/Admin/LoginPage.js

import { BasePage } from '@/support/pages/BasePage';

/**
 * Represents the Admin Login page.
 * It encapsulates the login form elements and the actions to interact with them.
 * This replaces the need for a custom cy.login() command.
 */
export class LoginPage extends BasePage {
    // --- Selectors ---
    get emailInput() { return cy.get('#email'); }
    get passwordInput() { return cy.get('#password'); }
    get submitButton() { return cy.get('#login-form button[type="submit"]'); }
    get errorMessage() { return cy.get('#login-error'); }
    get loginOverlay() { return cy.get('#login-overlay'); }

    // --- Actions ---

    /**
     * Visits the admin page.
     */
    visitAdminPage() {
        this.visit('admin.html');
    }

    /**
     * Enters credentials and submits the login form.
     * @param {string} email - The user's email address.
     * @param {string} password - The user's password.
     */
    login(email, password) {
        this.emailInput.type(email);
        this.passwordInput.type(password);
        this.submitButton.click();
    }

    // --- Verifications ---

    /**
     * Verifies that the login error message is displayed.
     */
    verifyLoginErrorIsVisible() {
        this.errorMessage.should('be.visible');
    }

    /**
     * Verifies that the login overlay is visible, indicating the user is logged out.
     */
    verifyIsLoggedOut() {
        this.loginOverlay.should('be.visible');
    }
}
