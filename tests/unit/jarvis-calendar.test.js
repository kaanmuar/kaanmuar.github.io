// Jarvis country calendar (#2989): date rules, the 60-day list, holiday pauses (50% rule, next business day, off by default) and the briefing lines.
const test = require("node:test");
const assert = require("node:assert/strict");
const cal = require("../../functions/jarvis-calendar.js");
const core = require("../../js/admin-jarvis-core.js");
const { fakeDb } = require("./fake-jarvis-db.js");

const MX_HOLIDAY = { MX: [{ date: "2026-11-16", name: "Revolution Day", local: "Día de la Revolución" }, { date: "2026-12-25", name: "Christmas Day", local: "Navidad" }], CO: [{ date: "2026-12-25", name: "Christmas Day", local: "Navidad" }, { date: "2026-12-08", name: "Immaculate Conception", local: "Inmaculada Concepción" }] };
const geo = { countries: [
  { cc: "MX", name: "Mexico", camps: [{ id: "c1", name: "W1 B-es Mexico", status: "active", share: 62 }, { id: "c2", name: "W1 B-es Americas", status: "active", share: 18 }] },
  { cc: "CO", name: "Colombia", camps: [{ id: "c2", name: "W1 B-es Americas", status: "active", share: 50 }, { id: "c3", name: "W2 paused", status: "paused", share: 90 }] }
] };

test("rules: fixed days, nth and last weekdays, Easter, day of the year and offsets", () => {
  assert.equal(cal.ruleDate("4th thursday of november", 2026), "2026-11-26");
  assert.equal(cal.ruleDate("4th thursday of november +1", 2026), "2026-11-27");
  assert.equal(cal.ruleDate("last friday of november", 2026), "2026-11-27");
  assert.equal(cal.ruleDate("last monday of may", 2026), "2026-05-25");
  assert.equal(cal.ruleDate("2nd sunday of may", 2027), "2027-05-09");
  assert.equal(cal.ruleDate("3rd monday of november -3", 2026), "2026-11-13");
  assert.equal(cal.ruleDate("5th monday of february", 2026), null);
  assert.equal(cal.ruleDate("easter", 2027), "2027-03-28");
  assert.equal(cal.ruleDate("easter -21", 2027), "2027-03-07");
  assert.equal(cal.ruleDate("day 256", 2027), "2027-09-13");
  assert.equal(cal.ruleDate("day 256", 2028), "2028-09-12");
  assert.equal(cal.ruleDate("12-25 -10", 2026), "2026-12-15");
  assert.equal(cal.ruleDate("02-30", 2026), null);
  assert.equal(cal.ruleDate("someday", 2026), null);
});

test("an organiser's date wins over the rule, and a one-off date only shows in its year", () => {
  assert.deepEqual(cal.occurrences({ rule: "3rd monday of november -3", dates: { 2026: "2026-11-13" }, days: 5 }, [2026]), [{ start: "2026-11-13", end: "2026-11-17" }]);
  assert.deepEqual(cal.occurrences({ date: "2027-04-26" }, [2026, 2027]), [{ start: "2027-04-26", end: "2027-04-26" }]);
});

test("academic calendars follow the hemisphere: March and August in the south, September and February in Spain", () => {
  const starts = (id, year) => cal.occurrences(cal.DATA.dates.find((d) => d.id === id), [year])[0].start;
  assert.equal(starts("uni-start-south-1", 2027).slice(5, 7), "03");
  assert.equal(starts("uni-start-south-2", 2027).slice(5, 7), "08");
  assert.equal(starts("uni-start-es", 2027).slice(5, 7), "09");
  assert.equal(starts("uni-sem2-es", 2027).slice(5, 7), "02");
  assert.equal(starts("uni-start-co-1", 2027), "2027-02-01");
  const south = cal.DATA.dates.find((d) => d.id === "uni-start-south-1").cc;
  assert.ok(south.includes("AR") && south.includes("BR") && !south.includes("ES"));
});

test("every curated date has a kind, a reason and an action, and its rule computes in both years", () => {
  cal.DATA.dates.forEach((e) => {
    assert.ok(cal.KINDS.includes(e.kind), e.id);
    assert.ok(e.why && e.action && e.name, e.id);
    if (e.rule) [2026, 2027].forEach((y) => assert.ok(cal.ruleDate(e.rule, y), `${e.id} ${y}`));
    if (e.source) assert.ok(cal.DATA.sources[e.source], `${e.id} source`);
  });
  const ada = cal.DATA.dates.find((d) => d.id === "ada-title-ii-large");
  assert.equal(ada.date, "2027-04-26");
});

test("the next business day skips weekends and the country's holidays", () => {
  assert.equal(cal.nextBusinessDay("2026-11-16"), "2026-11-17");
  assert.equal(cal.nextBusinessDay("2026-11-27"), "2026-11-30");
  assert.equal(cal.nextBusinessDay("2026-12-24", new Set(["2026-12-25"])), "2026-12-28");
});

test("build: 60 days for the target markets, holidays grouped across countries, five per country", () => {
  const out = cal.build({ today: "2026-11-09", targets: ["MX", "CO", "FR"], holidays: MX_HOLIDAY, settings: { autoPause: true, warnDays: 21 } });
  const xmas = out.days.find((d) => d.kind === "holiday" && d.name === "Christmas Day");
  assert.deepEqual(xmas.ccs.sort(), ["CO", "MX"]);
  assert.equal(xmas.after.MX, "2026-12-28");
  const rev = out.days.find((d) => d.name === "Revolution Day");
  assert.equal(rev.daysAway, 7);
  assert.equal(rev.local.MX, "Día de la Revolución");
  assert.ok(out.days.some((d) => d.ref === "buen-fin" && d.date === "2026-11-13" && d.end === "2026-11-17"));
  assert.ok(out.days.some((d) => d.ref === "black-friday" && d.ccs.includes("FR")));
  assert.ok(!out.days.some((d) => d.ref === "chile-ley-21719"), "Chile is not a target here");
  assert.ok(out.days.every((d) => d.date <= "2027-01-08" || d.ongoing));
  assert.ok(out.byCountry.MX.length <= 5 && out.byCountry.MX[0].date <= out.byCountry.MX[1].date);
  assert.ok(!out.byCountry.MX.some((d) => d.name === "World Quality Day"), "ALL dates stay off the country list");
  assert.equal(out.byCountry.MX.find((d) => d.kind === "holiday").name, "Día de la Revolución");
  assert.deepEqual(out.settings, { autoPause: true, warnDays: 21, remindDays: 3 });
  assert.equal(cal.build({ today: "2026-11-09", targets: [] }).settings.autoPause, false);
});

test("the geo rows get the next date and days to it", () => {
  const out = cal.build({ today: "2026-11-09", targets: ["MX"], holidays: MX_HOLIDAY });
  const rows = require("../../functions/jarvis-geo.js").joinDates([{ cc: "MX" }, { cc: "AO" }], out, Date.parse("2026-11-09T15:00:00Z"));
  assert.deepEqual(rows[0].nextDate, { date: "2026-11-13", name: "El Buen Fin", kind: "commerce" });
  assert.equal(rows[0].daysToDate, 4);
  assert.equal(rows[1].nextDate, null);
  assert.equal(rows[1].daysToDate, null);
});

test("source: Nager is asked once per country-year, cached in Firestore, and a country it lacks is listed", async () => {
  const db = fakeDb();
  await db.collection("jarvis_settings").doc("geo").set({ targets: ["MX", "BF"] });
  const asked = [];
  const fetch = async (url) => {
    asked.push(url);
    if (url.endsWith("/BF")) return { status: 404, ok: false };
    return { status: 200, ok: true, json: async () => [{ date: url.includes("2026") ? "2026-11-16" : "2027-01-01", name: "Revolution Day", localName: "Día de la Revolución", global: true, types: ["Public"] }, { date: "2026-11-20", name: "Regional", global: false, types: ["Public"] }] };
  };
  const ctx = { db, fetch, now: Date.parse("2026-11-09T15:00:00Z"), settings: {} };
  const out = await cal.source(ctx);
  assert.equal(out.ok, true);
  assert.deepEqual(out.missing, ["BF"]);
  assert.equal(asked.length, 4);
  assert.ok(out.days.some((d) => d.kind === "holiday" && d.ccs.includes("MX")));
  assert.ok(!out.days.some((d) => d.name === "Regional"));
  assert.match(out.notes.join(" "), /BF/);
  await cal.source(ctx);
  assert.equal(asked.length, 4, "the second read comes from jarvis_holidays");
});

test("auto-pause is off by default; on, it pauses only campaigns with at least half their leads in the country on holiday", () => {
  const calendar = cal.build({ today: "2026-11-16", targets: ["MX", "CO"], holidays: MX_HOLIDAY });
  const off = cal.dailyPlan({ today: "2026-11-16", settings: {}, calendar, geo, pauses: [] });
  assert.equal(off.pause.length, 0);
  const on = cal.dailyPlan({ today: "2026-11-16", settings: { autoPause: true }, calendar, geo, pauses: [] });
  assert.equal(on.pause.length, 1);
  assert.deepEqual(on.pause[0].campaigns.map((c) => c.id), ["c1"]);
  assert.equal(on.pause[0].resumeOn, "2026-11-17");
  assert.equal(on.pause[0].by, "auto");
  const live = cal.dailyPlan({ today: "2026-11-16", settings: { autoPause: true }, calendar, geo, campaigns: [{ id: "c1", status: "paused" }], pauses: [] });
  assert.equal(live.pause.length, 0, "a campaign Marketing shows paused is left alone");
  const again = cal.dailyPlan({ today: "2026-11-16", settings: { autoPause: true }, calendar, geo, pauses: [{ id: "MX-2026-11-16", status: "paused", resumeOn: "2026-11-17" }] });
  assert.equal(again.pause.length, 0);
});

test("a 50% share counts, a paused campaign does not, and resume is due on the next business day", () => {
  const calendar = cal.build({ today: "2026-12-08", targets: ["CO"], holidays: MX_HOLIDAY });
  const on = cal.dailyPlan({ today: "2026-12-08", settings: { autoPause: true }, calendar, geo, pauses: [] });
  assert.deepEqual(on.pause.map((p) => p.campaigns.map((c) => c.id)), [["c2"]]);
  const resume = cal.dailyPlan({ today: "2026-12-09", settings: {}, calendar, geo, pauses: [{ id: "CO-2026-12-08", status: "paused", resumeOn: "2026-12-09" }, { id: "MX-2026-12-25", status: "paused", resumeOn: "2026-12-28" }] });
  assert.deepEqual(resume.resume.map((p) => p.id), ["CO-2026-12-08"]);
  const planned = cal.dailyPlan({ today: "2026-12-08", settings: {}, calendar, geo, pauses: [{ id: "CO-2026-12-08", status: "planned", date: "2026-12-08", resumeOn: "2026-12-09" }, { id: "MX-2026-11-16", status: "planned", date: "2026-11-16", resumeOn: "2026-11-17" }] });
  assert.deepEqual(planned.pause.map((p) => p.id), ["CO-2026-12-08"], "a planned pause runs even with auto-pause off");
  assert.deepEqual(planned.expire.map((p) => p.id), ["MX-2026-11-16"]);
});

test("reminders go out at the warning and the reminder day", () => {
  const calendar = cal.build({ today: "2026-11-02", targets: ["MX", "CO"], holidays: MX_HOLIDAY });
  const plan = cal.dailyPlan({ today: "2026-11-02", settings: { warnDays: 14, remindDays: 3 }, calendar, geo, pauses: [] });
  assert.ok(plan.remind.some((d) => d.name === "Revolution Day"), "14 days before a holiday with a campaign to pause");
  const later = cal.dailyPlan({ today: "2026-11-13", settings: { warnDays: 14, remindDays: 3 }, calendar, geo, pauses: [] });
  assert.ok(later.remind.some((d) => d.name === "Revolution Day"));
  const msg = cal.remindMessage(plan.remind, "2026-11-02");
  assert.equal(msg.tab, "geo");
  assert.match(msg.title, /^Dates ahead: /);
});

test("runDaily pauses, logs, pushes and resumes through the ops", async () => {
  const db = fakeDb();
  const calls = [], logs = [], pushes = [];
  const ops = { campaign: async (id, action) => { calls.push(id + ":" + action); }, log: async (e) => { logs.push(e); }, push: async (m) => { pushes.push(m); } };
  const calendar = cal.build({ today: "2026-11-16", targets: ["MX"], holidays: MX_HOLIDAY });
  const out = await cal.runDaily({ db, now: Date.parse("2026-11-16T12:40:00Z"), ops }, { today: "2026-11-16", settings: { autoPause: true }, calendar, geo, pauses: [] });
  assert.equal(out.paused, 1);
  assert.deepEqual(calls, ["c1:pause"]);
  assert.equal(db.doc(cal.PAUSES, "MX-2026-11-16").status, "paused");
  assert.equal(logs[0].action, "calendar-pause");
  assert.equal(logs[0].mode, "auto");
  assert.match(pushes[0].body, /W1 B-es Mexico/);
  const pauses = await cal.readPauses(db);
  const back = await cal.runDaily({ db, now: Date.parse("2026-11-17T12:40:00Z"), ops }, { today: "2026-11-17", settings: { autoPause: true }, calendar, geo, pauses });
  assert.equal(back.resumed, 1);
  assert.deepEqual(calls, ["c1:pause", "c1:activate"]);
  assert.equal(db.doc(cal.PAUSES, "MX-2026-11-16").status, "resumed");
  assert.equal(db.doc(cal.PAUSES, "MX-2026-11-16").open, false);
});

test("a proposal's button plans a later pause and runs today's at once", async () => {
  const db = fakeDb();
  const calls = [], logs = [];
  const ops = { campaign: async (id, action) => { calls.push(id + ":" + action); }, log: async (e) => { logs.push(e); }, push: async () => null };
  const calendar = cal.build({ today: "2026-11-09", targets: ["MX"], holidays: MX_HOLIDAY });
  const ctx = { db, now: Date.parse("2026-11-09T15:00:00Z"), ops, by: "carlos" };
  const out = await cal.clickAction(ctx, { proposal: "calendar:pause:MX:2026-11-16" }, { calendar, geo });
  assert.match(out.note, /W1 B-es Mexico will pause on Mon, Nov 16/);
  assert.equal(calls.length, 0);
  assert.equal(db.doc(cal.PAUSES, "MX-2026-11-16").status, "planned");
  assert.equal(logs[0].status, "waiting");
  await assert.rejects(() => cal.clickAction(ctx, { proposal: "calendar:pause:MX:2026-11-20" }, { calendar, geo }), /No public holiday/);
  const cancel = await cal.clickAction(ctx, { proposal: "calendar:resume:MX:2026-11-16" }, { calendar, geo });
  assert.match(cancel.note, /cancelled/);
  assert.equal(db.doc(cal.PAUSES, "MX-2026-11-16").status, "cancelled");
  assert.equal(db.doc(cal.PAUSES, "MX-2026-11-16").open, false);
  await assert.rejects(() => cal.clickAction(ctx, { proposal: "calendar:resume:MX:2026-11-16" }, { calendar, geo }), /Nothing is paused/);
  const onDay = cal.build({ today: "2026-11-16", targets: ["MX"], holidays: MX_HOLIDAY, settings: { autoPause: true } });
  const skipped = await cal.runDaily(Object.assign({}, ctx, { now: Date.parse("2026-11-16T12:40:00Z") }), { today: "2026-11-16", settings: { autoPause: true }, calendar: onDay, geo, pauses: [] });
  assert.equal(calls.length, 0, "a cancelled holiday is not auto-paused");
  assert.equal(skipped.paused, 0);
  const today = cal.build({ today: "2026-11-16", targets: ["MX"], holidays: MX_HOLIDAY });
  const db2 = fakeDb();
  const now = await cal.clickAction(Object.assign({}, ctx, { db: db2, now: Date.parse("2026-11-16T15:00:00Z") }), { proposal: "calendar:pause:MX:2026-11-16" }, { calendar: today, geo });
  assert.equal(now.done, 1);
  assert.deepEqual(calls, ["c1:pause"]);
  const res = await cal.clickAction(Object.assign({}, ctx, { db: db2 }), { proposal: "calendar:resume:MX:2026-11-16" }, { calendar: today, geo });
  assert.equal(res.done, 1);
  assert.deepEqual(calls, ["c1:pause", "c1:activate"]);
});

test("briefing: a holiday pause proposal, a themed campaign ahead of Buen Fin, and the resume line", () => {
  const calendar = Object.assign({ ok: true }, cal.build({ today: "2026-11-09", targets: ["MX", "CO"], holidays: MX_HOLIDAY }));
  const now = new Date("2026-11-09T15:00:00Z");
  const items = core.briefing({ external: { calendar, geo }, now });
  const pause = items.find((i) => i.key === "calendar:pause:MX:2026-11-16");
  assert.ok(pause, "pause line");
  assert.equal(pause.level, "info");
  assert.match(pause.text, /W1 B-es Mexico \(62% of its leads\)/);
  assert.match(pause.text, /resume Tue, Nov 17/);
  assert.ok(!items.some((i) => i.key.startsWith("calendar:pause:CO:")), "Christmas is outside the 14-day window");
  assert.ok(items.some((i) => i.key === "calendar:campaign:buen-fin:2026-11-13"));
  const proposals = core.proposalRules({ external: { calendar, geo }, now }, items);
  const p = proposals.find((x) => x.key === "calendar:pause:MX:2026-11-16");
  assert.equal(p.click, "calendar-pause");
  assert.match(p.title, /^Pause W1 B-es Mexico in Mexico for Día de la Revolución/);
  assert.deepEqual(core.proposalRun(p), { action: "calendar-pause", label: "Pause over the holiday" });
  assert.equal(proposals.find((x) => x.key === "calendar:campaign:buen-fin:2026-11-13").tab, "marketing");
  const paused = Object.assign({}, calendar, { pauses: [{ id: "MX-2026-11-16", cc: "MX", date: "2026-11-16", name: "Día de la Revolución", status: "paused", resumeOn: "2026-11-17", campaigns: [{ id: "c1", name: "W1 B-es Mexico" }] }] });
  const after = core.briefing({ external: { calendar: paused, geo }, now: new Date("2026-11-18T15:00:00Z") });
  const resume = after.find((i) => i.key === "calendar:resume:MX:2026-11-16");
  assert.equal(resume.level, "warn");
  assert.ok(!after.some((i) => i.key === "calendar:pause:MX:2026-11-16"));
  assert.equal(core.proposalRun(core.proposalRules({ external: {} }, [resume])[0]).action, "calendar-resume");
});

test("settings: calendar is kept in jarvis_settings/main and defaults off", () => {
  const jarvis = require("../../functions/jarvis.js");
  assert.deepEqual(jarvis.normalizeSettings({}).calendar, { autoPause: false, warnDays: 14, remindDays: 3 });
  assert.deepEqual(jarvis.normalizeSettings({ calendar: { autoPause: true, warnDays: 90, remindDays: 99 } }).calendar, { autoPause: true, warnDays: 60, remindDays: 60 });
});
