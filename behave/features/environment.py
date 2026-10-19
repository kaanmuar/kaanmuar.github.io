import json
import os
import time

from selenium import webdriver

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
RESULTS = os.path.join(ROOT, "runner-results", "Behave.json")
MAC_CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"


def _driver(name):
    if name == "firefox":
        options = webdriver.FirefoxOptions()
        options.add_argument("-headless")
        return webdriver.Firefox(options=options)
    if name == "safari":
        return webdriver.Safari()
    if name == "edge":
        options = webdriver.EdgeOptions()
        options.add_argument("--headless=new")
        return webdriver.Edge(options=options)
    options = webdriver.ChromeOptions()
    if os.path.exists(MAC_CHROME):
        options.binary_location = MAC_CHROME
    for arg in ("--headless=new", "--disable-gpu", "--lang=en-US", "--window-size=1280,800"):
        options.add_argument(arg)
    return webdriver.Chrome(options=options)


def before_all(context):
    context.base = os.environ.get("BASE_URL", "http://127.0.0.1:8765").rstrip("/")
    context.label = os.environ.get("TARGET_BROWSER", "chrome")
    with open(os.path.join(ROOT, "tests", "native", "run-check.js"), encoding="utf-8") as handle:
        context.run_check = handle.read()
    context.results = []
    context.driver = _driver(context.label.lower())
    context.driver.set_page_load_timeout(20)
    context.driver.set_script_timeout(120)


def before_scenario(context, scenario):
    context.started = time.time()


def after_scenario(context, scenario):
    status = str(getattr(scenario.status, "name", scenario.status))
    if status in ("skipped", "untested"):
        return
    error = ""
    for step in scenario.steps:
        if str(getattr(step.status, "name", step.status)) in ("failed", "error"):
            error = str(step.error_message or "failed").strip().splitlines()[-1]
            break
    context.results.append({
        "title": context.label + " · " + scenario.name,
        "ok": status == "passed",
        "ms": int((time.time() - context.started) * 1000),
        "error": error[:300]
    })


def after_all(context):
    driver = getattr(context, "driver", None)
    if driver:
        driver.quit()
    os.makedirs(os.path.dirname(RESULTS), exist_ok=True)
    with open(RESULTS, "w", encoding="utf-8") as handle:
        json.dump({"framework": "Behave", "cases": getattr(context, "results", [])}, handle, indent=2)
