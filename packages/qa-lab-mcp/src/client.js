/**
 * HTTPS client for QA-lab soft preview, full crawl, and report open (#3480 / #3626).
 *
 * Soft preview → reviewRun /review/preview
 * Full crawl   → reviewRun /review (account API token)
 * Report open  → reviewUrl /review/open
 * Local: both paths on http://127.0.0.1:8768 (scripts/url-review-server.js).
 *
 * Env:
 *   QA_LAB_RUN_URL      reviewRun base (default production reviewRun)
 *   QA_LAB_REVIEW_URL   reviewUrl base (default production reviewUrl); local: same as RUN
 *   QA_LAB_API_TOKEN    account API token (qlat_…); required for crawl_url; unlocks get_report
 *   QA_LAB_SESSION      optional signed-in session (v1 fallback for get_report)
 *   QA_LAB_DEVICE_KEY   optional 64-hex device key (paired with session; or derived for crawl)
 *   QA_LAB_DEVICE_ID    optional hex device id for soft-preview / crawl identity
 *   QA_LAB_NAME         optional asker name for crawl (default "QA-lab MCP")
 *   QA_LAB_TURNSTILE    optional Turnstile token (prod soft-preview when Siteverify is on)
 *   QA_LAB_MCP_KEY      shared secret (≥24 chars); skips Turnstile, soft quota still applies (#3480 A)
 */
"use strict";

import crypto from "node:crypto";

const PROD_RUN = "https://us-central1-carlosm-interactive-cv.cloudfunctions.net/reviewRun";
const PROD_URL = "https://us-central1-carlosm-interactive-cv.cloudfunctions.net/reviewUrl";
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36";
const TERMS_VERSION = "2026-11-04b";

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

function deviceKey(env = process.env) {
  const own = String(env.QA_LAB_DEVICE_KEY || "").replace(/[^a-f0-9]/g, "").toLowerCase();
  if (/^[a-f0-9]{64}$/.test(own)) return own;
  const token = String(env.QA_LAB_API_TOKEN || "").trim();
  if (token) return crypto.scryptSync(token, "qa-lab-mcp-device", 32).toString("hex");
  return "";
}

function apiToken(env = process.env) {
  return String(env.QA_LAB_API_TOKEN || "").trim();
}

function authHeaders(env = process.env) {
  const headers = {
    "content-type": "application/json",
    accept: "application/x-ndjson, application/json",
    "user-agent": BROWSER_UA
  };
  const token = apiToken(env);
  if (token) {
    headers.authorization = "Bearer " + token;
    headers["x-qa-lab-api-token"] = token;
  }
  if (env.QA_LAB_MCP_KEY) headers["x-qa-lab-mcp-key"] = env.QA_LAB_MCP_KEY;
  return headers;
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
  const headers = authHeaders(env);
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

/**
 * Full crawl via POST /review. Requires QA_LAB_API_TOKEN (account token from POST /account/api-token).
 */
async function crawlUrl(url, options = {}, env = process.env, fetchImpl = fetch) {
  const target = String(url || "").trim();
  if (!target) return textResult("Missing url.", true);
  const token = apiToken(env);
  if (!token) {
    return textResult({
      error: "Full crawl needs an account API token.",
      hint: "Mint one while signed in: POST {reviewUrl}/account/api-token with session + termsAccepted, then set QA_LAB_API_TOKEN. Separate from QA_LAB_MCP_KEY (#3626)."
    }, true);
  }
  const frameworks = Array.isArray(options.frameworks) && options.frameworks.length
    ? options.frameworks
    : ["Playwright"];
  const body = {
    url: target,
    lang: "en",
    pageLang: "en",
    name: env.QA_LAB_NAME || "QA-lab MCP",
    reasonCode: options.reasonCode || "allowed",
    frameworks,
    tools: Array.isArray(options.tools) ? options.tools : [],
    pages: options.pages || 20,
    depth: options.depth || 2,
    termsAccepted: true,
    termsVersion: TERMS_VERSION,
    openedAt: Date.now() - 5000,
    runId: crypto.randomBytes(8).toString("hex"),
    deviceId: deviceId(env),
    deviceKey: deviceKey(env),
    unlisted: options.unlisted !== false
  };
  const res = await fetchImpl(runBase(env) + "/review", {
    method: "POST",
    headers: authHeaders(env),
    body: JSON.stringify(body)
  });
  const type = String(res.headers.get("content-type") || "");
  if (!res.ok || type.includes("application/json")) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    return textResult({
      error: err.error || ("HTTP " + res.status),
      paymentRequired: !!err.paymentRequired,
      purpose: err.purpose || "",
      priceUsd: err.priceUsd,
      signIn: !!err.signIn,
      fields: err.fields || [],
      hint: err.paymentRequired
        ? "Buy a run credit or pass on the web account, then retry crawl_url."
        : err.signIn
          ? "Check QA_LAB_API_TOKEN (mint via POST /account/api-token)."
          : undefined
    }, true);
  }
  const done = type.includes("ndjson") ? await readNdjson(res) : await res.json();
  if (!done || done.type === "error") {
    return textResult({ error: (done && done.error) || "The crawl failed." }, true);
  }
  const report = done.report || done;
  return textResult({
    id: report.id,
    host: report.host,
    softPreview: false,
    paid: done.paid,
    free: done.free,
    frameworks: done.frameworks || report.frameworks || frameworks,
    report
  });
}

async function getReport(id, env = process.env, fetchImpl = fetch) {
  const reportId = String(id || "").replace(/[^a-f0-9]/g, "").slice(0, 32);
  if (!reportId) return textResult("Missing report id.", true);
  const body = { id: reportId };
  if (env.QA_LAB_SESSION) body.session = env.QA_LAB_SESSION;
  if (env.QA_LAB_DEVICE_KEY) body.deviceKey = env.QA_LAB_DEVICE_KEY;
  const token = apiToken(env);
  if (token) body.apiToken = token;
  const res = await fetchImpl(reviewBase(env) + "/review/open", {
    method: "POST",
    headers: authHeaders(env),
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
        ? "Set QA_LAB_API_TOKEN (account token) or QA_LAB_SESSION + QA_LAB_DEVICE_KEY for the full report."
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
  TERMS_VERSION,
  runBase,
  reviewBase,
  previewUrl,
  crawlUrl,
  getReport,
  readNdjson,
  textResult,
  authHeaders,
  deviceKey,
  apiToken
};
