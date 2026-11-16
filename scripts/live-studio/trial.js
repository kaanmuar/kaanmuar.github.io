/* The live's free trial (#3176): one shared TRY- code per show, minted at show start through Jarvis's outreach-mint
   (functions/outreach-trials.js) with the Mac's paired token, valid for the show plus 24 hours and one trial per address.
   The live's ledger row is live:<session>; each live is logged in media/live-studio/lives.jsonl with its code and uses. */
const fs = require("fs");
const os = require("os");
const path = require("path");

const PAIR_CONFIG = path.join(os.homedir(), "Library/Application Support/QALab/engagement-browser/config.json");
const ENDPOINT = "https://us-central1-carlosm-interactive-cv.cloudfunctions.net/jarvis";
const AFTER_HOURS = 24;
const DEMO_CODE = "TRY-DEMO26";

function pairing(file = PAIR_CONFIG) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch (error) { return {}; }
}

async function call(op, body, deps = {}) {
  const pair = deps.pair || pairing();
  if (!pair.token) throw new Error("this Mac is not paired with Jarvis: node scripts/engagement-browser/agent.js pair");
  const res = await (deps.fetch || fetch)(pair.endpoint || ENDPOINT, {
    method: "POST", headers: { "Content-Type": "application/json", "x-mac-token": pair.token },
    body: JSON.stringify(Object.assign({ op }, body)), signal: AbortSignal.timeout(30000)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) throw new Error(op + ": " + (data.error || "Jarvis answered " + res.status));
  return data;
}

// The show's code: { code, url, validUntil, maxUses, person }. hours is how long the show runs.
async function mintLive(o, deps) {
  const body = { kind: "live", network: "live", handle: o.session, name: o.name || o.session, lang: o.lang, validHours: Number(o.hours) + AFTER_HOURS, by: "live-studio" };
  if (o.uses) body.maxUses = Number(o.uses);
  const out = await call("outreach-mint", body, deps);
  return { code: out.code, url: out.url, validUntil: out.validUntil, maxUses: out.maxUses, person: out.person.id };
}

// How many viewers claimed the show's trial, read back from its ledger row as the show ends.
async function closeLive(person, deps) {
  const out = await call("outreach-touch", { id: person, patch: { note: "live ended" } }, deps);
  return Number(out.person && out.person.uses) || 0;
}

function logLive(file, entry) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, JSON.stringify(entry) + "\n");
}

module.exports = { PAIR_CONFIG, ENDPOINT, AFTER_HOURS, DEMO_CODE, pairing, call, mintLive, closeLive, logLive };
