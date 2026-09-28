const fs = require('fs');
const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const firefox = require('selenium-webdriver/firefox');
const edge = require('selenium-webdriver/edge');
const safari = require('selenium-webdriver/safari');
const { chromeBinary, chromeArgs } = require('../tests/native/chrome');
const { ensureServer, BASE } = require('../tests/native/server');

let driver;
let phone = false;

function browserName() {
  return String(process.env.TARGET_BROWSER || 'chrome').toLowerCase();
}

async function openSession() {
  if (driver) return driver;
  await ensureServer();
  const name = browserName();
  const builder = new Builder();
  if (name === 'firefox') {
    const options = new firefox.Options();
    options.addArguments('-headless');
    driver = await builder.forBrowser('firefox').setFirefoxOptions(options).build();
  } else if (name === 'safari') {
    driver = await builder.forBrowser('safari').setSafariOptions(new safari.Options()).build();
  } else if (name === 'edge') {
    const options = new edge.Options();
    chromeArgs(1280, 800).forEach((arg) => options.addArguments(arg));
    const mac = '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge';
    if (fs.existsSync(mac)) options.setBinaryPath(mac);
    driver = await builder.forBrowser('MicrosoftEdge').setEdgeOptions(options).build();
  } else {
    const options = new chrome.Options();
    const binary = chromeBinary();
    if (binary) options.setChromeBinaryPath(binary);
    chromeArgs(1280, 800).forEach((arg) => options.addArguments(arg));
    driver = await builder.forBrowser('chrome').setChromeOptions(options).build();
  }
  await driver.manage().setTimeouts({ implicit: 2000, pageLoad: 20000, script: 70000 });
  phone = false;
  return driver;
}

async function closeSession() {
  if (!driver) return;
  const current = driver;
  driver = null;
  await current.quit();
}

async function applyViewport(width, height, mobile) {
  if (process.env.APPIUM_DEVICE) return;
  const name = browserName();
  if (name === 'chrome' || name === 'edge') {
    try {
      if (mobile) {
        await driver.sendDevToolsCommand('Emulation.setDeviceMetricsOverride', {
          width, height, deviceScaleFactor: 1, mobile: true
        });
      } else {
        await driver.sendDevToolsCommand('Emulation.clearDeviceMetricsOverride', {});
      }
    } catch (err) { /* Firefox and Safari use the window size */ }
  }
  try { await driver.manage().window().setRect({ width, height, x: 0, y: 0 }); } catch (err) { /* a device keeps its own size */ }
}

function session() {
  const css = (selector) => By.css(selector);
  return {
    async open(file) {
      await driver.get(BASE + '/' + file);
      await driver.executeScript(
        "sessionStorage.setItem('hasSeenTour','true'); sessionStorage.setItem('hasSeenStudioTour','true'); sessionStorage.setItem('hasSeenLabTour','true'); localStorage.setItem('qa-lab-fw-asked','1'); localStorage.setItem('theme','light');"
      );
      await driver.navigate().refresh();
      if (phone) await driver.manage().window().setRect({ width: 390, height: 844, x: 0, y: 0 });
    },
    async reload() {
      await driver.navigate().refresh();
    },
    async title() {
      return driver.getTitle();
    },
    async text(selector) {
      const el = await driver.wait(until.elementLocated(css(selector)), 8000);
      return el.getText();
    },
    async attr(selector, name) {
      const el = await driver.findElement(css(selector));
      return el.getAttribute(name);
    },
    async click(selector) {
      await driver.executeScript('document.querySelector(arguments[0]).click()', selector);
    },
    async count(selector) {
      return (await driver.findElements(css(selector))).length;
    },
    async displayed(selector) {
      const found = await driver.findElements(css(selector));
      if (!found.length) return false;
      return found[0].isDisplayed();
    },
    async execute(script) {
      return driver.executeScript(script);
    },
    async setPhone() {
      phone = true;
      await applyViewport(390, 844, true);
    },
    async setDesktop() {
      phone = false;
      await applyViewport(1280, 800, false);
    },
    async runCatalog(id) {
      await driver.wait(async () => driver.executeScript(
        "return document.readyState === 'complete' && (!!window.CarlosMunozCV || !!document.getElementById('login-overlay') || !!document.getElementById('runBtn') || !!document.querySelector('h1'))"
      ), 15000);
      const loaded = await driver.executeAsyncScript(function (src, done) {
        if (window.CatalogChecks) { done(true); return; }
        var script = document.createElement('script');
        script.src = src;
        script.onload = function () { done(!!window.CatalogChecks); };
        script.onerror = function () { done(false); };
        document.head.appendChild(script);
      }, BASE + '/js/catalog-checks.js');
      if (!loaded) throw new Error('catalog-checks.js did not load');
      const message = await driver.executeAsyncScript(function (caseId, done) {
        var check = window.CatalogChecks && window.CatalogChecks[caseId];
        if (!check) { done('FAIL: missing ' + caseId); return; }
        Promise.resolve(check()).then(function (msg) { done(String(msg || 'ok')); }).catch(function (err) {
          done('FAIL: ' + (err && err.message ? err.message : err));
        });
      }, id);
      if (String(message).indexOf('FAIL:') === 0) throw new Error(String(message).slice(5).trim());
    }
  };
}

module.exports = { openSession, closeSession, session };
