// Async WebDriver script shared by the Selenide, TestNG, Watir, Behave, and Reqnroll suites.
// arguments[0]: URL of js/catalog-checks.js, arguments[1]: catalog case id, last argument: WebDriver callback.
// Calls back with the check message, or "FAIL: <reason>".
var src = arguments[0];
var id = arguments[1];
var done = arguments[arguments.length - 1];
var started = Date.now();

function ready() {
  return document.readyState === 'complete' && (!!window.CarlosMunozCV || !!document.getElementById('login-overlay') || !!document.getElementById('runBtn') || !!document.querySelector('h1'));
}

function run() {
  var check = window.CatalogChecks && window.CatalogChecks[id];
  if (!check) { done('FAIL: missing ' + id); return; }
  Promise.resolve().then(check).then(function (msg) {
    done(String(msg || 'ok'));
  }, function (err) {
    done('FAIL: ' + (err && err.message ? err.message : err));
  });
}

function load() {
  if (window.CatalogChecks) { run(); return; }
  var script = document.createElement('script');
  script.src = src;
  script.onload = run;
  script.onerror = function () { done('FAIL: catalog-checks.js did not load'); };
  document.head.appendChild(script);
}

(function wait() {
  if (ready()) { load(); return; }
  if (Date.now() - started > 15000) { done('FAIL: the page did not finish loading'); return; }
  setTimeout(wait, 150);
})();
