// Jarvis settles the outreach leads by itself (#2016): translations, review re-runs, approvals, and what it asks.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const auto = require("../../scripts/marketing-leads-autopilot.js");
const sync = require("../../scripts/jarvis-marketing-sync.js");

const NOW = Date.parse("2026-11-02T15:00:00Z");
const DAY = 86400000;

test("leads autopilot: each row gets one decision, and Carlos's no is final", () => {
  const d = (row, reruns) => auto.decide(row, reruns || {}, NOW);
  assert.equal(d({ missing: "" }).kind, "approve");
  assert.equal(d({ missing: "", approved: "no" }).kind, "none");
  assert.equal(d({ missing: "", approved: "yes" }).kind, "none");
  assert.equal(d({ missing: "", uploaded: "2026-10-27" }).kind, "none");
  assert.equal(d({ missing: "top_finding (translate)" }).kind, "translate");
  const noReport = { host: "www.udg.mx", missing: "report (not published yet); best_point; live_report_url; top_finding" };
  assert.equal(d(noReport).kind, "rerun");
  assert.match(d(noReport, { "udg.mx": { tries: 1, at: new Date(NOW - DAY).toISOString() } }).why, /re-run 1 of 2 queued 2026-11-01/);
  assert.equal(d(noReport, { "udg.mx": { tries: 1, at: new Date(NOW - 3 * DAY).toISOString() } }).kind, "rerun");
  const stuck = d(noReport, { "udg.mx": { tries: 2, at: new Date(NOW - 3 * DAY).toISOString() } });
  assert.equal(stuck.kind, "ask");
  assert.match(stuck.why, /No Live Report after 2 review re-runs/);
  const personal = d({ missing: "email (personal address)" });
  assert.equal(personal.kind, "ask");
  assert.match(personal.why, /Personal address/);
  const peers = d({ missing: "top_finding (translate); peer_1; peer_2" });
  assert.equal(peers.kind, "ask");
  assert.deepEqual(peers.auto, ["translate"]);
  assert.match(peers.why, /Needs peer_1; Needs peer_2/);
});

test("leads autopilot: translations keep a lowercase start and an empty answer leaves the row alone", async () => {
  const fetch = async () => ({ ok: true, json: async () => [[["Los elementos deben cumplir los umbrales mínimos de contraste de color.", "x"]]] });
  assert.equal(await auto.translate("elements must meet minimum color contrast ratio thresholds", "es", fetch), "los elementos deben cumplir los umbrales mínimos de contraste de color");
  assert.equal(await auto.translate("x", "en", fetch), "");
  assert.equal(await auto.translate("x", "es", async () => ({ ok: false })), "");
  assert.equal(await auto.translate("x", "es", async () => { throw new Error("offline"); }), "");
});

test("leads autopilot: one pass translates, queues one re-run per host, approves what is complete and waits an hour", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "leads-"));
  const state = fs.mkdtempSync(path.join(os.tmpdir(), "state-"));
  fs.mkdirSync(path.join(dir, "prospects"));
  const header = "campaign,email,org,host,cc,language,sequence,top_finding,top_finding_en,missing,approved,uploaded\n";
  fs.writeFileSync(path.join(dir, "prospects", "week1-leads.csv"), header
    + "c,ana@udg.mx,UdG,udg.mx,mx,es,A,,,report (not published yet); top_finding,,\n"
    + "c,luis@udg.mx,UdG,udg.mx,mx,es,A,,,report (not published yet); top_finding,,\n"
    + "c,eva@itm.edu.co,ITM,itm.edu.co,co,es,A,missing alt text,missing alt text,top_finding (translate),,\n"
    + "c,bo@agency.ie,Agency,agency.ie,ie,en,A,x,x,,,\n"
    + "c,no@agency.ie,Agency,agency.ie,ie,en,A,x,x,,no,\n");
  const added = [];
  const db = { collection: (name) => ({ add: async (doc) => { added.push([name, doc]); return { id: "r" + added.length }; } }) };
  const fetch = async (url) => ({ ok: true, json: async () => (/live-reports/.test(url) ? { reports: [] } : [[["falta texto alternativo", "x"]]]) });
  const deps = { parseCsv: sync.parseCsv, toCsv: sync.toCsv, leadFiles: sync.leadFiles, tool: () => { throw new Error("no rebuild expected"); }, fetch, db, now: NOW, lookup: async () => ({}) };
  const notes = await auto.run(dir, state, deps);
  assert.deepEqual(notes, ["W1: 1 translated, 1 reviews re-run, 2 approved"]);
  assert.equal(added.length, 1);
  assert.equal(added[0][0], "jarvis_reviews");
  assert.equal(added[0][1].url, "https://udg.mx/");
  assert.equal(added[0][1].by, auto.OWNER);
  const rows = sync.parseCsv(fs.readFileSync(path.join(dir, "prospects", "week1-leads.csv"), "utf8")).rows;
  const by = Object.fromEntries(rows.map((r) => [r.email, r]));
  assert.equal(by["eva@itm.edu.co"].top_finding, "falta texto alternativo");
  assert.equal(by["eva@itm.edu.co"].approved, "yes");
  assert.equal(by["bo@agency.ie"].approved, "yes");
  assert.equal(by["no@agency.ie"].approved, "no");
  assert.equal(by["ana@udg.mx"].approved, "");
  assert.equal(await auto.run(dir, state, deps), null);

  const snap = sync.leads(dir, state, NOW);
  const ana = snap.rows.find((r) => r.email === "ana@udg.mx");
  assert.match(ana.wait, /re-run 1 of 2/);
  assert.equal(snap.rows.find((r) => r.email === "no@agency.ie").dropped, true);
});

test("leads autopilot: queues three re-runs a pass, on www. when the bare host does not resolve", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "leads-"));
  const state = fs.mkdtempSync(path.join(os.tmpdir(), "state-"));
  fs.mkdirSync(path.join(dir, "prospects"));
  const hosts = ["sena.edu.co", "udg.mx", "iteso.mx", "upb.edu.co", "platzi.com"];
  fs.writeFileSync(path.join(dir, "prospects", "week1-leads.csv"), "email,host,language,missing,approved,uploaded\n"
    + hosts.map((h) => `a@${h},${h},es,report (not published yet),,\n`).join(""));
  const added = [];
  const db = { collection: () => ({ add: async (doc) => { added.push(doc); return {}; } }) };
  const lookup = async (host) => { if (host === "sena.edu.co") throw Object.assign(new Error("ENOTFOUND"), { code: "ENOTFOUND" }); return {}; };
  const deps = { parseCsv: sync.parseCsv, toCsv: sync.toCsv, leadFiles: sync.leadFiles, tool: () => "", fetch: async () => ({ ok: true, json: async () => ({ reports: [] }) }), db, now: NOW, lookup };
  assert.deepEqual(await auto.run(dir, state, deps), ["W1: 0 translated, 3 reviews re-run, 0 approved"]);
  assert.deepEqual(added.map((doc) => doc.url), ["https://www.sena.edu.co/", "https://udg.mx/", "https://iteso.mx/"]);
  assert.deepEqual(await auto.run(dir, state, Object.assign({}, deps, { now: NOW + 61 * 60000 })), ["W1: 0 translated, 2 reviews re-run, 0 approved"]);
  assert.deepEqual(added.slice(3).map((doc) => doc.url), ["https://upb.edu.co/", "https://platzi.com/"]);
});

test("leads autopilot: Carlos's buttons set a field, allow a personal address and drop a lead on the Mac", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "leads-"));
  fs.mkdirSync(path.join(dir, "prospects"));
  fs.writeFileSync(path.join(dir, "prospects", "week2-leads.csv"), "email,host,missing,approved,uploaded,peer_1\n"
    + "a@uni.edu,uni.edu,peer_1; peer_2,,,\nb@gmail.com,b.com,email (personal address),,,\nc@x.com,x.com,,,,\n");
  const run = (args) => sync.HANDLERS[args.action](dir, args, NOW, dir);
  assert.match(run({ action: "lead-set", week: "W2", email: "a@uni.edu", field: "peer_1", value: "UdeA" }), /still needs peer_2/);
  assert.throws(() => run({ action: "lead-set", week: "W2", email: "a@uni.edu", field: "email", value: "x" }), /cannot be set/);
  assert.match(run({ action: "allow-personal", week: "W2", email: "b@gmail.com" }), /allowed/);
  assert.match(fs.readFileSync(path.join(dir, "prospects", "personal-email-ok.txt"), "utf8"), /^b@gmail\.com/m);
  run({ action: "lead-drop", week: "W2", email: "c@x.com", on: true });
  run({ action: "approve", week: "W2", email: "b@gmail.com", on: false });
  const rows = sync.parseCsv(fs.readFileSync(path.join(dir, "prospects", "week2-leads.csv"), "utf8")).rows;
  assert.deepEqual(rows.map((r) => [r.email, r.missing, r.approved, r.peer_1]), [["a@uni.edu", "peer_2", "", "UdeA"], ["b@gmail.com", "", "no", ""], ["c@x.com", "", "no", ""]]);
  assert.equal(run({ action: "approve-week", week: "W2" }), "0 approved, 1 still missing something");
});
