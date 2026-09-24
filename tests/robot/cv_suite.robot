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
