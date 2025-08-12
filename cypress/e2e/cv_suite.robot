*** Settings ***
# This file contains our main test cases.
# It imports the "dictionary" of keywords and elements from our resource file.
Resource          cv_resources.robot
Suite Teardown    Close Browser

*** Test Cases ***
# =================================================================================================
# DESKTOP SCENARIOS
# These tests run on a desktop-sized browser window.
# =================================================================================================
[Desktop] User Can Toggle Dark Mode And It Persists
    [Documentation]    Verifies the dark mode toggle works and the setting is saved on reload.
    [Tags]             Desktop    Core-UI
    Open CV in Desktop Browser
    Toggle The Theme On Desktop
    Verify Dark Mode Is Active
    Reload Page
    Verify Dark Mode Is Active

[Desktop] User Can Switch To Spanish And Verify Content
    [Documentation]    Verifies language switching and content updates.
    [Tags]             Desktop    Core-UI
    Open CV in Desktop Browser
    Select Language    es
    Verify Summary Title Is In Spanish
    Verify Experience Title Is In Spanish

[Desktop] Dynamic Radar Chart Can Filter The Toolkit
    [Documentation]    Verifies that clicking a radar chart label correctly filters the toolkit.
    [Tags]             Desktop    Interactive
    Open CV in Desktop Browser
    Click Radar Chart Label    QA & Automation
    Verify Toolkit Is Filtered

# =================================================================================================
# MOBILE SCENARIOS
# These tests run on a mobile-sized browser window.
# =================================================================================================
[Mobile] Mobile Toolbar Becomes Sticky On Scroll
    [Documentation]    Verifies the mobile-only toolbar appears and becomes sticky when scrolling.
    [Tags]             Mobile    Core-UI
    Open CV in Mobile Browser
    Wait Until Element Is Visible    ${MOBILE_TOOLBAR}
    Scroll To Bottom Of Page
    Verify Mobile Toolbar Is Sticky
    Scroll To Top Of Page
    Verify Mobile Toolbar Is Not Sticky

[Mobile] User Can Toggle Dark Mode On Mobile
    [Documentation]    Verifies the dark mode toggle works on the mobile toolbar.
    [Tags]             Mobile    Core-UI
    Open CV in Mobile Browser
    Toggle The Theme On Mobile
    Verify Dark Mode Is Active