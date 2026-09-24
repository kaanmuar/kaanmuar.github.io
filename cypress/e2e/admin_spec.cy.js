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
      cy.visit('/admin.html');
      cy.get('#dashboard').should('be.visible');
    });

    it('shows dashboard tabs after login', () => {
      cy.get('#messages-tab-btn').should('be.visible');
      cy.get('#ratings-tab-btn').should('be.visible');
      cy.get('#rejected-tab-btn').should('be.visible');
      cy.get('#blocked-tab-btn').should('be.visible');
      cy.get('#stats-tab-btn').should('be.visible');
    });

    it('can switch between admin tabs', () => {
      cy.get('#ratings-tab-btn').click();
      cy.get('#ratings-pane').should('be.visible');
      cy.get('#stats-tab-btn').click();
      cy.get('#stats-pane').should('be.visible');
      cy.get('#messages-tab-btn').click();
      cy.get('#messages-pane').should('be.visible');
    });
  });
});
