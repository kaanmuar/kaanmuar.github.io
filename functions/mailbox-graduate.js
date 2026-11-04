/* Warmed-up mailbox graduation (#2382, part of #2379). The four Microsoft 365 mailboxes on the secondary
   domains started Instantly warm-up on 2026-11-03. From DUE, mailboxGraduate (functions/index.js) checks them
   once a day through the Instantly API:

   ready   connected, warm-up on, health score >= HEALTH_MIN and at least MIN_SENT warm-up mails sent: its daily
           limit goes to DAILY_LIMIT and it joins every campaign that has not finished
   held    anything else: it stays out and is checked again the next day

   Carlos gets a push, a mail and a comment on #2379 whenever a mailbox joins, and once more if any is still held
   GIVE_UP_DAYS after DUE; then the job stops. Warm-up itself keeps running in Instantly. */

const INSTANTLY = "https://api.instantly.ai/api/v2/";
const MAILBOXES = ["carlos@getqalabreview.com", "munoz@getqalabreview.com", "carlos@tryqalabreview.com", "munoz@tryqalabreview.com"];
const DUE = "2026-11-24";
const GIVE_UP_DAYS = 14;
const HEALTH_MIN = 90;
const MIN_SENT = 50;
const DAILY_LIMIT = 20;
const TICKET = 2379;
// Instantly campaign status: 0 draft, 1 active, 2 paused; 3 completed and the negative ones (unhealthy,
// bounce protection, suspended) are left alone.
const OPEN_CAMPAIGNS = [0, 1, 2];
const DAY = 24 * 60 * 60 * 1000;

function assess(accounts, analytics, done) {
  const byEmail = new Map((accounts || []).map((a) => [String(a.email).toLowerCase(), a]));
  const ready = [];
  const held = [];
  MAILBOXES.filter((email) => !(done || []).includes(email)).forEach((email) => {
    const a = byEmail.get(email);
    const w = (analytics || {})[email] || {};
    const score = Number(w.health_score);
    const sent = Number(w.sent) || 0;
    if (!a) held.push({ email, why: "not connected to Instantly" });
    else if (a.status !== 1) held.push({ email, why: "account status " + a.status + ", not active" });
    else if (a.warmup_status !== 1) held.push({ email, why: "warm-up is off" });
    else if (!(score >= HEALTH_MIN)) held.push({ email, why: "warm-up health " + (Number.isFinite(score) ? score + "%" : "unknown") + ", under " + HEALTH_MIN + "%" });
    else if (sent < MIN_SENT) held.push({ email, why: sent + " warm-up mails sent, under " + MIN_SENT });
    else ready.push({ email, score, sent });
  });
  return { ready, held };
}

/** The campaigns that change: every open one, with the ready mailboxes it lacks appended to its email_list. */
function plan(campaigns, emails) {
  return (campaigns || []).filter((c) => OPEN_CAMPAIGNS.includes(c.status)).map((c) => {
    const list = c.email_list || [];
    const add = emails.filter((e) => !list.map((x) => String(x).toLowerCase()).includes(e));
    return add.length ? { id: c.id, name: c.name, email_list: list.concat(add), added: add } : null;
  }).filter(Boolean);
}

async function call(deps, method, path, body) {
  const res = await deps.fetch(INSTANTLY + path, {
    method,
    headers: Object.assign({ Authorization: "Bearer " + deps.key }, body ? { "Content-Type": "application/json" } : {}),
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000)
  });
  const text = await res.text();
  if (!res.ok) throw new Error("Instantly " + method + " " + path.split("?")[0] + ": " + res.status + " " + text.slice(0, 200));
  return text ? JSON.parse(text) : {};
}

async function campaigns(deps) {
  const out = [];
  let after = "";
  for (let page = 0; page < 20; page++) {
    const d = await call(deps, "GET", "campaigns?limit=100" + (after ? "&starting_after=" + encodeURIComponent(after) : ""));
    out.push(...(d.items || []));
    if (!d.next_starting_after || !(d.items || []).length) break;
    after = d.next_starting_after;
  }
  return out;
}

function message(title, body, lines) {
  return { kind: "alerts", title, body, lines, tab: "systems", tag: "jarvis-mailbox-graduate" };
}

function report(joined, held, changed, givingUp) {
  const title = joined.length
    ? joined.length + " warmed-up mailbox" + (joined.length > 1 ? "es" : "") + " joined the campaigns"
    : "Warm-up: " + held.length + " mailbox" + (held.length > 1 ? "es" : "") + " still not ready";
  const joinedLines = joined.map((r) => r.email + ": health " + r.score + "%, " + r.sent + " warm-up mails, daily limit " + DAILY_LIMIT);
  const heldLines = held.map((h) => h.email + ": " + h.why);
  const next = givingUp
    ? "Jarvis stops checking now. Look at these mailboxes in Instantly and add them by hand when they recover."
    : held.length ? "Jarvis checks the held ones again tomorrow." : "All four mailboxes are in; the job is done.";
  const lines = joinedLines.concat(heldLines.map((l) => "Held: " + l));
  return {
    push: message(title, joined.length ? "Added to " + changed + " campaign" + (changed === 1 ? "" : "s") + ". " + next : next, lines.slice(0, 6)),
    mail: {
      subject: title,
      eyebrow: "Jarvis",
      intro: (joined.length ? "Added to " + changed + " open campaign" + (changed === 1 ? "" : "s") + " in Instantly. " : "") + next,
      rows: lines.map((l, i) => ({ label: i < joinedLines.length ? "Joined" : "Held", value: l.replace(/^Held: /, "") })),
      respondUrl: "https://github.com/kaanmuar/kaanmuar.github.io/issues/" + TICKET,
      buttonLabel: "Open #" + TICKET
    },
    comment: "**" + title + "** (found by `mailboxGraduate`, #2382)\n\n"
      + (joined.length ? "Added to " + changed + " open campaign" + (changed === 1 ? "" : "s") + ".\n\n" : "")
      + lines.map((l) => "- " + l).join("\n") + "\n\n" + next
  };
}

/**
 * One daily run. deps: { fetch, key, now, state, notify(report) }. Returns { state, note }; the caller stores
 * state (done: the mailboxes that joined, finished: the job stopped).
 */
async function run(deps) {
  const state = Object.assign({ done: [] }, deps.state);
  const now = deps.now || Date.now();
  if (state.finished) return { state, note: "finished " + state.finished };
  if (now < Date.parse(DUE + "T00:00:00-05:00")) return { state, note: "waiting until " + DUE };
  if (!deps.key) throw new Error("INSTANTLY_API_KEY is not set.");
  const accounts = (await call(deps, "GET", "accounts?limit=100")).items || [];
  const analytics = (await call(deps, "POST", "accounts/warmup-analytics", { emails: MAILBOXES })).aggregate_data || {};
  const { ready, held } = assess(accounts, analytics, state.done);
  const emails = ready.map((r) => r.email);
  const changes = emails.length ? plan(await campaigns(deps), emails) : [];
  for (const email of emails) await call(deps, "PATCH", "accounts/" + encodeURIComponent(email), { daily_limit: DAILY_LIMIT });
  for (const c of changes) await call(deps, "PATCH", "campaigns/" + c.id, { email_list: c.email_list });
  state.done = state.done.concat(emails);
  state.checkedAt = new Date(now).toISOString();
  state.held = held;
  const givingUp = held.length > 0 && now >= Date.parse(DUE + "T00:00:00-05:00") + GIVE_UP_DAYS * DAY;
  if (!held.length || givingUp) state.finished = new Date(now).toISOString();
  if (emails.length || givingUp) await deps.notify(report(ready, held, changes.length, givingUp));
  return { state, note: emails.length + " joined " + changes.length + " campaigns, " + held.length + " held" + (state.finished ? ", finished" : "") };
}

module.exports = { MAILBOXES, DUE, HEALTH_MIN, MIN_SENT, DAILY_LIMIT, TICKET, GIVE_UP_DAYS, assess, plan, report, run };
