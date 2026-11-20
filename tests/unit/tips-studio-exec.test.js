// The render's exec() (#3840) kills a call that hangs and reports it as timedOut, so speak() retries it.
// Without a timeout, one hung edge-tts request held the Live Reports publish job until the 180-minute limit.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const SRC = fs.readFileSync(path.join(__dirname, "../../scripts/tips-studio/build.js"), "utf8");

// Load exec() exactly as written in build.js, with its timeout constants.
function loadExec() {
  const start = SRC.indexOf("const EXEC_TIMEOUT_MS");
  const end = SRC.indexOf("\nasync function speak");
  assert.ok(start > 0 && end > start, "exec() and its timeout constants sit before speak() in build.js");
  return new Function("spawn", SRC.slice(start, end) + "\nreturn exec;")(spawn);
}

test("a call that runs past its timeout is killed and reports timedOut, not an error", async () => {
  const exec = loadExec();
  const t = Date.now();
  const run = await exec("sleep", ["30"], 500);
  assert.equal(run.timedOut, true);
  assert.equal(run.status, null);
  assert.equal(run.error, undefined);
  assert.match(run.stderr, /timed out after 0\.5s/);
  assert.ok(Date.now() - t < 10_000, "returned at the timeout, not when the child would have exited");
});

test("a call that finishes in time keeps its status and output", async () => {
  const exec = loadExec();
  const run = await exec("node", ["-e", 'process.stdout.write("ok")'], 10_000);
  assert.equal(run.status, 0);
  assert.equal(run.timedOut, undefined);
});

test("speak() retries a timed-out voice call instead of giving up", () => {
  const speak = SRC.slice(SRC.indexOf("async function speak"));
  assert.match(speak, /VOICE_TIMEOUT_MS\s*\)/, "voice calls pass the voice timeout");
  assert.match(speak, /if \(run\.error \|\| /, "only a spawn error breaks out of the retry loop");
});
