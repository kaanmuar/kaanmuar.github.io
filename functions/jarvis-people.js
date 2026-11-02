/* Jarvis > URL Review > Signed-in people (#1976): each account that signed in to URL Review, with the URLs it ran,
   its visits (url_review_visits, from 1 Nov 2026), how often it came back, and its time on the review pages.
   The web panel and the Android app read the same answer from the "people" source. */
const core = require("./jarvis-core");

const DAY = 24 * 60 * 60 * 1000;
const ACCOUNTS = 300;
const VISITS = 5000;
const RUNS_PER_BATCH = 400;
const SHOWN = 100;
const RUN_FIELDS = ["email", "createdAt", "requestedUrl", "url", "status", "paid", "test"];

const ms = (value) => { const d = core.toDate(value); return d ? d.getTime() : 0; };
const iso = (value) => { const t = ms(value); return t ? new Date(t).toISOString() : ""; };
const sum = (rows, key) => rows.reduce((n, row) => n + (Number(row[key]) || 0), 0);

function person(row) {
  const visits = row.visits.slice().sort((a, b) => ms(b.startedAt) - ms(a.startedAt));
  const runs = row.runs.slice().sort((a, b) => ms(b.createdAt) - ms(a.createdAt));
  const activeMs = sum(visits, "activeMs");
  const seen = [row.lastSignInAt, visits[0] && visits[0].lastAt, runs[0] && runs[0].createdAt].map(ms);
  return {
    email: row.email,
    name: row.name,
    picture: row.picture,
    providers: row.providers,
    test: core.isTestEmail(row.email),
    firstAt: iso(row.firstAt),
    lastSignInAt: iso(row.lastSignInAt),
    lastSeenAt: iso(Math.max(...seen)),
    visits: visits.length,
    returns: Math.max(0, visits.length - 1),
    days: new Set(visits.map((v) => core.zoneParts(new Date(ms(v.startedAt))).day)).size,
    views: sum(visits, "views"),
    activeMs,
    avgVisitMs: visits.length ? Math.round(activeMs / visits.length) : 0,
    runs: runs.length,
    paid: runs.filter((r) => r.paid === true).length,
    urls: runs.slice(0, 10).map((r) => ({ url: String(r.requestedUrl || r.url || "").slice(0, 200), at: iso(r.createdAt), status: r.status || "", paid: r.paid === true })),
    recent: visits.slice(0, 8).map((v) => ({ startedAt: iso(v.startedAt), lastAt: iso(v.lastAt), activeMs: Number(v.activeMs) || 0, views: Number(v.views) || 0, pages: (v.pages || []).slice(0, 10) })),
    _visits: visits,
    _runs: runs
  };
}

function totals(people, start) {
  const inRange = (value) => ms(value) >= start;
  const visits = people.flatMap((p) => p._visits).filter((v) => inRange(v.lastAt));
  return {
    people: people.length,
    active: people.filter((p) => inRange(p.lastSeenAt)).length,
    new: people.filter((p) => inRange(p.firstAt)).length,
    returning: people.filter((p) => p.visits > 1).length,
    visits: visits.length,
    activeMs: sum(visits, "activeMs"),
    avgVisitMs: visits.length ? Math.round(sum(visits, "activeMs") / visits.length) : 0,
    runs: people.reduce((n, p) => n + p._runs.filter((r) => inRange(r.createdAt)).length, 0)
  };
}

function summarize({ accounts, visits, runs }, { now, days }) {
  const start = now - days * DAY;
  const byEmail = new Map();
  const row = (email) => {
    const key = String(email || "").toLowerCase();
    if (!byEmail.has(key)) byEmail.set(key, { email: key, name: "", picture: "", providers: [], firstAt: "", lastSignInAt: "", visits: [], runs: [] });
    return byEmail.get(key);
  };
  (accounts || []).forEach((a) => {
    const r = row(a.email || a.id);
    const profile = a.profile || {};
    Object.assign(r, { name: profile.name || "", picture: profile.picture || "", providers: a.providers || [], firstAt: a.createdAt || "", lastSignInAt: a.lastSignInAt || "" });
  });
  (visits || []).forEach((v) => { if (v.email) row(v.email).visits.push(v); });
  (runs || []).forEach((r) => { const key = String(r.email || "").toLowerCase(); if (byEmail.has(key)) byEmail.get(key).runs.push(r); });
  const people = [...byEmail.values()].filter((r) => r.email).map(person).sort((a, b) => ms(b.lastSeenAt) - ms(a.lastSeenAt));
  const strip = (p) => { const out = Object.assign({}, p); delete out._visits; delete out._runs; return out; };
  // One set of numbers per choice of the web's Real / Tests / All switch; the app and Ask read the real one.
  return {
    since: "2026-11-01",
    totals: totals(people.filter((p) => !p.test), start),
    testTotals: totals(people.filter((p) => p.test), start),
    allTotals: totals(people, start),
    people: people.slice(0, SHOWN).map(strip),
    more: Math.max(0, people.length - SHOWN)
  };
}

async function source(ctx) {
  const { db, now } = ctx;
  const rowsOf = (snap) => snap.docs.map((doc) => Object.assign({ id: doc.id }, doc.data()));
  const [accounts, visits] = await Promise.all([
    db.collection("url_review_accounts").orderBy("lastSignInAt", "desc").limit(ACCOUNTS).get().then(rowsOf),
    db.collection("url_review_visits").where("lastAt", ">=", new Date(now - 365 * DAY).toISOString()).orderBy("lastAt", "desc").limit(VISITS).get().then(rowsOf)
  ]);
  const emails = [...new Set(accounts.map((a) => a.email || a.id).concat(visits.map((v) => v.email)).filter(Boolean))];
  const runs = [];
  for (let i = 0; i < emails.length; i += 30) {
    const snap = await db.collection("url_reviews").where("email", "in", emails.slice(i, i + 30)).select(...RUN_FIELDS).limit(RUNS_PER_BATCH).get();
    runs.push(...rowsOf(snap));
  }
  return summarize({ accounts, visits, runs }, { now, days: ctx.days || 7 });
}

module.exports = { summarize, source };
