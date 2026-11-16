/**
 * HTTPS client for QA-lab soft preview + report open (#3480).
 *
 * Soft preview streams on reviewRun; report open lives on reviewUrl.
 * Local: both paths on http://127.0.0.1:8768 (scripts/url-review-server.js).
 *
 * Env:
 *   QA_LAB_RUN_URL      reviewRun base (default production reviewRun)
 *   QA_LAB_REVIEW_URL   reviewUrl base (default production reviewUrl); local: same as RUN
 *   QA_LAB_SESSION      optional signed-in session for full /review/open
 *   QA_LAB_DEVICE_KEY   optional device key paired with the session
 *   QA_LAB_DEVICE_ID    optional hex device id for soft-preview identity
 *   QA_LAB_TURNSTILE    optional Turnstile token (prod soft-preview when Siteverify is on)
 *   QA_LAB_MCP_KEY      shared secret (≥24 chars); skips Turnstile, soft quota still applies (#3480 A)
 */
"use strict";

import crypto from "node:crypto";

const PROD_RUN = "https://us-central1-carlosm-interactive-cv.cloudfunctions.net/reviewRun";
const PROD_URL = "https://us-central1-carlosm-interactive-cv.cloudfunctions.net/reviewUrl";
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36";

function stripSlash(url) {
  return String(url || "").replace(/\/$/, "");
}

function runBase(env = process.env) {
  if (env.QA_LAB_RUN_URL) return stripSlash(env.QA_LAB_RUN_URL);
  // One local base serves both routes.
  if (env.QA_LAB_REVIEW_URL && /127\.0\.0\.1|localhost/.test(env.QA_LAB_REVIEW_URL)) {
    return stripSlash(env.QA_LAB_REVIEW_URL);
  }
  return PROD_RUN;
}

function reviewBase(env = process.env) {
  if (env.QA_LAB_REVIEW_URL) return stripSlash(env.QA_LAB_REVIEW_URL);
  if (env.QA_LAB_RUN_URL && /127\.0\.0\.1|localhost/.test(env.QA_LAB_RUN_URL)) {
    return stripSlash(env.QA_LAB_RUN_URL);
  }
  return PROD_URL;
}

function deviceId(env = process.env) {
  const own = String(env.QA_LAB_DEVICE_ID || "").replace(/[^a-f0-9]/g, "").slice(0, 32);
  return own || crypto.randomBytes(8).toString("hex");
}

function textResult(payload, isError = false) {
  return {
    content: [{ type: "text", text: typeof payload === "string" ? payload : JSON.stringify(payload, null, 2) }],
    isError
  };
}

async function readNdjson(res) {
  const raw = await res.text();
  let last = null;
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      last = JSON.parse(trimmed);
    } catch {
      /* keep scanning */
    }
  }
  return last;
}

async function previewUrl(url, env = process.env, fetchImpl = fetch) {
  const target = String(url || "").trim();
  if (!target) return textResult("Missing url.", true);
  const body = {
    url: target,
    lang: "en",
    pageLang: "en",
    // humanCheck: openedAt must be 1.2s–12h before the request.
    openedAt: Date.now() - 5000,
    runId: crypto.randomBytes(8).toString("hex"),
    deviceId: deviceId(env),
    turnstileToken: env.QA_LAB_TURNSTILE || ""
  };
  if (env.QA_LAB_SESSION) body.session = env.QA_LAB_SESSION;
  if (env.QA_LAB_DEVICE_KEY) body.deviceKey = env.QA_LAB_DEVICE_KEY;
  const headers = {
    "content-type": "application/json",
    accept: "application/x-ndjson, application/json",
    "user-agent": BROWSER_UA
  };
  if (env.QA_LAB_MCP_KEY) headers["x-qa-lab-mcp-key"] = env.QA_LAB_MCP_KEY;
  const res = await fetchImpl(runBase(env) + "/review/preview", {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    return textResult({
      error: err.error || ("HTTP " + res.status),
      code: err.code || "",
      softLeft: err.softLeft,
      softCap: err.softCap,
      needTurnstile: !!err.needTurnstile,
      hint: err.code === "soft-turnstile"
        ? "Set QA_LAB_MCP_KEY to the server secret (skips Turnstile; soft quota still applies). See #3480 A."
        : undefined
    }, true);
  }
  const type = String(res.headers.get("content-type") || "");
  const done = type.includes("ndjson") ? await readNdjson(res) : await res.json();
  if (!done || done.type === "error") {
    return textResult({ error: (done && done.error) || "The preview failed." }, true);
  }
  const report = done.report || done;
  return textResult({
    id: report.id,
    host: report.host,
    softPreview: true,
    softLeft: done.softLeft,
    softCap: done.softCap,
    frameworks: done.frameworks || report.frameworks || [],
    report
  });
}

async function getReport(id, env = process.env, fetchImpl = fetch) {
  const reportId = String(id || "").replace(/[^a-f0-9]/g, "").slice(0, 32);
  if (!reportId) return textResult("Missing report id.", true);
  const body = { id: reportId };
  if (env.QA_LAB_SESSION) body.session = env.QA_LAB_SESSION;
  if (env.QA_LAB_DEVICE_KEY) body.deviceKey = env.QA_LAB_DEVICE_KEY;
  const res = await fetchImpl(reviewBase(env) + "/review/open", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      "user-agent": BROWSER_UA
    },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Locked/unpaid still return a frosted preview — surface it for the agent.
    return textResult({
      error: data.error || ("HTTP " + res.status),
      locked: !!data.locked,
      paymentRequired: !!data.paymentRequired,
      id: data.id || reportId,
      host: data.host,
      preview: data.preview || null,
      hint: data.locked
        ? "Set QA_LAB_SESSION and QA_LAB_DEVICE_KEY for the signed-in full report."
        : undefined
    }, !(data.preview));
  }
  return textResult({
    id: data.id || reportId,
    host: data.host,
    paid: data.paid,
    free: data.free,
    softPreview: data.softPreview,
    frameworks: data.frameworks || [],
    report: data.report || data.preview || null
  });
}

export {
  PROD_RUN,
  PROD_URL,
  BROWSER_UA,
  runBase,
  reviewBase,
  previewUrl,
  getReport,
  readNdjson,
  textResult
};
