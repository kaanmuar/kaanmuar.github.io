describe('Sprint studio', () => {
  beforeEach(() => {
    cy.visit('/simulador.html', {
      onBeforeLoad(win) {
        win.localStorage.setItem('theme', 'light');
      }
    });
  });

  it('loads the board and run control', () => {
    cy.contains('button', 'Run 4-agent sprint').should('be.visible');
    cy.contains('button', 'Jira board').should('be.visible');
    cy.contains('a', 'CV regression lab').should('be.visible');
    cy.get('#homeBtn').should('be.visible');
    cy.get('.ticket').should('have.length.at.least', 1);
  });

  it('follows CV light theme on first load', () => {
    cy.get('html').should('not.have.class', 'dark-mode');
  });

  it('theme toggle flips dark-mode', () => {
    cy.get('#theme-toggle').click();
    cy.get('html').should('have.class', 'dark-mode');
  });

  it('can open Xray and automation views', () => {
    cy.contains('button', 'Xray / TestRail').click();
    cy.contains('button', 'Automation lab').click();
    cy.contains('button', 'Jira board').click().should('be.visible');
  });
});
