/**
 * Local review API on 127.0.0.1:8768.
 * Streams a read log, keeps every try, and allows one completed review
 * per browser id and per network address.
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const core = require("../functions/url-review-core");
const newsWire = require("../functions/news-wire");
const desk = require("../functions/url-review-desk");
const offers = require("../functions/url-review-offers");
const auth = require("../functions/url-review-auth");

function loadEnvFile() {
  const file = path.join(__dirname, "..", "functions", ".env");
  let text = "";
  try { text = fs.readFileSync(file, "utf8"); } catch (error) { return; }
  text.split("\n").forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const eq = trimmed.indexOf("=");
    if (eq < 1) return;
    const key = trimmed.slice(0, eq).trim();
    if (!process.env[key]) process.env[key] = trimmed.slice(eq + 1).trim();
  });
}
loadEnvFile();

function paymentKeys() {
  return {
    secret: process.env.STRIPE_SECRET_KEY || "",
    wompiKey: process.env.WOMPI_PRIVATE_KEY || "",
    mercadoPagoToken: process.env.MERCADOPAGO_ACCESS_TOKEN || "",
    paypalClientId: process.env.PAYPAL_CLIENT_ID || "",
    paypalSecret: process.env.PAYPAL_CLIENT_SECRET || "",
    paypalMode: process.env.PAYPAL_MODE || ""
  };
}

function payReturn(purpose, choice, reference) {
  const base = "http://127.0.0.1:8765/qa-review-pay.html?purpose=" + purpose + "&provider=" + choice;
  if (choice === "stripe") {
    return {
      successUrl: base + "&result=success&session_id={CHECKOUT_SESSION_ID}",
      cancelUrl: base + "&result=cancel",
      pendingUrl: base + "&result=pending"
    };
  }
  return {
    successUrl: base + "&result=success&reference=" + reference,
    cancelUrl: base + "&result=cancel&reference=" + reference,
    pendingUrl: base + "&result=pending&reference=" + reference
  };
}

const PORT = 8768;
const runs = new Map();
const activeRuns = new Map();
const signInCodes = new Map();
const accountSessions = new Map();
const deskSessions = new Map();
const FILE = path.join(__dirname, "..", "runner-results", "url-reviews.jsonl");
const ALERT_FILE = path.join(__dirname, "..", "runner-results", "url-review-alerts.jsonl");
const ALLOW = new Set([
  "http://127.0.0.1:8765",
  "http://localhost:8765",
  "http://127.0.0.1:8768",
  "http://localhost:8768"
]);

function readStore() {
  try {
    return fs.readFileSync(FILE, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
  } catch (error) {
    return [];
  }
}

function readAlerts() {
  try {
    return fs.readFileSync(ALERT_FILE, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
  } catch (error) {
    return [];
  }
}

function mailAlert(note) {
  const key = process.env.SENDGRID_API_KEY || "";
  const from = process.env.SENDGRID_FROM || "";
  if (!key || !from) return;
  let sgMail = null;
  try { sgMail = require("@sendgrid/mail"); } catch (error) { return; }
  sgMail.setApiKey(key);
  sgMail.send({
    to: "qa@carlosandmunoz.com",
    from,
    subject: note.subject,
    text: (note.title + "\n\n" + (note.detail || "")).slice(0, 4000)
  }).catch((error) => {
    console.error("Review alert mail failed:", error && error.message ? error.message : "send failed");
  });
}

function storeAlert(note) {
  const saved = Object.assign({}, note, { id: note.id || crypto.randomBytes(8).toString("hex") });
  fs.mkdirSync(path.dirname(ALERT_FILE), { recursive: true });
  fs.appendFileSync(ALERT_FILE, JSON.stringify(saved) + "\n");
  return saved;
}

function noteReview(kind, source) {
  const saved = storeAlert(desk.alertFrom(kind, source || {}));
  mailAlert(saved);
  return saved;
}

function deskCookie(req) {
  return (String(req.headers.cookie || "").match(/(?:^|; )qa_desk=([a-f0-9]{32})/) || [])[1] || "";
}

function deskOperator(req) {
  const session = deskSessions.get(deskCookie(req));
  if (!session || session.until < Date.now()) return null;
  return session;
}

function verifyDeskGoogle(idToken) {
  return desk.verifyOperator(idToken);
}

function seedAlerts() {
  if (readAlerts().length) return;
  desk.alertsFromHistory(readStore()).forEach((note) => storeAlert(note));
}

function writeRecord(record) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.appendFileSync(FILE, JSON.stringify(record) + "\n");
  const kind = desk.kindFor(record);
  if (kind) noteReview(kind, record);
}

function originOf(req) {
  return ALLOW.has(req.headers.origin) ? req.headers.origin : "http://127.0.0.1:8765";
}

function clientIp(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || req.socket.remoteAddress || "";
}

function deviceFrom(req, body) {
  const cookie = String(req.headers.cookie || "");
  const saved = (cookie.match(/(?:^|; )qr_device=([a-f0-9]{16})/) || [])[1] || "";
  const sent = String((body && body.deviceId) || "").replace(/[^a-f0-9]/g, "").slice(0, 16);
  if (/^[a-f0-9]{16}$/.test(sent)) return sent;
  return saved || crypto.randomBytes(8).toString("hex");
}

function sendJson(res, status, body, origin, deviceId) {
  const headers = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "access-control-allow-origin": origin,
    "access-control-allow-credentials": "true",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "set-cookie": "qr_device=" + deviceId + "; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax"
  };
  res.writeHead(status, headers);
  res.end(JSON.stringify(body));
}

function startStream(res, origin, deviceId) {
  res.writeHead(200, {
    "content-type": "application/x-ndjson; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": origin,
    "access-control-allow-credentials": "true",
    "set-cookie": "qr_device=" + deviceId + "; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax"
  });
}

function line(res, payload) {
  if (!res.writableEnded) res.write(JSON.stringify(payload) + "\n");
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 20000) {
        reject(Object.assign(new Error("The request is too large."), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      } catch (error) {
        reject(Object.assign(new Error("The request was not JSON."), { status: 400 }));
      }
    });
    req.on("error", reject);
  });
}

// Sign-ins live in memory here; the code is printed instead of emailed.
const signIns = auth.memoryStore();

async function localSignIn(req, res, pathName, origin, deviceHint) {
  const enabled = process.env.REVIEW_SIGN_IN_PROVIDERS;
  if (req.method === "GET" && pathName === "/auth/providers") {
    sendJson(res, 200, { providers: auth.enabledProviders(enabled) }, origin, deviceHint);
    return;
  }
  let body = {};
  try { body = await readBody(req); } catch (error) { body = {}; }
  const answer = (result) => sendJson(res, result.ok ? 200 : result.status, result.ok
    ? { ok: true, session: result.session, email: result.email, provider: result.provider }
    : { error: result.error, code: result.code || "" }, origin, deviceHint);
  const mailCode = async (input) => {
    const started = await auth.startEmail(signIns, Object.assign({ ip: clientIp(req) }, input));
    if (!started.ok) return answer(started);
    console.log("Sign-in code for " + started.email + ": " + started.code + "  link: http://127.0.0.1:8765/qa-review.html?signin=" + started.id + "&key=" + started.token);
    sendJson(res, 200, { ok: true, id: started.id, sentTo: auth.maskEmail(started.email) }, origin, deviceHint);
  };
  if (pathName === "/auth/email") return mailCode({ email: body.email, deviceKey: body.deviceKey });
  if (pathName === "/auth/email/finish") return answer(await auth.finishEmail(signIns, body));
  if (pathName === "/auth/provider") {
    let decoded = null;
    try {
      decoded = await auth.lookupIdToken(process.env.FIREBASE_WEB_KEY || "AIzaSyA2-6WkecV3GoAK4qlsdGtH3jisjk3bK0w")(String(body.idToken || ""));
    } catch (error) {
      sendJson(res, 401, { error: "That sign-in was not accepted. Try again." }, origin, deviceHint);
      return;
    }
    const result = await auth.providerSignIn(signIns, decoded, { deviceKey: body.deviceKey, enabled });
    if (result.verifyEmail) return mailCode({ email: result.email, provider: result.provider, uid: result.uid, deviceKey: body.deviceKey });
    return answer(result);
  }
  if (pathName === "/auth/session") {
    const result = await auth.checkSession(signIns, Object.assign({}, body, { touch: false }));
    sendJson(res, result.ok ? 200 : result.status, result.ok ? { ok: true, email: result.email, provider: result.provider } : { error: result.error, signIn: true }, origin, deviceHint);
    return;
  }
  if (pathName === "/auth/signout") {
    await auth.closeSession(signIns, body.session);
    sendJson(res, 200, { ok: true }, origin, deviceHint);
    return;
  }
  sendJson(res, 404, { error: "Not found." }, origin, deviceHint);
}

const server = http.createServer(async (req, res) => {
  const origin = originOf(req);
  if (req.method === "OPTIONS") {
    sendJson(res, 204, {}, origin, deviceFrom(req, {}));
    return;
  }
  const url = new URL(req.url, "http://127.0.0.1:" + PORT);
  const deviceHint = deviceFrom(req, {});
  if (req.method === "GET" && url.pathname === "/news") {
    try {
      const news = await newsWire.loadNews({
        country: url.searchParams.get("country"),
        lang: url.searchParams.get("lang"),
        city: url.searchParams.get("city")
      });
      sendJson(res, 200, news, origin, deviceHint);
    } catch (error) {
      sendJson(res, 200, { country: "", lang: "en", items: [] }, origin, deviceHint);
    }
    return;
  }
  if (req.method === "GET" && url.pathname === "/health") {
    sendJson(res, 200, { ok: true }, origin, deviceHint);
    return;
  }
  if (url.pathname.startsWith("/auth/")) {
    await localSignIn(req, res, url.pathname, origin, deviceHint);
    return;
  }
  if (req.method === "GET" && (url.pathname === "/desk" || url.pathname === "/desk/failures")) {
    res.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex",
      "x-content-type-options": "nosniff"
    });
    res.end(url.pathname === "/desk" ? desk.PAGE : desk.FAILURES_PAGE);
    return;
  }
  if (req.method === "GET" && url.pathname === "/desk/failures/data") {
    if (!deskOperator(req)) {
      sendJson(res, 401, { error: "Sign in with the operator Google account." }, origin, deviceHint);
      return;
    }
    sendJson(res, 200, { failures: [], bugs: [], fixes: [] }, origin, deviceHint);
    return;
  }
  if (req.method === "POST" && url.pathname === "/desk/session") {
    let sessionBody = {};
    try { sessionBody = await readBody(req); } catch (error) { sessionBody = {}; }
    let email = null;
    try { email = await verifyDeskGoogle(sessionBody.idToken); } catch (error) { email = null; }
    if (!email) {
      sendJson(res, 403, { error: "This Google account cannot open the desk." }, origin, deviceHint);
      return;
    }
    const token = crypto.randomBytes(16).toString("hex");
    deskSessions.set(token, { email, until: Date.now() + 12 * 60 * 60 * 1000 });
    res.writeHead(200, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex",
      "access-control-allow-origin": origin,
      "access-control-allow-credentials": "true",
      "set-cookie": "qa_desk=" + token + "; Path=/; Max-Age=43200; HttpOnly; SameSite=Lax"
    });
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  if (req.method === "POST" && url.pathname === "/desk/logout") {
    deskSessions.delete(deskCookie(req));
    res.writeHead(200, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "set-cookie": "qa_desk=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax"
    });
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  if (req.method === "GET" && url.pathname === "/desk/data") {
    if (!deskOperator(req)) {
      sendJson(res, 401, { error: "Sign in with the operator Google account." }, origin, deviceHint);
      return;
    }
    const body = desk.snapshot(readStore(), readAlerts(), Array.from(activeRuns.values()));
    body.codes = Array.from(signInCodes.entries()).map(([email, item]) => ({
      email,
      code: item.code,
      expires: item.expires
    }));
    sendJson(res, 200, body, origin, deviceHint);
    return;
  }
  if (req.method === "GET" && (url.pathname === "/account" || url.pathname === "/qa-review-account.html")) {
    res.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex"
    });
    res.end(fs.readFileSync(path.join(__dirname, "..", "qa-review-account.html")));
    return;
  }
  if (req.method === "POST" && url.pathname === "/desk/pass") {
    if (!deskOperator(req)) {
      sendJson(res, 401, { error: "Sign in with the operator Google account." }, origin, deviceHint);
      return;
    }
    let passBody = {};
    try { passBody = await readBody(req); } catch (error) { passBody = {}; }
    const email = String(passBody.email || "").trim().toLowerCase();
    const plan = offers.planById(passBody.plan || "glance");
    if (!email || email.indexOf("@") === -1) {
      sendJson(res, 400, { error: "That address is missing." }, origin, deviceHint);
      return;
    }
    const until = new Date(Date.now() + plan.days * 24 * 60 * 60 * 1000).toISOString();
    writeRecord({
      id: crypto.randomBytes(9).toString("hex"),
      status: "monthly-pass",
      email,
      plan: plan.id,
      priceUsd: plan.usd,
      paid: false,
      localPass: true,
      paidUntil: until,
      createdAt: new Date().toISOString()
    });
    sendJson(res, 200, { ok: true, paidUntil: until, charged: false }, origin, deviceHint);
    return;
  }
  if (req.method === "POST" && url.pathname === "/account/code") {
    let codeBody = {};
    try { codeBody = await readBody(req); } catch (error) { codeBody = {}; }
    const email = String(codeBody.email || "").trim().toLowerCase();
    const known = readStore().some((row) => String(row.email || "").toLowerCase() === email);
    if (known) {
      const code = String(crypto.randomInt(100000, 1000000));
      signInCodes.set(email, { code, expires: new Date(Date.now() + 15 * 60 * 1000).toISOString() });
    }
    sendJson(res, 200, { ok: true }, origin, deviceHint);
    return;
  }
  if (req.method === "POST" && url.pathname === "/account/enter") {
    let enterBody = {};
    try { enterBody = await readBody(req); } catch (error) { enterBody = {}; }
    const email = String(enterBody.email || "").trim().toLowerCase();
    const code = String(enterBody.code || "").replace(/\D/g, "");
    const pending = signInCodes.get(email);
    const fresh = pending && pending.code === code && Date.parse(pending.expires) > Date.now();
    if (!fresh) {
      sendJson(res, 401, { error: "That code does not match a waiting sign-in." }, origin, deviceHint);
      return;
    }
    signInCodes.delete(email);
    const token = crypto.randomBytes(18).toString("hex");
    accountSessions.set(token, { email, until: Date.now() + 12 * 60 * 60 * 1000 });
    res.writeHead(200, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": origin,
      "access-control-allow-credentials": "true",
      "set-cookie": [
        "qr_device=" + deviceHint + "; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax",
        "qa_session=" + token + "; Path=/; Max-Age=43200; HttpOnly; SameSite=Lax"
      ]
    });
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  if (req.method === "GET" && url.pathname === "/account/runs") {
    const token = (String(req.headers.cookie || "").match(/(?:^|; )qa_session=([a-f0-9]+)/) || [])[1] || "";
    const session = accountSessions.get(token);
    if (!session || session.until < Date.now()) {
      sendJson(res, 401, { error: "Sign in again." }, origin, deviceHint);
      return;
    }
    const rows = readStore().filter((row) => String(row.email || "").toLowerCase() === session.email);
    const open = rows.some((row) => row.status === "monthly-pass" && Date.parse(row.paidUntil || "") > Date.now());
    const pass = rows.filter((row) => row.status === "monthly-pass").sort((a, b) => String(b.paidUntil).localeCompare(String(a.paidUntil)))[0] || null;
    sendJson(res, 200, {
      email: session.email,
      open,
      charged: pass ? pass.paid === true : false,
      localPass: pass ? pass.localPass === true : false,
      paidUntil: pass ? pass.paidUntil : "",
      plans: offers.catalog().plans,
      runs: rows.filter((row) => row.report).map((row) => offers.customerRun(row, open))
    }, origin, deviceHint);
    return;
  }
  if (req.method === "POST" && url.pathname === "/account/stop") {
    const token = (String(req.headers.cookie || "").match(/(?:^|; )qa_session=([a-f0-9]+)/) || [])[1] || "";
    const session = accountSessions.get(token);
    if (!session || session.until < Date.now()) {
      sendJson(res, 401, { error: "Sign in again." }, origin, deviceHint);
      return;
    }
    writeRecord({
      id: crypto.randomBytes(9).toString("hex"),
      status: "follow-stop",
      email: session.email,
      createdAt: new Date().toISOString()
    });
    sendJson(res, 200, { ok: true }, origin, deviceHint);
    return;
  }
  if (req.method === "POST" && url.pathname === "/review/capture") {
    let body = {};
    try { body = await readBody(req); } catch (error) { body = {}; }
    const reportId = String((body && body.reportId) || "").replace(/[^a-f0-9]/g, "").slice(0, 32);
    const kind = ["print", "printscreen", "copy", "case-print"].indexOf(String((body && body.kind) || "")) === -1 ? "" : String(body.kind);
    if (!reportId || !kind) {
      sendJson(res, 400, { error: "The capture note was incomplete." }, origin, deviceHint);
      return;
    }
    const found = readStore().reverse().find((row) => row && row.id === reportId && row.report);
    if (!found) {
      sendJson(res, 404, { error: "That report was not found on this machine." }, origin, deviceHint);
      return;
    }
    writeRecord({
      id: reportId,
      status: "capture",
      kind,
      at: new Date().toISOString(),
      deviceId: deviceFrom(req, body)
    });
    sendJson(res, 200, { ok: true }, origin, deviceFrom(req, body));
    return;
  }
  if (req.method === "GET" && url.pathname === "/review") {
    const id = url.searchParams.get("id") || "";
    const found = readStore().reverse().find((row) => row.id === id);
    if (!found || !found.report) {
      sendJson(res, 404, { error: "That report was not found on this machine." }, origin, deviceHint);
      return;
    }
    const paidLater = readStore().some((row) => row && row.status === "paid-report" && row.reportId === found.id && row.paid === true);
    if (!found.paid && !paidLater) {
      let priced = { usd: core.PRICE_PER_FRAMEWORK, frameworks: [] };
      try { priced = core.priceFor(found.frameworks || []); } catch (error) { priced = { usd: core.PRICE_PER_FRAMEWORK, frameworks: [] }; }
      sendJson(res, 402, {
        paymentRequired: true,
        priceUsd: priced.usd,
        frameworks: priced.frameworks,
        id: found.id,
        host: found.report.host,
        status: found.status
      }, origin, found.deviceId || deviceHint);
      return;
    }
    sendJson(res, 200, { report: found.report, frameworks: found.frameworks, paid: true }, origin, found.deviceId || deviceHint);
    return;
  }
  if (req.method === "POST" && (url.pathname === "/review/pay" || url.pathname === "/pay")) {
    sendJson(res, 402, {
      paymentRequired: true,
      priceUsd: core.PRICE_USD,
      error: "Reopening a report asks for payment. A card payment is not connected on this page."
    }, origin, deviceHint);
    return;
  }
  if (req.method === "POST" && (url.pathname === "/review/stop" || url.pathname === "/stop")) {
    let stopBody = {};
    try { stopBody = await readBody(req); } catch (error) { stopBody = {}; }
    const runId = String(stopBody.runId || "").replace(/[^a-f0-9]/g, "").slice(0, 32);
    const run = runs.get(runId);
    if (run) run.stopped = true;
    sendJson(res, 200, { ok: true, stopped: !!run }, origin, deviceHint);
    return;
  }
  if (req.method === "GET" && url.pathname === "/checkout/quote") {
    try {
      const layerQuery = url.searchParams.get("layers");
      const pageQuery = url.searchParams.get("pages");
      const purposeQuery = url.searchParams.get("purpose");
      const priced = purposeQuery === "credentials"
        ? core.priceForCredentials()
        : purposeQuery === "alerts"
          ? core.priceForAlerts(url.searchParams.get("count"))
          : layerQuery
            ? core.priceForLayers(layerQuery)
            : pageQuery
              ? core.priceForRun({
            frameworks: url.searchParams.get("frameworks") || "",
            tools: url.searchParams.get("tools") || "",
            pages: pageQuery,
            depth: url.searchParams.get("depth"),
            billing: url.searchParams.get("billing") || ""
          })
          : core.priceFor(url.searchParams.get("frameworks") || "", url.searchParams.get("tools") || "");
      const quote = await core.copQuote(priced.usd);
      sendJson(res, 200, {
        usd: priced.usd,
        cop: quote.pesos,
        rate: quote.rate,
        count: priced.count,
        frameworks: priced.frameworks,
        tools: priced.tools || [],
        discount: priced.discount || [],
        pages: priced.pages,
        depth: priced.depth,
        billing: priced.billing,
        frameworkUsd: priced.frameworkUsd,
        scopeUsd: priced.scopeUsd,
        pageUsd: priced.pageUsd,
        depthUsd: priced.depthUsd,
        perFramework: priced.each
      }, origin, deviceHint);
    } catch (error) {
      sendJson(res, error.status || 502, { error: error.message || "The peso price could not be loaded." }, origin, deviceHint);
    }
    return;
  }
  if (req.method === "POST" && url.pathname === "/checkout") {
    let payBody = {};
    try { payBody = await readBody(req); } catch (error) { payBody = {}; }
    const choice = core.paymentChoice(payBody.provider || "paypal");
    const purpose = ["report", "cases", "credentials", "alerts"].indexOf(payBody.purpose) === -1 ? "new-run" : payBody.purpose;
    const reportId = String(payBody.reportId || "").replace(/[^a-f0-9]/g, "").slice(0, 32);
    const deviceId = deviceFrom(req, payBody);
    const reference = crypto.randomBytes(8).toString("hex");
    if (!choice) {
      sendJson(res, 400, { error: "PayPal is the payment method for this review. No charge was made." }, origin, deviceId);
      return;
    }
    const urls = payReturn(purpose, choice, reference);
    try {
      const stored = purpose === "report" ? (readStore().find((item) => item && item.id === reportId && item.report) || {}) : {};
      const priced = purpose === "cases"
        ? core.priceForLayers(payBody.layers)
        : purpose === "credentials"
          ? core.priceForCredentials()
          : purpose === "alerts"
            ? core.priceForAlerts(payBody.alertCount)
            : purpose === "report"
              ? core.priceFor(stored.frameworks || [], core.toolsForCharge((stored.report && stored.report.tools) || [], payBody.tools))
            : core.priceForRun({
            frameworks: payBody.frameworks,
            tools: payBody.tools,
            pages: payBody.pages,
            depth: payBody.depth,
            billing: payBody.billing
          });
      const session = await core.startCheckout(Object.assign({
        provider: choice,
        purpose,
        reportId,
        deviceId,
        reference,
        frameworks: priced.frameworks || [],
        tools: priced.tools || [],
        layers: priced.layers || [],
        pages: priced.pages,
        depth: priced.depth,
        billing: priced.billing,
        alertCount: priced.alertCount,
        priceUsd: priced.usd,
        successUrl: urls.successUrl,
        cancelUrl: urls.cancelUrl,
        pendingUrl: urls.pendingUrl
      }, paymentKeys()));
      writeRecord({
        id: reference,
        status: "checkout-open",
        provider: core.paymentProvider(choice),
        method: choice,
        externalId: session.id,
        reference,
        purpose,
        reportId,
        deviceId,
        frameworks: priced.frameworks || [],
        tools: priced.tools || [],
        layers: priced.layers || [],
        pages: priced.pages || null,
        depth: priced.depth || null,
        billing: priced.billing || "",
        priceUsd: priced.usd,
        amount: session.amount,
        currency: session.currency,
        paid: false,
        createdAt: new Date().toISOString()
      });
      sendJson(res, 200, { url: session.url, id: session.id, provider: session.provider, currency: session.currency, amount: session.amount }, origin, deviceId);
    } catch (error) {
      sendJson(res, error.status || 502, { error: error.message || "Payment could not be started.", paymentRequired: true, priceUsd: core.PRICE_USD }, origin, deviceId);
    }
    return;
  }
  if (req.method === "POST" && url.pathname === "/checkout/confirm") {
    let confirmBody = {};
    try { confirmBody = await readBody(req); } catch (error) { confirmBody = {}; }
    const deviceId = deviceFrom(req, confirmBody);
    const choice = core.paymentChoice(confirmBody.provider || "paypal");
    if (!choice) {
      sendJson(res, 400, { error: "PayPal is the payment method for this review. No charge was recorded." }, origin, deviceId);
      return;
    }
    try {
      const result = await core.inspectPayment(Object.assign({
        provider: choice,
        sessionId: String(confirmBody.sessionId || "")
      }, paymentKeys()));
      if (!result.paid) {
        sendJson(res, 402, {
          paid: false,
          pending: !!result.pending,
          error: result.pending ? "The payment is still pending. Nothing was unlocked." : "The payment is not confirmed. No charge was recorded here."
        }, origin, deviceId);
        return;
      }
      const prior = readStore().find((row) => row && row.sessionId === result.sessionId && row.paid === true);
      if (prior) {
        sendJson(res, 200, { paid: true, purpose: prior.purpose === "report" ? "report" : "new-run" }, origin, deviceId);
        return;
      }
      let purpose = result.purpose === "report" ? "report" : "new-run";
      let reportId = String(result.reportId || "").replace(/[^a-f0-9]/g, "").slice(0, 32);
      let payer = result.deviceId || deviceId;
      let frameworks = result.frameworks || [];
      let priceUsd = result.amount || 0;
      if (choice !== "stripe") {
        const open = readStore().find((row) => row && row.status === "checkout-open" && row.reference === result.reference);
        const sameLink = !result.linkId || (open && open.externalId === result.linkId);
        if (!open || open.provider !== result.provider || open.amount !== result.amount || !sameLink) {
          sendJson(res, 402, { paid: false, error: "This payment does not match an open checkout." }, origin, deviceId);
          return;
        }
        purpose = open.purpose === "report" ? "report" : "new-run";
        reportId = String(open.reportId || "").replace(/[^a-f0-9]/g, "").slice(0, 32);
        payer = open.deviceId || deviceId;
        frameworks = open.frameworks || [];
        result.tools = open.tools || [];
        priceUsd = open.priceUsd || result.amount;
        result.pages = open.pages;
        result.depth = open.depth;
        result.billing = open.billing;
      }
      writeRecord({
        id: crypto.randomBytes(9).toString("hex"),
        status: purpose === "report" && reportId ? "paid-report" : "run-credit",
        reportId: purpose === "report" ? reportId : "",
        paid: true,
        provider: result.provider,
        method: choice,
        deviceId: payer,
        sessionId: result.sessionId,
        frameworks,
        tools: result.tools || [],
        pages: result.pages || core.INCLUDED_PAGES,
        depth: result.depth || core.INCLUDED_DEPTH,
        billing: result.billing || "run",
        createdAt: new Date().toISOString(),
        priceUsd,
        amount: result.amount,
        currency: result.currency
      });
      sendJson(res, 200, { paid: true, purpose }, origin, deviceId);
    } catch (error) {
      sendJson(res, error.status || 502, { paid: false, error: error.message || "The payment could not be confirmed." }, origin, deviceId);
    }
    return;
  }
  if (req.method !== "POST" || url.pathname !== "/review") {
    sendJson(res, 404, { error: "Not found." }, origin, deviceHint);
    return;
  }
  let body = {};
  try {
    body = await readBody(req);
  } catch (error) {
    sendJson(res, error.status || 400, { error: error.message }, origin, deviceHint);
    return;
  }
  const deviceId = deviceFrom(req, body);
  const signedIn = await auth.checkSession(signIns, body);
  if (!signedIn.ok) {
    sendJson(res, signedIn.status, { error: signedIn.error, signIn: true }, origin, deviceId);
    return;
  }
  body.email = signedIn.email;
  const intake = await core.screenIntake(body, req.headers);
  if (!intake.ok) {
    sendJson(res, intake.status || 400, { error: intake.error, fields: intake.fields || [] }, origin, deviceId);
    return;
  }
  const identity = { deviceId, ip: clientIp(req) };
  const decision = core.judgeAttempts(readStore(), identity, intake.value);
  if (decision.ok && decision.consumeId) {
    writeRecord({
      id: crypto.randomBytes(9).toString("hex"),
      status: "run-credit-used",
      creditId: decision.consumeId,
      deviceId,
      createdAt: new Date().toISOString()
    });
  }
  if (!decision.ok) {
    writeRecord({
      id: crypto.randomBytes(9).toString("hex"),
      createdAt: new Date().toISOString(),
      status: decision.code === "payment" ? "payment-due" : "blocked",
      deviceId,
      ip: identity.ip,
      name: intake.value.name,
      email: intake.value.email,
      reason: intake.value.reason,
      requestedUrl: intake.value.url,
      log: [{ at: new Date().toISOString(), text: decision.message }]
    });
    sendJson(res, decision.code === "payment" ? 402 : 429, {
      error: decision.message,
      paymentRequired: decision.code === "payment",
      purpose: decision.code === "payment" ? "new-run" : "",
      priceUsd: decision.priceUsd || 0,
      frameworks: decision.frameworks || [],
      pages: decision.pages,
      depth: decision.depth,
      billing: decision.billing || "",
      frameworkUsd: decision.frameworkUsd,
      scopeUsd: decision.scopeUsd,
      pageUsd: decision.pageUsd,
      depthUsd: decision.depthUsd
    }, origin, deviceId);
    return;
  }
  const runId = String(body.runId || "").replace(/[^a-f0-9]/g, "").slice(0, 32) || crypto.randomBytes(8).toString("hex");
  const run = { stopped: false };
  runs.set(runId, run);
  activeRuns.set(runId, {
    runId,
    at: new Date().toISOString(),
    name: intake.value.name,
    email: intake.value.email,
    url: intake.value.url
  });
  noteReview("started", {
    runId,
    name: intake.value.name,
    email: intake.value.email,
    requestedUrl: intake.value.url,
    status: "running",
    frameworks: intake.value.frameworks,
    pages: intake.value.pages,
    depth: intake.value.depth,
    reason: intake.value.reason
  });
  res.on("close", () => {
    if (!res.writableEnded) run.stopped = true;
  });
  startStream(res, origin, deviceId);
  try {
    const report = await core.reviewTarget(intake.value.url, {
      log: (text) => line(res, { type: "log", text }),
      stopped: () => run.stopped,
      maxPages: intake.value.pages,
      maxDepth: intake.value.depth,
      browse: process.env.CHROME_PATH ? (job) => require("../functions/url-review-browser").browse(job) : undefined,
      pagespeed: process.env.PAGESPEED_KEY ? (url) => core.pageSpeed(url, process.env.PAGESPEED_KEY) : undefined
    });
    const record = core.intakeRecord(intake.value, report, {
      ip: identity.ip,
      deviceId,
      userAgent: req.headers["user-agent"],
      acceptLanguage: req.headers["accept-language"],
      country: "",
      region: "",
      city: ""
    });
    const prior = readStore().filter((row) => row.email === intake.value.email && row.report && row.report.host === report.host && row.report.id !== report.id && row.report.insights && row.status !== "stopped")
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0];
    const history = prior ? core.compareRuns(prior.report, report) : null;
    if (history) report.history = history;
    writeRecord(record);
    line(res, { type: "done", report, frameworks: record.frameworks, paid: false, priceUsd: record.priceUsd });
    res.end();
  } catch (error) {
    noteReview("failed", {
      runId,
      name: intake.value.name,
      email: intake.value.email,
      requestedUrl: intake.value.url,
      status: "failed",
      reason: error.message || "The review failed."
    });
    line(res, { type: "error", error: error.message || "The review failed." });
    res.end();
  } finally {
    runs.delete(runId);
    activeRuns.delete(runId);
  }
});

seedAlerts();
server.listen(PORT, "127.0.0.1", () => {
  console.log("URL review listening on http://127.0.0.1:" + PORT);
});
