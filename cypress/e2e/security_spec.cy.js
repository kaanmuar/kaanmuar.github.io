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
      expect(xml).not.to.include('globant.com');
      expect(xml).not.to.include('zaga.co');
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
    cy.get('#person-structured-data').invoke('text').should('include', 'Carlos').and('match', /18 (years|años)/i).and('include', 'https://zaga.co').and('include', 'https://publicisproduction.com');
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

  it('the login control is the only public link to admin', () => {
    cy.visitCV();
    cy.get('a[href*="admin.html"]').should('have.length', 2);
    cy.get('#admin-login-btn').should('have.attr', 'href', 'admin.html');
    cy.get('#admin-login-btn-mobile').should('have.attr', 'href', 'admin.html');
    cy.visit('/simulador.html', {
      onBeforeLoad(win) {
        win.sessionStorage.setItem('hasSeenStudioTour', 'true');
      }
    });
    cy.get('a[href*="admin.html"]').should('have.length', 1);
    cy.get('#admin-login-btn').should('have.attr', 'href', 'admin.html');
  });

  it('names each clip video, poster, and duration', () => {
    const clips = [
      ['media/qa-lab-running.html', 'QA Lab running', 'PT54S', 'qa-lab-running.mp4', 'qa-lab-running.jpg'],
      ['media/qa-lab-tour.html', 'QA Lab tour', 'PT41S', 'qa-lab-tour.mp4', 'qa-lab-tour.jpg'],
      ['media/sdlc-studio-running.html', 'SDLC Studio sprint', 'PT1M33S', 'sdlc-studio-running.mp4', 'sdlc-studio-running.jpg'],
      ['media/sdlc-studio-tour.html', 'SDLC Studio tour', 'PT26S', 'sdlc-studio-tour.mp4', 'sdlc-studio-tour.jpg']
    ];
    cy.request('/sitemap.xml').its('body').then((sitemap) => {
      clips.forEach(([page, title, duration, video, poster]) => {
        expect(sitemap).to.include('https://carlosandmunoz.com/' + page);
        cy.request('/' + page).its('body').then((html) => {
          expect(html).to.include('<h1>' + title + '</h1>');
          expect(html).to.include('"duration": "' + duration + '"');
          expect(html).to.include('src="' + video + '"');
          expect(html).to.include('poster="' + poster + '"');
          expect(html).to.not.include('admin.html');
        });
      });
    });
    clips.forEach(([, , , video, poster]) => {
      cy.request({ url: '/media/' + video, method: 'HEAD' }).its('headers').its('content-type').should('include', 'video/mp4');
      cy.request({ url: '/media/' + poster, method: 'HEAD' }).its('headers').its('content-type').should('include', 'image/jpeg');
    });
  });

  it('lists every hreflang and omits admin from the sitemap', () => {
    cy.request('/sitemap.xml').its('body').then((xml) => {
      expect(xml).to.not.include('admin.html');
      ['https://carlosandmunoz.com/', 'https://carlosandmunoz.com/simulador.html', 'https://carlosandmunoz.com/qa-lab.html'].forEach((loc) => {
        ['en', 'es', 'pt', 'de', 'fr', 'it', 'x-default'].forEach((code) => {
          expect(xml).to.include('hreflang="' + code + '"');
        });
        expect(xml).to.include('hreflang="es" href="' + loc + '?lang=es"');
        expect(xml).to.include('hreflang="it" href="' + loc + '?lang=it"');
      });
    });
  });
});
