class LoginPage {
  get emailInput() { return cy.get('#email'); }
  get passwordInput() { return cy.get('#password'); }
  get submitButton() { return cy.get('#login-form button[type="submit"]'); }
  get loginOverlay() { return cy.get('#login-overlay'); }
  get dashboard() { return cy.get('#dashboard'); }

  visit() {
    cy.visitAdmin();
    this.loginOverlay.should('be.visible');
  }
}

const loginPage = new LoginPage();
const hasAdminPassword = Boolean(Cypress.env('ADMIN_PASSWORD'));

describe('Admin panel', () => {
  it('shows the login overlay when unauthenticated', () => {
    loginPage.visit();
    loginPage.dashboard.should('not.be.visible');
    cy.get('#admin-home').should('be.visible');
  });

  it('rejects an empty login attempt', () => {
    loginPage.visit();
    loginPage.submitButton.click();
    loginPage.emailInput.then(($el) => {
      expect($el[0].validity.valueMissing).to.eq(true);
    });
  });

  it('rejects invalid credentials without opening the dashboard', () => {
    loginPage.visit();
    loginPage.emailInput.type('nobody@example.com');
    loginPage.passwordInput.type('wrong-password-000', { log: false });
    loginPage.submitButton.click();
    loginPage.dashboard.should('not.be.visible');
    loginPage.loginOverlay.should('be.visible');
  });

  context('authenticated flows', () => {
    beforeEach(function () {
      if (!hasAdminPassword) this.skip();
      cy.loginAdmin();
    });

    it('keeps the dashboard behind the authenticator', () => {
      cy.get('#messages-tab-btn').should('not.be.visible');
    });

    it('asks for a 6-digit code on the authenticator step', () => {
      cy.get('#mfa-form:visible, #mfa-enroll:visible').within(() => {
        cy.contains('label', 'Authenticator code').should('be.visible');
        cy.get('input[inputmode="numeric"]').should('be.visible');
      });
    });

    it('a short code stays on the authenticator step', () => {
      cy.get('#mfa-form:visible, #mfa-enroll:visible').within(() => {
        cy.get('input[inputmode="numeric"]').type('12');
        cy.get('button[type="submit"]').click();
        cy.get('#mfa-error, #mfa-enroll-error').invoke('text').should('not.be.empty');
      });
      cy.get('#dashboard').should('not.be.visible');
    });
  });
});
