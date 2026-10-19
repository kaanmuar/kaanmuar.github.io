# Generated from tests/native/catalog.json by scripts/build-catalog-suites.js. Edit the catalog, then rerun the script.
Feature: CV regression lab catalog
  Each scenario opens one page, loads js/catalog-checks.js, and runs the lab check with the same id.
  The Performance rows belong to JMeter, Gatling, and k6.

  @SMK-01 @Smoke
  Scenario: SMK-01 Public surfaces return 200
    Given the page "index.html" is open on a desktop screen
    When the catalog check "SMK-01" runs
    Then the check passes

  @SMK-02 @Smoke
  Scenario: SMK-02 CV document title and Harbor skin
    Given the page "index.html" is open on a desktop screen
    When the catalog check "SMK-02" runs
    Then the check passes

  @FN-01 @Functional
  Scenario: FN-01 Dark mode toggle and persistence
    Given the page "index.html" is open on a desktop screen
    When the catalog check "FN-01" runs
    Then the check passes

  @FN-02 @Functional
  Scenario: FN-02 Language switch to a random language, then back
    Given the page "index.html" is open on a desktop screen
    When the catalog check "FN-02" runs
    Then the check passes

  @FN-03 @Functional
  Scenario: FN-03 A random language loads from the address, then the original returns
    Given the page "index.html" is open on a desktop screen
    When the catalog check "FN-03" runs
    Then the check passes

  @FN-04 @Functional
  Scenario: FN-04 Profile photo modal open / close
    Given the page "index.html" is open on a desktop screen
    When the catalog check "FN-04" runs
    Then the check passes

  @FN-05 @Functional
  Scenario: FN-05 Glance KPIs include 18+ years
    Given the page "index.html" is open on a desktop screen
    When the catalog check "FN-05" runs
    Then the check passes

  @FN-06 @Functional
  Scenario: FN-06 Radar label filters toolkit (QA & Automation)
    Given the page "index.html" is open on a desktop screen
    When the catalog check "FN-06" runs
    Then the check passes

  @FN-07 @Functional
  Scenario: FN-07 Skill tag filters experience list
    Given the page "index.html" is open on a desktop screen
    When the catalog check "FN-07" runs
    Then the check passes

  @FN-08 @Functional
  Scenario: FN-08 Timeline jump opens the matching role
    Given the page "index.html" is open on a desktop screen
    When the catalog check "FN-08" runs
    Then the check passes

  @FN-09 @Functional
  Scenario: FN-09 Export menu lists five formats
    Given the page "index.html" is open on a desktop screen
    When the catalog check "FN-09" runs
    Then the check passes

  @FN-10 @Functional
  Scenario: FN-10 Print and studio launch controls exist
    Given the page "index.html" is open on a desktop screen
    When the catalog check "FN-10" runs
    Then the check passes

  @FN-11 @Functional
  Scenario: FN-11 Read More expands the summary
    Given the page "index.html" is open on a desktop screen
    When the catalog check "FN-11" runs
    Then the check passes

  @FN-12 @Functional
  Scenario: FN-12 Education lists ISTQB
    Given the page "index.html" is open on a desktop screen
    When the catalog check "FN-12" runs
    Then the check passes

  @FN-13 @Functional
  Scenario: FN-13 Empty message form stays disabled
    Given the page "index.html" is open on a desktop screen
    When the catalog check "FN-13" runs
    Then the check passes

  @FN-14 @Functional
  Scenario: FN-14 Tour starts, waits for Next, then closes
    Given the page "index.html" is open on a desktop screen
    When the catalog check "FN-14" runs
    Then the check passes

  @FN-15 @Functional
  Scenario: FN-15 Core competency filters and dims unrelated CV content
    Given the page "index.html" is open on a desktop screen
    When the catalog check "FN-15" runs
    Then the check passes

  @FN-16 @Functional
  Scenario: FN-16 All eight core competencies are clickable filters
    Given the page "index.html" is open on a desktop screen
    When the catalog check "FN-16" runs
    Then the check passes

  @FN-17 @Functional
  Scenario: FN-17 Clicking the same competency again restores the CV
    Given the page "index.html" is open on a desktop screen
    When the catalog check "FN-17" runs
    Then the check passes

  @FN-18 @Functional
  Scenario: FN-18 Switching competencies moves the highlight
    Given the page "index.html" is open on a desktop screen
    When the catalog check "FN-18" runs
    Then the check passes

  @FN-19 @Functional
  Scenario: FN-19 ?topic=qa deep-links the competency filter
    Given the page "index.html?topic=qa" is open on a desktop screen
    When the catalog check "FN-19" runs
    Then the check passes

  @FN-20 @Functional
  Scenario: FN-20 Reset Filters clears competency focus
    Given the page "index.html" is open on a desktop screen
    When the catalog check "FN-20" runs
    Then the check passes

  @FN-21 @Functional
  Scenario: FN-21 Clicking a highlighted experience keeps competency focus
    Given the page "index.html" is open on a desktop screen
    When the catalog check "FN-21" runs
    Then the check passes

  @FN-22 @Functional
  Scenario: FN-22 QA radar label applies the same competency focus
    Given the page "index.html" is open on a desktop screen
    When the catalog check "FN-22" runs
    Then the check passes

  @FN-23 @Functional
  Scenario: FN-23 Dark, light, then back to the original theme
    Given the page "index.html" is open on a desktop screen
    When the catalog check "FN-23" runs
    Then the check passes

  @FN-24 @Functional
  Scenario: FN-24 Three languages, then back to the original
    Given the page "index.html" is open on a desktop screen
    When the catalog check "FN-24" runs
    Then the check passes

  @FN-25 @Functional
  Scenario: FN-25 Share menu targets the current page
    Given the page "index.html" is open on a desktop screen
    When the catalog check "FN-25" runs
    Then the check passes

  @FN-26 @Functional
  Scenario: FN-26 Print sheets follow the selected language
    Given the page "index.html" is open on a desktop screen
    When the catalog check "FN-26" runs
    Then the check passes

  @FN-27 @Functional
  Scenario: FN-27 Print links are real addresses
    Given the page "index.html" is open on a desktop screen
    When the catalog check "FN-27" runs
    Then the check passes

  @FN-28 @Functional
  Scenario: FN-28 Exports download in the selected language
    Given the page "index.html" is open on a desktop screen
    When the catalog check "FN-28" runs
    Then the check passes

  @FN-29 @Functional
  Scenario: FN-29 Send stays inside the contact panel
    Given the page "index.html" is open on a desktop screen
    When the catalog check "FN-29" runs
    Then the check passes

  @FN-30 @Functional
  Scenario: FN-30 Tour Back returns to the first step
    Given the page "index.html" is open on a desktop screen
    When the catalog check "FN-30" runs
    Then the check passes

  @FN-31 @Functional
  Scenario: FN-31 Engagement offer names contract work
    Given the page "index.html" is open on a desktop screen
    When the catalog check "FN-31" runs
    Then the check passes

  @FN-32 @Functional
  Scenario: FN-32 Lab asks which runners to use and remembers the tour
    Given the page "index.html" is open on a desktop screen
    When the catalog check "FN-32" runs
    Then the check passes

  @FN-33 @Functional
  Scenario: FN-33 Rate CV offers five stars
    Given the page "index.html" is open on a desktop screen
    When the catalog check "FN-33" runs
    Then the check passes

  @FN-34 @Functional
  Scenario: FN-34 Lab report opens in English with graphs
    Given the page "index.html" is open on a desktop screen
    When the catalog check "FN-34" runs
    Then the check passes

  @SEC-01 @Security
  Scenario: SEC-01 robots.txt allows CV and blocks admin / tests
    Given the page "index.html" is open on a desktop screen
    When the catalog check "SEC-01" runs
    Then the check passes

  @SEC-02 @Security
  Scenario: SEC-02 Sitemap includes CV + studio, omits admin
    Given the page "index.html" is open on a desktop screen
    When the catalog check "SEC-02" runs
    Then the check passes

  @SEC-03 @Security
  Scenario: SEC-03 Admin is noindex
    Given the page "index.html" is open on a desktop screen
    When the catalog check "SEC-03" runs
    Then the check passes

  @SEC-04 @Security
  Scenario: SEC-04 CV is indexable with canonical and JSON-LD
    Given the page "index.html" is open on a desktop screen
    When the catalog check "SEC-04" runs
    Then the check passes

  @SEC-05 @Security
  Scenario: SEC-05 LinkedIn uses noopener + _blank
    Given the page "index.html" is open on a desktop screen
    When the catalog check "SEC-05" runs
    Then the check passes

  @SEC-06 @Security
  Scenario: SEC-06 lang query does not execute script
    Given the page "index.html" is open on a desktop screen
    When the catalog check "SEC-06" runs
    Then the check passes

  @SEC-07 @Security
  Scenario: SEC-07 Only the login control opens admin
    Given the page "index.html" is open on a desktop screen
    When the catalog check "SEC-07" runs
    Then the check passes

  @SEC-08 @Security
  Scenario: SEC-08 Core competencies ship ItemList JSON-LD and topic URLs
    Given the page "index.html" is open on a desktop screen
    When the catalog check "SEC-08" runs
    Then the check passes

  @A11Y-01 @Accessibility
  Scenario: A11Y-01 No serious WCAG 2 A/AA axe findings (overlays excluded)
    Given the page "index.html" is open on a desktop screen
    When the catalog check "A11Y-01" runs
    Then the check passes

  @A11Y-02 @Accessibility
  Scenario: A11Y-02 Main landmark and named heading
    Given the page "index.html" is open on a desktop screen
    When the catalog check "A11Y-02" runs
    Then the check passes

  @A11Y-03 @Accessibility
  Scenario: A11Y-03 Theme toggle is focusable; photo has alt
    Given the page "index.html" is open on a desktop screen
    When the catalog check "A11Y-03" runs
    Then the check passes

  @A11Y-04 @Accessibility
  Scenario: A11Y-04 CV tour card is a labelled dialog and takes keyboard focus
    Given the page "index.html" is open on a desktop screen
    When the catalog check "A11Y-04" runs
    Then the check passes

  @A11Y-05 @Accessibility
  Scenario: A11Y-05 Studio tour card is a labelled dialog and takes keyboard focus
    Given the page "simulador.html" is open on a desktop screen
    When the catalog check "A11Y-05" runs
    Then the check passes

  @A11Y-06 @Accessibility
  Scenario: A11Y-06 Lab tour card is a labelled dialog and takes keyboard focus
    Given the page "qa-lab.html" is open on a desktop screen
    When the catalog check "A11Y-06" runs
    Then the check passes

  @ADM-01 @Admin
  Scenario: ADM-01 Login overlay shown; dashboard hidden
    Given the page "admin.html" is open on a desktop screen
    When the catalog check "ADM-01" runs
    Then the check passes

  @ADM-02 @Admin
  Scenario: ADM-02 Empty login is blocked by HTML5 required
    Given the page "admin.html" is open on a desktop screen
    When the catalog check "ADM-02" runs
    Then the check passes

  @ADM-03 @Admin
  Scenario: ADM-03 Login fields are labeled
    Given the page "admin.html" is open on a desktop screen
    When the catalog check "ADM-03" runs
    Then the check passes

  @STU-01 @Studio
  Scenario: STU-01 Sprint studio loads board and run control
    Given the page "index.html" is open on a desktop screen
    When the catalog check "STU-01" runs
    Then the check passes

  @STU-02 @Studio
  Scenario: STU-02 Studio nav exposes Xray, lab, and this regression lab
    Given the page "index.html" is open on a desktop screen
    When the catalog check "STU-02" runs
    Then the check passes

  @STU-03 @Studio
  Scenario: STU-03 Studio ships a guided tour of its features
    Given the page "index.html" is open on a desktop screen
    When the catalog check "STU-03" runs
    Then the check passes

  @STU-04 @Studio
  Scenario: STU-04 Studio asks which board the sprint should use
    Given the page "index.html" is open on a desktop screen
    When the catalog check "STU-04" runs
    Then the check passes

  @STU-05 @Studio
  Scenario: STU-05 Studio slides a runner console in from the right
    Given the page "index.html" is open on a desktop screen
    When the catalog check "STU-05" runs
    Then the check passes

  @STU-06 @Studio
  Scenario: STU-06 Studio report stays English until a language is chosen
    Given the page "index.html" is open on a desktop screen
    When the catalog check "STU-06" runs
    Then the check passes

  @STU-07 @Studio
  Scenario: STU-07 Sprint board holds the PayStream rehearsal and the Interactive CV delivery
    Given the page "index.html" is open on a desktop screen
    When the catalog check "STU-07" runs
    Then the check passes

  @MOB-01 @Mobile
  Scenario: MOB-01 CV phone chrome shows tools, studio, and lab
    Given the page "index.html" is open on a phone screen
    When the catalog check "MOB-01" runs
    Then the check passes

  @MOB-02 @Mobile
  Scenario: MOB-02 CV does not spill sideways on a phone
    Given the page "index.html" is open on a phone screen
    When the catalog check "MOB-02" runs
    Then the check passes

  @MOB-03 @Mobile
  Scenario: MOB-03 Studio topbar stacks without clipping Run
    Given the page "simulador.html" is open on a phone screen
    When the catalog check "MOB-03" runs
    Then the check passes

  @MOB-04 @Mobile
  Scenario: MOB-04 Studio page scrolls instead of locking the board
    Given the page "simulador.html" is open on a phone screen
    When the catalog check "MOB-04" runs
    Then the check passes

  @MOB-05 @Mobile
  Scenario: MOB-05 QA lab header does not cover the heading
    Given the page "qa-lab.html" is open on a phone screen
    When the catalog check "MOB-05" runs
    Then the check passes

  @MOB-06 @Mobile
  Scenario: MOB-06 Admin login and back control fit the phone
    Given the page "admin.html" is open on a phone screen
    When the catalog check "MOB-06" runs
    Then the check passes

  @SMK-03 @Smoke
  Scenario: SMK-03 Clip pages name the video, poster, and duration
    Given the page "index.html" is open on a desktop screen
    When the catalog check "SMK-03" runs
    Then the check passes

  @SEC-09 @Security
  Scenario: SEC-09 Sitemap hreflang lists every language and omits admin
    Given the page "index.html" is open on a desktop screen
    When the catalog check "SEC-09" runs
    Then the check passes

  @FN-35 @Functional
  Scenario: FN-35 Every language shows its own summary title
    Given the page "index.html" is open on a desktop screen
    When the catalog check "FN-35" runs
    Then the check passes

  @FN-36 @Functional
  Scenario: FN-36 Profile photo is a dialog and Escape closes it
    Given the page "index.html" is open on a desktop screen
    When the catalog check "FN-36" runs
    Then the check passes

  @FN-37 @Functional
  Scenario: FN-37 A short or invalid note keeps Send disabled
    Given the page "index.html" is open on a desktop screen
    When the catalog check "FN-37" runs
    Then the check passes

  @FN-38 @Functional
  Scenario: FN-38 Company names open their sites and leave the job closed
    Given the page "index.html" is open on a desktop screen
    When the catalog check "FN-38" runs
    Then the check passes

  @STU-08 @Studio
  Scenario: STU-08 Linear renames the columns and keeps the Sprint 24 story
    Given the page "simulador.html" is open on a desktop screen
    When the catalog check "STU-08" runs
    Then the check passes

  @STU-09 @Studio
  Scenario: STU-09 Backlog hides Sprint 24 and shows CV-410
    Given the page "simulador.html" is open on a desktop screen
    When the catalog check "STU-09" runs
    Then the check passes

  @FN-39 @Functional
  Scenario: FN-39 Portrait and footer seals show the same trademark
    Given the page "index.html" is open on a desktop screen
    When the catalog check "FN-39" runs
    Then the check passes

  @FN-40 @Functional
  Scenario: FN-40 Golden Gate is the look unless one was kept
    Given the page "index.html" is open on a desktop screen
    When the catalog check "FN-40" runs
    Then the check passes

  @FN-41 @Functional
  Scenario: FN-41 Footer Download PDF is a direct file link
    Given the page "index.html" is open on a desktop screen
    When the catalog check "FN-41" runs
    Then the check passes

  @FN-42 @Functional
  Scenario: FN-42 The lab offers all 20 frameworks, load tools included
    Given the page "qa-lab.html" is open on a desktop screen
    When the catalog check "FN-42" runs
    Then the check passes
