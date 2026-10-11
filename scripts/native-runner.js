const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const catalog = require('../tests/native/catalog.json');
const { ensureServer } = require('../tests/native/server');
const { startLoadServer } = require('./load-server');
const { listTargets, XCODE } = require('./targets');

const root = path.join(__dirname, '..');
const base = process.env.BASE_URL || 'http://127.0.0.1:8765';
const resultsDir = path.join(root, 'runner-results');
const knownIds = new Set(catalog.map((row) => row.id));

const LAYERS = {
  Selenium: {
    Smoke: ['selenium/smoke.spec.js'],
    Functional: ['selenium/cv.spec.js'],
    Security: ['selenium/security.spec.js'],
    Accessibility: ['selenium/a11y.spec.js'],
    Studio: ['selenium/studio.spec.js'],
    Admin: ['selenium/admin.spec.js'],
    Lab: ['selenium/lab.spec.js'],
    Mobile: ['selenium/mobile.spec.js']
  },
  WebDriverIO: {
    Smoke: ['wdio/smoke.spec.js'],
    Functional: ['wdio/cv.spec.js'],
    Security: ['wdio/security.spec.js'],
    Accessibility: ['wdio/a11y.spec.js'],
    Studio: ['wdio/studio.spec.js'],
    Admin: ['wdio/admin.spec.js'],
    Lab: ['wdio/lab.spec.js'],
    Mobile: ['wdio/mobile.spec.js']
  },
  Appium: {
    Smoke: ['appium/smoke.spec.js'],
    Functional: ['appium/cv.spec.js'],
    Security: ['appium/security.spec.js'],
    Accessibility: ['appium/a11y.spec.js'],
    Studio: ['appium/studio.spec.js'],
    Admin: ['appium/admin.spec.js'],
    Lab: ['appium/lab.spec.js'],
    Mobile: ['appium/mobile.spec.js']
  },
  JMeter: {
    Performance: ['jmeter/load.jmx']
  },
  Gatling: {
    Performance: ['gatling/src/test/java/CvLoad.java']
  },
  Playwright: {
    Smoke: ['tests/smoke.spec.js'],
    Functional: ['tests/cv.spec.js', 'tests/competency.spec.js'],
    Security: ['tests/security.spec.js'],
    Accessibility: ['tests/a11y.spec.js'],
    Studio: ['tests/simulator.spec.js'],
    Admin: ['tests/admin.spec.js'],
    Lab: ['tests/qa-lab.spec.js'],
    Mobile: ['tests/mobile.spec.js']
  },
  Cypress: {
    Smoke: ['cypress/e2e/cv_spec.cy.js'],
    Functional: ['cypress/e2e/cv_spec.cy.js', 'cypress/e2e/competency_spec.cy.js'],
    Security: ['cypress/e2e/security_spec.cy.js'],
    Accessibility: ['cypress/e2e/a11y_spec.cy.js'],
    Studio: ['cypress/e2e/simulator_spec.cy.js'],
    Admin: ['cypress/e2e/admin_spec.cy.js'],
    Lab: ['cypress/e2e/qa_lab_spec.cy.js'],
    Mobile: ['cypress/e2e/mobile_spec.cy.js']
  },
  Robot: {
    Smoke: ['tests/robot/cv_suite.robot'],
    Functional: ['tests/robot/cv_suite.robot'],
    Security: ['tests/robot/security_admin.robot'],
    Accessibility: ['tests/robot/cv_suite.robot'],
    Studio: ['tests/robot/security_admin.robot'],
    Admin: ['tests/robot/security_admin.robot'],
    Lab: ['tests/robot/qa_lab.robot'],
    Mobile: ['tests/robot/mobile_suite.robot']
  }
};

function filesFor(framework, ids) {
  const map = LAYERS[framework];
  if (!map) return [];
  const rows = ids.length ? catalog.filter((row) => ids.includes(row.id)) : catalog;
  const layers = new Set(rows.map((row) => row.layer));
  return [...new Set([...layers].flatMap((layer) => map[layer] || []))];
}

function sanitizeBrowsers(list) {
  const allowed = new Set(['chrome', 'firefox', 'safari', 'edge']);
  const picked = (Array.isArray(list) ? list : []).map((item) => String(item).toLowerCase()).filter((id) => allowed.has(id));
  return [...new Set(picked.length ? picked : ['chrome'])];
}

function sanitizeDevices(list) {
  const known = new Map(listTargets().devices.map((device) => [device.id, device]));
  return (Array.isArray(list) ? list : []).map((item) => {
    if (!item || typeof item.id !== 'string' || item.id.length > 80) return null;
    if (known.has(item.id)) return known.get(item.id);
    if (item.platform === 'profile' || item.platform === 'here') {
      return {
        platform: item.platform,
        id: item.id,
        label: String(item.label || item.id).slice(0, 80),
        width: Number(item.width) || 0,
        height: Number(item.height) || 0
      };
    }
    return null;
  }).filter(Boolean);
}

function edgeInstalled() {
  const local = process.env.LOCALAPPDATA || '';
  return fs.existsSync('/Applications/Microsoft Edge.app')
    || fs.existsSync('/usr/bin/microsoft-edge')
    || (local && fs.existsSync(path.join(local, 'Microsoft', 'Edge', 'Application', 'msedge.exe')));
}

function sanitizeIds(list) {
  const ids = (Array.isArray(list) ? list : []).map(String).filter((id) => knownIds.has(id));
  return [...new Set(ids)];
}

function command(framework, browser, ids) {
  const node = process.execPath;
  const files = filesFor(framework, ids);
  if (framework === 'Playwright') {
    return [node, path.join(root, 'node_modules', '@playwright', 'test', 'cli.js'), 'test', 'tests/catalog.spec.js', '--reporter=list', '--workers=1'];
  }
  if (framework === 'Cypress') {
    return [node, path.join(root, 'node_modules', 'cypress', 'bin', 'cypress'), 'run', '--browser', browser === 'edge' ? 'edge' : browser, '--spec', 'cypress/e2e/catalog_spec.cy.js'];
  }
  if (framework === 'Robot') {
    return [node, path.join(root, 'scripts', 'run-robot-catalog.js')];
  }
  if (framework === 'JMeter') {
    return files.length ? [node, path.join(root, 'scripts', 'run-jmeter.js')] : null;
  }
  if (framework === 'Gatling') {
    return files.length ? [node, path.join(root, 'scripts', 'run-gatling.js')] : null;
  }
  if (!files.length) return null;
  if (framework === 'Selenium') {
    return [node, path.join(root, 'node_modules', 'mocha', 'bin', 'mocha.js'), ...files, '--timeout', '120000', '--exit', '--reporter', 'spec'];
  }
  if (framework === 'WebDriverIO') {
    const args = [node, path.join(root, 'node_modules', '@wdio', 'cli', 'bin', 'wdio.js'), 'run', 'wdio/wdio.conf.js'];
    files.forEach((file) => args.push('--spec', file));
    return args;
  }
  if (framework === 'Appium') {
    const args = [node, path.join(root, 'scripts', 'run-appium.js')];
    files.forEach((file) => args.push('--spec', file));
    return args;
  }
  return null;
}

function runProcess(args, extra, onLine) {
  return new Promise((resolve) => {
    const child = spawn(args[0], args.slice(1), {
      cwd: root,
      env: {
        ...process.env,
        BASE_URL: base,
        TEST_PORT: '8765',
        CYPRESS_BASE_URL: base,
        APPIUM_HOME: path.join(root, '.appium'),
        ...(fs.existsSync(XCODE) ? { DEVELOPER_DIR: XCODE } : {}),
        ...extra
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    const emit = (buf) => {
      String(buf).split(/\r?\n/).forEach((line) => {
        if (line) onLine(line);
      });
    };
    child.stdout.on('data', emit);
    child.stderr.on('data', emit);
    child.on('error', (err) => {
      onLine(err.message);
      resolve(1);
    });
    child.on('close', (code) => resolve(code == null ? 1 : code));
  });
}

function readSummary(framework) {
  const file = path.join(resultsDir, framework + '.json');
  if (!fs.existsSync(file)) return null;
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (err) { return null; }
}

async function postJson(url, payload, headers) {
  const res = await fetch(url, {
    method: 'POST',
    headers: Object.assign({ 'Content-Type': 'application/json' }, headers || {}),
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(5000)
  });
  if (!res.ok) throw new Error('model ' + res.status);
  return res.json();
}

async function observePrompt(prompt) {
  const text = String(prompt || '').slice(0, 8000);
  if (!text) throw new Error('empty prompt');
  const base = process.env.QA_LAB_AI_BASE;
  const key = process.env.QA_LAB_AI_KEY;
  if (base && key) {
    const data = await postJson(base.replace(/\/$/, '') + '/chat/completions', {
      model: process.env.QA_LAB_AI_MODEL || 'gpt-4o-mini',
      temperature: 0.2,
      messages: [{ role: 'user', content: text }]
    }, { Authorization: 'Bearer ' + key });
    const content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!content) throw new Error('empty model reply');
    return { ok: true, text: String(content).slice(0, 1200), source: 'Configured model' };
  }
  const data = await postJson('http://127.0.0.1:11434/api/chat', {
    model: process.env.QA_LAB_AI_MODEL || 'llama3.2',
    stream: false,
    messages: [{ role: 'user', content: text }]
  });
  const content = data && data.message && data.message.content;
  if (!content) throw new Error('empty model reply');
  return { ok: true, text: String(content).slice(0, 1200), source: 'Ollama' };
}

function lineWriter(res) {
  let chain = Promise.resolve();
  return {
    send(msg) {
      const line = JSON.stringify(msg) + '\n';
      chain = chain.then(() => new Promise((resolve) => {
        if (res.writableEnded) return resolve();
        res.write(line, () => resolve());
      }));
    },
    flush() {
      return chain;
    }
  };
}

async function runFramework(fw, ids, browsers, devices, catalogCount, send) {
  const targets = (fw === 'JMeter' || fw === 'Gatling')
    ? [{ browser: 'load' }]
    : fw === 'Appium'
      ? (devices.length ? devices.map((device) => ({ device })) : [{ browser: 'chrome' }])
      : browsers.map((browser) => ({ browser }));
  const merged = { framework: fw, cases: [] };
  let code = 0;
  fs.rmSync(path.join(resultsDir, fw + '.json'), { force: true });
  send({ fw, line: 'catalog ' + catalogCount + ' cases' });
  for (const target of targets) {
    const browser = target.browser || 'chrome';
    if (fw === 'Cypress' && browser === 'safari') {
      send({ fw, line: 'Cypress does not drive Safari. Pick Chrome, Firefox, or Edge for Cypress.' });
      code = 1;
      continue;
    }
    const bundle = browser === 'firefox' ? 'firefox' : (browser === 'safari' ? 'webkit' : 'chromium');
    const label = (fw === 'JMeter' || fw === 'Gatling')
      ? '8 virtual users · 20s'
      : (target.device ? target.device.label : (bundle === 'webkit' ? 'webkit' : browser));
    const extra = {
      TARGET_BROWSER: label,
      CATALOG_IDS: ids.join(','),
      CYPRESS_CATALOG_IDS: ids.join(','),
      ROBOT_BROWSER: browser,
      ROBOT_IDS: ids.join(','),
      PW_BROWSER: bundle
    };
    if (fw === 'JMeter' || fw === 'Gatling') {
      extra.TEST_PORT = '8767';
      extra.BASE_URL = 'http://127.0.0.1:8767';
    }
    if (browser === 'edge' && edgeInstalled()) extra.PW_CHANNEL = 'msedge';
    if (target.device && (target.device.platform === 'ios' || target.device.avd)) {
      extra.APPIUM_DEVICE = JSON.stringify(target.device);
      extra.APPIUM_DEVICE_LABEL = target.device.label;
      extra.TARGET_BROWSER = target.device.label;
    } else if (target.device && target.device.width) {
      extra.APPIUM_VIEWPORT = target.device.width + 'x' + target.device.height;
      extra.APPIUM_DEVICE_LABEL = target.device.label;
      extra.TARGET_BROWSER = target.device.label;
    }
    if (fw === 'Playwright') {
      const install = [process.execPath, path.join(root, 'node_modules', '@playwright', 'test', 'cli.js'), 'install', bundle];
      send({ fw, line: '$ ' + install.join(' ') });
      await runProcess(install, extra, (line) => send({ fw, line }));
    }
    if (browser === 'edge' && !edgeInstalled()) {
      send({ fw, line: 'Edge is not installed on this host. This pass uses the bundled Chromium browser.' });
    }
    if (browser === 'safari' && process.platform !== 'darwin' && fw !== 'Playwright') {
      send({ fw, line: 'Safari is a macOS browser. This host runs that pass in bundled WebKit.' });
    }
    const args = command(fw, browser, ids);
    if (!args) {
      send({ fw, line: 'No catalog files for ' + label });
      code = 1;
      continue;
    }
    send({ fw, line: '$ ' + args.join(' ') + '  [' + label + ']' });
    const partCode = await runProcess(args, extra, (line) => send({ fw, line }));
    const part = readSummary(fw);
    if (part && Array.isArray(part.cases)) merged.cases.push(...part.cases);
    if (partCode) code = partCode;
  }
  fs.writeFileSync(path.join(resultsDir, fw + '.json'), JSON.stringify(merged, null, 2));
  send({ fw, code, summary: merged, line: 'exit ' + code + ' · ' + merged.cases.length + ' recorded' });
}

let busy = false;

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  const url = req.url.split('?')[0];
  if (url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, busy, observe: true, model: !!(process.env.QA_LAB_AI_BASE && process.env.QA_LAB_AI_KEY) }));
    return;
  }
  if (req.method === 'POST' && url === '/observe') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 12000) req.destroy();
    });
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        const answer = await observePrompt(payload.prompt);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(answer));
      } catch (err) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, reason: 'No model is connected.' }));
      }
    });
    return;
  }
  if (req.method === 'GET' && url === '/targets') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(listTargets()));
    return;
  }
  if (req.method !== 'POST' || url !== '/run') {
    res.writeHead(404);
    res.end();
    return;
  }
  if (busy) {
    res.writeHead(409, { 'Content-Type': 'text/plain' });
    res.end('A native run is already in progress.');
    return;
  }
  let body = '';
  req.on('data', (chunk) => { body += chunk; });
  req.on('end', async () => {
    busy = true;
    res.writeHead(200, { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-cache' });
    const writer = lineWriter(res);
    let load = null;
    try {
      const payload = JSON.parse(body || '{}');
      const frameworks = (payload.frameworks || []).filter((name) => LAYERS[name]);
      const browsers = sanitizeBrowsers(payload.browsers);
      const devices = sanitizeDevices(payload.devices);
      const ids = sanitizeIds(payload.ids);
      const catalogCount = ids.length || catalog.length;
      fs.mkdirSync(resultsDir, { recursive: true });
      await ensureServer();
      load = frameworks.some((fw) => fw === 'JMeter' || fw === 'Gatling') ? await startLoadServer(8767) : null;
      await Promise.all(frameworks.map((fw) => runFramework(fw, ids, browsers, devices, catalogCount, writer.send).catch((err) => {
        writer.send({ fw, code: 1, summary: { framework: fw, cases: [] }, line: String(err.message || err) });
      })));
      await writer.flush();
    } catch (err) {
      writer.send({ fw: 'Playwright', line: String(err.message || err) });
      await writer.flush();
    } finally {
      if (load && !load.reused) load.server.close();
      busy = false;
      res.end();
    }
  });
});

server.listen(8770, '127.0.0.1', () => {
  console.log('Native runner listening on http://127.0.0.1:8770');
});
