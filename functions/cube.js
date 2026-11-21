/**
 * The Cube's queue (#1935): a run is a url_review_runs document. Creating one starts the
 * cube-runner Cloud Run job (runner/), which reads the review's cases, runs them, and
 * writes the summary, one row per case, and the log back onto the same document.
 */
const RUNS = "url_review_runs";
const RUNNABLE = ["Playwright"];
const JOB = { project: "carlosm-interactive-cv", region: "us-central1", name: "cube-runner" };
const SOURCES = ["jarvis", "checkout", "sample", "schedule"];
const SHOWN = ["checkout", "sample", "schedule"];
const SAMPLES = "url_review_run_samples";
const SAMPLE_SIZE = 5;

const queue = (db) => db.collection(RUNS);

function cleanFrameworks(list) {
  const asked = (Array.isArray(list) ? list : [list]).map((fw) => String(fw || "").trim()).filter(Boolean);
  const chosen = RUNNABLE.filter((fw) => asked.some((name) => name.toLowerCase() === fw.toLowerCase()));
  return chosen.length ? chosen : RUNNABLE.slice(0, 1);
}

async function enqueue(db, { reviewId, frameworks, source, token, email, limit }, by, now) {
  const id = String(reviewId || "").trim();
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(id)) throw new Error("That is not a report id.");
  const review = await db.collection("url_reviews").doc(id).get();
  const report = review.exists ? review.data().report : null;
  const cases = (report && report.cases) || [];
  if (!cases.length) throw new Error("Report " + id + " has no cases to run.");
  const cap = Math.max(0, Math.floor(Number(limit) || 0));
  const row = {
    reviewId: id,
    host: String(report.host || ""),
    frameworks: cleanFrameworks(frameworks),
    cases: cap ? Math.min(cap, cases.length) : cases.length,
    source: SOURCES.indexOf(source) === -1 ? "jarvis" : source,
    by: String(by || ""),
    email: String(email || "").slice(0, 200),
    token: String(token || "").slice(0, 4096),
    status: "queued",
    at: new Date(now).toISOString()
  };
  if (cap) row.limit = cap;
  const ref = await queue(db).add(row);
  return { id: ref.id, reviewId: id, host: row.host, frameworks: row.frameworks, cases: row.cases };
}

// One free sample per site per UTC day (#1945), whoever runs it: the lock is created, never overwritten.
function sampleKey(host, now) {
  return String(host || "").toLowerCase().replace(/[^a-z0-9.-]/g, "") + "~" + new Date(now).toISOString().slice(0, 10);
}

function nextSampleAt(now) {
  const day = new Date(now);
  return new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate() + 1)).toISOString();
}

async function startSample(db, { reviewId, host, email }, now) {
  const lock = db.collection(SAMPLES).doc(sampleKey(host, now));
  try {
    await lock.create({ reviewId, email, at: new Date(now).toISOString() });
  } catch (error) {
    if (error && (error.code === 6 || /already exists/i.test(String(error.message)))) return { used: true, next: nextSampleAt(now) };
    throw error;
  }
  try {
    const run = await enqueue(db, { reviewId, source: "sample", email, limit: SAMPLE_SIZE }, email, now);
    await lock.update({ runId: run.id });
    return run;
  } catch (error) {
    await lock.delete().catch(() => {});
    throw error;
  }
}

// A failed sample gives the day back, so the reader can try again.
async function releaseSample(db, run, id) {
  if (run.source !== "sample" || run.status !== "failed") return false;
  const lock = db.collection(SAMPLES).doc(sampleKey(run.host, Date.parse(run.at)));
  const snap = await lock.get();
  if (!snap.exists || (snap.data() || {}).runId !== id) return false;
  await lock.delete();
  return true;
}

// What the report's owner sees of a run: no push token, no operator, no Cloud Run execution name.
function customerView(id, d) {
  return {
    id, status: d.status, source: d.source, host: d.host, frameworks: d.frameworks || [], cases: d.cases || 0,
    only: d.only || null, at: d.at, startedAt: stamp(d.startedAt), finishedAt: stamp(d.finishedAt),
    log: Array.isArray(d.log) ? d.log : [], summary: d.summary || null,
    results: Array.isArray(d.cases) ? d.cases.map((row) => ({ id: row.id, title: row.title, status: row.status, ms: row.ms, layer: row.layer, review: row.review, triage: row.triage || "", error: row.error || "" })) : null,
    error: d.error || ""
  };
}

function stamp(value) {
  if (!value) return "";
  if (typeof value.toDate === "function") return value.toDate().toISOString();
  return String(value);
}

async function latestFor(db, reviewId) {
  const snap = await queue(db).where("reviewId", "==", reviewId).limit(20).get();
  const runs = snap.docs.map((doc) => ({ id: doc.id, d: doc.data() })).filter((row) => SHOWN.indexOf(row.d.source) !== -1);
  runs.sort((a, b) => String(b.d.at).localeCompare(String(a.d.at)));
  return runs.length ? customerView(runs[0].id, runs[0].d) : null;
}

async function sampleState(db, host, now) {
  if (!host) return { used: false, next: nextSampleAt(now) };
  const snap = await db.collection(SAMPLES).doc(sampleKey(host, now)).get();
  return { used: snap.exists, next: nextSampleAt(now) };
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

module.exports = { RUNS, RUNNABLE, JOB, SAMPLES, SAMPLE_SIZE, cleanFrameworks, enqueue, sampleKey, nextSampleAt, startSample, releaseSample, customerView, latestFor, sampleState, jobUrl, startJob, finished, doneMessage, recent };
