const test = require("node:test");
const assert = require("node:assert");
const crypto = require("crypto");
const githubApp = require("../../functions/github-app");

const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const pem = privateKey.export({ type: "pkcs8", format: "pem" });
const env = { GITHUB_APP_ID: "Iv1.abc", GITHUB_APP_PRIVATE_KEY: Buffer.from(pem).toString("base64"), GITHUB_BUGS_TOKEN: "gho_fallback" };
const NOW = Date.parse("2026-10-27T06:00:00Z");

function fakeGitHub({ repoInstalled = true } = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const path = url.replace("https://api.github.com", "");
    const jwt = init.headers.Authorization.replace("Bearer ", "");
    calls.push({ path, method: init.method, jwt });
    const reply = (status, body) => ({ ok: status < 300, status, json: async () => body });
    if (path === "/repos/kaanmuar/kaanmuar.github.io/installation") return repoInstalled ? reply(200, { id: 11 }) : reply(404, { message: "Not Found" });
    if (path === "/orgs/carlosandmunoz-hq/installation") return reply(200, { id: 22 });
    const minted = path.match(/^\/app\/installations\/(\d+)\/access_tokens$/);
    if (minted && init.method === "POST") return reply(201, { token: "ghs_" + minted[1], expires_at: new Date(NOW + 3600000).toISOString() });
    return reply(404, { message: "Not Found" });
  };
  return { calls, fetchImpl };
}

test.beforeEach(() => githubApp.reset());

test("mints a repo token with a JWT signed by the app key and caches it until five minutes before expiry", async () => {
  const gh = fakeGitHub();
  assert.strictEqual(await githubApp.token("repo", { fetchImpl: gh.fetchImpl, env, now: NOW }), "ghs_11");
  const [head, body, sig] = gh.calls[0].jwt.split(".");
  assert.ok(crypto.verify("RSA-SHA256", Buffer.from(head + "." + body), publicKey, Buffer.from(sig, "base64url")));
  assert.strictEqual(JSON.parse(Buffer.from(body, "base64url")).iss, "Iv1.abc");
  assert.deepStrictEqual(gh.calls.map((c) => c.method + " " + c.path), ["GET /repos/kaanmuar/kaanmuar.github.io/installation", "POST /app/installations/11/access_tokens"]);
  await githubApp.token("repo", { fetchImpl: gh.fetchImpl, env, now: NOW + 50 * 60000 });
  assert.strictEqual(gh.calls.length, 2);
  await githubApp.token("repo", { fetchImpl: gh.fetchImpl, env, now: NOW + 56 * 60000 });
  assert.strictEqual(gh.calls.length, 4);
});

test("the board scope uses the org installation", async () => {
  const gh = fakeGitHub();
  assert.strictEqual(await githubApp.token("board", { fetchImpl: gh.fetchImpl, env, now: NOW }), "ghs_22");
});

test("without the app key both scopes use GITHUB_BUGS_TOKEN", async () => {
  const gh = fakeGitHub();
  assert.strictEqual(await githubApp.token("repo", { fetchImpl: gh.fetchImpl, env: { GITHUB_BUGS_TOKEN: "gho_fallback" }, now: NOW }), "gho_fallback");
  assert.strictEqual(await githubApp.token("board", { fetchImpl: gh.fetchImpl, env: {}, now: NOW }), "");
  assert.strictEqual(gh.calls.length, 0);
});

test("a raw PEM with escaped newlines works as the key", async () => {
  const gh = fakeGitHub();
  const raw = Object.assign({}, env, { GITHUB_APP_PRIVATE_KEY: pem.replace(/\n/g, "\\n") });
  assert.strictEqual(await githubApp.token("repo", { fetchImpl: gh.fetchImpl, env: raw, now: NOW }), "ghs_11");
});

test("while the app is not installed on the repo, the repo scope falls back and waits ten minutes before asking again", async () => {
  const gh = fakeGitHub({ repoInstalled: false });
  const warn = console.warn;
  console.warn = () => {};
  try {
    assert.strictEqual(await githubApp.token("repo", { fetchImpl: gh.fetchImpl, env, now: NOW }), "gho_fallback");
    assert.strictEqual(await githubApp.token("repo", { fetchImpl: gh.fetchImpl, env, now: NOW + 5 * 60000 }), "gho_fallback");
    assert.strictEqual(gh.calls.length, 1);
    await githubApp.token("repo", { fetchImpl: gh.fetchImpl, env, now: NOW + 11 * 60000 });
    assert.strictEqual(gh.calls.length, 2);
  } finally {
    console.warn = warn;
  }
});
