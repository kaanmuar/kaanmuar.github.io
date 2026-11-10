/* Jarvis Map timeline and flow (#3114, part of #2976): two pure views over what the geo source already holds.

   timeline   every Instantly campaign as a bar by week: start date (or creation) to now, or to when it stopped when
              known (a holiday pause from the calendar, else Instantly's last change of a paused or completed campaign).
              Status is draft, scheduled (active, start still ahead), active, paused or done. Each bar carries the
              countries it reaches (the geo rows' camps), so the clients show only the selected country's. Markers are
              the calendar's special dates for those countries (the rows' nextDate when the calendar is missing) and
              its holiday pauses, up to AHEAD days from today or a week past the last bar.
   flow       channel to outcome stage, one band per channel: cold email (leads, contacted, opened, replied), sweep
              (prospects queued), social (replies drafted, posted) and visitors (short-link visits, paid unlocks).
              Values follow LINKS for all countries and per country; a link no source feeds is in needs, never guessed.

   Twins: js/admin-jarvis-geo-flow.js and android/.../ui/GeoFlow.kt draw them. */

const STATUS = ["draft", "scheduled", "active", "paused", "done"];
const STOPPED = /^(paused|accounts unhealthy|bounce protect|suspended)$/;
const RUNNING = /^(active|running subsequences)$/;
const MARKERS = 40;
const AHEAD = 28;
const DAY = 24 * 60 * 60 * 1000;

const STAGES = ["prospect", "sent", "opened", "replied", "viewed", "paid"];
const CHANNELS = ["email", "sweep", "social", "web"];
// [channel, from ("" is the channel itself), to, the row's number]
const LINKS = [
  ["email", "", "prospect", (r) => r.leads],
  ["email", "prospect", "sent", (r) => r.contacted || r.sent],
  ["email", "sent", "opened", (r) => r.opened],
  ["email", "opened", "replied", (r) => r.replies],
  ["sweep", "", "prospect", (r) => r.prospects],
  ["social", "", "prospect", (r) => r.social],
  ["social", "prospect", "sent", (r) => r.socialApproved],
  ["web", "", "viewed", (r) => r.visits],
  ["web", "viewed", "paid", (r) => r.paid]
];
// Links no source feeds yet, so they stay out of the diagram.
const MISSING = [
  "Cold email stops at replied: Instantly does not see Live Report views or payments; those show under Visitors and short links.",
  "Sweep and Live Reports stop at prospect: Live Report views are not counted per country yet.",
  "Social replies stop at sent: the networks give no opens or replies for them.",
  "Visitors and short links start at report viewed: GA4 visitors are site sessions, not prospects, so they stay out."
];

const day = (v) => { const s = String(v || "").slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : ""; };
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const addDays = (s, n) => iso(Date.parse(s + "T00:00:00Z") + n * DAY);
const bogotaDay = (now) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(now));

/** The timeline's five statuses from Instantly's: scheduled is an active campaign whose start date is still ahead. */
function statusOf(c, today) {
  const s = String((c && c.status) || "");
  if (s === "completed") return "done";
  if (STOPPED.test(s)) return "paused";
  if (RUNNING.test(s)) return day(c.start) > today ? "scheduled" : "active";
  return "draft";
}

/** Campaign bars, markers and the axis span (pure). input: { campaigns, countries, calendar, now }. */
function timeline(input) {
  const i = input || {};
  const today = bogotaDay(i.now || Date.now());
  const reach = {};
  (i.countries || []).forEach((r) => (r.camps || []).forEach((c) => { (reach[c.id] = reach[c.id] || []).push([r.cc, Number(c.share) || 0]); }));
  const pauses = ((i.calendar && i.calendar.pauses) || []).filter((p) => p && (p.status === "paused" || p.status === "planned"));
  const rows = (i.campaigns || []).filter((c) => c && c.id).map((c) => {
    const status = statusOf(c, today);
    const start = day(c.start) || day(c.created);
    const held = pauses.filter((p) => (p.campaigns || []).some((x) => x.id === c.id));
    let end = "";
    let endBy = "";
    if (status === "paused" || status === "done") {
      const p = held.filter((x) => x.status === "paused").map((x) => day(x.pausedAt) || day(x.date)).filter(Boolean).sort().pop();
      const changed = day(c.updated);
      if (p && status === "paused") { end = p; endBy = "pause"; } else if (changed && changed >= start) { end = changed; endBy = "update"; }
    } else if (status === "scheduled" || status === "draft") end = start;
    return {
      id: String(c.id), name: String(c.name || "").slice(0, 80), week: c.week || "", lang: c.lang || "", region: c.region || "",
      status, raw: c.status || "", start, end: end && start && end < start ? start : end, endBy, window: c.window || "",
      ccs: (reach[c.id] || []).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map((x) => x[0]),
      pauses: held.map((p) => ({ cc: p.cc, date: day(p.date), until: day(p.resumeOn), name: String(p.name || "").slice(0, 60), status: p.status }))
    };
  }).sort((a, b) => (a.start || "9999").localeCompare(b.start || "9999") || a.name.localeCompare(b.name));

  const reached = new Set([].concat(...rows.map((r) => r.ccs)));
  const starts = rows.map((r) => r.start).filter(Boolean).sort();
  const from = starts[0] && starts[0] < today ? starts[0] : addDays(today, -28);
  const latest = rows.map((r) => r.end || r.start).filter(Boolean).sort().pop() || today;
  const last = [addDays(today, AHEAD), addDays(latest, 7)].sort().pop();
  let markers = [];
  const days = i.calendar && Array.isArray(i.calendar.days) ? i.calendar.days : null;
  if (days) {
    days.forEach((d) => {
      const ccs = d.all ? [] : (d.ccs || []).filter((cc) => reached.has(cc));
      if (!d.all && !ccs.length) return;
      markers.push({ date: day(d.date), end: day(d.end), name: String(d.name || "").slice(0, 60), kind: d.kind || "event", ccs, all: !!d.all });
    });
  } else {
    const seen = {};
    (i.countries || []).filter((r) => r.nextDate && reached.has(r.cc)).forEach((r) => {
      const k = r.nextDate.date + "|" + r.nextDate.name;
      if (seen[k]) seen[k].ccs.push(r.cc);
      else markers.push(seen[k] = { date: day(r.nextDate.date), end: "", name: String(r.nextDate.name || "").slice(0, 60), kind: r.nextDate.kind || "event", ccs: [r.cc], all: false });
    });
  }
  pauses.forEach((p) => markers.push({ date: day(p.date), end: day(p.resumeOn), name: "Paused for " + String(p.name || "a holiday").slice(0, 50), kind: "pause", ccs: [p.cc], all: false }));
  markers = markers.filter((m) => m.date && m.date <= last && (m.end || m.date) >= from)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.kind === "pause") - (b.kind === "pause") || a.name.localeCompare(b.name)).slice(0, MARKERS);

  const byStatus = STATUS.map((s) => rows.filter((r) => r.status === s).length);
  return { today, from, to: last, rows, markers, byStatus, undated: rows.filter((r) => !r.start).length };
}

const values = (r) => LINKS.map((l) => Math.max(0, Math.round(Number(l[3](r)) || 0)));

/** The flow's link values for all countries (the sum of theirs) and per country with any (pure). Links are [channel, from, to]. */
function flow(countries) {
  const by = {};
  const all = LINKS.map(() => 0);
  (countries || []).forEach((r) => {
    const v = values(r);
    if (!v.some((n) => n > 0)) return;
    by[r.cc] = v;
    v.forEach((n, k) => { all[k] += n; });
  });
  return { links: LINKS.map((l) => [l[0], l[1], l[2]]), all, by, needs: MISSING.slice() };
}

/** Both, as the geo source adds them. */
function build(input) {
  const i = input || {};
  return { timeline: timeline(i), flow: flow(i.countries) };
}

/** For Ask: the flow in words and the campaigns by status, a few hundred bytes. */
function ask(geo) {
  if (!geo || geo.ok === false || !geo.flow) return null;
  const f = geo.flow;
  const t = geo.timeline || {};
  return {
    flow: f.links.map((l, n) => l[0] + ": " + (l[1] || l[0]) + " → " + l[2] + " " + f.all[n]).filter((x) => !/ 0$/.test(x)),
    campaigns: STATUS.reduce((m, s, n) => { if ((t.byStatus || [])[n]) m[s] = t.byStatus[n]; return m; }, {}),
    nextMarkers: (t.markers || []).filter((m) => m.date >= t.today).slice(0, 5).map((m) => m.date + " " + m.name + (m.ccs.length ? " (" + m.ccs.join(", ") + ")" : ""))
  };
}

module.exports = { timeline, flow, build, ask, statusOf, STATUS, STAGES, CHANNELS, LINKS, MISSING };
