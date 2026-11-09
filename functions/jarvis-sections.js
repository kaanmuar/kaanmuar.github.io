/* Jarvis 2.0 snapshot sections (#2508, contract on #2507): the snapshot op's answer cut into the sections the app,
   watch, widgets and web keep and merge, each with a version, so a client that sends its versions gets back only the
   sections that changed.

   The sections are cut from the composed snapshot on every read (jarvis-snapshot.js keeps its build inputs cached),
   so they never lag those inputs and cost no Firestore reads or writes of their own. A version is a hash of the
   section's content, `cachedAt` left out, so a source fetched again with the same answer keeps its version.

   Each top-level field belongs to one section; `external` is split by source. A field no section claims goes to
   `other` until it is given one (a unit test fails while any does). */

const crypto = require("crypto");
const core = require("./jarvis-core");

const SECTIONS = {
  settings: { fields: ["settings", "thresholds"], from: ["settings"] },
  products: { fields: ["window", "products", "outreachVisits", "feed", "socialHeat"], from: ["products"] },
  wide: { fields: ["wide"], from: ["products", "external"] },
  briefing: { fields: ["briefing", "briefHidden", "readiness", "connections"], from: ["products", "external", "goals", "settings", "marks"] },
  approvals: { fields: ["proposals", "countdowns"], from: ["proposals", "countdowns", "products", "external", "goals", "settings"] },
  goals: { fields: ["goals"], from: ["goals"] },
  reports: { fields: ["reports"], from: ["reports"] },
  // Small and fast-changing (#2548): only jarvis_cache/processes, so a writer knows the version it pushes.
  processes: { fields: ["processes"], from: ["processes"] },
  systems: { external: ["health", "uptime", "speed", "platform", "safety", "cloudflare", "jobs", "github", "github-work"], from: ["external"] },
  pagespeed: { external: ["pagespeed", "local", "search"], from: ["external"] },
  marketing: { external: ["marketing", "marketing-sync", "social", "outreach", "targets", "engagement", "ga4"], from: ["external"] },
  people: { external: ["people", "calls"], from: ["external"] },
  money: { external: ["money"], from: ["external"] },
  mail: { fields: ["mailCodes"], external: ["email", "mailbox", "addresses"], from: ["external"], live: true },
  devices: { fields: ["devices"], live: true },
  other: { from: [] }
};
const NAMES = Object.keys(SECTIONS);
// Answer fields that belong to no section: the response's own envelope and the products build time.
const ENVELOPE = new Set(["ok", "op", "cachedAt", "versions"]);
// An external source no section names is shown with the systems.
const SPARE_SOURCE = "systems";

const FIELD_OF = {};
const SOURCE_OF = {};
NAMES.forEach((name) => {
  (SECTIONS[name].fields || []).forEach((field) => { FIELD_OF[field] = name; });
  (SECTIONS[name].external || []).forEach((source) => { SOURCE_OF[source] = name; });
});

const withoutCachedAt = (key, value) => (key === "cachedAt" ? undefined : value);

/* Stamps that move with the clock alone are left out (#2819), so a version moves only when content does: the
   caller's own device row is stamped seen on every call, the products window ends at the build time, and each
   connection row carries its source's cachedAt. Clients move the window with cachedAt and take checked times from
   the delta answer's `checked` (applySections in jarvis-core.js). */
function hashed(name, payload) {
  if (name === "devices" && Array.isArray(payload.devices)) {
    return { devices: payload.devices.map((row) => (row && row.mine ? Object.assign({}, row, { seenAt: undefined }) : row)) };
  }
  if (name === "products" && payload.window) return Object.assign({}, payload, { window: undefined });
  if (name === "briefing" && Array.isArray(payload.connections)) {
    return Object.assign({}, payload, { connections: payload.connections.map((row) => (row && typeof row === "object" ? Object.assign({}, row, { at: undefined }) : row)) });
  }
  return payload;
}

function version(name, payload) {
  return crypto.createHash("sha1").update(JSON.stringify(hashed(name, payload), withoutCachedAt) || "").digest("hex").slice(0, 12);
}

// The full snapshot cut into its sections: { name: payload }, every section present (empty when it has nothing).
function split(full) {
  const out = NAMES.reduce((m, name) => { m[name] = {}; return m; }, {});
  Object.keys(full || {}).forEach((key) => {
    if (ENVELOPE.has(key)) return;
    if (key === "external" && full.external && typeof full.external === "object") {
      Object.keys(full.external).forEach((source) => {
        const name = SOURCE_OF[source] || SPARE_SOURCE;
        out[name].external = Object.assign(out[name].external || {}, { [source]: full.external[source] });
      });
      return;
    }
    out[FIELD_OF[key] || "other"][key] = full[key];
  });
  return out;
}

// When a section's content was built: the newest build time of the cached sections it comes from, or now if read live.
function builtAt(name, meta, now) {
  const s = SECTIONS[name];
  if (s.live) return new Date(now).toISOString();
  const times = (s.from || []).map((from) => Date.parse(((meta || {})[from] || {}).at)).filter(Number.isFinite);
  return new Date(times.length ? Math.max(...times) : now).toISOString();
}

// `only` from the request: the sections asked for, or every section when it names none we know.
function wanted(only) {
  const list = Array.isArray(only) ? only.filter((name) => SECTIONS[name]) : [];
  return new Set(list.length ? list : NAMES);
}

const isSince = (since) => !!since && typeof since === "object" && !Array.isArray(since);

// A section as sent in a delta: a field or source it names but no longer has goes as null, so a client drops it.
function sent(name, payload) {
  const s = SECTIONS[name];
  const out = Object.assign({}, payload);
  (s.fields || []).forEach((field) => { if (!(field in out)) out[field] = null; });
  if (s.external) out.external = Object.assign(s.external.reduce((m, source) => { m[source] = null; return m; }, {}), out.external);
  return out;
}

// Each source's cachedAt, for the sections asked: the clients' checked times (#2818), which the versions leave out.
function checkedAt(parts, names) {
  const out = {};
  names.forEach((name) => Object.entries(parts[name].external || {}).forEach(([source, x]) => { if (x && x.cachedAt) out[source] = x.cachedAt; }));
  return out;
}

/* The snapshot op's answer. Without `since`: the full snapshot as every installed build reads it, plus `versions`.
   With `since` ({ section: v }): only the sections whose version differs, the versions of every section asked, and
   `checked`, each source's cachedAt. */
function serve(full, meta, { since, only, days, now = Date.now() } = {}) {
  const parts = split(full);
  const delta = isSince(since);
  const names = delta ? NAMES.filter((name) => wanted(only).has(name)) : NAMES;
  const versions = {};
  names.forEach((name) => { versions[name] = { v: version(name, parts[name]), at: builtAt(name, meta, now) }; });
  if (!delta) return Object.assign({}, full, { versions });
  const sections = {};
  names.forEach((name) => { if (since[name] !== versions[name].v) sections[name] = sent(name, parts[name]); });
  return { delta: true, days, cachedAt: full.cachedAt, versions, sections, checked: checkedAt(parts, names) };
}

// Applies a delta answer to a kept full snapshot exactly as the app, watch and web do (#2510).
function apply(kept, answer) {
  return core.applySections(kept, answer);
}

// The sections whose version moved between two version maps; a push (#2509) names these.
function changed(before, after) {
  return Object.keys(after || {}).filter((name) => !before || !before[name] || before[name].v !== after[name].v);
}

module.exports = { SECTIONS, NAMES, split, version, builtAt, wanted, isSince, serve, apply, changed };
