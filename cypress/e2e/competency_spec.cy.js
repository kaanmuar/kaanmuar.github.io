const TOPICS = ['pm', 'qa', 'lead', 'devops', 'cloud', 'strategy', 'relations'];

describe('Core competency filters', () => {
  beforeEach(() => {
    cy.viewport(1280, 720);
    cy.visitCV();
  });

  it('exposes seven clickable competency buttons', () => {
    cy.get('.competency-item').should('have.length', 7).and('have.attr', 'aria-pressed', 'false');
    TOPICS.forEach((id) => {
      cy.get(`.competency-item[data-competency="${id}"]`).should('be.visible');
    });
  });

  TOPICS.forEach((id) => {
    it(`applies highlight and dim for ${id}`, () => {
      cy.get(`.competency-item[data-competency="${id}"]`).click();
      cy.get('html').should('have.class', 'topic-focus');
      cy.get(`.competency-item[data-competency="${id}"]`).should('have.attr', 'aria-pressed', 'true');
      cy.get('.competency-item.topic-match').should('have.length', 1);
      cy.get('.competency-item.topic-dim').should('have.length', 6);
      cy.get('.experience-item.topic-match').should('exist');
      cy.get('.experience-item.topic-dim').should('exist');
      cy.get('.timeline-item.topic-match').should('exist');
      cy.get('#languages-section').should('have.class', 'topic-dim');
    });
  });

  it('toggles the same competency off', () => {
    cy.get('.competency-item[data-competency="qa"]').click();
    cy.get('html').should('have.class', 'topic-focus');
    cy.get('.competency-item[data-competency="qa"]').click();
    cy.get('html').should('not.have.class', 'topic-focus');
  });

  it('switches from PM to QA', () => {
    cy.get('.competency-item[data-competency="pm"]').click();
    cy.get('.competency-item[data-competency="qa"]').click();
    cy.get('.competency-item[data-competency="qa"]').should('have.attr', 'aria-pressed', 'true');
    cy.get('.competency-item[data-competency="pm"]').should('have.attr', 'aria-pressed', 'false');
    cy.get('.tech-tag[data-skill-name="Selenium"]').should('have.class', 'selected');
  });

  it('keeps focus on a matching experience and restores on outside click', () => {
    cy.get('.competency-item[data-competency="pm"]').click();
    cy.get('.experience-item.topic-match').first().click();
    cy.get('html').should('have.class', 'topic-focus');
    cy.get('#languages-heading').click({ force: true });
    cy.get('html').should('not.have.class', 'topic-focus');
  });

  it('clears focus with Reset Filters', () => {
    cy.get('.competency-item[data-competency="qa"]').click();
    cy.get('#reset-filter').click();
    cy.get('html').should('not.have.class', 'topic-focus');
    cy.get('.tech-tag.selected').should('have.length', 0);
  });

  it('does not clear focus when toggling theme', () => {
    cy.get('.competency-item[data-competency="cloud"]').click();
    cy.get('#theme-toggle').click();
    cy.get('html').should('have.class', 'topic-focus');
  });

  it('highlights ISTQB for QA', () => {
    cy.get('.competency-item[data-competency="qa"]').click();
    cy.get('[data-topic="qa"]').should('have.class', 'topic-match').and('contain', 'ISTQB');
  });

  it('applies the same focus from the QA radar label', () => {
    cy.forceGlancePair(0);
    cy.get('#competencies-radar-chart').scrollIntoView();
    cy.get('#competencies-radar-chart').contains('g.radar-label', 'QA & Automation').click({ force: true });
    cy.get('html').should('have.class', 'topic-focus');
    cy.get('.competency-item[data-competency="qa"]').should('have.attr', 'aria-pressed', 'true');
  });

  it('deep-links ?topic=qa', () => {
    cy.visitCV({ qs: '?topic=qa' });
    cy.get('html').should('have.class', 'topic-focus');
    cy.get('.competency-item[data-competency="qa"]').should('have.attr', 'aria-pressed', 'true');
  });

  it('ignores an unknown topic query', () => {
    cy.visitCV({ qs: '?topic=nope' });
    cy.get('html').should('not.have.class', 'topic-focus');
  });

  it('ships competency JSON-LD and keywords', () => {
    cy.get('#competencies-structured-data').invoke('text').should('include', 'DefinedTerm').and('include', 'topic=pm');
    TOPICS.forEach((id) => {
      cy.get('#competencies-structured-data').invoke('text').should('include', `topic=${id}`);
    });
    cy.get('meta[name="keywords"]').should('have.attr', 'content').and('include', 'IT Project Management');
  });

  it('deep-links ?competency=qa as a topic alias', () => {
    cy.visitCV({ qs: '?competency=qa' });
    cy.get('html').should('have.class', 'topic-focus');
    cy.get('.competency-item[data-competency="qa"]').should('have.attr', 'aria-pressed', 'true');
  });

  it('places competencies immediately after glance in the tour', () => {
    cy.window().then((win) => {
      const keys = win.CarlosMunozCV.tourSteps.map((s) => s.titleKey);
      expect(keys.indexOf('tour_title_competencies')).to.eq(keys.indexOf('tour_title_glance') + 1);
    });
  });

  it('keeps focus when header chrome is clicked', () => {
    cy.get('.competency-item[data-competency="qa"]').click();
    cy.get('#tour-start-btn').click();
    cy.get('html').should('have.class', 'topic-focus');
    cy.get('#export-selector').click();
    cy.get('html').should('have.class', 'topic-focus');
  });
});

describe('Core competency filters on a phone', () => {
  beforeEach(() => {
    cy.viewport(390, 844);
    cy.visitCV();
  });

  it('QA competency still highlights and restores', () => {
    cy.get('.competency-item[data-competency="qa"]').click();
    cy.get('html').should('have.class', 'topic-focus');
    cy.get('.experience-item.topic-match').should('exist');
    cy.get('#languages-heading').click({ force: true });
    cy.get('html').should('not.have.class', 'topic-focus');
  });
});
