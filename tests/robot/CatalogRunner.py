import json
import os

from robot.libraries.BuiltIn import BuiltIn


class CatalogRunner:
    def open_catalog_browser(self):
        browser = str(BuiltIn().get_variable_value("${BROWSER}", "chrome")).lower()
        sel = BuiltIn().get_library_instance("SeleniumLibrary")
        if browser == "safari":
            sel.open_browser("about:blank", "safari")
        elif browser == "firefox":
            sel.open_browser("about:blank", "firefox", options='add_argument("-headless")')
        elif browser == "edge":
            sel.open_browser("about:blank", "edge", options='add_argument("--headless=new")')
        else:
            sel.open_browser("about:blank", "chrome", options='add_argument("--headless=new")')
        os.makedirs(os.path.join(os.getcwd(), "runner-results"), exist_ok=True)
        with open(self._path(), "w", encoding="utf-8") as handle:
            json.dump({"framework": "Robot", "cases": []}, handle)

    def run_catalog_check(self, case_id, page, phone):
        sel = BuiltIn().get_library_instance("SeleniumLibrary")
        driver = sel.driver
        base = str(BuiltIn().get_variable_value("${BASE}", "http://127.0.0.1:8765")).rstrip("/")
        narrow = phone is True or str(phone).lower() == "true"
        try:
            if narrow:
                driver.execute_cdp_cmd("Emulation.setDeviceMetricsOverride", {
                    "width": 390, "height": 844, "deviceScaleFactor": 1, "mobile": True
                })
            else:
                driver.execute_cdp_cmd("Emulation.clearDeviceMetricsOverride", {})
        except Exception:
            pass
        try:
            driver.set_window_size(390, 844) if narrow else driver.set_window_size(1280, 800)
        except Exception:
            pass
        driver.set_page_load_timeout(20)
        driver.set_script_timeout(70)
        driver.get(base + "/" + page)
        driver.execute_script(
            "sessionStorage.setItem('hasSeenTour','true');"
            "sessionStorage.setItem('hasSeenStudioTour','true');"
            "sessionStorage.setItem('hasSeenLabTour','true');"
            "localStorage.setItem('qa-lab-fw-asked','1');"
            "localStorage.setItem('theme','light');"
        )
        driver.refresh()
        loaded = driver.execute_async_script(
            """
            var src = arguments[0];
            var done = arguments[arguments.length - 1];
            if (window.CatalogChecks) { done(true); return; }
            var script = document.createElement('script');
            script.src = src;
            script.onload = function () { done(!!window.CatalogChecks); };
            script.onerror = function () { done(false); };
            document.head.appendChild(script);
            """,
            base + "/js/catalog-checks.js",
        )
        if not loaded:
            self._record(case_id, False, "catalog-checks.js did not load")
            raise AssertionError("catalog-checks.js did not load")
        message = driver.execute_async_script(
            """
            var id = arguments[0];
            var done = arguments[arguments.length - 1];
            var check = window.CatalogChecks && window.CatalogChecks[id];
            if (!check) { done('FAIL: missing ' + id); return; }
            Promise.resolve(check()).then(function (msg) { done(String(msg || 'ok')); }).catch(function (err) {
              done('FAIL: ' + (err && err.message ? err.message : err));
            });
            """,
            case_id,
        )
        text = str(message)
        ok = not text.startswith("FAIL:")
        self._record(case_id, ok, "" if ok else text[5:].strip())
        if not ok:
            raise AssertionError(text[5:].strip())

    def _path(self):
        return os.path.join(os.getcwd(), "runner-results", "Robot.json")

    def _record(self, case_id, ok, error):
        label = BuiltIn().get_variable_value("${BROWSER}", "chrome")
        data = {"framework": "Robot", "cases": []}
        if os.path.exists(self._path()):
            try:
                with open(self._path(), encoding="utf-8") as handle:
                    data = json.load(handle)
            except Exception:
                data = {"framework": "Robot", "cases": []}
        data.setdefault("cases", []).append({
            "title": str(label) + " · " + str(case_id),
            "ok": bool(ok),
            "ms": 0,
            "error": error or "",
        })
        with open(self._path(), "w", encoding="utf-8") as handle:
            json.dump(data, handle, indent=2)
