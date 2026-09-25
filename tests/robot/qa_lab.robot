*** Settings ***
Resource          cv_resources.robot
Suite Teardown    Close All Browsers

*** Variables ***
${LAB_URL}    ${BASE_URL}/qa-lab.html

*** Keywords ***
Open Lab In Desktop Browser
    Open Browser    ${LAB_URL}    ${BROWSER}    options=${CHROME_OPTIONS}
    Execute Javascript    sessionStorage.setItem('hasSeenTour','true'); sessionStorage.setItem('hasSeenLabTour','true'); localStorage.setItem('theme','light');
    Go To    ${LAB_URL}
    Set Window Size    1280    800
    Wait Until Element Is Visible    id:run-all    15s

*** Test Cases ***
Lab Catalog Lists Fifty Three Cases And New Features
    [Tags]    QA-Lab
    Open Lab In Desktop Browser
    ${count}=    Execute Javascript    return document.querySelectorAll('.case-row').length
    Should Be Equal As Integers    ${count}    53
    Page Should Contain    FN-15
    Page Should Contain    FN-23
    Page Should Contain    FN-28
    Page Should Contain    FN-22
    Page Should Contain    SEC-08
    Page Should Contain    STU-03

Lab Dashboard Opens And Closes From Header
    [Tags]    QA-Lab
    Open Lab In Desktop Browser
    Click Element    id:dash-open
    Wait Until Page Contains Element    css:#dash-overlay.open
    Click Element    id:dash-close
    Wait Until Page Does Not Contain Element    css:#dash-overlay.open

Lab Guided Tour Starts On The Catalog
    [Tags]    QA-Lab
    Open Lab In Desktop Browser
    Click Element    id:tour-start-btn
    Wait Until Page Contains Element    css:#site-tour-overlay.on
    Element Text Should Be    id:site-tour-title    The catalog
    Click Element    id:site-tour-close
    Wait Until Page Does Not Contain Element    css:#site-tour-overlay.on

Lab Mobile Filter Narrows The Catalog
    [Tags]    QA-Lab
    Open Lab In Desktop Browser
    ${all}=    Execute Javascript    return document.querySelectorAll('.case-row').length
    Click Element    css:[data-filter="Mobile"]
    ${mobile}=    Execute Javascript    return document.querySelectorAll('.case-row').length
    Should Be True    ${mobile} > 0
    Should Be True    ${mobile} < ${all}
    Page Should Contain    MOB-01
