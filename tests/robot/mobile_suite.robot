*** Settings ***
Resource          cv_resources.robot
Suite Teardown    Close All Browsers

*** Test Cases ***
[Mobile] CV Toolbar Shows Studio And Lab Launchers
    [Tags]    Mobile    CV
    Open CV in Mobile Browser
    Wait Until Element Is Visible    ${MOBILE_TOOLBAR}
    Wait Until Element Is Visible    id:sim-launch-btn-mobile
    Wait Until Element Is Visible    id:qa-lab-btn-mobile
    Element Should Not Be Visible    ${THEME_TOGGLE_DESKTOP}

[Mobile] CV Does Not Spill Sideways
    [Tags]    Mobile    CV
    Open CV in Mobile Browser
    ${extra}=    Execute Javascript    return document.documentElement.scrollWidth - window.innerWidth
    Should Be True    ${extra} <= 2

[Mobile] Studio Header Does Not Clip Run
    [Tags]    Mobile    Studio
    Open Studio In Mobile Browser
    Wait Until Element Is Visible    id:homeBtn
    Wait Until Element Is Visible    id:runBtn
    ${clipped}=    Execute Javascript    return document.getElementById('runBtn').getBoundingClientRect().bottom > document.querySelector('.topbar').getBoundingClientRect().bottom + 2
    Should Not Be True    ${clipped}

[Mobile] QA Lab Heading Sits Below The Header
    [Tags]    Mobile    QA-Lab
    Open Lab In Mobile Browser
    Wait Until Element Is Visible    id:homeBtn
    Wait Until Page Contains Element    css:[data-filter="Mobile"]
    Wait Until Element Is Visible    css:[data-view="watch"]
    ${overlap}=    Execute Javascript    return document.querySelector('.intro h1').getBoundingClientRect().top < document.querySelector('.topbar').getBoundingClientRect().bottom - 1
    Should Not Be True    ${overlap}

[Mobile] QA Lab Dashboard Opens On Phone
    [Tags]    Mobile    QA-Lab
    Open Lab In Mobile Browser
    Wait Until Element Is Visible    id:tour-start-btn
    Click Element    id:dash-open
    Wait Until Page Contains Element    css:#dash-overlay.open
    Click Element    id:dash-close
    Wait Until Page Does Not Contain Element    css:#dash-overlay.open

[Mobile] Studio Tour Control Is Visible
    [Tags]    Mobile    Studio
    Open Studio In Mobile Browser
    Wait Until Element Is Visible    id:tour-start-btn

[Mobile] QA Competency Filter Works On Phone
    [Tags]    Mobile    CV
    Open CV in Mobile Browser
    Click Element    css:.competency-item[data-competency="qa"]
    Wait Until Page Contains Element    css:html.topic-focus
    Page Should Contain Element    css:.experience-item.topic-match
    Click Element    id:languages-heading
    Wait Until Page Does Not Contain Element    css:html.topic-focus

[Mobile] Admin Login Shows Back To CV
    [Tags]    Mobile    Admin
    Open Admin In Mobile Browser
    Wait Until Element Is Visible    id:login-overlay
    Wait Until Element Is Visible    id:admin-home
    Click Element    id:admin-home
    Wait Until Element Is Visible    id:main-name    15s
