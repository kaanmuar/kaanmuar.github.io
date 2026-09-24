describe('Accessibility', () => {
  it('CV has no serious WCAG 2 A/AA axe violations outside overlays', () => {
    cy.visitCV();
    cy.injectAxe();
    cy.checkA11y(
      { exclude: ['#contact-widget', '#tour-tooltip', '.skiptranslate'] },
      { includedImpacts: ['critical', 'serious'], rules: { 'color-contrast': { enabled: false } } }
    );
  });

  it('exposes a main landmark and named heading', () => {
    cy.visitCV();
    cy.get('main.main-content').should('have.length', 1);
    cy.contains('h1', /Carlos/i).should('be.visible');
  });

  it('desktop theme toggle is keyboard-focusable', () => {
    cy.visitCV();
    cy.get('#theme-toggle').focus().should('have.focus');
  });

  it('profile photo has an accessible name', () => {
    cy.visitCV();
    cy.get('#profile-photo').should('have.attr', 'alt').and('not.be.empty');
  });

  it('admin login fields are labeled', () => {
    cy.visit('/admin.html');
    cy.get('label[for="email"]').should('be.visible');
    cy.get('label[for="password"]').should('be.visible');
  });
});
