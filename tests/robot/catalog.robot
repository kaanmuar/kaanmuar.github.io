*** Settings ***
Library           SeleniumLibrary
Library           CatalogRunner.py
Suite Setup       Open Catalog Browser
Suite Teardown    Close All Browsers
Test Template     Run Catalog Check

*** Variables ***
${BASE}           http://127.0.0.1:8765
${BROWSER}        chrome

*** Test Cases ***
SMK-01 Public surfaces return 200
    [Tags]    SMK-01
    SMK-01    index.html    ${FALSE}

SMK-02 CV document title and Harbor skin
    [Tags]    SMK-02
    SMK-02    index.html    ${FALSE}

FN-01 Dark mode toggle and persistence
    [Tags]    FN-01
    FN-01    index.html    ${FALSE}

FN-02 Language switch to a random language, then back
    [Tags]    FN-02
    FN-02    index.html    ${FALSE}

FN-03 ?lang=de is honored on load
    [Tags]    FN-03
    FN-03    index.html?lang=de    ${FALSE}

FN-04 Profile photo modal open / close
    [Tags]    FN-04
    FN-04    index.html    ${FALSE}

FN-05 Glance KPIs include 18+ years
    [Tags]    FN-05
    FN-05    index.html    ${FALSE}

FN-06 Radar label filters toolkit (QA & Automation)
    [Tags]    FN-06
    FN-06    index.html    ${FALSE}

FN-07 Skill tag filters experience list
    [Tags]    FN-07
    FN-07    index.html    ${FALSE}

FN-08 Timeline jump opens the matching role
    [Tags]    FN-08
    FN-08    index.html    ${FALSE}

FN-09 Export menu lists five formats
    [Tags]    FN-09
    FN-09    index.html    ${FALSE}

FN-10 Print and studio launch controls exist
    [Tags]    FN-10
    FN-10    index.html    ${FALSE}

FN-11 Read More expands the summary
    [Tags]    FN-11
    FN-11    index.html    ${FALSE}

FN-12 Education lists ISTQB
    [Tags]    FN-12
    FN-12    index.html    ${FALSE}

FN-13 Empty message form stays disabled
    [Tags]    FN-13
    FN-13    index.html    ${FALSE}

FN-14 Tour starts, waits for Next, then closes
    [Tags]    FN-14
    FN-14    index.html    ${FALSE}

FN-15 Core competency filters and dims unrelated CV content
    [Tags]    FN-15
    FN-15    index.html    ${FALSE}

FN-16 All seven core competencies are clickable filters
    [Tags]    FN-16
    FN-16    index.html    ${FALSE}

FN-17 Clicking the same competency again restores the CV
    [Tags]    FN-17
    FN-17    index.html    ${FALSE}

FN-18 Switching competencies moves the highlight
    [Tags]    FN-18
    FN-18    index.html    ${FALSE}

FN-19 ?topic=qa deep-links the competency filter
    [Tags]    FN-19
    FN-19    index.html?topic=qa    ${FALSE}

FN-20 Reset Filters clears competency focus
    [Tags]    FN-20
    FN-20    index.html    ${FALSE}

FN-21 Clicking a highlighted experience keeps competency focus
    [Tags]    FN-21
    FN-21    index.html    ${FALSE}

FN-22 QA radar label applies the same competency focus
    [Tags]    FN-22
    FN-22    index.html    ${FALSE}

FN-23 Dark, light, then back to the original theme
    [Tags]    FN-23
    FN-23    index.html    ${FALSE}

FN-24 Three languages, then back to the original
    [Tags]    FN-24
    FN-24    index.html    ${FALSE}

FN-25 Share menu targets the current page
    [Tags]    FN-25
    FN-25    index.html    ${FALSE}

FN-26 Print sheets follow the selected language
    [Tags]    FN-26
    FN-26    index.html    ${FALSE}

FN-27 Print links are real addresses
    [Tags]    FN-27
    FN-27    index.html    ${FALSE}

FN-28 Exports download in the selected language
    [Tags]    FN-28
    FN-28    index.html    ${FALSE}

FN-29 Send stays inside the contact panel
    [Tags]    FN-29
    FN-29    index.html    ${FALSE}

FN-30 Tour Back returns to the first step
    [Tags]    FN-30
    FN-30    index.html    ${FALSE}

FN-31 Engagement offer names contract work
    [Tags]    FN-31
    FN-31    index.html    ${FALSE}

FN-32 Lab asks which runners to use and remembers the tour
    [Tags]    FN-32
    FN-32    index.html    ${FALSE}

FN-33 Rate CV offers five stars
    [Tags]    FN-33
    FN-33    index.html    ${FALSE}

FN-34 Lab report opens in English with graphs
    [Tags]    FN-34
    FN-34    index.html    ${FALSE}

SEC-01 robots.txt allows CV and blocks admin / tests
    [Tags]    SEC-01
    SEC-01    index.html    ${FALSE}

SEC-02 Sitemap includes CV + studio, omits admin
    [Tags]    SEC-02
    SEC-02    index.html    ${FALSE}

SEC-03 Admin is noindex
    [Tags]    SEC-03
    SEC-03    index.html    ${FALSE}

SEC-04 CV is indexable with canonical and JSON-LD
    [Tags]    SEC-04
    SEC-04    index.html    ${FALSE}

SEC-05 LinkedIn uses noopener + _blank
    [Tags]    SEC-05
    SEC-05    index.html    ${FALSE}

SEC-06 lang query does not execute script
    [Tags]    SEC-06
    SEC-06    index.html    ${FALSE}

SEC-07 Public chrome does not link to admin.html
    [Tags]    SEC-07
    SEC-07    index.html    ${FALSE}

SEC-08 Core competencies ship ItemList JSON-LD and topic URLs
    [Tags]    SEC-08
    SEC-08    index.html    ${FALSE}

A11Y-01 No serious WCAG 2 A/AA axe findings (overlays excluded)
    [Tags]    A11Y-01
    A11Y-01    index.html    ${FALSE}

A11Y-02 Main landmark and named heading
    [Tags]    A11Y-02
    A11Y-02    index.html    ${FALSE}

A11Y-03 Theme toggle is focusable; photo has alt
    [Tags]    A11Y-03
    A11Y-03    index.html    ${FALSE}

A11Y-04 CV tour card is a labelled dialog and takes keyboard focus
    [Tags]    A11Y-04
    A11Y-04    index.html    ${FALSE}

A11Y-05 Studio tour card is a labelled dialog and takes keyboard focus
    [Tags]    A11Y-05
    A11Y-05    simulador.html    ${FALSE}

A11Y-06 Lab tour card is a labelled dialog and takes keyboard focus
    [Tags]    A11Y-06
    A11Y-06    qa-lab.html    ${FALSE}

ADM-01 Login overlay shown; dashboard hidden
    [Tags]    ADM-01
    ADM-01    admin.html    ${FALSE}

ADM-02 Empty login is blocked by HTML5 required
    [Tags]    ADM-02
    ADM-02    admin.html    ${FALSE}

ADM-03 Login fields are labeled
    [Tags]    ADM-03
    ADM-03    admin.html    ${FALSE}

STU-01 Sprint studio loads board and run control
    [Tags]    STU-01
    STU-01    index.html    ${FALSE}

STU-02 Studio nav exposes Xray, lab, and this regression lab
    [Tags]    STU-02
    STU-02    index.html    ${FALSE}

STU-03 Studio ships a guided tour of its features
    [Tags]    STU-03
    STU-03    index.html    ${FALSE}

STU-04 Studio asks which board the sprint should use
    [Tags]    STU-04
    STU-04    index.html    ${FALSE}

STU-05 Studio slides a runner console in from the right
    [Tags]    STU-05
    STU-05    index.html    ${FALSE}

STU-06 Studio report stays English until a language is chosen
    [Tags]    STU-06
    STU-06    index.html    ${FALSE}

STU-07 Sprint board holds six stories including refunds and webhooks
    [Tags]    STU-07
    STU-07    index.html    ${FALSE}

MOB-01 CV phone chrome shows tools, studio, and lab
    [Tags]    MOB-01
    MOB-01    index.html    ${TRUE}

MOB-02 CV does not spill sideways on a phone
    [Tags]    MOB-02
    MOB-02    index.html    ${TRUE}

MOB-03 Studio topbar stacks without clipping Run
    [Tags]    MOB-03
    MOB-03    simulador.html    ${TRUE}

MOB-04 Studio page scrolls instead of locking the board
    [Tags]    MOB-04
    MOB-04    simulador.html    ${TRUE}

MOB-05 QA lab header does not cover the heading
    [Tags]    MOB-05
    MOB-05    qa-lab.html    ${TRUE}

MOB-06 Admin login and back control fit the phone
    [Tags]    MOB-06
    MOB-06    admin.html    ${TRUE}
