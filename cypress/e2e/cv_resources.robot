*** Settings ***
# This section imports the libraries needed for web testing.
Library    SeleniumLibrary
Library    String

*** Variables ***
# This section defines all the CSS selectors, just like the "getters" in your Cypress Page Object Model.
${URL}                      ../index.html
${BROWSER}                  Chrome
${DESKTOP_VIEWPORT}         1280x800
${MOBILE_VIEWPORT}          375x667

# --- Locators for Page Elements ---
${HTML_ELEMENT}             css:html
${THEME_TOGGLE_DESKTOP}     id:theme-toggle
${THEME_TOGGLE_MOBILE}      id:theme-toggle-mobile
${LANGUAGE_SELECTOR}        id:language-selector
${SUMMARY_TITLE}            [data-translate-key="summary_title"]
${EXPERIENCE_TITLE}         [data-translate-key="experience_title"]
${COMPETENCIES_CHART}       id:competencies-radar-chart
${TOOLKIT_HEADING}          id:toolkit-heading
${SELENIUM_SKILL_TAG}       css:.tech-tag[data-skill-name="Selenium"]
${CYPRESS_SKILL_TAG}        css:.tech-tag[data-skill-name="Cypress"]
${MOBILE_TOOLBAR}           css:.mobile-toolbar-wrapper .mobile-toolbar
${MOBILE_TOOLBAR_STICKY}    css:.mobile-toolbar.is-sticky

*** Keywords ***
# This section defines reusable, low-level actions.

# --- Browser & Navigation Keywords ---
Open CV in Desktop Browser
    Open Browser            ${URL}    ${BROWSER}
    Set Window Size         1280    800
    Wait Until Element Is Visible    id:main-name

Open CV in Mobile Browser
    Open Browser            ${URL}    ${BROWSER}
    Set Window Size         375    667
    Wait Until Element Is Visible    id:main-name

# --- Verification Keywords ---
Verify Dark Mode Is Active
    Element Should Have Class    ${HTML_ELEMENT}    dark-mode

Verify Dark Mode Is Not Active
    Element Should Not Have Class    ${HTML_ELEMENT}    dark-mode

Verify Summary Title Is In Language
    [Arguments]    ${language_code}
    ${expected_title}=    Get From Dictionary    ${TRANSLATIONS.${language_code}}    summary_title
    Wait Until Page Contains    ${expected_title}

Verify Experience Title Is In Language
    [Arguments]    ${language_code}
    ${expected_title}=    Get From Dictionary    ${TRANSLATIONS.${language_code}}    experience_title
    Wait Until Page Contains    ${expected_title}

# --- Interaction Keywords ---
Toggle The Theme On Desktop
    Wait Until Element Is Visible    ${THEME_TOGGLE_DESKTOP}
    Click Element           ${THEME_TOGGLE_DESKTOP}

Toggle The Theme On Mobile
    Wait Until Element Is Visible    ${THEME_TOGGLE_MOBILE}
    Click Element           ${THEME_TOGGLE_MOBILE}

Select Language
    [Arguments]    ${language_code}
    Click Element           ${LANGUAGE_SELECTOR}
    Wait Until Element Is Visible    css:[data-lang="${language_code}"]
    Click Element           css:[data-lang="${language_code}"]

Click Radar Chart Label
    [Arguments]    ${label_text}
    Wait Until Element Is Visible    ${COMPETENCIES_CHART}
    Click Element           xpath://*[contains(@class, 'radar-label')]/*[text()='${label_text}']

Verify Toolkit Is Filtered
    Wait Until Element Is Visible    ${TOOLKIT_HEADING}
    Element Should Be Visible        ${SELENIUM_SKILL_TAG}.selected
    Element Should Be Visible        ${CYPRESS_SKILL_TAG}.selected

Scroll To Bottom Of Page
    Execute Javascript      window.scrollTo(0, document.body.scrollHeight)
    Sleep    0.5s

Scroll To Top Of Page
    Execute Javascript      window.scrollTo(0, 0)
    Sleep    0.5s

Verify Mobile Toolbar Is Sticky
    Wait Until Element Is Visible    ${MOBILE_TOOLBAR_STICKY}

Verify Mobile Toolbar Is Not Sticky
    Wait Until Element Is Not Visible    ${MOBILE_TOOLBAR_STICKY}