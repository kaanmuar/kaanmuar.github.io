#!/usr/bin/env node
/**
 * Runs a URL review's cases in the Cube (#1935).
 *
 *   node runner/run.js --report report.json --out /tmp/cube-run [--frameworks Playwright]
 *   RUN_ID=<id> node runner/run.js          Cloud Run job: url_review_runs/{RUN_ID} in, results and artifacts out
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const cube = require("./cube.js");

const BUCKET = process.env.CUBE_BUCKET || "carlosm-interactive-cv.firebasestorage.app";
const RUNS = "url_review_runs";
const LOG_LINES = 200;

function arg(name) {
  const at = process.argv.indexOf("--" + name);
  return at === -1 ? "" : process.argv[at + 1] || "";
}

async function local() {
  const file = arg("report");
  if (!file) throw new Error("Pass --report <file> or set RUN_ID");
  const report = JSON.parse(fs.readFileSync(file, "utf8"));
  const dir = path.resolve(arg("out") || fs.mkdtempSync(path.join(os.tmpdir(), "cube-")));
  const frameworks = arg("frameworks") ? arg("frameworks").split(",") : undefined;
  const result = await cube.run(report, { dir, frameworks, onLine: (line) => process.stdout.write(line + "\n") });
  fs.writeFileSync(path.join(dir, "cube-result.json"), JSON.stringify(result, null, 2));
  const s = result.summary;
  console.log("\n" + s.passed + " passed, " + s.failed + " failed (" + s.site + " site, " + s.test + " test, " + s.unreachable + " unreachable), " + s.flaky + " flaky, " + s.skipped + " left to a person. " + path.join(dir, "cube-result.json"));
}

async function job(runId) {
  const { initializeApp } = require("firebase-admin/app");
  const { getFirestore, FieldValue } = require("firebase-admin/firestore");
  const { getStorage } = require("firebase-admin/storage");
  initializeApp();
  const db = getFirestore();
  const ref = db.collection(RUNS).doc(runId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("No run " + runId);
  const order = snap.data();
  if (order.status !== "queued") return console.log("Run " + runId + " is " + order.status + "; nothing to do");
  const review = await db.collection("url_reviews").doc(order.reviewId).get();
  const report = review.exists && review.data().report;
  if (!report || !(report.cases || []).length) throw new Error("Review " + order.reviewId + " has no cases");

  const log = [];
  let flushed = 0;
  const flush = () => {
    if (log.length === flushed) return Promise.resolve();
    flushed = log.length;
    return ref.update({ log: log.slice(-LOG_LINES) }).catch(() => {});
  };
  const timer = setInterval(flush, 2000);
  await ref.update({ status: "running", startedAt: FieldValue.serverTimestamp() });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cube-"));
  try {
    const result = await cube.run(report, { dir, frameworks: order.frameworks, onLine: (line) => log.push(line.slice(0, 300)) });
    const bucket = getStorage().bucket(BUCKET);
    for (const row of result.cases) {
      for (const file of row.artifacts || []) {
        const dest = "url-review-runs/" + runId + "/" + row.id + "/" + path.basename(file.path);
        await bucket.upload(file.path, { destination: dest, metadata: { contentType: file.type } });
        file.path = dest;
      }
    }
    clearInterval(timer);
    await flush();
    await ref.update({ status: "done", finishedAt: FieldValue.serverTimestamp(), base: result.base, frameworks: result.frameworks, summary: result.summary, cases: result.cases });
  } catch (error) {
    clearInterval(timer);
    log.push(String(error.message || error));
    await ref.update({ status: "failed", finishedAt: FieldValue.serverTimestamp(), error: String(error.message || error).slice(0, 500), log: log.slice(-LOG_LINES) });
    throw error;
  }
}

(process.env.RUN_ID ? job(process.env.RUN_ID) : local()).catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
