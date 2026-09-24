*** Settings ***
Resource          cv_resources.robot
Suite Teardown    Close All Browsers

*** Test Cases ***
Admin Shows Login Overlay When Unauthenticated
    [Tags]    Admin    Security
    Open Browser    ${ADMIN_URL}    ${BROWSER}    options=${CHROME_OPTIONS}
    Wait Until Element Is Visible    id:login-overlay
    Element Should Not Be Visible    id:dashboard

Admin Is Marked Noindex
    [Tags]    Admin    Security    SEO
    Open Browser    ${ADMIN_URL}    ${BROWSER}    options=${CHROME_OPTIONS}
    ${robots}=    Execute Javascript    return document.querySelector('meta[name="robots"]').getAttribute('content')
    Should Contain    ${robots}    noindex

Robots Txt Disallows Admin
    [Tags]    Security    SEO
    Open Browser    ${BASE_URL}/robots.txt    ${BROWSER}    options=${CHROME_OPTIONS}
    Wait Until Page Contains    Disallow: /admin.html
    Page Should Contain    Disallow: /cypress/

Sitemap Omits Admin And Includes Simulator
    [Tags]    Security    SEO
    Open Browser    ${BASE_URL}/sitemap.xml    ${BROWSER}    options=${CHROME_OPTIONS}
    ${source}=    Get Source
    Should Contain    ${source}    simulador.html
    Should Contain    ${source}    qa-lab.html
    Should Not Contain    ${source}    admin.html

CV LinkedIn Uses Noopener
    [Tags]    Security
    Open CV in Desktop Browser
    ${rel}=    Get Element Attribute    css:#contact-linkedin a    rel
    Should Contain    ${rel}    noopener

Studio Loads Board And Run Control
    [Tags]    Simulator
    Open Browser    ${SIM_URL}    ${BROWSER}    options=${CHROME_OPTIONS}
    Execute Javascript    localStorage.setItem('theme','light')
    Go To    ${SIM_URL}
    Wait Until Page Contains    Run 4-agent sprint
    Page Should Contain Element    css:.ticket
