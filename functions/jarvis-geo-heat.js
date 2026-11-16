/* Jarvis Map heatmap and sector grid (#3112), added to the geo source (jarvis-geo.js) as `heat` and `sectors`.

   heat     replies (marketing-sync, the last 80) and sends (the marketing source's last 200 sent emails) by weekday and
            hour in each recipient country's local time, so they line up with the sending windows. A sender's country
            comes from the lead list, then the prospect queue and the Live Reports by host, the way geoRows does. Each
            country also gets its campaigns' sending window in its own local time.
            Cells are sparse: r [[day, hour, replies, positive]], s [[day, hour, sends]], day 0 Monday to 6 Sunday.
            The window w is 42 hex digits: six per day from Monday, bit 23 - hour set when a campaign sends then.
   sectors  rows are countries, columns the prospect queue's sectors. Prospects are exact; sent and replies are each
            campaign's numbers split across its synced leads' (country, sector), a lead taking its site's sector from
            the queue (the sync's lead rows carry no sector). Arrays p, s and r follow `sectors.list`; "?" is no sector.
   Twins of the shading: levelOf in js/admin-jarvis-geo-heat.js and GeoHeat.kt. */

const geo = require("./jarvis-geo");

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const POSITIVE = /interest|positive|meeting|yes|book/i;
const NO_SECTOR = "?";
const MAX_SECTORS = 10;
const MAX_ROWS = 40;

// Countries spanning several zones use their most populous one; MULTI_ZONE lists them so the tab can say so.
const MULTI_ZONE = {
  US: "America/New_York", CA: "America/Toronto", MX: "America/Mexico_City", BR: "America/Sao_Paulo", AU: "Australia/Sydney",
  RU: "Europe/Moscow", CL: "America/Santiago", EC: "America/Guayaquil", ES: "Europe/Madrid", PT: "Europe/Lisbon",
  ID: "Asia/Jakarta", KZ: "Asia/Almaty", CD: "Africa/Kinshasa", NZ: "Pacific/Auckland", AR: "America/Argentina/Buenos_Aires"
};
const ZONES = Object.assign({
  GB: "Europe/London", IE: "Europe/Dublin", FR: "Europe/Paris", DE: "Europe/Berlin", IT: "Europe/Rome", CH: "Europe/Zurich",
  AT: "Europe/Vienna", BE: "Europe/Brussels", NL: "Europe/Amsterdam", LU: "Europe/Luxembourg", LI: "Europe/Vaduz", MC: "Europe/Monaco",
  SM: "Europe/San_Marino", VA: "Europe/Vatican", MT: "Europe/Malta", AD: "Europe/Andorra", DK: "Europe/Copenhagen", NO: "Europe/Oslo",
  SE: "Europe/Stockholm", FI: "Europe/Helsinki", IS: "Atlantic/Reykjavik", PL: "Europe/Warsaw", CZ: "Europe/Prague", SK: "Europe/Bratislava",
  HU: "Europe/Budapest", SI: "Europe/Ljubljana", HR: "Europe/Zagreb", RO: "Europe/Bucharest", BG: "Europe/Sofia", GR: "Europe/Athens",
  CY: "Asia/Nicosia", EE: "Europe/Tallinn", LV: "Europe/Riga", LT: "Europe/Vilnius", UA: "Europe/Kiev", TR: "Europe/Istanbul",
  RS: "Europe/Belgrade", BA: "Europe/Sarajevo", MK: "Europe/Skopje", AL: "Europe/Tirane", ME: "Europe/Podgorica", MD: "Europe/Chisinau",
  CO: "America/Bogota", PE: "America/Lima", VE: "America/Caracas", BO: "America/La_Paz", PY: "America/Asuncion", UY: "America/Montevideo",
  GT: "America/Guatemala", SV: "America/El_Salvador", HN: "America/Tegucigalpa", NI: "America/Managua", CR: "America/Costa_Rica",
  PA: "America/Panama", CU: "America/Havana", DO: "America/Santo_Domingo", PR: "America/Puerto_Rico", HT: "America/Port-au-Prince",
  JM: "America/Jamaica", TT: "America/Port_of_Spain", BZ: "America/Belize", BS: "America/Nassau", BB: "America/Barbados",
  GY: "America/Guyana", SR: "America/Paramaribo",
  ZA: "Africa/Johannesburg", NG: "Africa/Lagos", KE: "Africa/Nairobi", GH: "Africa/Accra", AO: "Africa/Luanda", MZ: "Africa/Maputo",
  CV: "Atlantic/Cape_Verde", GW: "Africa/Bissau", ST: "Africa/Sao_Tome", GQ: "Africa/Malabo", SN: "Africa/Dakar", CI: "Africa/Abidjan",
  CM: "Africa/Douala", ML: "Africa/Bamako", BF: "Africa/Ouagadougou", NE: "Africa/Niamey", TD: "Africa/Ndjamena", GN: "Africa/Conakry",
  BJ: "Africa/Porto-Novo", TG: "Africa/Lome", CG: "Africa/Brazzaville", GA: "Africa/Libreville", MG: "Indian/Antananarivo",
  RW: "Africa/Kigali", BI: "Africa/Bujumbura", DJ: "Africa/Djibouti", KM: "Indian/Comoro", EG: "Africa/Cairo", MA: "Africa/Casablanca",
  DZ: "Africa/Algiers", TN: "Africa/Tunis", ET: "Africa/Addis_Ababa", TZ: "Africa/Dar_es_Salaam", UG: "Africa/Kampala",
  IN: "Asia/Kolkata", SG: "Asia/Singapore", PH: "Asia/Manila", TL: "Asia/Dili", JP: "Asia/Tokyo", CN: "Asia/Shanghai", KR: "Asia/Seoul",
  HK: "Asia/Hong_Kong", TW: "Asia/Taipei", MY: "Asia/Kuala_Lumpur", TH: "Asia/Bangkok", VN: "Asia/Ho_Chi_Minh", PK: "Asia/Karachi",
  BD: "Asia/Dhaka", AE: "Asia/Dubai", SA: "Asia/Riyadh", IL: "Asia/Jerusalem", QA: "Asia/Qatar", KW: "Asia/Kuwait", LK: "Asia/Colombo",
  NP: "Asia/Kathmandu"
}, MULTI_ZONE);

const up = (cc) => String(cc || "").trim().toUpperCase();
const valid = (cc) => /^[A-Z]{2}$/.test(cc);
const bare = (host) => String(host || "").toLowerCase().replace(/^https?:\/\//, "").replace(/[/:].*$/, "").replace(/^www\./, "");
const domainOf = (email) => bare(String(email || "").split("@")[1] || "");
const emailOf = (from) => String(from || "").toLowerCase().replace(/^.*</, "").replace(/>.*$/, "").trim();

const FORMATS = {};
/** The weekday (0 Monday) and hour in a zone at an instant, or null for a zone Intl does not know. */
function slotIn(ms, zone) {
  let f = FORMATS[zone];
  if (f === undefined) {
    try { f = new Intl.DateTimeFormat("en-US", { timeZone: zone, weekday: "short", hour: "numeric", minute: "numeric", hourCycle: "h23" }); } catch (error) { f = null; }
    FORMATS[zone] = f;
  }
  if (!f || !Number.isFinite(ms)) return null;
  const p = {};
  f.formatToParts(new Date(ms)).forEach((x) => { p[x.type] = x.value; });
  const d = DAYS.indexOf(p.weekday);
  return d < 0 ? null : { d, h: Number(p.hour) % 24, m: Number(p.minute) || 0 };
}

// Walks parent domains (mail.uni.edu.co → uni.edu.co) through the maps, first hit wins.
const lookup = (maps) => (host) => {
  let h = bare(host);
  while (h && h.includes(".")) {
    for (const m of maps) if (m[h]) return m[h];
    h = h.slice(h.indexOf(".") + 1);
  }
  return "";
};

/** Email → country, in geoRows's order: the lead list by address, then lead, queue and Live Reports hosts. */
function senderCountry(i) {
  const leadEmail = {};
  const leadHosts = {};
  const queueHosts = {};
  const liveHosts = {};
  ((i.sync && i.sync.leads && i.sync.leads.rows) || []).forEach((l) => {
    const cc = up(l.cc);
    if (!valid(cc)) return;
    if (l.email) leadEmail[String(l.email).toLowerCase()] = cc;
    if (l.host) leadHosts[bare(l.host)] = cc;
  });
  ((i.queue && i.queue.hosts) || []).forEach((h) => { if (valid(up(h.cc))) queueHosts[bare(h.host)] = up(h.cc); });
  ((i.live && i.live.reports) || []).forEach((r) => { if (valid(up(r.country))) liveHosts[bare(r.host)] = up(r.country); });
  const byHost = lookup([leadHosts, queueHosts, liveHosts]);
  return (email) => { const e = emailOf(email); return leadEmail[e] || byHost(domainOf(e)); };
}

/** "Mon-Fri 09:00-17:00 America/Chicago" (windowOf in jarvis-marketing.js) → { days: [0..6 from Monday], from, to minutes, zone }. */
function parseWindow(text) {
  const m = /^(.*?)\s*(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})(?:\s+(\S+))?\s*$/.exec(String(text || "").trim());
  if (!m) return null;
  const span = m[1].trim();
  let days = [];
  const run = /^([A-Z][a-z]{2})-([A-Z][a-z]{2})$/.exec(span);
  if (run && DAYS.includes(run[1]) && DAYS.includes(run[2])) {
    for (let d = DAYS.indexOf(run[1]); ; d = (d + 1) % 7) { days.push(d); if (d === DAYS.indexOf(run[2])) break; }
  } else days = span ? span.split(/[,\s]+/).map((s) => DAYS.indexOf(s)).filter((d) => d >= 0) : [0, 1, 2, 3, 4, 5, 6];
  const from = Number(m[2]) * 60 + Number(m[3]);
  const to = Number(m[4]) * 60 + Number(m[5]);
  if (!days.length || to <= from) return null;
  return { days, from, to, zone: m[6] || "" };
}

const STEP = 30 * 60000;
/** The 7 × 24 cells of a country's local week when one of the windows sends, as 7 day numbers (bit 23 - hour). */
function windowMask(windows, zone, now) {
  const mask = [0, 0, 0, 0, 0, 0, 0];
  const day = new Date(now);
  const start = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()) - ((day.getUTCDay() + 6) % 7) * 86400000;
  windows.forEach((w) => {
    const wz = w.zone && slotIn(now, w.zone) ? w.zone : zone;
    for (let t = start; t < start + 7 * 86400000; t += STEP) {
      const at = slotIn(t, wz);
      if (!at || !w.days.includes(at.d)) continue;
      const min = at.h * 60 + at.m;
      if (min < w.from || min >= w.to) continue;
      const here = slotIn(t, zone);
      if (here) mask[here.d] |= 1 << (23 - here.h);
    }
  });
  return mask;
}
const hexOf = (mask) => mask.map((v) => v.toString(16).padStart(6, "0")).join("");

/**
 * Replies and sends by local weekday and hour per country, and each country's sending window (pure, for the tests).
 * input: { sync, marketing, queue, live, countries (geoRows rows, for their campaigns), now }.
 */
function heatRows(input) {
  const i = input || {};
  const now = Number(i.now) || Date.now();
  const country = senderCountry(i);
  const grids = {};
  const all = { r: {}, s: {} };
  const grid = (cc) => grids[cc] || (grids[cc] = { r: {}, s: {} });
  let replies = 0;
  let sends = 0;
  let unzoned = 0;
  const add = (cc, at, kind, positive) => {
    const zone = ZONES[cc];
    const slot = zone && slotIn(Date.parse(at || ""), zone);
    if (!slot) { unzoned++; return false; }
    const key = slot.d * 24 + slot.h;
    [grid(cc)[kind], all[kind]].forEach((g) => {
      const c = g[key] || (g[key] = [0, 0]);
      c[0]++;
      if (positive) c[1]++;
    });
    return true;
  };
  ((i.sync && i.sync.replies) || []).forEach((rep) => { if (add(country(rep.from), rep.at, "r", POSITIVE.test(rep.category || ""))) replies++; });
  ((i.marketing && i.marketing.sent && i.marketing.sent.rows) || []).forEach((e) => { if (e.kind !== "resend" && add(country(e.to), e.at, "s", false)) sends++; });

  const camps = {};
  ((i.marketing && i.marketing.campaigns && i.marketing.campaigns.rows) || []).forEach((c) => { camps[c.id] = c; });
  const cells = (g, kind) => Object.keys(g).map(Number).sort((a, b) => a - b).map((k) => (kind === "r" ? [Math.floor(k / 24), k % 24, g[k][0], g[k][1]] : [Math.floor(k / 24), k % 24, g[k][0]]));
  const out = {};
  const zones = {};
  (i.countries || []).forEach((r) => {
    const zone = ZONES[r.cc];
    if (!zone) return;
    const windows = (r.camps || []).map((c) => camps[c.id]).filter((c) => c && c.status !== "completed").map((c) => parseWindow(c.window)).filter(Boolean);
    const g = grids[r.cc];
    if (!g && !windows.length) return;
    const w = windows.length ? hexOf(windowMask(windows, zone, now)) : "";
    out[r.cc] = { r: g ? cells(g.r, "r") : [], s: g ? cells(g.s, "s") : [], w };
    zones[r.cc] = zone;
  });
  Object.keys(grids).forEach((cc) => {
    if (out[cc]) return;
    out[cc] = { r: cells(grids[cc].r, "r"), s: cells(grids[cc].s, "s"), w: "" };
    zones[cc] = ZONES[cc];
  });
  return {
    zones, multi: Object.keys(zones).filter((cc) => MULTI_ZONE[cc]).sort(), countries: out,
    all: { r: cells(all.r, "r"), s: cells(all.s, "s") }, replies, sends, unzoned
  };
}

/** Country-by-sector prospects, sent and replies (pure, for the tests). input: { queue, sync, marketing }. */
function sectorGrid(input) {
  const i = input || {};
  const hosts = (i.queue && i.queue.hosts) || [];
  const cell = {};
  const at = (cc, sector) => { const k = cc + "|" + sector; return cell[k] || (cell[k] = { cc, sector, p: 0, s: 0, r: 0 }); };
  const hostSector = {};
  hosts.forEach((h) => {
    const cc = up(h.cc);
    if (!valid(cc)) return;
    const sector = String(h.sector || "other").toLowerCase().slice(0, 40);
    at(cc, sector).p++;
    hostSector[bare(h.host)] = sector;
  });
  const sectorOf = lookup([hostSector]);
  const leadRows = (i.sync && i.sync.leads && i.sync.leads.rows) || [];
  let matched = 0;
  const leads = leadRows.filter((l) => valid(up(l.cc))).map((l) => {
    const sector = String(l.sector || sectorOf(l.host) || sectorOf(domainOf(l.email)) || "").toLowerCase().slice(0, 40);
    if (sector) matched++;
    return { campaign: l.campaign, cc: up(l.cc), sector: sector || NO_SECTOR };
  });
  let unsplit = 0;
  ((i.marketing && i.marketing.campaigns && i.marketing.campaigns.rows) || []).forEach((c) => {
    const mine = leads.filter((l) => l.campaign === c.name);
    if (!mine.length) { unsplit += Number(c.sent) || 0; return; }
    mine.forEach((l) => {
      const x = at(l.cc, l.sector);
      x.s += (Number(c.sent) || 0) / mine.length;
      x.r += (Number(c.replies) || 0) / mine.length;
    });
  });
  const list = Object.values(cell);
  const total = {};
  list.forEach((x) => { total[x.sector] = (total[x.sector] || 0) + x.p + x.s; });
  const named = Object.keys(total).filter((s) => s !== NO_SECTOR).sort((a, b) => total[b] - total[a] || a.localeCompare(b));
  const keep = named.length > MAX_SECTORS ? named.slice(0, MAX_SECTORS - 1).concat("other") : named;
  const cols = Array.from(new Set(keep)).concat(total[NO_SECTOR] ? [NO_SECTOR] : []);
  const col = (s) => (cols.includes(s) ? cols.indexOf(s) : cols.indexOf("other"));
  const rows = {};
  list.forEach((x) => {
    const r = rows[x.cc] || (rows[x.cc] = { cc: x.cc, name: geo.nameOf(x.cc), p: cols.map(() => 0), s: cols.map(() => 0), r: cols.map(() => 0) });
    const n = col(x.sector);
    if (n < 0) return;
    r.p[n] += x.p; r.s[n] += x.s; r.r[n] += x.r;
  });
  const sum = (a) => a.reduce((s, n) => s + n, 0);
  const out = Object.values(rows).map((r) => Object.assign(r, { s: r.s.map(Math.round), r: r.r.map(Math.round) }))
    .filter((r) => sum(r.p) + sum(r.s) > 0)
    .sort((a, b) => sum(b.p) + sum(b.s) - (sum(a.p) + sum(a.s)) || a.cc.localeCompare(b.cc));
  const needs = [];
  if (!leadRows.length) needs.push("Sent and replies per sector need the marketing sync's leads; it has none, so only prospects show.");
  else if (!matched) needs.push("Sent and replies per sector come from synced leads whose site is in the prospect queue; none matched yet, so only prospects show.");
  else if (matched < leads.length) needs.push(`${leads.length - matched} of ${leads.length} synced leads have no site in the prospect queue, so their emails count under no sector.`);
  if (unsplit) needs.push(`${unsplit.toLocaleString("en-US")} emails come from campaigns with no synced leads, so they have no sector.`);
  return { list: cols, rows: out.slice(0, MAX_ROWS), more: Math.max(0, out.length - MAX_ROWS), leads: leads.length, matched, unsplit, needs };
}

/** What Ask needs: each country's busiest reply hours in its local time, and the top country-sector cells. */
function heatAsk(g) {
  if (!g || g.ok === false || !g.heat) return null;
  const h = g.heat;
  const peaks = Object.keys(h.countries || {}).map((cc) => {
    const r = h.countries[cc].r || [];
    const n = r.reduce((s, c) => s + c[2], 0);
    const best = r.slice().sort((a, b) => b[2] - a[2] || a[0] - b[0] || a[1] - b[1]).slice(0, 2);
    return { cc, n, text: `${cc} (${h.zones[cc]}): ${n} replies, most ${best.map((c) => DAYS[c[0]] + " " + c[1] + "h").join(", ") || "none"}` };
  }).filter((x) => x.n).sort((a, b) => b.n - a.n).slice(0, 8).map((x) => x.text);
  const s = g.sectors || {};
  const cells = [];
  (s.rows || []).forEach((r) => (s.list || []).forEach((sec, n) => { if (r.p[n] || r.s[n]) cells.push({ t: `${r.cc} ${sec === NO_SECTOR ? "no sector" : sec}: ${r.p[n]} prospects, ${r.s[n]} sent, ${r.r[n]} replies`, w: r.s[n] * 10 + r.p[n] }); }));
  return { replyHours: peaks, localTime: "each country's local time; " + (h.multi || []).join(", ") + " use their most populous zone", sectors: cells.sort((a, b) => b.w - a.w).slice(0, 10).map((c) => c.t) };
}

module.exports = { heatRows, sectorGrid, heatAsk, parseWindow, windowMask, slotIn, senderCountry, ZONES, MULTI_ZONE, DAYS, NO_SECTOR };
