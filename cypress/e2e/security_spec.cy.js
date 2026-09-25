describe('Security and SEO', () => {
  it('robots.txt allows the CV and disallows admin and test trees', () => {
    cy.request('/robots.txt').its('body').then((body) => {
      expect(body).to.match(/Allow:\s*\//);
      expect(body).to.match(/Disallow:\s*\/admin\.html/);
      expect(body).to.match(/Disallow:\s*\/cypress\//);
      expect(body).to.match(/Disallow:\s*\/tests\//);
      expect(body).to.include('Sitemap:');
    });
  });

  it('sitemap lists CV and simulator and omits admin', () => {
    cy.request('/sitemap.xml').its('body').then((xml) => {
      expect(xml).to.include('carlosandmunoz.com/');
      expect(xml).to.include('simulador.html');
      expect(xml).to.include('qa-lab.html');
      expect(xml).to.include('qa-lab.html?lang=es');
      expect(xml).not.to.include('admin.html');
    });
  });

  it('admin is noindex', () => {
    cy.visit('/admin.html');
    cy.get('meta[name="robots"]').should('have.attr', 'content').and('match', /noindex/i);
  });

  it('CV is indexable and has canonical plus JSON-LD', () => {
    cy.visitCV();
    cy.get('meta[name="robots"]').should('have.attr', 'content').and('match', /index/i);
    cy.get('link[rel="canonical"]').should('have.attr', 'href').and('include', 'carlosandmunoz.com');
    cy.get('#site-structured-data').invoke('text').should('include', 'featureList').and('include', 'QA regression lab');
    cy.get('#person-structured-data').invoke('text').should('include', 'Carlos').and('match', /18 (years|años)/i);
    cy.get('#competencies-structured-data').invoke('text').should('include', 'DefinedTerm').and('include', 'topic=pm');
    cy.get('meta[name="keywords"]').should('have.attr', 'content').and('include', 'IT Project Management');
  });

  it('external profile links use noopener', () => {
    cy.visitCV();
    cy.get('#contact-linkedin a').should('have.attr', 'rel').and('include', 'noopener');
    cy.get('#contact-linkedin a').should('have.attr', 'target', '_blank');
  });

  it('lang query does not execute script payloads', () => {
    const hits = [];
    cy.on('window:alert', (msg) => hits.push(msg));
    cy.visitCV({ qs: '?lang=%3Cscript%3Ealert(1)%3C/script%3E' });
    cy.get('.main-container').should('be.visible');
    cy.wrap(hits).should('deep.equal', []);
  });

  it('public chrome does not link to admin.html', () => {
    cy.visitCV();
    cy.get('a[href*="admin.html"]').should('have.length', 0);
    cy.visit('/simulador.html', {
      onBeforeLoad(win) {
        win.sessionStorage.setItem('hasSeenStudioTour', 'true');
      }
    });
    cy.get('a[href*="admin.html"]').should('have.length', 0);
  });
});
