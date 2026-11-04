/**
 * The Cube's queue (#1935): a run is a url_review_runs document. Creating one starts the
 * cube-runner Cloud Run job (runner/), which reads the review's cases, runs them, and
 * writes the summary, one row per case, and the log back onto the same document.
 */
const RUNS = "url_review_runs";
const RUNNABLE = ["Playwright"];
const JOB = { project: "carlosm-interactive-cv", region: "us-central1", name: "cube-runner" };
const SOURCES = ["jarvis", "checkout", "sample", "schedule"];

const queue = (db) => db.collection(RUNS);

function cleanFrameworks(list) {
  const asked = (Array.isArray(list) ? list : [list]).map((fw) => String(fw || "").trim()).filter(Boolean);
  const chosen = RUNNABLE.filter((fw) => asked.some((name) => name.toLowerCase() === fw.toLowerCase()));
  return chosen.length ? chosen : RUNNABLE.slice(0, 1);
}

async function enqueue(db, { reviewId, frameworks, source, token, email }, by, now) {
  const id = String(reviewId || "").trim();
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(id)) throw new Error("That is not a report id.");
  const review = await db.collection("url_reviews").doc(id).get();
  const report = review.exists ? review.data().report : null;
  const cases = (report && report.cases) || [];
  if (!cases.length) throw new Error("Report " + id + " has no cases to run.");
  const row = {
    reviewId: id,
    host: String(report.host || ""),
    frameworks: cleanFrameworks(frameworks),
    cases: cases.length,
    source: SOURCES.indexOf(source) === -1 ? "jarvis" : source,
    by: String(by || ""),
    email: String(email || "").slice(0, 200),
    token: String(token || "").slice(0, 4096),
    status: "queued",
    at: new Date(now).toISOString()
  };
  const ref = await queue(db).add(row);
  return { id: ref.id, reviewId: id, host: row.host, frameworks: row.frameworks, cases: row.cases };
}

function jobUrl(job) {
  const j = Object.assign({}, JOB, job);
  return "https://run.googleapis.com/v2/projects/" + j.project + "/locations/" + j.region + "/jobs/" + j.name + ":run";
}

async function startJob(fetchImpl, accessToken, runId, job) {
  const res = await fetchImpl(jobUrl(job), {
    method: "POST",
    headers: { Authorization: "Bearer " + accessToken, "Content-Type": "application/json" },
    body: JSON.stringify({ overrides: { containerOverrides: [{ env: [{ name: "RUN_ID", value: runId }] }] } })
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error("Cloud Run refused the run (" + res.status + "): " + ((body.error && body.error.message) || "no detail"));
  return String(body.name || "");
}

function finished(before, after) {
  return (before || {}).status !== (after || {}).status && ["done", "failed"].indexOf((after || {}).status) !== -1;
}

function doneMessage(run, link) {
  const tag = "cube-run-" + run.reviewId;
  if (run.status === "failed") return { kind: "review", title: "Run failed: " + run.host, body: String(run.error || "The runner stopped.").slice(0, 200), url: link, tag };
  const s = run.summary || {};
  const bits = [(s.passed || 0) + " passed", (s.failed || 0) + " failed"];
  if (s.disagree) bits.push(s.disagree + " disagree with the review");
  if (s.flaky) bits.push(s.flaky + " flaky");
  const lines = (run.cases || []).filter((row) => row.status === "failed").slice(0, 5).map((row) => (row.id + " " + row.title).slice(0, 120));
  return { kind: "review", title: "Run done: " + run.host, body: bits.join(", ") + ". Tap to open the report.", lines, url: link, tag };
}

async function recent(db, limit) {
  const snap = await queue(db).orderBy("at", "desc").limit(limit || 20).get();
  return snap.docs.map((doc) => {
    const d = doc.data();
    return { id: doc.id, reviewId: d.reviewId, host: d.host, status: d.status, frameworks: d.frameworks, source: d.source, at: d.at, summary: d.summary || null, error: d.error || "" };
  });
}

module.exports = { RUNS, RUNNABLE, JOB, cleanFrameworks, enqueue, jobUrl, startJob, finished, doneMessage, recent };
