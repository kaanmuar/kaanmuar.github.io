/**
 * Gemini for Jarvis and engagement (#3189): Vertex AI first on Google Cloud, the AI Studio key as the fallback, GEMINI_VIA=studio
 * for key first with Vertex on 402 or 429, and the Jarvis and engagement callers on that path.
 *
 *   node --test tests/unit/gemini.test.js
 */
const test = require("node:test");
const assert = require("node:assert/strict");

const Gemini = require("../../functions/gemini");
const jarvis = require("../../functions/jarvis");
const jarvisEngagement = require("../../functions/jarvis-engagement");

const CLOUD = { K_SERVICE: "jarvis" };
const json = (status, body) => ({ ok: status < 400, status, json: async () => body });
const answer = (text) => json(200, { candidates: [{ content: { parts: [{ text: "thinking", thought: true }, { text }] }, finishReason: "STOP" }] });

// Answers by host: the metadata server's token, then Vertex and AI Studio with the given statuses.
function net(vertexStatus, studioStatus) {
  const calls = [];
  const fetch = async (url, opts) => {
    calls.push({ url, headers: (opts || {}).headers || {}, body: opts && opts.body ? JSON.parse(opts.body) : null });
    if (url.startsWith("http://metadata.google.internal/")) return json(200, { access_token: "meta-token", expires_in: 3600 });
    const status = url.includes("aiplatform.googleapis.com") ? vertexStatus : studioStatus;
    return status === 200 ? answer(url.includes("aiplatform") ? "from vertex" : "from studio") : json(status, { error: { message: "nope" } });
  };
  return { fetch, calls, hosts: () => calls.map((c) => new URL(c.url).host) };
}

const BODY = { contents: [{ role: "user", parts: [{ text: "hi" }] }] };

test("gemini: off Google Cloud only the key is used, and nothing at all without one", async () => {
  const n = net(200, 200);
  const out = await Gemini.generate(n.fetch, { GEMINI_API_KEY: "k" }, BODY);
  assert.equal(out.via, "studio");
  assert.equal(Gemini.text(out.data), "from studio");
  assert.deepEqual(n.hosts(), ["generativelanguage.googleapis.com"]);
  assert.match(n.calls[0].url, /gemini-flash-latest:generateContent$/);
  assert.equal(Gemini.ready({}), false);
  await assert.rejects(Gemini.generate(n.fetch, {}, BODY), /not configured/);
});

test("gemini: on Google Cloud Vertex goes first with the metadata token and gemini-3.8-flash", async () => {
  const n = net(200, 200);
  const out = await Gemini.generate(n.fetch, Object.assign({ GEMINI_API_KEY: "k", GEMINI_MODEL: "gemini-flash-latest" }, CLOUD), BODY);
  assert.equal(out.via, "vertex");
  assert.equal(Gemini.text(out.data), "from vertex");
  const call = n.calls.find((c) => c.url.includes("aiplatform"));
  assert.match(call.url, /projects\/carlosm-interactive-cv\/locations\/global\/publishers\/google\/models\/gemini-3\.8-flash:generateContent$/);
  assert.equal(call.headers.Authorization, "Bearer meta-token");
  assert.equal(call.headers["x-goog-api-key"], undefined);
  assert.equal(Gemini.ready(CLOUD), true);
  assert.equal(Gemini.ready(Object.assign({ GEMINI_VERTEX: "off" }, CLOUD)), false);
});

test("gemini: a failing Vertex falls over to the key, and fails when there is no key", async () => {
  for (const status of [429, 403, 500]) {
    const n = net(status, 200);
    const out = await Gemini.generate(n.fetch, Object.assign({ GEMINI_API_KEY: "k" }, CLOUD), BODY);
    assert.equal(out.via, "studio", "Vertex " + status);
  }
  await assert.rejects(Gemini.generate(net(500, 200).fetch, CLOUD, BODY), /Vertex AI Gemini answered 500/);
  await assert.rejects(Gemini.generate(net(500, 402).fetch, Object.assign({ GEMINI_API_KEY: "k" }, CLOUD), BODY), /Vertex AI Gemini answered 500: nope; then Gemini answered 402/);
});

test("gemini: GEMINI_VIA=studio puts the key first and uses Vertex only on 402 or 429", async () => {
  const env = Object.assign({ GEMINI_API_KEY: "k", GEMINI_VIA: "studio" }, CLOUD);
  assert.equal((await Gemini.generate(net(200, 200).fetch, env, BODY)).via, "studio");
  assert.equal((await Gemini.generate(net(200, 402).fetch, env, BODY)).via, "vertex");
  assert.equal((await Gemini.generate(net(200, 429).fetch, env, BODY)).via, "vertex");
  await assert.rejects(Gemini.generate(net(200, 500).fetch, env, BODY), /Gemini answered 500/);
});

test("gemini: useToken reaches Vertex off Google Cloud, as with gcloud auth print-access-token", async () => {
  Gemini.useToken(async () => "gcloud-token");
  try {
    const n = net(200, 200);
    const out = await Gemini.generate(n.fetch, {}, BODY);
    assert.equal(out.via, "vertex");
    assert.equal(n.calls[0].headers.Authorization, "Bearer gcloud-token");
    assert.equal(Gemini.ready({}), true);
  } finally {
    Gemini.useToken(null);
  }
});

test("gemini: Jarvis's briefing and engagement's JSON calls go to Vertex on Google Cloud, to the key when Vertex fails", async () => {
  const brief = net(200, 200);
  assert.equal((await jarvis.brief(brief.fetch, Object.assign({ GEMINI_API_KEY: "k" }, CLOUD), { range: "7" })).text, "from vertex");
  assert.equal(brief.calls.find((c) => c.url.includes("aiplatform")).body.systemInstruction.parts[0].text.startsWith("You are Jarvis"), true);
  const down = net(503, 200);
  assert.equal((await jarvis.brief(down.fetch, Object.assign({ GEMINI_API_KEY: "k" }, CLOUD), { range: "7" })).text, "from studio");
  const spent = net(200, 402);
  assert.equal((await jarvis.brief(spent.fetch, CLOUD, { range: "7" })).text, "from vertex");
  await assert.rejects(jarvis.brief(spent.fetch, {}, {}), /GEMINI_API_KEY/);

  const eng = net(200, 402);
  assert.equal(await jarvisEngagement.geminiJson(eng.fetch, Object.assign({ GEMINI_API_KEY: "k" }, CLOUD), "Answer in JSON"), "from vertex");
  assert.equal(eng.calls.find((c) => c.url.includes("aiplatform")).body.generationConfig.responseMimeType, "application/json");
});
