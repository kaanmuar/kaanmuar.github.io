const catalog = require('../../tests/native/catalog.json');

const wanted = new Set(String(Cypress.env('CATALOG_IDS') || '').split(',').map((item) => item.trim()).filter(Boolean));
const rows = catalog.filter((row) => !wanted.size || wanted.has(row.id));

describe('Full catalog', () => {
  before(() => {
    cy.task('catalogReset');
  });

  afterEach(function () {
    const failed = this.currentTest.state !== 'passed';
    if (failed && /remote page to load/.test((this.currentTest.err && this.currentTest.err.message) || '')) {
      cy.window({ log: false }).then((win) => {
        const done = new Set(win.performance.getEntriesByType('resource').map((entry) => entry.name));
        const open = Array.from(win.document.querySelectorAll('img[src], script[src], link[href][rel~="stylesheet"], link[href][rel="preload"], iframe[src]'))
          .filter((el) => !(el.tagName === 'IMG' && (el.complete || el.loading === 'lazy')))
          .map((el) => el.src || el.href)
          .filter((url) => url && !done.has(url));
        cy.task('log', `Page load stalled on ${win.location.href}: ${open.join(', ') || 'every resource in the page finished'}`);
      });
    }
    cy.task('catalogRecord', {
      title: this.currentTest.title,
      state: failed ? 'failed' : 'passed',
      duration: this.currentTest.duration || 0,
      err: failed ? { message: (this.currentTest.err && this.currentTest.err.message) || 'failed' } : null
    });
  });

  rows.forEach((row) => {
    it(row.id + ' ' + row.title, () => {
      cy.viewport(row.phone ? 390 : 1280, row.phone ? 844 : 800);
      cy.visit('/' + row.path);
      cy.window().then((win) => {
        win.sessionStorage.setItem('hasSeenTour', 'true');
        win.sessionStorage.setItem('hasSeenStudioTour', 'true');
        win.sessionStorage.setItem('hasSeenLabTour', 'true');
        win.localStorage.setItem('qa-lab-fw-asked', '1');
        win.localStorage.setItem('theme', 'light');
      });
      cy.reload();
      cy.readFile('js/catalog-checks.js').then((src) => {
        cy.document().then((doc) => {
          const script = doc.createElement('script');
          script.textContent = src;
          doc.head.appendChild(script);
        });
      });
      cy.window({ timeout: 90000 }).then((win) => win.CatalogChecks[row.id]());
    });
  });
});
