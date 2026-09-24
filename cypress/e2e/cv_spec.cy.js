class CVPage {
  visit(options = {}) {
    cy.visitCV(options);
  }

  get html() { return cy.get('html'); }
  get themeToggle() { return cy.get('#theme-toggle'); }
  get languageSelector() { return cy.get('#language-selector'); }
  get profilePhoto() { return cy.get('#profile-photo'); }
  get imageModal() { return cy.get('#image-modal'); }
  get printBtn() { return cy.get('#print-btn'); }
  get exportSelector() { return cy.get('#export-selector'); }
  get expandAllToolkitBtn() { return cy.get('#expand-all-toolkit'); }
  get tourStartBtn() { return cy.get('#tour-start-btn:visible'); }
  get tourTooltip() { return cy.get('#tour-tooltip'); }
  get contactWidgetFab() { return cy.get('#contact-widget-fab'); }
  get contactWidget() { return cy.get('#contact-widget'); }
  get messageForm() { return cy.get('#message-form'); }
  get competenciesRadarChart() { return cy.get('#competencies-radar-chart'); }
  get timelineContainer() { return cy.get('#timeline-container'); }
  get educationSection() { return cy.get('section[aria-labelledby="education-heading"]'); }
  get testimonialsSection() { return cy.get('#testimonials-section'); }
  get glanceKpis() { return cy.get('#glance-kpis'); }
  get mobileToolbar() { return cy.get('.mobile-toolbar-wrapper .mobile-toolbar'); }
  get mobileThemeToggle() { return cy.get('#theme-toggle-mobile'); }
  get mobileShareSelector() { return cy.get('#social-share-selector-mobile'); }

  selectLanguage(langCode) {
    this.languageSelector.click();
    cy.get(`#language-options .lang-option[data-lang="${langCode}"]`).click();
  }
}

const cvPage = new CVPage();

describe('Interactive CV', () => {
  context('Desktop', () => {
    beforeEach(() => {
      cy.viewport(1280, 720);
      cvPage.visit();
    });

    it('toggles dark mode and persists it', () => {
      cvPage.html.should('not.have.class', 'dark-mode');
      cvPage.themeToggle.click();
      cvPage.html.should('have.class', 'dark-mode');
      cy.reload();
      cvPage.html.should('have.class', 'dark-mode');
    });

    it('switches language to Spanish and back to English', () => {
      cvPage.selectLanguage('es');
      cy.get('[data-translate-key="summary_title"]').should('contain.text', 'Resumen');
      cvPage.selectLanguage('en');
      cy.get('[data-translate-key="summary_title"]').should('contain.text', 'Professional Summary');
    });

    it('honors ?lang=de on load', () => {
      cy.visitCV({ qs: '?lang=de' });
      cy.get('[data-translate-key="summary_title"]').should('contain.text', 'Berufliches Profil');
    });

    it('opens and closes the profile photo modal', () => {
      cvPage.profilePhoto.click();
      cvPage.imageModal.should('have.class', 'visible');
      cy.get('.modal-close').click();
      cvPage.imageModal.should('not.have.class', 'visible');
    });

    it('shows glance KPIs with 18+ years', () => {
      cvPage.glanceKpis.scrollIntoView().should('contain.text', '18+');
      cy.get('.glance-kpi').should('have.length', 5);
    });

    it('filters toolkit from a radar label', () => {
      cy.forceGlancePair(0);
      cvPage.competenciesRadarChart.scrollIntoView();
      cvPage.competenciesRadarChart.contains('g.radar-label', 'QA & Automation').click({ force: true });
      cy.get('#toolkit-heading').should('be.visible');
      cy.get('.tech-tag[data-skill-name="Selenium"]').should('have.class', 'selected');
      cy.get('.tech-tag[data-skill-name="Cypress"]').should('have.class', 'selected');
    });

    it('filters the CV from a core competency and restores on outside click', () => {
      cy.get('.competency-item[data-competency="pm"]').click();
      cy.get('html').should('have.class', 'topic-focus');
      cy.get('.competency-item[data-competency="pm"]').should('have.attr', 'aria-pressed', 'true');
      cy.get('.experience-item.topic-match').should('exist');
      cy.get('.experience-item.topic-dim').should('exist');
      cy.get('#languages-heading').click({ force: true });
      cy.get('html').should('not.have.class', 'topic-focus');
    });

    it('filters experience by a skill tag', () => {
      cvPage.expandAllToolkitBtn.click();
      cy.get('.tech-tag[data-skill-name="Selenium"]').click();
      cy.get('.experience-item.filter-match').should('exist');
      cy.get('.experience-item.filter-no-match').should('exist');
    });

    it('timeline link expands the matching experience', () => {
      cvPage.timelineContainer.find('.timeline-item a').first().as('firstTimelineLink').click({ force: true });
      cy.get('@firstTimelineLink').invoke('attr', 'href').then((href) => {
        cy.get(href).should('have.class', 'is-open');
        cy.get(`${href} .experience-body`).should('be.visible');
      });
    });

    it('opens the export menu with all formats', () => {
      cy.window().then((win) => {
        cy.stub(win.CarlosMunozCV, '_exportAsPDF_jsPDF').as('exportPDF');
        cy.stub(win.CarlosMunozCV, '_exportAsJPG').as('exportJPG');
        cy.stub(win.CarlosMunozCV, '_exportAsATS').as('exportDOC');
        cy.stub(win.CarlosMunozCV, '_exportAsJSON').as('exportJSON');
        cy.stub(win.CarlosMunozCV, '_exportAsText').as('exportTEXT');
      });
      cvPage.exportSelector.click();
      cy.get('#export-options button').should('have.length.at.least', 5);
      cy.get('#export-options button').eq(0).click({ force: true });
      cy.get('@exportPDF').should('have.been.calledOnce');
      cy.get('#export-options button').eq(1).click({ force: true });
      cy.get('@exportJPG').should('have.been.calledOnce');
      cy.get('#export-options button').eq(2).click({ force: true });
      cy.get('@exportDOC').should('have.been.calledOnce');
      cy.get('#export-options button').eq(3).click({ force: true });
      cy.get('@exportJSON').should('have.been.calledOnce');
      cy.get('#export-options button').eq(4).click({ force: true });
      cy.get('@exportTEXT').should('have.been.calledOnce');
    });

    it('shows print, simulator, and regression lab controls', () => {
      cvPage.printBtn.should('be.visible');
      cy.get('#sim-launch-btn').should('be.visible');
      cy.get('#qa-lab-btn').should('be.visible');
    });

    it('expands the summary on Read More', () => {
      cy.get('#read-more-btn').click();
      cy.get('#read-more-btn').should('have.attr', 'aria-expanded', 'true');
    });

    it('lists key certifications including ISTQB', () => {
      cvPage.educationSection.scrollIntoView().should('be.visible');
      cy.get('#certs-subheading').should('be.visible');
      cvPage.educationSection.should('contain.text', 'ISTQB');
    });

    it('validates an empty contact message form without submitting', () => {
      cvPage.contactWidgetFab.click({ force: true });
      cvPage.contactWidget.should('be.visible');
      cvPage.messageForm.find('button[type="submit"]').should('be.disabled');
      cvPage.messageForm.find('#sender-name').focus().blur().should('have.class', 'invalid');
      cvPage.messageForm.find('#sender-email').type('invalid-email').blur().should('have.class', 'invalid');
    });

    it('starts the tour, waits for Next, then closes', () => {
      cvPage.tourStartBtn.click();
      cvPage.tourTooltip.should('be.visible');
      cy.get('#tour-step-counter').should('contain.text', '1 /');
      cy.get('#tour-next-btn').should('be.disabled');
      cy.get('#tour-next-btn', { timeout: 16000 }).should('not.be.disabled');
      cy.get('#tour-next-btn').click();
      cy.get('#tour-step-counter').should('contain.text', '2 /');
      cy.get('#tour-close-btn').click();
      cvPage.tourTooltip.should('not.be.visible');
    });

    it('handles testimonials if any are published', () => {
      cvPage.testimonialsSection.scrollIntoView();
      cy.get('body').then(($body) => {
        if ($body.find('#testimonials-container .testimonial-card').length > 0) {
          cvPage.testimonialsSection.should('be.visible');
          cy.get('#average-rating-display').should('be.visible');
        }
      });
    });
  });

  context('Mobile', () => {
    beforeEach(() => {
      cy.viewport('iphone-xr');
      cvPage.visit();
    });

    it('shows the mobile toolbar and hides the desktop theme toggle', () => {
      cvPage.mobileToolbar.should('be.visible');
      cvPage.themeToggle.should('not.be.visible');
    });

    it('shows studio and lab launchers without sideways spill', () => {
      cy.get('#sim-launch-btn-mobile').should('be.visible');
      cy.get('#qa-lab-btn-mobile').should('be.visible');
      cy.window().then((win) => {
        expect(win.document.documentElement.scrollWidth - win.innerWidth).to.be.at.most(2);
      });
    });

    it('makes the mobile toolbar sticky on scroll', () => {
      cy.scrollTo(0, 1600);
      cvPage.mobileToolbar.should('have.class', 'is-sticky');
      cy.scrollTo('top');
      cvPage.mobileToolbar.should('not.have.class', 'is-sticky');
    });

    it('toggles dark mode from the mobile control', () => {
      cvPage.html.should('not.have.class', 'dark-mode');
      cvPage.mobileThemeToggle.click();
      cvPage.html.should('have.class', 'dark-mode');
    });

    it('opens the mobile share dropdown', () => {
      cvPage.mobileShareSelector.click();
      cy.get('#social-share-options-mobile-container').should('be.visible');
    });
  });
});
