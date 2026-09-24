describe('CV regression lab', () => {
  beforeEach(() => {
    cy.visit('/qa-lab.html', {
      onBeforeLoad(win) {
        win.localStorage.setItem('theme', 'light');
      }
    });
  });

  it('lists cases and explains where, when, and how', () => {
    cy.contains('h1', 'The suite I run on this CV').should('be.visible');
    cy.get('.case-row').should('have.length.at.least', 10);
    cy.contains('.case-id', 'MOB-01').should('exist');
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
  });
});
