/**
 * The rescue of failed URL reviews (#3080): the rule diagnosis, Gemini's schema and its Vertex AI fallback, the ladder, the plan
 * and its caps, the daily cloud pass and the promised re-run's step (#3079) with a fake Firestore.
 *
 *   node --test tests/unit/url-review-rescue.test.js
 */
const test = require("node:test");
const assert = require("node:assert/strict");

const rescue = require("../../functions/url-review-rescue");
const failures = require("../../functions/url-review-failures");

const NOW = Date.parse("2026-11-10T12:00:00Z");

function failed(id, extra) {
  return Object.assign({
    id,
    kind: "failed",
    at: "2026-11-09T10:00:00Z",
    url: "https://www.example.com/",
    host: "www.example.com",
    name: "Ana",
    email: "ana@example.org",
    diagnosedAt: "2026-11-09T11:00:00Z",
    cause: { id: "bot-protection", label: "The site's bot protection refused the review", status: 403, vendor: "Cloudflare" },
    error: { message: "The site's bot protection refused the review (status 403, a Cloudflare bot check), in the plain request and in headless Chrome." },
    diagnosis: { cleared: false, nowLabel: "The plain read is refused (status 403, Cloudflare)" },
    probe: { plain: { status: 403, challenge: "Cloudflare", server: "cloudflare" }, browser: { ok: true, docStatus: 403, challenge: "Cloudflare" } },
    lines: [{ t: 1, text: "Browser: / is still status 403 in plain Chrome, so this pass stops before axe-core and the phone." }],
    options: { pages: 20, depth: 2, frameworks: [] },
    intake: {}
  }, extra || {});
}

test("rescue: the rules name the blocker and the strategies for each failure class", () => {
  const bot = rescue.ruleDiagnosis(rescue.evidenceOf(failed("a"), null, []));
  assert.equal(bot.by, "rules");
  assert.equal(bot.blocker, "waf-ip");
  assert.equal(bot.vendor, "Cloudflare");
  assert.deepEqual(bot.strategies, ["chrome-headers", "mac"]);

  const challenge = rescue.ruleDiagnosis(rescue.evidenceOf(failed("b", { lines: [{ t: 1, text: "Browser: the page title is Just a moment..." }] }), null, []));
  assert.equal(challenge.blocker, "js-challenge");

  const expired = failed("c", { cause: { id: "tls" }, error: { message: "certificate has expired" } });
  const cert = rescue.ruleDiagnosis(rescue.evidenceOf(expired, null, []));
  assert.equal(cert.siteSide, true);
  assert.deepEqual(rescue.ladder(cert, null, [], NOW), []);

  const h2 = rescue.ruleDiagnosis(rescue.evidenceOf(failed("d", { cause: { id: "timeout" }, error: { message: "headless Chrome could not open it either (net::ERR_HTTP2_PROTOCOL_ERROR at https://www.hpe.com/)." } }), null, []));
  assert.equal(h2.blocker, "http2");

  const geo = rescue.ruleDiagnosis(rescue.evidenceOf(failed("e", { url: "https://www.supersociedades.gov.co/", cause: { id: "timeout" }, error: { message: "The page took too long." }, probe: {} }), null, []));
  assert.equal(geo.blocker, "geo-block");
  assert.deepEqual(geo.strategies, ["alt-host", "mac"]);
});

test("rescue: Gemini's answer is kept only inside the schema", () => {
  const good = rescue.parseAi('Sure:\n{"blocker":"interactive-challenge","vendor":"Cloudflare","confidence":0.82,"siteSide":false,"strategies":["mac","mac"],"summary":"Turnstile asks for a click.","research":"The site uses Cloudflare Turnstile."}');
  assert.deepEqual(good, { by: "gemini", blocker: "interactive-challenge", vendor: "Cloudflare", confidence: 0.82, siteSide: false, strategies: ["mac"], summary: "Turnstile asks for a click.", research: "The site uses Cloudflare Turnstile." });
  assert.equal(rescue.parseAi('{"blocker":"aliens","vendor":"Cloudflare","confidence":0.5,"strategies":[],"summary":"x"}'), null);
  assert.equal(rescue.parseAi('{"blocker":"waf-ip","vendor":"Cloudflare","confidence":1.5,"strategies":[],"summary":"x"}'), null);
  assert.equal(rescue.parseAi('{"blocker":"waf-ip","vendor":"Cloudflare","confidence":0.5,"strategies":["proxy"],"summary":"x"}'), null);
  assert.equal(rescue.parseAi('{"blocker":"waf-ip","vendor":"Cloudflare","confidence":0.5,"strategies":[],"summary":""}'), null);
  assert.equal(rescue.parseAi("no json here"), null);
  const prompt = rescue.aiPrompt(rescue.evidenceOf(failed("a"), null, ["Plain read with the review UA: status 403"]));
  assert.match(prompt, /Answer with only one JSON object/);
  assert.match(prompt, /Plain read with the review UA: status 403/);
});

test("rescue: aiDiagnose grounds the call and falls back on a bad answer", async () => {
  let sent = null;
  const answer = (text) => async (url, init) => {
    sent = JSON.parse(init.body);
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text }] }, groundingMetadata: { groundingChunks: [{ web: { title: "cloudflare.com", uri: "https://example.org/s" } }] } }] }) };
  };
  const ev = rescue.evidenceOf(failed("a"), null, []);
  const out = await rescue.aiDiagnose(ev, { key: "k", fetch: answer('{"blocker":"waf-ip","vendor":"Cloudflare","confidence":0.7,"siteSide":false,"strategies":["chrome-headers","mac"],"summary":"Data-center addresses are refused."}') });
  assert.deepEqual(sent.tools, [{ google_search: {} }]);
  assert.equal(out.blocker, "waf-ip");
  assert.deepEqual(out.sources, [{ title: "cloudflare.com", uri: "https://example.org/s" }]);
  await assert.rejects(rescue.aiDiagnose(ev, { key: "k", fetch: answer("I think it is Cloudflare.") }), /not in the schema/);
  await assert.rejects(rescue.aiDiagnose(ev, { fetch: answer("{}") }), /not configured/);
});

test("rescue: Gemini on Vertex AI answers when the AI Studio key is out of credits or rate-limited", async () => {
  const ev = rescue.evidenceOf(failed("a"), null, []);
  const good = '{"blocker":"waf-ip","vendor":"Cloudflare","confidence":0.7,"siteSide":false,"strategies":["mac"],"summary":"Data-center addresses are refused."}';
  const calls = [];
  const studio = (status) => async (url, init) => {
    calls.push({ url, auth: init.headers.Authorization || "", body: JSON.parse(init.body) });
    if (url.includes("generativelanguage")) return { ok: false, status, json: async () => ({ error: { message: "Your prepayment credits are depleted." } }) };
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: good }] } }] }) };
  };
  const out = await rescue.diagnoseWithFallback(ev, { key: "k", fetch: studio(402), token: async () => "tok" });
  assert.equal(out.via, "vertex");
  assert.equal(out.blocker, "waf-ip");
  assert.match(calls[1].url, /^https:\/\/aiplatform\.googleapis\.com\/v1\/projects\/carlosm-interactive-cv\/locations\/global\/publishers\/google\/models\/[\w.-]+:generateContent$/);
  assert.equal(calls[1].auth, "Bearer tok");
  assert.deepEqual(calls[1].body.tools, [{ googleSearch: {} }]);
  calls.length = 0;
  assert.equal((await rescue.diagnoseWithFallback(ev, { key: "k", fetch: studio(429), token: async () => "tok" })).via, "vertex");
  calls.length = 0;
  await assert.rejects(rescue.diagnoseWithFallback(ev, { key: "k", fetch: studio(500), token: async () => "tok" }), /Gemini answered 500/);
  assert.equal(calls.length, 1);
  calls.length = 0;
  assert.equal((await rescue.diagnoseWithFallback(ev, { fetch: studio(402), token: async () => "tok" })).via, "vertex");
  assert.equal(calls.length, 1);
  assert.match(rescue.rescueLines({ status: "mac-wanted", diagnosis: Object.assign({}, out, { confidence: 0.7 }), attempts: [] })[0], /^Diagnosis \(Gemini on Vertex AI, confidence 70%\)/);
});

test("rescue: the ladder puts a fresh hint first and skips what this rescue lost", () => {
  const plan = { strategies: ["chrome-headers", "mac"], confidence: 0.6 };
  assert.deepEqual(rescue.ladder(plan, null, [], NOW), ["chrome-headers", "mac", "alt-host"]);
  assert.deepEqual(rescue.ladder(plan, { strategy: "alt-host", at: "2026-11-01T00:00:00Z" }, [], NOW), ["alt-host", "chrome-headers", "mac"]);
  assert.deepEqual(rescue.ladder(plan, { strategy: "alt-host", at: "2026-06-01T00:00:00Z" }, [], NOW), ["chrome-headers", "mac", "alt-host"]);
  const lost = [{ strategy: "chrome-headers", ok: false }, { strategy: "mac", ok: false }, { strategy: "mac", ok: null }];
  assert.deepEqual(rescue.ladder(plan, null, lost, NOW), ["mac", "alt-host"]);
  assert.deepEqual(rescue.ladder(plan, null, lost.concat([{ strategy: "mac", ok: false }]), NOW), ["alt-host"]);
  assert.deepEqual(rescue.ladder(plan, null, lost.concat([{ strategy: "mac", ok: false }]), NOW, true), ["mac", "alt-host"]);
});

test("rescue: helpers for the other host name and a readable plain read", () => {
  assert.equal(rescue.altUrl("https://www.example.com/a?b=1"), "https://example.com/a?b=1");
  assert.equal(rescue.altUrl("https://example.com/"), "https://www.example.com/");
  assert.equal(rescue.altUrl("https://1.2.3.4/"), "");
  assert.equal(rescue.readable({ status: 200, html: true, challenge: "" }), true);
  assert.equal(rescue.readable({ status: 200, html: true, challenge: "Cloudflare" }), false);
  assert.equal(rescue.readable({ status: 403, html: true }), false);
  assert.equal(rescue.readable({ error: "The page took too long." }), false);
  assert.equal(rescue.probeNote({ status: 403, challenge: "Cloudflare", html: true }), "status 403, Cloudflare bot check");
});

test("rescue: the plan takes failures no re-run settled, one per address and asker, within the caps", () => {
  const rows = [
    failed("a1"),
    failed("a2", { at: "2026-11-08T10:00:00Z" }),
    failed("held", { url: "https://held.example/", rerun: { status: "held" } }),
    failed("again", { url: "https://again.example/", rerun: { status: "failed" } }),
    failed("dns", { url: "https://dns.example/", cause: { id: "dns" } }),
    failed("save", { url: "https://save.example/", cause: { id: "save" } }),
    failed("old", { url: "https://old.example/", at: "2026-10-01T10:00:00Z" }),
    failed("notfound", { url: "https://gone.example/", cause: { id: "status", status: 404 }, diagnosis: { site: true } }),
    failed("queued", { url: "https://queued.example/" })
  ];
  const prior = [{ id: "queued", key: "https://queued.example/|ana@example.org", status: "mac-wanted" }];
  const plan = rescue.rescuePlan(rows, prior, NOW);
  assert.deepEqual(plan.map((item) => item.id), ["a1", "again"]);
  assert.deepEqual(plan[0].group.failureIds, ["a1", "a2"]);
  assert.deepEqual(plan[0].group.options.frameworks, ["Playwright"]);

  const spent = [{ id: "a1", key: "https://www.example.com/|ana@example.org", status: "trying", day: "2026-11-10", dayAttempts: rescue.ATTEMPTS_PER_DAY }];
  assert.deepEqual(rescue.rescuePlan(rows, prior.concat(spent), NOW).map((item) => item.id), ["again"]);
  const many = Array.from({ length: 20 }, (_, n) => failed("m" + n, { url: "https://m" + n + ".example/" }));
  assert.equal(rescue.rescuePlan(many, [], NOW).length, rescue.RESCUES_PER_DAY);
});

test("rescue: a promised failure goes first, past the daily caps and an exhausted rescue", () => {
  const promise = { state: "open", dueAt: "2026-11-11T10:00:00Z" };
  const many = Array.from({ length: 20 }, (_, n) => failed("m" + n, { url: "https://m" + n + ".example/", at: "2026-11-10T0" + (n % 10) + ":00:00Z" }));
  const kept = failed("kept", { url: "https://kept.example/", at: "2026-11-01T10:00:00Z", promise });
  const tired = failed("tired", { url: "https://tired.example/", at: "2026-11-01T10:00:00Z", promise });
  const prior = [
    { id: "kept", key: "https://kept.example/|ana@example.org", status: "exhausted" },
    { id: "tired", key: "https://tired.example/|ana@example.org", status: "trying", day: "2026-11-10", dayAttempts: rescue.ATTEMPTS_PER_DAY }
  ];
  const plan = rescue.rescuePlan(many.concat([kept, tired]), prior, NOW);
  assert.deepEqual(plan.slice(0, 2).map((item) => [item.id, item.promised]), [["kept", true], ["tired", true]]);
  assert.equal(plan.length, 2 + rescue.RESCUES_PER_DAY);
  assert.equal(rescue.rescueDoc(plan[0], { status: "trying", attempts: [] }, NOW).promised, true);
  const exhausted = rescue.rescuePlan([failed("x", { url: "https://kept.example/" })], prior, NOW);
  assert.equal(exhausted.length, 0);
});

test("rescue: the AI cap holds per day and per failure", () => {
  assert.equal(rescue.aiDue(null, NOW, 0), true);
  assert.equal(rescue.aiDue(null, NOW, rescue.AI_PER_DAY), false);
  assert.equal(rescue.aiDue({ day: "2026-11-10", dayAi: rescue.AI_PER_FAILURE_DAY }, NOW, 0), false);
  assert.equal(rescue.aiDue({ day: "2026-11-09", dayAi: 5 }, NOW, 0), true);
});

function fakeDb(seed) {
  const store = {};
  Object.keys(seed || {}).forEach((name) => seed[name].forEach((row) => { store[name + "/" + row.id] = Object.assign({}, row); }));
  const rowsOf = (name) => Object.keys(store).filter((key) => key.startsWith(name + "/")).map((key) => Object.assign({ id: key.slice(name.length + 1) }, store[key]));
  return {
    store,
    collection: (name) => ({
      where: (field, op, value) => {
        const docs = () => rowsOf(name).filter((row) => op === "==" ? row[field] === value : String(row[field] || "") >= value).map((row) => ({ id: row.id, data: () => row }));
        return { get: async () => ({ docs: docs() }), limit: (n) => ({ get: async () => ({ docs: docs().slice(0, n) }) }) };
      },
      doc: (id) => ({
        get: async () => ({ exists: !!store[name + "/" + id], data: () => store[name + "/" + id] }),
        set: async (value) => { store[name + "/" + id] = value; },
        update: async (value) => { store[name + "/" + id] = Object.assign({}, store[name + "/" + id], value); }
      })
    })
  };
}

test("rescue: the cloud pass reads as Chrome, re-runs, keeps a hint, and queues the rest for the Mac", async () => {
  const walled = failed("w1");
  const blocked = failed("b1", { url: "https://blocked.example/", host: "blocked.example", email: "" });
  const db = fakeDb({ url_review_failures: [walled, blocked] });
  const reads = [];
  const reruns = [];
  const out = await rescue.runRescues({
    db,
    rows: [walled, blocked],
    probeRead: async (url, options) => {
      reads.push(url + " " + (options.readAs || "tagged"));
      return new URL(url).hostname === "www.example.com" && options.readAs === "chrome" ? { status: 200, html: true, challenge: "" } : { status: 403, html: true, challenge: "Cloudflare" };
    },
    rerun: async (group) => {
      reruns.push(group);
      return { id: "r1", status: "held", reportId: "rep1" };
    },
    probeLines: failures.probeLines,
    gemini: async () => { throw new Error("Gemini answered 503: busy"); },
    until: Date.now() + 60000
  });
  assert.equal(out.planned, 2);
  assert.equal(out.ai, 2);
  assert.equal(reruns.length, 1);
  assert.equal(reruns[0].readAs, "chrome");
  assert.equal(reruns[0].trigger.id, "rescue");
  const rescued = db.store["url_review_rescues/w1"];
  assert.equal(rescued.status, "rescued");
  assert.equal(rescued.strategy, "chrome-headers");
  assert.equal(rescued.diagnosis.by, "rules");
  assert.equal(db.store["url_review_read_hints/example.com"].strategy, "chrome-headers");
  const queued = db.store["url_review_rescues/b1"];
  assert.equal(queued.status, "mac-wanted");
  assert.deepEqual(queued.attempts.map((row) => [row.strategy, row.ok]), [["chrome-headers", false], ["mac", null]]);
  assert.equal(queued.dayAttempts, 1);
  assert.equal(db.store["url_review_failures/b1"].rescue.status, "mac-wanted");
  assert.ok(db.store["url_review_failures/b1"].rescue.lines.some((line) => /^Diagnosis \(rules/.test(line)));
  assert.deepEqual(reads, ["https://www.example.com/ chrome", "https://blocked.example/ chrome"]);
});

test("rescue: the desk and the daily bug show what the rescue concluded", () => {
  const doc = failed("w1", { rescue: { id: "w1", status: "mac-wanted", blocker: "waf-ip", by: "gemini", lines: ["Diagnosis (Gemini, confidence 80%): A bot wall that refuses data-center addresses, Cloudflare. Refused from Google Cloud.", "Rescue: Waiting for Carlos's Mac to read it from a home connection."] } });
  assert.equal(failures.failureRow(doc).rescue, "rescue mac-wanted (Gemini: waf-ip)");
  assert.equal(failures.failureDetail(doc).rescueLines.length, 2);
  const bugs = failures.bugPlan([Object.assign({}, doc, { diagnosis: { cleared: false, nowLabel: "Still refused" }, fixes: failures.FIXES.map((fix) => fix.cause + " " + fix.ref) })], [], []);
  assert.equal(bugs.length, 1);
  assert.match(bugs[0].body, /### Rescue of www\.example\.com \(#3080\)\n- Diagnosis \(Gemini, confidence 80%\)/);
});

test("rescue: the promised re-run's step returns the held re-run, waits on the Mac, or runs the ladder", async () => {
  const promise = { state: "open", dueAt: "2026-11-11T10:00:00Z" };
  const group = (url, ids) => ({ url, host: new URL(url).hostname, email: "ana@example.org", failureIds: ids, options: { pages: 20, depth: 2, frameworks: ["Playwright"] }, intake: {}, promise });
  const db = fakeDb({
    url_review_failures: [failed("done1", { url: "https://done.example/", promise }), failed("mac1", { url: "https://mac.example/", promise }), failed("new1", { promise })],
    url_review_rescues: [
      { id: "done1", key: "https://done.example/|ana@example.org", status: "rescued", rerunId: "r9" },
      { id: "mac1", key: "https://mac.example/|ana@example.org", status: "mac-wanted" }
    ],
    url_review_reruns: [{ id: "r9", status: "held", reportId: "rep9" }]
  });
  const reruns = [];
  const deps = {
    db,
    probeRead: async (url, options) => options.readAs === "chrome" ? { status: 200, html: true, challenge: "" } : { status: 403, html: true, challenge: "Cloudflare" },
    rerun: async (one) => { reruns.push(one); return { id: "r10", status: "held", reportId: "rep10" }; },
    probeLines: failures.probeLines,
    gemini: null,
    until: Date.now() + 60000
  };
  const held = await rescue.rescueGroup(deps, group("https://done.example/", ["done1"]));
  assert.deepEqual([held.id, held.status, held.promise], ["r9", "held", promise]);
  const waiting = await rescue.rescueGroup(deps, group("https://mac.example/", ["mac1"]));
  assert.deepEqual([waiting.status, waiting.rescue], ["failed", "mac-wanted"]);
  assert.equal(db.store["url_review_rescues/mac1"].promised, true);
  assert.equal(reruns.length, 0);
  const fresh = await rescue.rescueGroup(deps, group("https://www.example.com/", ["new1"]));
  assert.deepEqual([fresh.id, fresh.status], ["r10", "held"]);
  assert.equal(reruns[0].readAs, "chrome");
  assert.equal(db.store["url_review_rescues/new1"].status, "rescued");
  assert.equal(db.store["url_review_rescues/new1"].promised, true);
});
