describe('CV regression lab', () => {
  beforeEach(() => {
    cy.visit('/qa-lab.html', {
      onBeforeLoad(win) {
        win.localStorage.setItem('theme', 'light');
        win.sessionStorage.setItem('hasSeenLabTour', 'true');
        win.sessionStorage.setItem('hasSeenStudioTour', 'true');
      }
    });
  });

  it('lists cases and explains where, when, and how', () => {
    cy.contains('h1', 'The suite I run on this CV').should('be.visible');
    cy.get('.case-row').should('have.length', 47);
    cy.contains('.case-id', 'MOB-01').should('exist');
    cy.contains('.case-id', 'FN-15').should('exist');
    cy.contains('.case-id', 'FN-22').should('exist');
    cy.contains('.case-id', 'SEC-08').should('exist');
    cy.contains('.case-id', 'STU-03').should('exist');
    cy.get('.src-link').first().should('have.attr', 'href').and('include', 'github.com/kaanmuar/kaanmuar.github.io/blob/main/');
    cy.contains('a', 'Suite repo').should('have.attr', 'href', 'https://github.com/kaanmuar/kaanmuar.github.io');
    cy.get('#case-detail').should('contain', 'Where').and('contain', 'When').and('contain', 'How');
    cy.get('#dash-charts .chart-card').should('have.length.at.least', 3);
    cy.get('#homeBtn').should('be.visible');
    cy.get('#langToggle').should('be.visible');
    cy.get('[data-pace="1"]').should('have.class', 'on');
    cy.get('[data-view="watch"]').should('have.class', 'on');
    cy.get('#sut').should('be.visible');
  });

  it('lets the visitor pick a slower pace', () => {
    cy.get('[data-pace="1.5"]').click();
    cy.get('[data-pace="1.5"]').should('have.class', 'on');
  });

  it('defaults to Watch and can hide actions', () => {
    cy.get('html').should('have.class', 'lab-watch');
    cy.get('#sut').should('be.visible');
    cy.get('[data-view="background"]').click();
    cy.get('html').should('have.class', 'lab-background');
    cy.get('#sut').should('not.be.visible');
    cy.get('.sut-bg-note').should('be.visible');
  });

  it('runs SMK-01 and writes a passing report row', () => {
    cy.contains('.case-id', 'SMK-01').click();
    cy.contains('button', 'Run this case').click();
    cy.get('#run-log', { timeout: 30000 }).should('contain', 'PASS');
    cy.get('#report-body').should('contain', 'SMK-01');
    cy.get('#kpi-pass').should('contain', '1');
    cy.get('#dash-overlay').should('have.class', 'open');
    cy.get('#dash-title').should('be.visible');
    cy.get('#dash-close').click();
    cy.get('#dash-overlay').should('not.have.class', 'open');
  });

  it('opens the dashboard splash from the header', () => {
    cy.get('#dash-open').click();
    cy.get('#dash-overlay').should('have.class', 'open');
    cy.get('#dash-title').should('be.visible');
    cy.get('#dash-close').click();
  });

  it('starts a guided tour of the lab', () => {
    cy.get('#tour-start-btn').click();
    cy.get('#site-tour-overlay').should('have.class', 'on');
    cy.get('#site-tour-title').should('have.text', 'The catalog');
    cy.get('#site-tour-close').click();
  });

  it('advances the lab tour with Next', () => {
    cy.get('#tour-start-btn').click();
    cy.get('#site-tour-next').should('be.disabled');
    cy.get('#site-tour-next', { timeout: 4000 }).should('not.be.disabled');
    cy.get('#site-tour-next').click();
    cy.get('#site-tour-title').should('have.text', 'Filter by type');
    cy.get('#site-tour-close').click();
  });

  it('closes the dashboard splash from the backdrop', () => {
    cy.get('#dash-open').click();
    cy.get('#dash-overlay').should('have.class', 'open');
    cy.get('#dash-overlay').click('topLeft');
    cy.get('#dash-overlay').should('not.have.class', 'open');
  });

  it('narrows the catalog with the Mobile filter', () => {
    cy.get('.case-row').its('length').then((all) => {
      cy.get('[data-filter="Mobile"]').click();
      cy.get('.case-row').its('length').should('be.lt', all).and('be.gt', 0);
    });
    cy.contains('.case-id', 'MOB-01').should('exist');
  });

  it('closes the dashboard splash with Escape', () => {
    cy.get('#dash-open').click();
    cy.get('#dash-overlay').should('have.class', 'open');
    cy.get('body').type('{esc}');
    cy.get('#dash-overlay').should('not.have.class', 'open');
  });
});
