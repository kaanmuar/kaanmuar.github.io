from behave import given, then, when

PRIME = (
    "sessionStorage.setItem('hasSeenTour','true');"
    "sessionStorage.setItem('hasSeenStudioTour','true');"
    "sessionStorage.setItem('hasSeenLabTour','true');"
    "localStorage.setItem('qa-lab-fw-asked','1');"
    "localStorage.setItem('theme','light');"
)


@given('the page "{page}" is open on a {screen} screen')
def open_page(context, page, screen):
    driver = context.driver
    phone = screen == "phone"
    try:
        if phone:
            driver.execute_cdp_cmd("Emulation.setDeviceMetricsOverride", {"width": 390, "height": 844, "deviceScaleFactor": 1, "mobile": True})
        else:
            driver.execute_cdp_cmd("Emulation.clearDeviceMetricsOverride", {})
    except Exception:
        pass
    try:
        driver.set_window_size(390, 844) if phone else driver.set_window_size(1280, 800)
    except Exception:
        pass
    driver.get(context.base + "/" + page)
    driver.execute_script(PRIME)
    driver.refresh()


@when('the catalog check "{case_id}" runs')
def run_check(context, case_id):
    context.message = str(context.driver.execute_async_script(context.run_check, context.base + "/js/catalog-checks.js", case_id))


@then("the check passes")
def check_passes(context):
    assert not context.message.startswith("FAIL:"), context.message[5:].strip()
