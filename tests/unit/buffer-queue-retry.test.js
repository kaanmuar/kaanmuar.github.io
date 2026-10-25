const test = require("node:test");
const assert = require("node:assert");
const { gql } = require("../../scripts/buffer-queue");

function replies(...list) {
  const calls = [];
  const request = async () => {
    const [status, body, retryAfter] = list[Math.min(calls.length, list.length - 1)];
    calls.push(status);
    return { ok: status < 400, status, headers: { get: (name) => (name === "retry-after" && retryAfter != null ? String(retryAfter) : null) }, json: async () => body };
  };
  return { calls, request };
}

const limited = (window) => [429, { errors: [{ message: "Too many requests", extensions: Object.assign({ code: "RATE_LIMIT_EXCEEDED" }, window ? { window } : {}) }] }];

test("a 429 on the 15-minute window waits and retries", async () => {
  const waits = [];
  const { calls, request } = replies([...limited("15m"), 90], [200, { data: { ok: 1 } }]);
  const data = await gql("query { ok }", {}, { request, sleep: async (ms) => waits.push(ms) });
  assert.deepStrictEqual(data, { ok: 1 });
  assert.deepStrictEqual(calls, [429, 200]);
  assert.deepStrictEqual(waits, [90e3]);
});

test("a 429 without a window backs off 30, 60 and 120 s, then fails", async () => {
  const waits = [];
  const { calls, request } = replies(limited());
  await assert.rejects(gql("query { ok }", {}, { request, sleep: async (ms) => waits.push(ms) }), /Buffer 429/);
  assert.strictEqual(calls.length, 4);
  assert.deepStrictEqual(waits, [30e3, 60e3, 120e3]);
});

test("a 429 on the daily window fails at once as spent", async () => {
  const { calls, request } = replies([...limited("1d"), 7200]);
  await assert.rejects(gql("query { ok }", {}, { request, sleep: async () => assert.fail("no wait") }), (error) => error.spent && /1d limit is spent; it frees up in 2 h/.test(error.message));
  assert.strictEqual(calls.length, 1);
});

test("other errors are not retried", async () => {
  const { calls, request } = replies([400, { errors: [{ message: "bad", extensions: { code: "BAD_USER_INPUT" } }] }]);
  await assert.rejects(gql("query { ok }", {}, { request }), (error) => error.code === "BAD_USER_INPUT" && !error.spent);
  assert.strictEqual(calls.length, 1);
});
