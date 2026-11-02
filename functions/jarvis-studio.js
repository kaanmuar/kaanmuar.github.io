"use strict";
/*
 * Jarvis studio (#1981): the clip and skit renders studio-render.yml can make, and starting one from Jarvis on the web
 * or in the app. The tips-studio sources and skits are read from main and the skit takes from the skit-takes release,
 * so a new source shows up once it merges. The workflow checks the request again before it renders anything.
 */
const WORKFLOW = "studio-render.yml";
const TAKES = "skit-takes";
const KINDS = ["tips", "skit"];
const MODES = ["render", "rotate", "captions"];
const LANGS = ["en", "es", "pt", "de", "fr", "it"];
// Keep in step with NOT_SOURCES in scripts/studio-render.js.
const NOT_SOURCES = ["build", "brands", "buffer-voiced", "site-assets", "runs-auto"];
const SLUG = /^[a-z0-9][a-z0-9-]*$/;
const LIST = /^[a-z0-9-]+(,[a-z0-9-]+)*$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The workflow inputs for a render request, or an error a person can act on. */
function inputs(body) {
  const b = body || {};
  const out = { kind: KINDS.includes(b.kind) ? b.kind : "", name: String(b.name || "").trim(), mode: MODES.includes(b.mode || "render") ? b.mode || "render" : "" };
  if (!out.kind) throw new Error("Pick tips or skit.");
  if (!out.mode) throw new Error("Pick render, rotate or captions.");
  if (!SLUG.test(out.name)) throw new Error("Pick a source or a skit.");
  if (out.kind === "skit" && out.mode === "rotate") throw new Error("A skit keeps its actors' voices, so there is nothing to rotate.");
  const extra = {
    batch: [SLUG, "The batch is lowercase letters, digits and dashes."],
    start: [DAY, "The first day is YYYY-MM-DD."],
    tips: [LIST, "Posts are ids separated by commas."],
    langs: [LIST, "Languages are codes separated by commas, e.g. en,es."],
    networks: [LIST, "Networks are names separated by commas, e.g. x,linkedin."],
    ticket: [/^\d+$/, "The ticket is an issue number."]
  };
  for (const [key, [re, why]] of Object.entries(extra)) {
    const value = String(b[key] || "").trim().replace(/^#/, "");
    if (!value) continue;
    if (!re.test(value)) throw new Error(why);
    out[key] = value;
  }
  if (out.langs && !out.langs.split(",").every((l) => LANGS.includes(l))) throw new Error("Languages are " + LANGS.join(", ") + ".");
  if (out.kind === "tips") delete out.langs;
  if (out.kind === "skit") delete out.tips;
  return out;
}

/** Source names from a GitHub contents listing of scripts/tips-studio. */
function sources(listing) {
  return (listing || []).map((f) => f && f.type === "file" && /^([a-z0-9-]+)\.js$/.exec(f.name)).filter(Boolean).map((m) => m[1])
    .filter((name) => !NOT_SOURCES.includes(name)).sort();
}

/** Skit ids from skits.js, each with the languages whose take is in the skit-takes release. */
function skits(skitsJs, assets) {
  const names = (assets || []).map((a) => a.name);
  const ids = [...String(skitsJs || "").matchAll(/^\s*id:\s*"([a-z0-9-]+)"/gm)].map((m) => m[1]);
  return ids.map((id) => ({ id, takes: LANGS.filter((lang) => names.includes(id + "-" + lang + ".mp4")) }));
}

/** The latest studio-render runs, newest first. */
function runs(list, limit) {
  return ((list && list.workflow_runs) || []).slice(0, limit || 6).map((r) => ({
    name: r.display_title || r.name || "", event: r.event || "", status: r.status || "", conclusion: r.conclusion || "", at: r.created_at || "", url: r.html_url || ""
  }));
}

/** What the Studio panel shows: { sources, skits, runs }. */
async function overview(get, repo) {
  const [listing, file, release, list] = await Promise.all([
    get("/repos/" + repo + "/contents/scripts/tips-studio?ref=main").catch(() => []),
    get("/repos/" + repo + "/contents/scripts/skits-studio/skits.js?ref=main").catch(() => null),
    get("/repos/" + repo + "/releases/tags/" + TAKES).catch(() => null),
    get("/repos/" + repo + "/actions/workflows/" + WORKFLOW + "/runs?per_page=6").catch(() => null)
  ]);
  const js = file && file.content ? Buffer.from(file.content, "base64").toString("utf8") : "";
  return { sources: sources(listing), skits: skits(js, release && release.assets), runs: runs(list), workflow: WORKFLOW, takes: TAKES };
}

/** Starts studio-render.yml with the request; the run shows up in the panel a few seconds later. */
async function start(post, repo, body) {
  const want = inputs(body);
  await post("/repos/" + repo + "/actions/workflows/" + WORKFLOW + "/dispatches", { ref: "main", inputs: want });
  const what = want.kind + " " + want.name + (want.mode === "render" ? "" : " (" + want.mode + ")");
  const lands = want.mode === "rotate" ? "the " + (want.batch || "batch") + "-voiced release" : "a PR";
  return { inputs: want, note: "Rendering " + what + ". The review links land in " + lands + (want.ticket ? " and on #" + want.ticket : "") + " when it is done.", url: "https://github.com/" + repo + "/actions/workflows/" + WORKFLOW };
}

module.exports = { WORKFLOW, TAKES, LANGS, MODES, inputs, sources, skits, runs, overview, start };
