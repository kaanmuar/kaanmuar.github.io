describe('Accessibility', () => {
  it('CV has no serious WCAG 2 A/AA axe violations outside overlays', () => {
    cy.visitCV();
    cy.injectAxe();
    cy.checkA11y(
      { exclude: ['#contact-widget', '.skiptranslate'] },
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

  it('CV tour card is a labelled dialog and takes focus', () => {
    cy.visitCV();
    cy.get('#tour-start-btn').first().click();
    cy.get('#tour-tooltip').should('be.visible').and('have.attr', 'role', 'dialog').and('have.focus');
    cy.get('#tour-title').invoke('text').should('not.be.empty');
    cy.get('#tour-description').invoke('text').should('not.be.empty');
    cy.get('#tour-close-btn').should('contain', 'Close');
    cy.get('#tour-tooltip').trigger('keydown', { key: 'Escape', bubbles: true });
    cy.get('#tour-tooltip').should('not.be.visible');
  });

  it('studio tour card is a labelled dialog and takes focus', () => {
    cy.visit('/simulador.html', { onBeforeLoad(win) { win.sessionStorage.setItem('hasSeenStudioTour', 'true'); } });
    cy.get('#tour-start-btn').click();
    cy.get('#site-tour-tooltip').should('be.visible').and('have.attr', 'role', 'dialog').and('have.focus');
    cy.get('#site-tour-title').should('have.text', 'Sprint views');
    cy.get('#site-tour-body').invoke('text').should('not.be.empty');
    cy.get('#site-tour-tooltip').trigger('keydown', { key: 'Escape', bubbles: true });
    cy.get('#site-tour-tooltip').should('not.be.visible');
  });

  it('lab tour card is a labelled dialog and takes focus', () => {
    cy.visit('/qa-lab.html', {
      onBeforeLoad(win) {
        win.sessionStorage.setItem('hasSeenLabTour', 'true');
        win.sessionStorage.setItem('qa-lab-fw-asked', '1');
      }
    });
    cy.get('#tour-start-btn').click();
    cy.get('#site-tour-tooltip').should('be.visible').and('have.attr', 'role', 'dialog').and('have.focus');
    cy.get('#site-tour-title').should('have.text', 'The catalog');
    cy.get('#site-tour-body').invoke('text').should('not.be.empty');
    cy.get('#site-tour-tooltip').trigger('keydown', { key: 'Escape', bubbles: true });
    cy.get('#site-tour-tooltip').should('not.be.visible');
  });

  it('admin login fields are labeled', () => {
    cy.visit('/admin.html');
    cy.get('label[for="email"]').should('be.visible');
    cy.get('label[for="password"]').should('be.visible');
  });
});
