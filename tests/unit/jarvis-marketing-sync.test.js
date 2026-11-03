// Jarvis > Marketing's sync with the Mac's outreach folder (#1730): the jarvis function's commands and replies,
// and scripts/jarvis-marketing-sync.js reading and editing the folder.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const mk = require("../../functions/jarvis-marketing.js");
const sync = require("../../scripts/jarvis-marketing-sync.js");

const NOW = Date.parse("2026-10-26T15:00:00Z");
const REPLY = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const json = (body, status) => ({ ok: (status || 200) < 400, status: status || 200, json: async () => body });

function fakeDb(syncDoc) {
  const added = [];
  return {
    added,
    collection: (name) => ({
      add: async (doc) => { added.push([name, doc]); return { id: "cmd" + added.length }; },
      doc: () => ({ get: async () => ({ exists: !!syncDoc, data: () => syncDoc }) })
    })
  };
}

test("marketing sync (#1730): commands are checked before they reach the Mac", () => {
  assert.deepEqual(mk.commandOf({ action: "approve", week: "w1", email: " A@Uni.edu ", on: true }), { action: "approve", args: { week: "W1", email: "a@uni.edu", on: true }, label: "Approve a@uni.edu (W1)" });
  assert.equal(mk.commandOf({ action: "approve", week: "W1", email: "a@uni.edu", on: false }).label, "Unapprove a@uni.edu (W1)");
  assert.equal(mk.commandOf({ action: "upload", week: "W2" }).args.week, "W2");
  assert.deepEqual(mk.commandOf({ action: "linkedin", date: "2026-10-26", name: "Ana Pérez", sent: true }).args, { date: "2026-10-26", name: "Ana Pérez", sent: true });
  assert.equal(mk.commandOf({ action: "dnc", value: "Spam.Example.com" }).args.reason, "added from Jarvis");
  assert.throws(() => mk.commandOf({ action: "upload", week: "all" }), /week like W1/);
  assert.throws(() => mk.commandOf({ action: "approve", week: "W1", email: "nobody" }), /lead's email/);
  assert.throws(() => mk.commandOf({ action: "run", job: "rm -rf" }), /prospects, leads or replies/);
  assert.throws(() => mk.commandOf({ action: "linkedin", date: "today", name: "Ana" }), /date/);
  assert.throws(() => mk.commandOf({ action: "shell" }), /Unknown/);
});

test("marketing sync (#1730, #1980): the tab sees how old the sync is and what waits for the outreach Action", () => {
  const doc = { at: new Date(NOW - 5 * 3600000).toISOString(), running: true, leads: { weeks: [{ week: "W1", total: 2 }], rows: [{ email: "a@x.edu" }] }, replies: { items: [{ id: REPLY }] }, dnc: { items: [] } };
  const out = mk.syncRows(doc, [
    { id: "1", kind: "marketing", action: "upload", label: "Upload W1", status: "pending", createdAt: "2026-10-26T14:59:00Z" },
    { id: "2", kind: "marketing", action: "approve", label: "Approve", status: "done", result: "approved a@x.edu" },
    { id: "3", kind: "other", status: "pending" }
  ], NOW);
  assert.equal(out.stale, true);
  assert.equal(out.running, true);
  assert.equal(out.commands.pending, 1);
  assert.deepEqual(out.commands.items.map((c) => c.id), ["1", "2"]);
  assert.equal(out.leads.rows.length, 1);
  assert.equal(mk.syncRows(Object.assign({}, doc, { at: new Date(NOW - 3 * 3600000).toISOString() }), [], NOW).stale, false);
  assert.equal(mk.syncRows(null, [], NOW).at, "");
});

test("marketing sync (#1730): a queued command waits for the Mac, and do-not-contact also blocks in Instantly at once", async () => {
  const calls = [];
  const ctx = { env: { INSTANTLY_API_KEY: "k" }, now: NOW, fetch: async (url, init) => { calls.push([url, init.body]); return json({}); } };
  const db = fakeDb(null);
  const out = await mk.command(ctx, db, { action: "approve-week", week: "W1" });
  assert.deepEqual(out, { queued: "cmd1", action: "approve-week", label: "Approve every complete lead in W1", syncing: false });
  assert.equal(db.added[0][0], "jarvis_commands");
  assert.deepEqual([db.added[0][1].kind, db.added[0][1].status, db.added[0][1].createdAt], ["marketing", "pending", new Date(NOW).toISOString()]);
  assert.equal(calls.length, 0);
  const dnc = await mk.command(ctx, db, { action: "dnc", value: "no@uni.edu" });
  assert.equal(dnc.blocked, "no@uni.edu");
  assert.match(calls[0][0], /block-lists-entries$/);
});

test("marketing sync (#1980): a queued command starts the outreach Action's sync at once", async () => {
  const calls = [];
  const ctx = { env: {}, now: NOW, githubToken: async () => "t", fetch: async (url, init) => { calls.push([url, JSON.parse(init.body), init.headers.Authorization]); return { status: 204 }; } };
  const out = await mk.command(ctx, fakeDb(null), { action: "upload", week: "W2" });
  assert.equal(out.syncing, true);
  assert.deepEqual(calls, [["https://api.github.com/repos/kaanmuar/qa-lab-outreach/actions/workflows/outreach.yml/dispatches", { ref: "main", inputs: { mode: "sync" } }, "Bearer t"]]);
  const refused = await mk.command(Object.assign({}, ctx, { fetch: async () => ({ status: 404 }) }), fakeDb(null), { action: "upload", week: "W2" });
  assert.equal(refused.syncing, false);
});

test("marketing sync (#1730): a reply goes out in the thread of a synced email only, once", async () => {
  const calls = [];
  const ctx = { env: { INSTANTLY_API_KEY: "k" }, now: NOW, fetch: async (url, init) => { calls.push([url.replace("https://api.instantly.ai/api/v2/", ""), JSON.parse(init.body)]); return json({ id: "x" }); } };
  const db = fakeDb({ replies: { items: [{ id: REPLY, from: "dean@uni.edu", to: "carlos@mail.qa-lab.co", subject: "Su sitio" }, { id: "bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee", from: "x@y.co", to: "carlos@mail.qa-lab.co", subject: "Re: hi", sent: "2026-10-25T10:00:00Z" }] } });
  const out = await mk.command(ctx, db, { action: "reply", id: REPLY, text: "Hola <Ana>\n\nGracias" });
  assert.deepEqual(out.sent, { id: REPLY, to: "dean@uni.edu", subject: "Re: Su sitio" });
  assert.equal(calls[0][0], "emails/reply");
  assert.deepEqual([calls[0][1].eaccount, calls[0][1].reply_to_uuid, calls[0][1].subject], ["carlos@mail.qa-lab.co", REPLY, "Re: Su sitio"]);
  assert.equal(calls[0][1].body.html, "<div>Hola &lt;Ana&gt;</div><div><br></div><div>Gracias</div>");
  assert.deepEqual([db.added[0][1].action, db.added[0][1].args.id], ["replied", REPLY]);
  await assert.rejects(mk.command(ctx, db, { action: "reply", id: "bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee", text: "again" }), /already answered/);
  await assert.rejects(mk.command(ctx, db, { action: "reply", id: "cccccccc-bbbb-cccc-dddd-eeeeeeeeeeee", text: "hi" }), /not in the last sync/);
  await assert.rejects(mk.command(ctx, db, { action: "reply", id: REPLY, text: "  " }), /Write the answer/);
  assert.equal(calls.length, 1);
});

test("marketing sync (#1730): the Mac script keeps the leads CSV byte for byte and reads LinkedIn headings with nested parentheses", () => {
  const text = 'email,org,missing,approved\r\na@x.edu,"Uni, Norte","report ""not published""",\r\nb@x.edu,"Line\nbreak",,yes\r\n';
  const csv = sync.parseCsv(text);
  assert.equal(csv.rows[0].org, "Uni, Norte");
  assert.equal(csv.rows[1].org, "Line\nbreak");
  assert.equal(sync.toCsv(csv.header, csv.rows, csv.eol), text);
  assert.deepEqual(sync.linkedinHeading("## [x] Ana Pérez, Directora de TI, Sede Norte (Universidad Pontificia (UPB), CO)"),
    { sent: true, name: "Ana Pérez", title: "Directora de TI, Sede Norte", org: "Universidad Pontificia (UPB)", cc: "CO" });
  assert.equal(sync.linkedinHeading("## Not a person"), null);
});

function folder() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mk-sync-"));
  const state = fs.mkdtempSync(path.join(os.tmpdir(), "mk-state-"));
  ["prospects", "linkedin", "tracker/replies"].forEach((d) => fs.mkdirSync(path.join(dir, d), { recursive: true }));
  fs.writeFileSync(path.join(dir, "prospects", "week1-leads.csv"), "campaign,email,org,host,cc,missing,approved,uploaded\r\nW1 B-es Americas,a@x.edu,A,a.edu,co,,,\r\nW1 B-es Americas,b@x.edu,B,b.edu,co,report,,\r\nW1 B-es Americas,c@x.edu,C,c.edu,co,,yes,2026-10-20\r\n");
  fs.writeFileSync(path.join(dir, "prospects", "do-not-contact.csv"), "email_or_domain,added_utc,reason\n");
  fs.writeFileSync(path.join(dir, "linkedin", "2026-10-26.md"), "# LinkedIn, 2026-10-26\n\n## [ ] Ana Pérez, CIO (Uni (UPB), CO)\n\n- Profile: [https://www.linkedin.com/in/ana](https://www.linkedin.com/in/ana)\n- Note: hola\n");
  fs.writeFileSync(path.join(dir, "tracker", "replies", "2026-10-25.json"), JSON.stringify([{ id: REPLY, at: "2026-10-25T12:00:00Z", from: "dean@uni.edu", to: "c@m.co", subject: "Hi", campaign: "W1 B-es Americas", text: "Interested" }]));
  fs.writeFileSync(path.join(dir, "tracker", "replies", "2026-10-26.drafts.json"), JSON.stringify([{ id: REPLY, category: "interested", summary: "Wants a call", lang: "es", draft: "Hola" }]));
  fs.writeFileSync(path.join(dir, "tracker", "replies", "2026-10-26.json"), "[]");
  return { dir, state };
}

test("marketing sync (#1730): the Mac snapshot counts leads per week and joins a reply with a draft written the next day", () => {
  const { dir, state } = folder();
  const s = sync.snapshot(dir, state, NOW);
  assert.deepEqual(s.leads.weeks, [{ week: "W1", total: 3, complete: 2, missing: 1, approved: 1, uploaded: 1, ready: 0, ask: 1, dropped: 0 }]);
  assert.deepEqual([s.replies.items.length, s.replies.items[0].category, s.replies.items[0].draft, s.replies.items[0].to], [1, "interested", "Hola", "c@m.co"]);
  assert.deepEqual([s.linkedin.date, s.linkedin.items[0].name, s.linkedin.items[0].profile, s.linkedin.items[0].sent], ["2026-10-26", "Ana Pérez", "https://www.linkedin.com/in/ana", false]);
  assert.equal(s.running, false);
});

test("marketing sync (#1730): the Mac applies approvals, LinkedIn, do-not-contact and answers, and waits while an agent run holds the lock", () => {
  const { dir, state } = folder();
  const run = (action, args) => sync.runCommand({ action, args }, dir, state, NOW);
  assert.deepEqual([run("approve", { week: "W1", email: "b@x.edu", on: true }).status, run("approve", { week: "W1", email: "b@x.edu", on: true }).result], ["failed", "b@x.edu still needs: report."]);
  assert.match(run("approve", { week: "W1", email: "c@x.edu", on: false }).result, /uploaded on 2026-10-20/);
  assert.equal(run("approve-week", { week: "W1" }).result, "1 approved, 1 still missing something");
  assert.equal(sync.leads(dir).weeks[0].ready, 1);
  assert.equal(run("approve", { week: "W1", email: "a@x.edu", on: false }).result, "unapproved a@x.edu");
  assert.match(fs.readFileSync(path.join(dir, "prospects", "week1-leads.csv"), "utf8"), /\r\nW1 B-es Americas,a@x\.edu,A,a\.edu,co,,no,\r\n/);
  assert.equal(run("linkedin", { date: "2026-10-26", name: "Ana Pérez", sent: true }).status, "done");
  assert.equal(sync.linkedin(dir).items[0].sent, true);
  assert.equal(run("linkedin", { date: "2026-10-26", name: "Nobody", sent: true }).status, "failed");
  assert.equal(run("dnc", { value: "no@x.edu", reason: "asked" }).result, "added no@x.edu");
  assert.equal(run("dnc", { value: "no@x.edu", reason: "asked" }).result, "no@x.edu was already listed");
  assert.equal(sync.dnc(dir).items.length, 1);
  run("replied", { id: REPLY, at: "2026-10-26T15:00:00Z" });
  assert.equal(sync.replies(dir, NOW).items[0].sent, "2026-10-26T15:00:00Z");
  assert.equal(run("drop-table", {}).status, "failed");
  fs.mkdirSync(path.join(state, "lock"));
  assert.equal(run("approve-week", { week: "W1" }), null);
  assert.equal(run("replied", { id: REPLY, at: "x" }).status, "done");
});

test("marketing sync (#2470): an upload holds back sites answered with a report reply in the last 30 days, then lets them go", () => {
  const { dir, state } = folder();
  const file = path.join(dir, "prospects", "week1-leads.csv");
  const text = "campaign,email,org,host,cc,missing,approved,uploaded\r\nW1 B-es Americas,a@x.edu,A,www.a.edu,co,,yes,\r\nW1 B-es Americas,d@x.edu,D,d.edu,co,,yes,\r\nW1 B-es Americas,b@x.edu,B,b.edu,co,report,yes,\r\n";
  fs.writeFileSync(file, text);
  const seen = [];
  const tool = (d, args) => {
    seen.push([args, sync.parseCsv(fs.readFileSync(file, "utf8")).rows.map((r) => r.missing)]);
    return "uploaded d@x.edu to W1 B-es Americas 1\n";
  };
  const run = (ctx) => sync.runCommand({ action: "upload", args: { week: "W1" } }, dir, state, NOW, Object.assign({ tool }, ctx));
  const answered = new Map([["a.edu", "2026-10-20T10:00:00Z"], ["b.edu", "2026-10-21T10:00:00Z"]]);
  assert.equal(run({ answered }).result, "1 uploaded to Instantly, 1 held for a report reply in the last 30 days");
  assert.deepEqual(seen, [[["leads", "--upload", "--week", "W1"], ["held: report reply in the last 30 days", "", "report"]]]);
  assert.equal(fs.readFileSync(file, "utf8"), text);
  assert.equal(run({ answered: new Map() }).result, "1 uploaded to Instantly");
  assert.deepEqual(run({ answered: null }), { status: "failed", result: "The report replies could not be read, so nothing was uploaded.", doneAt: new Date(NOW).toISOString() });
  assert.equal(seen.length, 2);
  assert.equal(run({ answered, tool: () => { throw new Error("Instantly is down"); } }).result, "Instantly is down");
  assert.equal(fs.readFileSync(file, "utf8"), text);
});

test("the sync writes each working day's LinkedIn list once, from 07:00, never at weekends", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mk-li-"));
  fs.mkdirSync(path.join(dir, "linkedin"));
  const calls = [];
  const run = (args) => { calls.push(args); fs.writeFileSync(path.join(dir, "linkedin", args[1] + ".md"), "# list\n"); };
  const at = (d, h) => new Date(2026, 10, d, h).getTime();
  assert.equal(sync.linkedinDay(dir, at(2, 6), run), "");
  assert.equal(sync.linkedinDay(dir, at(2, 9), run), "LinkedIn list for 2026-11-02 written");
  assert.equal(sync.linkedinDay(dir, at(2, 10), run), "");
  assert.equal(sync.linkedinDay(dir, at(1, 9), run), "");
  assert.deepEqual(calls, [["tools/linkedin-day.py", "2026-11-02"]]);
});

test("under a run's lock the LinkedIn list waits only while the prospect CSVs are being written (#2240)", () => {
  const nine = new Date(2026, 10, 2, 9).getTime();
  const folder = () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mk-li-"));
    fs.mkdirSync(path.join(dir, "linkedin"));
    fs.mkdirSync(path.join(dir, "prospects"));
    const csv = path.join(dir, "prospects", "week2-education.csv");
    fs.writeFileSync(csv, "org,host\n");
    fs.utimesSync(csv, new Date(nine - 2 * 60000), new Date(nine - 2 * 60000));
    return { dir, csv, run: (args) => fs.writeFileSync(path.join(dir, "linkedin", args[1] + ".md"), "# list\n") };
  };
  const held = folder();
  assert.equal(sync.linkedinDay(held.dir, nine, held.run, true), "");
  fs.utimesSync(held.csv, new Date(nine - 11 * 60000), new Date(nine - 11 * 60000));
  assert.equal(sync.linkedinDay(held.dir, nine, held.run, true), "LinkedIn list for 2026-11-02 written");
  const fresh = folder();
  assert.equal(sync.linkedinDay(fresh.dir, nine, fresh.run, false), "LinkedIn list for 2026-11-02 written");
});

const SENT = "11111111-2222-3333-4444-555555555555";

test("sent emails (#2017): every cold email with what the lead did since, newest first", () => {
  const out = mk.sentRows([
    { id: SENT, ue_type: 1, timestamp_email: "2026-11-02T14:00:00Z", lead: "Ana@Uni.edu", eaccount: "hello@qalabreview.com", subject: "Your site", campaign_id: "c1", step: 1 },
    { id: "x2", ue_type: 3, timestamp_email: "2026-11-03T14:00:00Z", to_address_email_list: "b@agency.io", eaccount: "hello@qalabreview.com", subject: "Fwd" },
    { id: "x3", ue_type: 2, timestamp_email: "2026-11-04T14:00:00Z", lead: "ana@uni.edu" }
  ], [{ email: "ana@uni.edu", first_name: "Ana", last_name: "Pérez", company_name: "Uni", email_open_count: 2, status: -1 }], [{ id: "c1", name: "W1 B-es Americas" }], { [SENT]: [{ to: "c@uni.edu", at: "2026-11-03T10:00:00Z" }] });
  assert.equal(out.total, 2);
  assert.deepEqual(out.rows.map((r) => r.id), ["x2", SENT]);
  const a = out.rows[1];
  assert.deepEqual([a.to, a.name, a.org, a.campaign, a.step, a.kind, a.opened, a.bounced, a.resent.length], ["ana@uni.edu", "Ana Pérez", "Uni", "W1 B-es Americas", 1, "campaign", 2, true, 1]);
  assert.deepEqual([out.rows[0].kind, out.rows[0].org], ["resend", "agency.io"]);
  assert.deepEqual([out.opened, out.bounced], [1, 1]);
});

test("sent emails (#2017): resend forwards the original from its mailbox, never to do-not-contact", async () => {
  const calls = [];
  const saved = {};
  const fetch = async (url, init) => {
    calls.push([url.replace(/^.*\/v2\//, ""), init && init.body ? JSON.parse(init.body) : null]);
    return json(/emails\/1111/.test(url) ? { id: SENT, ue_type: 1, lead: "ana@uni.edu", eaccount: "hello@qalabreview.com", subject: "Your site" } : {});
  };
  const db = { collection: () => ({ doc: (id) => ({
    get: async () => (id === "marketing_sync" ? { exists: true, data: () => ({ dnc: { items: [{ value: "blocked.edu" }] } }) } : { exists: false }),
    set: async (doc) => Object.assign(saved, doc)
  }) }) };
  const ctx = { fetch, env: { INSTANTLY_API_KEY: "k" }, now: NOW };
  const out = await mk.resend(ctx, db, { id: SENT });
  assert.deepEqual([out.to, out.same, out.from], ["ana@uni.edu", true, "hello@qalabreview.com"]);
  const fwd = calls.find((c) => c[0] === "emails/forward")[1];
  assert.deepEqual([fwd.reply_to_uuid, fwd.eaccount, fwd.to_address_email_list, fwd.subject, fwd.include_original_body], [SENT, "hello@qalabreview.com", "ana@uni.edu", "Your site", true]);
  assert.equal(saved[SENT][0].to, "ana@uni.edu");
  assert.equal((await mk.resend(ctx, db, { id: SENT, to: "Dean@Uni.edu" })).same, false);
  await assert.rejects(mk.resend(ctx, db, { id: SENT, to: "x@blocked.edu" }), /do-not-contact/);
  await assert.rejects(mk.resend(ctx, db, { id: "nope" }), /sent email's id/);
});

test("marketing sync (#2479): the LinkedIn note survives a Check first line above it", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mk-li-"));
  fs.mkdirSync(path.join(dir, "linkedin"));
  fs.writeFileSync(path.join(dir, "linkedin", "2026-11-03.md"), "# LinkedIn, 2026-11-03\n\n## [ ] Miles Pines, Founder & CEO (Theo, US)\n\n"
    + "- Profile: [https://www.linkedin.com/in/milespines](https://www.linkedin.com/in/milespines)\n- Live Report: not yet (https://x/?live=u-theo-site)\n"
    + "- Trigger: YC F26\n- Check first: confirm the person is still in this role.\n- Note: Hi Miles, we reviewed theo.site. Happy to send it.\n- DM after accept: Thanks for connecting, Miles.\n");
  const [p] = sync.linkedin(dir).items;
  assert.equal(p.lines.length, 6);
  assert.equal(p.lines[4], "Note: Hi Miles, we reviewed theo.site. Happy to send it.");
});
