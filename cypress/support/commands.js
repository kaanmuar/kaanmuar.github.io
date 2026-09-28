Cypress.Commands.add('skipSiteTours', (win) => {
  win.sessionStorage.setItem('hasSeenTour', 'true');
  win.sessionStorage.setItem('hasSeenLabTour', 'true');
  win.sessionStorage.setItem('hasSeenStudioTour', 'true');
  win.sessionStorage.setItem('qa-lab-fw-asked', '1');
});

Cypress.Commands.add('visitCV', (options = {}) => {
  const { tour = false, theme = 'light', qs = '' } = options;
  cy.visit(`/index.html${qs}`, {
    onBeforeLoad(win) {
      if (tour) win.sessionStorage.removeItem('hasSeenTour');
      else win.sessionStorage.setItem('hasSeenTour', 'true');
      win.sessionStorage.setItem('hasSeenLabTour', 'true');
      win.sessionStorage.setItem('hasSeenStudioTour', 'true');
      win.sessionStorage.setItem('qa-lab-fw-asked', '1');
      if (!win.localStorage.getItem('theme')) win.localStorage.setItem('theme', theme);
      if (!(qs && /lang=/.test(qs))) win.localStorage.setItem('cv-preferred-lang', 'en');
    }
  });
  cy.get('.main-container').should('be.visible');
  cy.window().should('have.property', 'CarlosMunozCV');
});

Cypress.Commands.add('visitAdmin', () => {
  cy.visit('/admin.html');
});

Cypress.Commands.add('loginAdmin', () => {
  const email = Cypress.env('ADMIN_EMAIL') || 'kaanmuar@gmail.com';
  const password = Cypress.env('ADMIN_PASSWORD');
  if (!password) {
    throw new Error('Set Cypress env ADMIN_PASSWORD to run authenticated admin tests.');
  }
  cy.visit('/admin.html');
  cy.get('#email').type(email);
  cy.get('#password').type(password, { log: false });
  cy.get('#login-form button[type="submit"]').click();
  cy.get('#login-title').should('have.text', 'Authenticator');
  cy.get('#dashboard').should('not.be.visible');
  cy.get('#login-form').should('not.be.visible');
  cy.get('#mfa-form:visible, #mfa-enroll:visible').should('have.length', 1);
});

Cypress.Commands.add('forceGlancePair', (index = 0) => {
  cy.window().then((win) => {
    if (win.CarlosMunozCV && typeof win.CarlosMunozCV._showGlancePair === 'function') {
      win.CarlosMunozCV._showGlancePair(index, false);
    }
  });
});
