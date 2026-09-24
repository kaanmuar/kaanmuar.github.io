describe('Mobile — CV, Studio, QA Lab, Admin', () => {
  beforeEach(() => {
    cy.viewport(390, 844);
  });

  it('CV shows the phone toolbar with studio and lab launchers', () => {
    cy.visitCV();
    cy.get('.mobile-toolbar').should('be.visible');
    cy.get('#sim-launch-btn-mobile').should('be.visible');
    cy.get('#qa-lab-btn-mobile').should('be.visible');
    cy.get('#theme-toggle').should('not.be.visible');
    cy.get('#theme-toggle-mobile .sun-icon').should('not.be.visible');
    cy.get('#theme-toggle-mobile .moon-icon').should('be.visible');
    cy.window().then((win) => {
      expect(win.document.documentElement.scrollWidth - win.innerWidth).to.be.at.most(2);
    });
  });

  it('Studio stacks the header without clipping Run', () => {
    cy.visit('/simulador.html', {
      onBeforeLoad(win) {
        win.localStorage.setItem('theme', 'light');
      }
    });
    cy.get('#homeBtn').should('be.visible');
    cy.get('#runBtn').should('be.visible');
    cy.window().then((win) => {
      const bar = win.document.querySelector('.topbar');
      const run = win.document.getElementById('runBtn');
      const br = bar.getBoundingClientRect();
      const rr = run.getBoundingClientRect();
      expect(rr.bottom, 'run clipped by topbar').to.be.at.most(br.bottom + 2);
      expect(br.height).to.be.greaterThan(56);
      expect(['auto', 'scroll', 'visible']).to.include(win.getComputedStyle(win.document.body).overflowY);
    });
  });

  it('QA lab header stays above the heading', () => {
    cy.visit('/qa-lab.html', {
      onBeforeLoad(win) {
        win.localStorage.setItem('theme', 'light');
      }
    });
    cy.get('#homeBtn').should('be.visible');
    cy.get('[data-pace="1"]').should('be.visible');
    cy.get('[data-view="watch"]').should('be.visible');
    cy.get('#sut').should('be.visible');
    cy.get('[data-filter="Mobile"]').should('be.visible');
    cy.window().then((win) => {
      const bar = win.document.querySelector('.topbar');
      const h1 = win.document.querySelector('.intro h1');
      expect(h1.getBoundingClientRect().top).to.be.at.least(bar.getBoundingClientRect().bottom - 1);
    });
    cy.contains('h1', 'The suite I run on this CV').should('be.visible');
  });

  it('Admin login overlay and back link fit the phone', () => {
    cy.visit('/admin.html');
    cy.get('#login-overlay').should('be.visible');
    cy.get('#admin-home').should('be.visible');
    cy.get('#admin-home').click();
    cy.location('pathname').should('include', 'index.html');
  });
});
