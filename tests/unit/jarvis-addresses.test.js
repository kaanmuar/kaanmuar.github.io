const test = require("node:test");
const assert = require("node:assert/strict");
const addresses = require("../../functions/jarvis-addresses");
const outreach = require("../../functions/jarvis-outreach");
const actions = require("../../functions/jarvis-actions");
const core = require("../../js/admin-jarvis-core.js");
const { fakeDb } = require("./fake-jarvis-db");

const MONDAY_10 = Date.parse("2026-10-26T15:00:00Z");
const HOOK = "https://us-central1-example.cloudfunctions.net/mailInbound?key=s3cret";
const INBOX = "owner@gmail.example";
const plain = ["abuse", "community", "hello", "hola", "legal", "postmaster", "privacy", "security", "support"];
const hooked = ["bluesky", "buffer", "canary", "linkedin", "mastodon", "meta", "qa", "qalaburlreview", "qaurlreview", "tiktok", "x", "youtube"];
const ALIASES = plain.map((alias) => ({ alias, forward: INBOX })).concat(hooked.map((alias) => ({ alias, forward: INBOX + "," + HOOK })));
const ACCOUNTS = [
  { email: "carlos@qalabreview.com", status: 1, warmup_status: 1, stat_warmup_score: 98, daily_limit: 30 },
  { email: "hello@qalabreview.com", status: -1, warmup_status: 1, status_message: { e_message: "Permanent OAuth failure: AADSTS50076 MFA required. Trace ID: abc" } }
];

test("ImprovMX rows: forwards with the webhook as \"webhook\", the last day per alias, bounces and SMTP logins", () => {
  const box = { aliases: [{ alias: "qa", mails: 4, forwarded: 3, bounced: 1, refused: 0, last: "2026-10-26T14:00:00Z" }, { alias: "hello", mails: 2, forwarded: 2, bounced: 0, refused: 0 }],
    problems: [{ alias: "qa", outcome: "bounced", reason: "550 mailbox full" }] };
  const rows = addresses.improvmxRows(ALIASES, [{ username: "notices", usage: 12 }], box, "carlosandmunoz.com");
  assert.equal(rows.filter((r) => r.kind === "alias").length, 21);
  const qa = rows.find((r) => r.address === "qa@carlosandmunoz.com");
  assert.deepEqual(qa.forwards, [INBOX, "webhook"]);
  assert.equal(qa.state, "error");
  assert.equal(qa.problem, "bounce");
  assert.match(qa.detail, /1 mail bounced in the last day: 550 mailbox full/);
  assert.equal(rows.find((r) => r.address === "hello@carlosandmunoz.com").detail, "2 mails in the last day, 2 forwarded.");
  assert.deepEqual(rows.find((r) => r.kind === "smtp login"), Object.assign({}, rows.find((r) => r.kind === "smtp login"), { address: "notices@carlosandmunoz.com", system: "ImprovMX", state: "ok" }));
  assert.ok(!JSON.stringify(rows).includes("s3cret"), "the webhook key never reaches a row");
});

test("a missing required alias is Jarvis's to restore, with the inbox and the webhook copied from another alias", () => {
  const without = ALIASES.filter((a) => a.alias !== "canary" && a.alias !== "postmaster");
  const rows = addresses.improvmxRows(without, [], null);
  const canary = rows.find((r) => r.address === "canary@carlosandmunoz.com");
  assert.equal(canary.problem, "missing");
  assert.deepEqual(canary.fix, { by: "jarvis", action: "restore-alias" });
  assert.deepEqual(canary.forwards, [INBOX, "webhook"]);
  assert.deepEqual(addresses.restorePlan(without, "canary"), { alias: "canary", forward: INBOX + "," + HOOK });
  assert.deepEqual(addresses.restorePlan(without, "postmaster"), { alias: "postmaster", forward: INBOX });
  assert.equal(addresses.restorePlan(without, "sales"), null, "only required aliases");
  const noHook = without.map((a) => ({ alias: a.alias, forward: INBOX }));
  assert.equal(addresses.restorePlan(noHook, "canary"), null);
  assert.equal(addresses.improvmxRows(noHook, [], null).find((r) => r.address.startsWith("canary@")).fix.by, "carlos");
});

test("Instantly rows: an error is Carlos's to reconnect, warm-up off is Jarvis's, a Jarvis pause shows its reason", () => {
  const accounts = outreach.accountRows(ACCOUNTS.concat([
    { email: "cold@qalabreview.com", status: 1, warmup_status: 0, stat_warmup_score: 40 },
    { email: "rest@qalabreview.com", status: 2, warmup_status: 1, stat_warmup_score: 70 }
  ]));
  const rows = addresses.instantlyRows(accounts, [{ email: "rest@qalabreview.com", reason: "warm-up score 70 under 80" }]);
  const by = (e) => rows.find((r) => r.address === e);
  assert.equal(by("carlos@qalabreview.com").state, "ok");
  assert.equal(by("carlos@qalabreview.com").detail, "warm-up on, score 98.");
  assert.equal(by("hello@qalabreview.com").state, "error");
  assert.deepEqual(by("hello@qalabreview.com").fix, { by: "carlos", action: "Reconnect", link: "https://app.instantly.ai/app/accounts" });
  assert.match(by("hello@qalabreview.com").detail, /AADSTS50076 MFA required\.$/);
  assert.deepEqual([by("cold@qalabreview.com").state, by("cold@qalabreview.com").fix.action], ["warn", "enable-warmup"]);
  assert.equal(by("rest@qalabreview.com").state, "paused");
  assert.match(by("rest@qalabreview.com").detail, /^Paused by Jarvis: warm-up score 70 under 80; warm-up on/);
});

test("Microsoft 365 rows: each mailbox with its smtp aliases; blocked or unlicensed users are errors", () => {
  const rows = addresses.graphRows([
    { displayName: "Carlos", mail: "Carlos@qalabreview.com", accountEnabled: true, assignedLicenses: [{ skuId: "x" }],
      proxyAddresses: ["SMTP:Carlos@qalabreview.com", "smtp:qa@qalabreview.com", "smtp:CarlosMunozArdila@QAlabURLReview.onmicrosoft.com"] },
    { displayName: "Hello", mail: "hello@qalabreview.com", accountEnabled: false, assignedLicenses: [{ skuId: "x" }], proxyAddresses: ["SMTP:hello@qalabreview.com"] },
    { displayName: "No mail", userPrincipalName: "svc@qalaburlreview.onmicrosoft.com", accountEnabled: true, assignedLicenses: [] }
  ]);
  assert.deepEqual(rows.map((r) => [r.address, r.kind, r.state, r.aliasOf]), [
    ["carlos@qalabreview.com", "mailbox", "ok", ""], ["qa@qalabreview.com", "mailbox alias", "ok", "carlos@qalabreview.com"],
    ["carlosmunozardila@qalaburlreview.onmicrosoft.com", "mailbox alias", "ok", "carlos@qalabreview.com"], ["hello@qalabreview.com", "mailbox", "error", ""]
  ]);
  assert.equal(rows[3].problem, "disabled");
  assert.equal(rows[2].domain, "qalaburlreview.onmicrosoft.com");
});

test("issues: one per problem with who fixes it; unchecked Microsoft 365 rows and bounces are not pushed", () => {
  const sending = addresses.instantlyRows(outreach.accountRows(ACCOUNTS), []);
  const rows = addresses.improvmxRows(ALIASES.filter((a) => a.alias !== "abuse"), [], { aliases: [], problems: [{ alias: "x", outcome: "refused", reason: "550 no" }] })
    .concat(addresses.uncheckedRows(sending, "qalabreview.com"), sending, addresses.senderRows("qa@carlosandmunoz.com", [], "carlosandmunoz.com"));
  const domains = [{ domain: "qalabreview.com", checks: [{ name: "DMARC", ok: false, detail: "p=none (monitor only)" }, { name: "MX", ok: true }] }];
  const issues = addresses.issuesOf(rows, domains);
  assert.deepEqual(issues.map((i) => [i.key, i.by, i.push]), [
    ["improvmx:bounce:x@carlosandmunoz.com", "carlos", false],
    ["improvmx:missing:abuse@carlosandmunoz.com", "jarvis", true],
    ["instantly:reconnect:hello@qalabreview.com", "carlos", true],
    ["sendgrid:no-reply-alias:qa@carlosandmunoz.com", "carlos", true],
    ["dns:qalabreview.com:DMARC", "carlos", true]
  ]);
  assert.match(issues[2].text, /^Reconnect hello@qalabreview.com in Instantly: Permanent OAuth failure/);
  assert.equal(addresses.senderRows("qa@carlosandmunoz.com", null, "carlosandmunoz.com")[0].state, "ok", "ImprovMX did not answer: not flagged");
  assert.equal(addresses.uncheckedRows(sending, "qalabreview.com").length, 2);
});

function fakeFetch(over) {
  const calls = [];
  const answer = (body, status) => ({ ok: (status || 200) < 400, status: status || 200, json: async () => body, text: async () => JSON.stringify(body) });
  const cname = { "s1._domainkey.carlosandmunoz.com": 1, "s2._domainkey.carlosandmunoz.com": 1, "dkimprovmx1._domainkey.carlosandmunoz.com": 1, "dkimprovmx2._domainkey.carlosandmunoz.com": 1, "selector1._domainkey.qalabreview.com": 1, "selector2._domainkey.qalabreview.com": 1 };
  const fetch = async (url, init) => {
    calls.push([url, init && init.method, init && init.body]);
    const o = (over || {})[Object.keys(over || {}).find((k) => url.includes(k))];
    if (o) return answer(...o(url, init));
    if (url.includes("dns.google")) {
      const q = new URL(url).searchParams;
      const name = q.get("name"), type = q.get("type");
      const data = type === "MX" ? "10 mx1.improvmx.com." : type === "CNAME" ? (cname[name] ? "x.example." : null) : name.startsWith("_dmarc") ? "v=DMARC1; p=quarantine; pct=25" : "v=spf1 include:spf.improvmx.com include:sendgrid.net ~all";
      return answer({ Answer: data ? [{ type: { MX: 15, CNAME: 5, TXT: 16 }[type], data }] : [] });
    }
    if (url.includes("/aliases")) return answer({ aliases: ALIASES });
    if (url.includes("/credentials")) return answer({ credentials: [{ username: "notices", usage: 3 }] });
    if (url.includes("/logs/count")) return answer({ total: 0 });
    if (url.includes("/logs")) return answer({ logs: [] });
    if (url.endsWith("/account")) return answer({ account: { plan: { name: "Premium" } } });
    if (url.includes("api.instantly.ai")) return answer({ items: ACCOUNTS });
    return answer({}, 404);
  };
  return { fetch, calls };
}

function sourceDb(pauses) {
  const doc = (data) => ({ get: async () => ({ exists: !!data, data: () => data }) });
  return { collection: (name) => ({ doc: () => doc(null), get: async () => ({ docs: (name === "jarvis_outreach_pauses" ? pauses || [] : []).map((p) => ({ data: () => p })) }) }) };
}

const ENV = { IMPROVMX_API_KEY: "imx", INSTANTLY_API_KEY: "ins", SENDGRID_FROM: "qa@carlosandmunoz.com" };

test("source: every address with its state, the domains' mail records, and the Graph need when Microsoft 365 is not connected", async () => {
  const { fetch } = fakeFetch();
  const out = await addresses.source({ fetch, env: ENV, db: sourceDb(), now: MONDAY_10 });
  assert.equal(out.ok, true);
  assert.deepEqual(out.needs, [addresses.GRAPH_NEED]);
  assert.equal(out.graph, false);
  assert.deepEqual(out.domains.map((d) => [d.domain, d.ok, d.site]), [["carlosandmunoz.com", true, true], ["qalabreview.com", true, false]]);
  assert.match(out.domains[0].checks.find((c) => c.name === "DKIM").detail, /s1, s2, dkimprovmx1 and dkimprovmx2 are published/);
  const systems = out.rows.reduce((m, r) => { m[r.system] = (m[r.system] || 0) + 1; return m; }, {});
  assert.deepEqual(systems, { ImprovMX: 22, "Microsoft 365": 2, Instantly: 2, SendGrid: 1 });
  assert.equal(out.rows[0].domain, "carlosandmunoz.com");
  assert.equal(out.rows.find((r) => r.system === "SendGrid").state, "ok");
  assert.deepEqual(out.issues.map((i) => i.key), ["instantly:reconnect:hello@qalabreview.com"]);
  assert.equal(out.counts.addresses, 24, "qa@ is an alias and the SendGrid sender; carlos@ and hello@ are in Instantly and Microsoft 365");
  assert.ok(!JSON.stringify(out).includes("s3cret"), "the webhook key never leaves the server");
});

test("source: with the Graph app set, Microsoft 365 users are read with client credentials", async () => {
  const { fetch, calls } = fakeFetch({
    "login.microsoftonline.com": () => [{ access_token: "tok" }],
    "graph.microsoft.com": () => [{ value: [{ mail: "Carlos@qalabreview.com", accountEnabled: true, assignedLicenses: [{}], proxyAddresses: ["SMTP:Carlos@qalabreview.com", "smtp:qa@qalabreview.com"] }] }]
  });
  const out = await addresses.source({ fetch, env: Object.assign({ MS_GRAPH_TENANT_ID: "t", MS_GRAPH_CLIENT_ID: "c", MS_GRAPH_CLIENT_SECRET: "s" }, ENV), db: sourceDb(), now: MONDAY_10 });
  assert.deepEqual(out.needs, []);
  assert.equal(out.graph, true);
  assert.deepEqual(out.rows.filter((r) => r.system === "Microsoft 365").map((r) => r.address), ["carlos@qalabreview.com", "qa@qalabreview.com"]);
  const token = calls.find(([url]) => url.includes("login.microsoftonline.com"));
  assert.match(token[2], /grant_type=client_credentials/);
  assert.match(calls.find(([url]) => url.includes("graph.microsoft.com"))[0], /\$select=displayName,userPrincipalName,mail,proxyAddresses,accountEnabled,assignedLicenses/);
});

test("the Graph secrets stay out of the declared secrets: a missing one would break the deploy", () => {
  const secrets = require("../../functions/secrets");
  assert.ok(!secrets.ALL.some((s) => /^MS_GRAPH_/.test(s)));
});

test("restoreAlias posts the rebuilt alias and enableWarmup posts the emails to Instantly", async () => {
  const { fetch, calls } = fakeFetch({ "/aliases": (url, init) => [init && init.method === "POST" ? { success: true } : { aliases: ALIASES.filter((a) => a.alias !== "canary") }] });
  const ctx = { fetch, env: ENV };
  const res = await addresses.restoreAlias(ctx, "canary");
  const post = calls.find(([, method]) => method === "POST");
  assert.match(post[0], /domains\/carlosandmunoz\.com\/aliases$/);
  assert.deepEqual(JSON.parse(post[2]), { alias: "canary", forward: INBOX + "," + HOOK });
  assert.equal(res.detail, "Restored canary@carlosandmunoz.com → " + INBOX + ", webhook.");
  const warm = fakeFetch({ "warmup/enable": () => [{ id: "job" }] });
  await addresses.enableWarmup({ fetch: warm.fetch, env: ENV }, ["cold@qalabreview.com"]);
  assert.deepEqual([warm.calls[0][0], warm.calls[0][1], JSON.parse(warm.calls[0][2])], ["https://api.instantly.ai/api/v2/accounts/warmup/enable", "POST", { emails: ["cold@qalabreview.com"] }]);
});

const issue = (key, by, extra) => Object.assign({ key, by, push: true, text: key, address: key.split(":").pop(), system: "Instantly", action: by === "jarvis" ? "enable-warmup" : "Reconnect", link: "https://app.instantly.ai/app/accounts" }, extra);

test("pushes: once per occurrence; a problem that clears and comes back pushes again", () => {
  const a = issue("instantly:reconnect:hello@qalabreview.com", "carlos");
  let open = addresses.openProblems([a], [], MONDAY_10);
  assert.deepEqual(addresses.toPush([a], open).map((i) => i.key), [a.key]);
  open[a.key].pushedAt = new Date(MONDAY_10).toISOString();
  open = addresses.openProblems([a], addresses.openList(open), MONDAY_10 + 3600000);
  assert.deepEqual(addresses.toPush([a], open), [], "same problem, not pushed again");
  assert.equal(open[a.key].since, new Date(MONDAY_10).toISOString());
  open = addresses.openProblems([], addresses.openList(open), MONDAY_10 + 7200000);
  open = addresses.openProblems([a], addresses.openList(open), MONDAY_10 + 10800000);
  assert.deepEqual(addresses.toPush([a], open).map((i) => i.key), [a.key], "it came back");
  assert.deepEqual(addresses.toPush([issue("improvmx:bounce:x@c.com", "carlos", { push: false }), issue("instantly:warmup:a@q.com", "jarvis")], addresses.openProblems([issue("improvmx:bounce:x@c.com", "carlos"), issue("instantly:warmup:a@q.com", "jarvis")], [], MONDAY_10)), []);
  const msgs = addresses.pushMessages([a]);
  assert.deepEqual([msgs[0].tab, msgs[0].url, msgs[0].actions[0].label], ["systems", "https://app.instantly.ai/app/accounts", "Reconnect"]);
  assert.equal(addresses.pushMessages([1, 2, 3, 4].map((n) => issue("dns:d" + n, "carlos"))).length, 1, "past three, one push for all");
});

function addressOps(state, over) {
  const calls = { warm: [], restored: [], pushes: [], paused: [], pauses: {} };
  const ops = Object.assign({
    held: async () => [], noticesLive: false, failedNotices: async () => [], noticeBudget: async () => 0, hubStale: async () => false,
    addresses: async () => state.addresses,
    addressState: async () => state.saved,
    setAddressState: async (row) => { state.saved = row; },
    enableWarmup: async (emails) => { calls.warm.push(...emails); if (state.warmFails) throw new Error("Instantly 403: scope"); return { detail: "on" }; },
    restoreAlias: async (alias) => { calls.restored.push(alias); return { detail: "back" }; },
    push: async (msg) => { calls.pushes.push(msg); },
    pauseMailbox: async (email) => { calls.paused.push(email); },
    setPause: async (email, row) => { if (row) calls.pauses[email] = row; else delete calls.pauses[email]; }
  }, over || {});
  return { ops, calls };
}

test("autoRun: warm-up off is turned on before the pause loop, so the mailbox is healed and not paused", async () => {
  const cold = { email: "cold@qalabreview.com", status: "active", warmup: "off", score: 90 };
  const state = { addresses: { ok: true, issues: [issue("instantly:warmup:cold@qalabreview.com", "jarvis")] } };
  const { ops, calls } = addressOps(state, { outreach: async () => ({ domain: "qalabreview.com", failing: [], warmupMin: 80, mailboxes: [cold], pauses: [] }) });
  const out = await actions.autoRun({ db: fakeDb(), now: MONDAY_10, settings: {}, ops });
  assert.deepEqual(calls.warm, ["cold@qalabreview.com"]);
  assert.deepEqual(calls.paused, []);
  assert.deepEqual(out.done.map((r) => r.action), ["enable-warmup"]);
  assert.match(actions.pushMessage(out).lines[0], /^Turn mailbox warm-up back on: cold@qalabreview.com/);
});

test("autoRun: a fix runs once per occurrence and within its cap; Carlos's problems push once", async () => {
  const db = fakeDb();
  const issues = [issue("improvmx:missing:canary@carlosandmunoz.com", "jarvis", { action: "restore-alias", system: "ImprovMX" }), issue("improvmx:missing:abuse@carlosandmunoz.com", "jarvis", { action: "restore-alias", system: "ImprovMX" }),
    issue("improvmx:missing:postmaster@carlosandmunoz.com", "jarvis", { action: "restore-alias", system: "ImprovMX" }), issue("instantly:reconnect:hello@qalabreview.com", "carlos")];
  const state = { addresses: { ok: true, issues } };
  const { ops, calls } = addressOps(state);
  const first = await actions.autoRun({ db, now: MONDAY_10, settings: {}, ops });
  assert.deepEqual(calls.restored, ["canary", "abuse"], "cap of 2 a day");
  assert.deepEqual(first.waiting.map((w) => w.action), ["restore-alias"]);
  assert.deepEqual(calls.pushes.map((m) => m.title), ["Email: hello@qalabreview.com"]);
  await actions.autoRun({ db, now: MONDAY_10 + 3600000, settings: {}, ops });
  assert.deepEqual(calls.restored, ["canary", "abuse"], "not again for the same occurrence");
  assert.equal(calls.pushes.length, 1, "the same problem is not pushed twice");
  assert.ok(state.saved.open.every((p) => p.since === new Date(MONDAY_10).toISOString()));
});

test("autoRun: a fix that fails is pushed to Carlos with the error", async () => {
  const state = { warmFails: true, addresses: { ok: true, issues: [issue("instantly:warmup:cold@qalabreview.com", "jarvis")] } };
  const { ops, calls } = addressOps(state);
  await actions.autoRun({ db: fakeDb(), now: MONDAY_10, settings: {}, ops });
  assert.deepEqual(calls.pushes.map((m) => m.body), ["Jarvis could not turn warm-up on for cold@qalabreview.com: Instantly 403: scope"]);
});

test("briefing: an address line only when the outreach, safety and mailbox sources do not already say it", () => {
  const issues = [
    { key: "instantly:reconnect:hello@qalabreview.com", level: "alert", system: "Instantly", address: "hello@qalabreview.com", problem: "reconnect", text: "Reconnect hello@qalabreview.com in Instantly: MFA" },
    { key: "dns:qalabreview.com:DMARC", level: "warn", system: "DNS", address: "qalabreview.com", check: "DMARC", problem: "dns", text: "qalabreview.com DMARC: p=none" },
    { key: "dns:carlosandmunoz.com:DKIM", level: "warn", system: "DNS", address: "carlosandmunoz.com", check: "DKIM", problem: "dns", text: "carlosandmunoz.com DKIM: dkimprovmx2 missing" },
    { key: "m365:disabled:hello@qalabreview.com", level: "alert", system: "Microsoft 365", address: "hello@qalabreview.com", problem: "disabled", text: "hello@qalabreview.com cannot sign in" }
  ];
  const ext = { addresses: { ok: true, issues, domains: [{ domain: "carlosandmunoz.com", site: true }, { domain: "qalabreview.com" }] } };
  const keys = (e) => core.briefing({ products: {}, external: e }).map((b) => b.key).filter((k) => k.startsWith("addresses:"));
  assert.deepEqual(keys(ext).sort(), issues.map((i) => "addresses:" + i.key).sort());
  const covered = Object.assign({}, ext, {
    outreach: { ok: true, instantly: { ok: true, accounts: [{ email: "hello@qalabreview.com", status: "error", warmup: "on" }], status: [] }, mail: { domain: "qalabreview.com", checks: [{ name: "DMARC", ok: false, detail: "p=none" }] } },
    safety: { ok: true, checks: [{ name: "DKIM", level: "warn", detail: "s2 missing", key: "dkim" }] }
  });
  assert.deepEqual(keys(covered), ["addresses:m365:disabled:hello@qalabreview.com"]);
  const proposals = core.proposalRules({ products: {}, external: ext }, core.briefing({ products: {}, external: ext }));
  assert.ok(proposals.some((p) => p.title === "Reconnect the mailboxes in Instantly" && p.link === "https://app.instantly.ai/app/accounts"));
  assert.ok(core.CONNECTIONS.some((c) => c.key === "addresses"));
});
