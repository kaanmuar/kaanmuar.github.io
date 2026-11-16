/**
 * HTTPS client for QA-lab soft preview + report open (#3480).
 * Default base: production reviewUrl Cloud Function.
 *
 * Env:
 *   QA_LAB_REVIEW_URL   base URL (default production; use http://127.0.0.1:8787 for local server)
 *   QA_LAB_SESSION      optional signed-in session token for full /review/open
 *   QA_LAB_DEVICE_KEY   optional device key paired with the session
 *   QA_LAB_TURNSTILE    optional Turnstile token (production soft-preview when Siteverify is on)
 *   QA_LAB_MCP_KEY      optional shared secret once product picks a Turnstile exemption (A)
 */
"use strict";

const DEFAULT_BASE = "https://us-central1-carlosm-interactive-cv.cloudfunctions.net/reviewUrl";

function baseUrl(env = process.env) {
  return String(env.QA_LAB_REVIEW_URL || DEFAULT_BASE).replace(/\/$/, "");
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

async function previewUrl(url, env = process.env) {
  const target = String(url || "").trim();
  if (!target) return textResult("Missing url.", true);
  const body = {
    url: target,
    lang: "en",
    pageLang: "en",
    turnstileToken: env.QA_LAB_TURNSTILE || "",
    deviceId: String(env.QA_LAB_DEVICE_ID || "").replace(/[^a-f0-9]/g, "").slice(0, 32)
  };
  if (env.QA_LAB_SESSION) body.session = env.QA_LAB_SESSION;
  const headers = { "content-type": "application/json", accept: "application/x-ndjson, application/json" };
  if (env.QA_LAB_MCP_KEY) headers["x-qa-lab-mcp-key"] = env.QA_LAB_MCP_KEY;
  const res = await fetch(baseUrl(env) + "/review/preview", {
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
        ? "Production soft-preview needs Turnstile (or a product-approved MCP exemption). See #3480."
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

async function getReport(id, env = process.env) {
  const reportId = String(id || "").replace(/[^a-f0-9]/g, "").slice(0, 32);
  if (!reportId) return textResult("Missing report id.", true);
  const body = { id: reportId };
  if (env.QA_LAB_SESSION) body.session = env.QA_LAB_SESSION;
  if (env.QA_LAB_DEVICE_KEY) body.deviceKey = env.QA_LAB_DEVICE_KEY;
  const res = await fetch(baseUrl(env) + "/review/open", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return textResult({
      error: data.error || ("HTTP " + res.status),
      locked: !!data.locked,
      paymentRequired: !!data.paymentRequired,
      id: data.id || reportId,
      host: data.host,
      preview: data.preview || null,
      hint: data.locked
        ? "Set QA_LAB_SESSION (and QA_LAB_DEVICE_KEY if needed) for the signed-in full report."
        : undefined
    }, true);
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

export { DEFAULT_BASE, baseUrl, previewUrl, getReport, readNdjson, textResult };
