"use strict";

/* Gemini for Jarvis, engagement and the review rescue (#3189).
   On Google Cloud: Gemini on Vertex AI first, billed to the Firebase project and called as the function's service account
   (roles/aiplatform.user, no key), then the AI Studio key (GEMINI_API_KEY) when Vertex fails.
   GEMINI_VIA=studio puts the key first again and falls over to Vertex only on 402 (credits spent) or 429.
   Off Google Cloud (unit tests, scripts): the key only, unless useToken() gives a token, as gcloud auth print-access-token does.

   generate(fetch, env, body, { model, vertexModel, timeoutMs, token }) -> { data, via: "vertex" | "studio" }
   text(data) -> the first candidate's answer, without thought parts */

const STUDIO_URL = "https://generativelanguage.googleapis.com/v1beta/models/";
const STUDIO_MODEL = "gemini-flash-latest";
const VERTEX_PROJECT = "carlosm-interactive-cv";
// The only Gemini model the project has on Vertex: gemini-2.5-flash and the -latest aliases answer 404.
const VERTEX_MODEL = "gemini-3.8-flash";
const VERTEX_URL = "https://aiplatform.googleapis.com/v1/projects/" + VERTEX_PROJECT + "/locations/global/publishers/google/models/";
const METADATA_TOKEN = "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token";
const SPENT = [402, 429];

let cached = null;
let tokenSource = null;

function useToken(fn) {
  tokenSource = typeof fn === "function" ? fn : null;
  cached = null;
}

async function vertexToken(fetchImpl) {
  if (tokenSource) return tokenSource();
  if (cached && cached.until > Date.now() + 60000) return cached.value;
  const res = await fetchImpl(METADATA_TOKEN, { headers: { "Metadata-Flavor": "Google" }, signal: AbortSignal.timeout(5000) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) throw new Error("The metadata server gave no token (" + res.status + ").");
  cached = { value: data.access_token, until: Date.now() + (Number(data.expires_in) || 300) * 1000 };
  return cached.value;
}

// Cloud Functions set K_SERVICE and FUNCTION_TARGET; GEMINI_VERTEX=on|off overrides.
function vertexReady(env) {
  const e = env || {};
  if (e.GEMINI_VERTEX === "off") return false;
  return !!(tokenSource || e.GEMINI_VERTEX === "on" || e.K_SERVICE || e.FUNCTION_TARGET);
}

function ready(env) {
  return !!(env || {}).GEMINI_API_KEY || vertexReady(env);
}

async function call(fetchImpl, url, headers, body, label, timeoutMs) {
  const res = await fetchImpl(url, {
    method: "POST", headers: Object.assign({ "Content-Type": "application/json" }, headers),
    body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs || 60000)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(label + " answered " + res.status + ": " + String((data.error || {}).message || "").slice(0, 160)), { status: res.status });
  return data;
}

function studio(fetchImpl, key, body, opts) {
  const o = opts || {};
  return call(fetchImpl, STUDIO_URL + (o.model || STUDIO_MODEL) + ":generateContent", { "x-goog-api-key": key }, body, "Gemini", o.timeoutMs);
}

async function vertex(fetchImpl, body, opts) {
  const o = opts || {};
  const bearer = typeof o.token === "function" ? await o.token() : await vertexToken(fetchImpl);
  return call(fetchImpl, VERTEX_URL + (o.vertexModel || VERTEX_MODEL) + ":generateContent", { Authorization: "Bearer " + bearer }, body, "Vertex AI Gemini", o.timeoutMs);
}

async function generate(fetchImpl, env, body, opts) {
  const e = env || {};
  const o = Object.assign({}, opts || {});
  o.model = o.model || e.GEMINI_MODEL;
  o.vertexModel = o.vertexModel || e.VERTEX_MODEL;
  const key = e.GEMINI_API_KEY;
  const onVertex = vertexReady(e) || typeof o.token === "function";
  if (!key && !onVertex) throw new Error("Gemini is not configured: no GEMINI_API_KEY and no Vertex AI.");
  if (!onVertex || (key && e.GEMINI_VIA === "studio")) {
    if (key) {
      try {
        return { data: await studio(fetchImpl, key, body, o), via: "studio" };
      } catch (error) {
        if (!onVertex || !SPENT.includes(error.status)) throw error;
      }
    }
    return { data: await vertex(fetchImpl, body, o), via: "vertex" };
  }
  try {
    return { data: await vertex(fetchImpl, body, o), via: "vertex" };
  } catch (error) {
    if (!key) throw error;
    try {
      return { data: await studio(fetchImpl, key, body, o), via: "studio" };
    } catch (second) {
      throw Object.assign(new Error(error.message + "; then " + second.message), { status: second.status });
    }
  }
}

function text(data) {
  const candidate = ((data || {}).candidates || [])[0] || {};
  return ((candidate.content || {}).parts || []).filter((part) => !part.thought).map((part) => part.text || "").join("");
}

const label = (via) => (via === "vertex" ? "Gemini on Vertex AI" : "Gemini");

module.exports = { generate, text, ready, vertexReady, vertex, studio, useToken, label, STUDIO_URL, STUDIO_MODEL, VERTEX_MODEL, VERTEX_URL, METADATA_TOKEN };
