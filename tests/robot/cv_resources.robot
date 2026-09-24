*** Settings ***
Library           SeleniumLibrary
Library           String

*** Variables ***
${BASE_URL}               http://127.0.0.1:8765
${CV_URL}                 ${BASE_URL}/index.html
${ADMIN_URL}              ${BASE_URL}/admin.html
${SIM_URL}                ${BASE_URL}/simulador.html
${BROWSER}                Chrome
${HTML_ELEMENT}           css:html
${THEME_TOGGLE_DESKTOP}   id:theme-toggle
${THEME_TOGGLE_MOBILE}    id:theme-toggle-mobile
${LANGUAGE_SELECTOR}      id:language-selector
${COMPETENCIES_CHART}     id:competencies-radar-chart
${TOOLKIT_HEADING}        id:toolkit-heading
${SELENIUM_SKILL_TAG}     css:.tech-tag[data-skill-name="Selenium"]
${CYPRESS_SKILL_TAG}      css:.tech-tag[data-skill-name="Cypress"]
${MOBILE_TOOLBAR}         css:.mobile-toolbar-wrapper .mobile-toolbar
${CHROME_OPTIONS}         add_argument("--headless=new"); add_argument("--disable-gpu"); add_argument("--window-size=1280,800")

*** Keywords ***
Element Should Have Class
    [Arguments]    ${locator}    ${class_name}
    ${cls}=    Get Element Attribute    ${locator}    class
    Should Contain    ${cls}    ${class_name}

Element Should Not Have Class
    [Arguments]    ${locator}    ${class_name}
    ${cls}=    Get Element Attribute    ${locator}    class
    Should Not Contain    ${cls}    ${class_name}

Prepare Storage And Open
    [Arguments]    ${url}
    Open Browser    ${url}    ${BROWSER}    options=${CHROME_OPTIONS}
    Execute Javascript    sessionStorage.setItem('hasSeenTour','true'); localStorage.setItem('theme','light');
    Go To    ${url}
    Wait Until Element Is Visible    id:main-name    15s

Open CV in Desktop Browser
    Prepare Storage And Open    ${CV_URL}
    Set Window Size    1280    800

Open CV in Mobile Browser
    Prepare Storage And Open    ${CV_URL}
    Set Window Size    390    844

Open Studio In Mobile Browser
    Open Browser    ${SIM_URL}    ${BROWSER}    options=${CHROME_OPTIONS}
    Execute Javascript    sessionStorage.setItem('hasSeenTour','true'); sessionStorage.setItem('hasSeenStudioTour','true'); localStorage.setItem('theme','light');
    Go To    ${SIM_URL}
    Set Window Size    390    844
    Wait Until Element Is Visible    id:runBtn    15s

Open Lab In Mobile Browser
    Open Browser    ${BASE_URL}/qa-lab.html    ${BROWSER}    options=${CHROME_OPTIONS}
    Execute Javascript    sessionStorage.setItem('hasSeenTour','true'); sessionStorage.setItem('hasSeenLabTour','true'); localStorage.setItem('theme','light');
    Go To    ${BASE_URL}/qa-lab.html
    Set Window Size    390    844
    Wait Until Element Is Visible    id:run-all    15s

Open Admin In Mobile Browser
    Open Browser    ${ADMIN_URL}    ${BROWSER}    options=${CHROME_OPTIONS}
    Set Window Size    390    844
    Wait Until Element Is Visible    id:login-overlay    15s

Verify Dark Mode Is Active
    Element Should Have Class    ${HTML_ELEMENT}    dark-mode

Verify Dark Mode Is Not Active
    Element Should Not Have Class    ${HTML_ELEMENT}    dark-mode

Verify Summary Title Is In Spanish
    Wait Until Page Contains    Resumen Profesional    10s

Verify Experience Title Is In Spanish
    Wait Until Page Contains    Experiencia Profesional    10s

Toggle The Theme On Desktop
    Wait Until Element Is Visible    ${THEME_TOGGLE_DESKTOP}
    Execute Javascript    document.getElementById('theme-toggle').click()

Toggle The Theme On Mobile
    Wait Until Element Is Visible    ${THEME_TOGGLE_MOBILE}
    Execute Javascript    document.getElementById('theme-toggle-mobile').click()

Select Language
    [Arguments]    ${language_code}
    Click Element    ${LANGUAGE_SELECTOR}
    Wait Until Element Is Visible    css:#language-options .lang-option[data-lang="${language_code}"]
    Click Element    css:#language-options .lang-option[data-lang="${language_code}"]

Click Radar Chart Label
    [Arguments]    ${label_text}
    Wait Until Element Is Visible    ${COMPETENCIES_CHART}
    Execute Javascript    if (window.CarlosMunozCV) { window.CarlosMunozCV._showGlancePair(0, false); }
    Sleep    0.4s
    Execute Javascript    (function(label){ var n=document.evaluate("//*[contains(@class,'radar-label')][contains(.,'"+label+"')]", document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue; if(n) n.dispatchEvent(new MouseEvent('click', {bubbles:true})); })('${label_text}')

Verify Toolkit Is Filtered
    Wait Until Element Is Visible    ${TOOLKIT_HEADING}
    Wait Until Page Contains Element    css:.tech-tag[data-skill-name="Selenium"].selected
    Wait Until Page Contains Element    css:.tech-tag[data-skill-name="Cypress"].selected

Scroll To Bottom Of Page
    Execute Javascript    window.scrollTo(0, 800)
    Sleep    0.5s

Scroll To Top Of Page
    Execute Javascript    window.scrollTo(0, 0)
    Sleep    0.5s

Verify Mobile Toolbar Is Sticky
    Element Should Have Class    ${MOBILE_TOOLBAR}    is-sticky

Verify Mobile Toolbar Is Not Sticky
    Element Should Not Have Class    ${MOBILE_TOOLBAR}    is-sticky
