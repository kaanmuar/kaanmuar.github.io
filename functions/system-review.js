/* The system review (#2409) opsWatchdog runs each morning, past the scheduled jobs: the workflows failing on main with
   the cause read from their logs and its fix, open security alerts, and PRs left open. Jarvis fixes what it can on its
   own (jarvis-actions.js); what is left needs Carlos, so each problem names the fix.
   run({ fetch, token, now }) -> { problems: [{ job, why }], rows: [{ label, value }] }. A source GitHub will not
   show the app (a missing permission) becomes a row that says so, never a problem. */
const REPO = "kaanmuar/kaanmuar.github.io";
const DAY = 864e5;
const STALE_PR_DAYS = 7;
const MAX_LOGS = 5;

const clip = (s, n) => String(s || "").replace(/\s+/g, " ").trim().slice(0, n);
const stamp = /^\d{4}-\d\d-\d\dT[\d:.]+Z\s?/;

// The cause of a failed job, from its log text: what broke and the fix, in one line.
function causeOf(log) {
  const lines = String(log || "").split("\n").map((l) => l.replace(stamp, "").replace(/\x1b\[[0-9;]*m/g, "").trimEnd());
  const find = (re) => lines.find((l) => re.test(l));
  const refused = find(/access token is invalid|bad credentials|token (has )?expired|invalid[_ ]?token|\b401\b[^\n]*(token|credential|unauthori[sz]ed)/i);
  if (refused) return "a token was refused (" + clip(refused, 140) + "): renew that secret in GitHub Settings > Secrets and variables > Actions";
  const broken = lines.filter((l) => /^broken: \S+ -> \S+/.test(l));
  if (broken.length) return broken.length + " links point to pages that do not exist (" + clip(broken[0].slice(8), 140) + "): build the missing pages, or drop the links, then run it again on main";
  const memory = find(/memory limit|heap out of memory|ENOMEM|killed.*signal 9/i);
  if (memory) return "ran out of memory (" + clip(memory, 120) + "): raise the job's memory or read less at once";
  const limited = find(/\b429\b|rate limit|quota exceeded/i);
  if (limited) return "hit a rate limit (" + clip(limited, 120) + "): it should pass on the next run; if not, slow it down";
  const timeout = find(/timed out|ETIMEDOUT|exceeded the maximum execution time/i);
  if (timeout) return "timed out (" + clip(timeout, 120) + ")";
  const end = lines.findIndex((l) => /##\[error\]/.test(l));
  const before = lines.slice(0, end < 0 ? lines.length : end).filter((l) => l.trim() && !/^##\[/.test(l));
  return before.length ? "failed: " + clip(before[before.length - 1], 180) : "failed with no readable cause in its log";
}

// Secret scanning alerts from the last week and critical Dependabot alerts are problems; the rest are counts.
function security({ secrets, dependabot, code }, now) {
  const problems = [];
  const rows = [];
  const sev = (list, field) => list.reduce((acc, a) => { const s = field(a) || "unknown"; acc[s] = (acc[s] || 0) + 1; return acc; }, {});
  const tally = (counts) => ["critical", "high", "medium", "low"].filter((s) => counts[s]).map((s) => counts[s] + " " + s).join(", ") || "none";
  if (Array.isArray(secrets)) {
    const fresh = secrets.filter((a) => now - Date.parse(a.created_at) < 7 * DAY);
    if (fresh.length) problems.push({ job: "Secret scanning", why: fresh.length + " new leaked secret" + (fresh.length === 1 ? "" : "s") + " (" + clip(fresh.map((a) => a.secret_type_display_name).join(", "), 80) + "): revoke and rotate it, then close the alert" });
    rows.push({ label: "Secret scanning", value: secrets.length + " open" });
  } else rows.push({ label: "Secret scanning", value: "not readable by the GitHub App (needs Secret scanning alerts: read)" });
  if (Array.isArray(dependabot)) {
    const counts = sev(dependabot, (a) => a.security_advisory && a.security_advisory.severity);
    if (counts.critical) problems.push({ job: "Dependabot", why: counts.critical + " critical alert" + (counts.critical === 1 ? "" : "s") + ": merge its Dependabot PR or bump the package" });
    rows.push({ label: "Dependabot", value: tally(counts) });
  } else rows.push({ label: "Dependabot", value: "not readable by the GitHub App (needs Dependabot alerts: read)" });
  if (Array.isArray(code)) rows.push({ label: "Code scanning", value: tally(sev(code, (a) => a.rule && (a.rule.security_severity_level || a.rule.severity))) });
  else rows.push({ label: "Code scanning", value: "not readable by the GitHub App (needs Code scanning alerts: read)" });
  return { problems, rows };
}

function stalePrs(prs, now) {
  const old = (prs || []).filter((p) => !p.draft && now - Date.parse(p.created_at) > STALE_PR_DAYS * DAY);
  const bots = old.filter((p) => /^dependabot\//.test((p.head && p.head.ref) || ""));
  const people = old.filter((p) => !bots.includes(p));
  const list = (l) => l.slice(0, 8).map((p) => "#" + p.number).join(", ") + (l.length > 8 ? " and " + (l.length - 8) + " more" : "");
  return {
    label: "PRs open over " + STALE_PR_DAYS + " days",
    value: old.length ? [people.length ? people.length + " from chats (" + list(people) + ")" : "", bots.length ? bots.length + " from Dependabot (" + list(bots) + ")" : ""].filter(Boolean).join("; ") : "none"
  };
}

async function run({ fetch, token, now }) {
  if (!token) return { problems: [], rows: [{ label: "System review", value: "no GitHub token" }] };
  const headers = { Authorization: "Bearer " + token, Accept: "application/vnd.github+json", "User-Agent": "qa-lab-jarvis", "X-GitHub-Api-Version": "2022-11-28" };
  const get = async (path) => {
    const res = await fetch("https://api.github.com/repos/" + REPO + path, { headers, signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw Object.assign(new Error("GitHub " + path + " answered " + res.status), { status: res.status });
    return res.json();
  };
  const orNull = (p) => p.catch((error) => { if (error.status === 403 || error.status === 404) return null; throw error; });
  const problems = [];
  const rows = [];

  const runs = await get("/actions/runs?branch=main&status=completed&per_page=100");
  const newest = new Map();
  // Dependabot's update runs (event "dynamic") each carry their own name, so no later run ever replaces a failed one;
  // its alert counts below stand for them.
  (runs.workflow_runs || []).forEach((r) => { if (r.event !== "dynamic" && !["cancelled", "skipped"].includes(r.conclusion) && !newest.has(r.name)) newest.set(r.name, r); });
  const failing = Array.from(newest.values()).filter((r) => ["failure", "timed_out"].includes(r.conclusion) && now - Date.parse(r.updated_at) < 2 * DAY);
  for (const r of failing.slice(0, MAX_LOGS)) {
    let cause = "failed";
    try {
      const job = ((await get("/actions/runs/" + r.id + "/jobs?filter=latest")).jobs || []).find((j) => j.conclusion === "failure");
      if (job) {
        const res = await fetch("https://api.github.com/repos/" + REPO + "/actions/jobs/" + job.id + "/logs", { headers, signal: AbortSignal.timeout(20000) });
        cause = res.ok ? causeOf(await res.text()) : "failed (its log answered " + res.status + ")";
        const step = (job.steps || []).find((s) => s.conclusion === "failure");
        if (step) cause = "step \"" + clip(step.name, 60) + "\": " + cause;
      }
    } catch (error) {
      cause = "failed (its log could not be read: " + clip(error.message, 80) + ")";
    }
    problems.push({ job: r.name, why: clip(cause, 320) + " " + r.html_url });
  }
  rows.push({ label: "Workflows on main", value: newest.size + " seen, " + failing.length + " failing" });

  const [secrets, dependabot, code, prs] = await Promise.all([
    orNull(get("/secret-scanning/alerts?state=open&per_page=100")),
    orNull(get("/dependabot/alerts?state=open&per_page=100")),
    orNull(get("/code-scanning/alerts?state=open&per_page=100")),
    get("/pulls?state=open&per_page=100").catch(() => null)
  ]);
  const sec = security({ secrets, dependabot, code }, now);
  problems.push(...sec.problems);
  rows.push(...sec.rows);
  if (prs) rows.push(stalePrs(prs, now));
  return { problems, rows };
}

module.exports = { causeOf, security, stalePrs, run, STALE_PR_DAYS };
