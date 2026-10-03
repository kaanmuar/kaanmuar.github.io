describe('Sprint studio', () => {
  beforeEach(() => {
    cy.visit('/simulador.html', {
      onBeforeLoad(win) {
        win.localStorage.setItem('theme', 'light');
        win.sessionStorage.setItem('hasSeenStudioTour', 'true');
        win.sessionStorage.setItem('hasSeenLabTour', 'true');
      }
    });
  });

  it('loads the board and run control', () => {
    cy.contains('button', 'Run 4-agent sprint').should('be.visible');
    cy.contains('button', 'Jira board').should('be.visible');
    cy.contains('a', 'CV regression lab').should('be.visible');
    cy.get('#homeBtn').should('be.visible');
    cy.get('#tour-start-btn').should('be.visible');
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

  it('starts a guided tour of the studio', () => {
    cy.get('#tour-start-btn').click();
    cy.get('#site-tour-overlay').should('have.class', 'on');
    cy.get('#site-tour-title').should('have.text', 'Sprint views');
    cy.get('#site-tour-close').click();
  });

  it('advances the studio tour with Next', () => {
    cy.get('#tour-start-btn').click();
    cy.get('#site-tour-next').should('be.disabled');
    cy.get('#site-tour-next', { timeout: 4000 }).should('not.be.disabled');
    cy.get('#site-tour-next').click();
    cy.get('#site-tour-title').should('have.text', 'Four agents');
    cy.get('#site-tour-close').click();
  });

  it('renames columns on Linear and keeps PAY-241', () => {
    cy.get('[data-board-view="linear"]').click();
    cy.get('#view').should('have.class', 'board-linear');
    cy.get('#view .col h3 span:first-child').then(($spans) => {
      expect([...$spans].map((span) => span.textContent.trim())).to.deep.equal(['Todo', 'In Progress', 'In Review', 'In QA', 'Done']);
    });
    cy.get('#view').should('contain', 'PAY-241');
    cy.get('.nav button[data-view="board"]').should('have.text', 'Linear');
  });

  it('shows only Backlog and CV-410', () => {
    cy.get('[data-sprint="Backlog"]').click();
    cy.get('#view .col h3 span:first-child').should('have.text', 'Backlog');
    cy.get('[data-sprint="Backlog"]').should('have.class', 'on');
    cy.get('#view').should('contain', 'CV-410').and('not.contain', 'PAY-241');
  });
});
