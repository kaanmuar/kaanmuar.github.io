*** Settings ***
Resource          cv_resources.robot
Suite Teardown    Close All Browsers

*** Test Cases ***
[Desktop] User Can Toggle Dark Mode And It Persists
    [Tags]    Desktop    Core-UI
    Open CV in Desktop Browser
    Toggle The Theme On Desktop
    Verify Dark Mode Is Active
    Reload Page
    Verify Dark Mode Is Active

[Desktop] User Can Switch To Spanish And Verify Content
    [Tags]    Desktop    Core-UI    i18n
    Open CV in Desktop Browser
    Select Language    es
    Verify Summary Title Is In Spanish
    Verify Experience Title Is In Spanish

[Desktop] Dynamic Radar Chart Can Filter The Toolkit
    [Tags]    Desktop    Interactive
    Open CV in Desktop Browser
    Click Radar Chart Label    QA & Automation
    Verify Toolkit Is Filtered

[Desktop] Core Competency Highlights Related Content
    [Tags]    Desktop    Interactive
    Open CV in Desktop Browser
    Click Element    css:.competency-item[data-competency="pm"]
    Wait Until Page Contains Element    css:html.topic-focus
    Page Should Contain Element    css:.experience-item.topic-match
    Page Should Contain Element    css:.experience-item.topic-dim
    Click Element    id:languages-heading
    Wait Until Page Does Not Contain Element    css:html.topic-focus

[Desktop] All Seven Competencies Are Clickable
    [Tags]    Desktop    Interactive
    Open CV in Desktop Browser
    ${count}=    Execute Javascript    return document.querySelectorAll('.competency-item').length
    Should Be Equal As Integers    ${count}    7

[Desktop] Same Competency Click Restores The CV
    [Tags]    Desktop    Interactive
    Open CV in Desktop Browser
    Click Element    css:.competency-item[data-competency="qa"]
    Wait Until Page Contains Element    css:html.topic-focus
    Click Element    css:.competency-item[data-competency="qa"]
    Wait Until Page Does Not Contain Element    css:html.topic-focus

[Desktop] Reset Filters Clears Competency Focus
    [Tags]    Desktop    Interactive
    Open CV in Desktop Browser
    Click Element    css:.competency-item[data-competency="qa"]
    Wait Until Page Contains Element    css:html.topic-focus
    Click Element    id:reset-filter
    Wait Until Page Does Not Contain Element    css:html.topic-focus

[Desktop] Radar QA Label Applies Competency Focus
    [Tags]    Desktop    Interactive
    Open CV in Desktop Browser
    Click Radar Chart Label    QA & Automation
    Wait Until Page Contains Element    css:html.topic-focus
    Element Attribute Value Should Be    css:.competency-item[data-competency="qa"]    aria-pressed    true

[Desktop] Theme Toggle Keeps Competency Focus
    [Tags]    Desktop    Interactive
    Open CV in Desktop Browser
    Click Element    css:.competency-item[data-competency="cloud"]
    Wait Until Page Contains Element    css:html.topic-focus
    Toggle The Theme On Desktop
    Wait Until Page Contains Element    css:html.topic-focus
    Element Attribute Value Should Be    css:.competency-item[data-competency="cloud"]    aria-pressed    true

[Desktop] Topic Query Deep Links QA
    [Tags]    Desktop    Interactive
    Open Browser    ${CV_URL}?topic=qa    ${BROWSER}    options=${CHROME_OPTIONS}
    Execute Javascript    sessionStorage.setItem('hasSeenTour','true'); localStorage.setItem('theme','light');
    Go To    ${CV_URL}?topic=qa
    Wait Until Page Contains Element    css:html.topic-focus
    Element Attribute Value Should Be    css:.competency-item[data-competency="qa"]    aria-pressed    true

[Desktop] Unknown Topic Query Leaves CV Unfiltered
    [Tags]    Desktop    Interactive
    Open Browser    ${CV_URL}?topic=nope    ${BROWSER}    options=${CHROME_OPTIONS}
    Execute Javascript    sessionStorage.setItem('hasSeenTour','true'); localStorage.setItem('theme','light');
    Go To    ${CV_URL}?topic=nope
    Wait Until Element Is Visible    id:main-name    15s
    Page Should Not Contain Element    css:html.topic-focus

[Desktop] Glance KPIs Show 18 Plus Years
    [Tags]    Desktop    Content
    Open CV in Desktop Browser
    Wait Until Page Contains Element    css:.glance-kpi
    Page Should Contain    18+

[Desktop] Profile Photo Modal Opens And Closes
    [Tags]    Desktop    Core-UI
    Open CV in Desktop Browser
    Click Element    id:profile-photo
    Wait Until Element Is Visible    css:#image-modal.visible
    Click Element    css:.modal-close
    Wait Until Page Does Not Contain Element    css:#image-modal.visible

[Desktop] Export Menu Lists Formats
    [Tags]    Desktop    Core-UI
    Open CV in Desktop Browser
    Click Element    id:export-selector
    Wait Until Page Contains    Export as PDF
    Page Should Contain    Export as JPG
    Page Should Contain    Export as DOC

[Desktop] Simulator Launcher Is Present
    [Tags]    Desktop    Navigation
    Open CV in Desktop Browser
    Wait Until Element Is Visible    id:sim-launch-btn

[Mobile] Mobile Toolbar Becomes Sticky On Scroll
    [Tags]    Mobile    Core-UI
    Open CV in Mobile Browser
    Wait Until Element Is Visible    ${MOBILE_TOOLBAR}
    Scroll To Bottom Of Page
    Verify Mobile Toolbar Is Sticky
    Scroll To Top Of Page
    Verify Mobile Toolbar Is Not Sticky

[Mobile] User Can Toggle Dark Mode On Mobile
    [Tags]    Mobile    Core-UI
    Open CV in Mobile Browser
    Toggle The Theme On Mobile
    Verify Dark Mode Is Active
