// translate.py falls back to Gemini once Google's free translator refuses (#3897), with the same length check.
const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const dir = path.join(__dirname, '../../scripts/tips-studio');

// Runs python with translate imported, sleeps stubbed out, and prints the JSON the snippet returns.
function run(setup, expr, env = {}) {
	const code = [
		'import json, time; time.sleep = lambda s: None',
		'import translate',
		setup,
		'print(json.dumps(' + expr + ', ensure_ascii=False))',
	].join('\n');
	const out = execFileSync(process.env.PYTHON || 'python3', ['-c', code], {
		cwd: dir,
		encoding: 'utf8',
		env: { ...process.env, ...env },
		stdio: ['ignore', 'pipe', 'ignore'],
	});
	return JSON.parse(out.trim().split('\n').pop());
}

test('after Google refuses once, the next batches go to Gemini without asking Google again', () => {
	const result = run(
		`
asked = []
def refuse(text, lang):
    asked.append(text)
    raise RuntimeError("HTTP Error 429")
translate.gtx = refuse
translate.gemini = lambda batch, lang: ["G:" + p for p in batch]
first = translate.translate_batch(["Hello there.", "Second line."], "es")
second = translate.translate_batch(["Third line."], "de")
`,
		'{"first": first, "second": second, "asked": len(asked), "down": sorted(translate.GOOGLE_DOWN)}'
	);
	assert.deepEqual(result.first, ['G:Hello there.', 'G:Second line.']);
	assert.deepEqual(result.second, ['G:Third line.']);
	assert.equal(result.asked, 1, 'Google is asked once, then skipped for the rest of the run');
	assert.deepEqual(result.down, ['es']);
});

test('Google lines are used while Google works, one per fragment', () => {
	const result = run(
		`
translate.gtx = lambda text, lang: text.upper()
translate.gemini = lambda batch, lang: ["should not be used"]
`,
		'translate.translate_batch(["one", "two"], "fr")'
	);
	assert.deepEqual(result, ['ONE', 'TWO']);
});

test('gemini() sends the fragments and returns them when the count matches', () => {
	const result = run(
		`
import io, urllib.request
sent = {}
class Reply(io.BytesIO):
    def __enter__(self): return self
    def __exit__(self, *a): return False
def fake(req, timeout=None):
    sent["url"] = req.full_url
    sent["key"] = req.get_header("X-goog-api-key")
    sent["body"] = json.loads(req.data.decode())
    reply = {"candidates": [{"content": {"parts": [{"text": json.dumps(["Hola a todos.", "Adiós."])}]}}]}
    return Reply(json.dumps(reply).encode())
urllib.request.urlopen = fake
`,
		'{"out": translate.gemini(["Hi all.", "Bye."], "es"), "url": sent["url"], "key": sent["key"], "prompt": sent["body"]["contents"][0]["parts"][0]["text"][:200]}',
		{ GEMINI_API_KEY: 'test-key' }
	);
	assert.deepEqual(result.out, ['Hola a todos.', 'Adiós.']);
	assert.match(result.url, /generativelanguage\.googleapis\.com\/v1beta\/models\/gemini-flash-latest:generateContent$/);
	assert.equal(result.key, 'test-key');
  assert.match(result.prompt, /informal tú form \(never usted\)/, 'Spanish keeps the tú register the render checks for');
});

test('gemini() refuses a reply with the wrong count and gives up after three tries', () => {
	const result = run(
		`
import io, urllib.request
calls = []
class Reply(io.BytesIO):
    def __enter__(self): return self
    def __exit__(self, *a): return False
def fake(req, timeout=None):
    calls.append(1)
    return Reply(json.dumps({"candidates": [{"content": {"parts": [{"text": "[\\"only one\\"]"}]}}]}).encode())
urllib.request.urlopen = fake
err = None
try:
    translate.gemini(["a", "b"], "de")
except RuntimeError as e:
    err = str(e)
`,
		'{"err": err, "calls": len(calls)}',
		{ GEMINI_API_KEY: 'test-key' }
	);
	assert.match(result.err, /could not translate a batch to de/);
	assert.equal(result.calls, 3);
});

test('without a Gemini key the fallback says so instead of silently dropping the batch', () => {
	const env = { ...process.env };
	delete env.GEMINI_API_KEY;
	const result = run(
		`
err = None
try:
    translate.gemini(["a"], "it")
except RuntimeError as e:
    err = str(e)
`,
		'err',
		env
	);
	assert.match(result, /GEMINI_API_KEY is not set/);
});
