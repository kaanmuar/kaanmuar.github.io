const test = require("node:test");
const assert = require("node:assert/strict");
const work = require("../../scripts/open-work.js");

const tracked = new Set(["js/qa-review.js", "tests/qa-review-top.spec.js", "qa-review.html", "functions/url-review-failures.js", "a/index.js", "b/index.js", "c/index.js", "d/index.js"]);

test("files a prompt names resolve to tracked paths, by full path or by a bare name with three matches at most (#2969)", () => {
  assert.deepEqual(work.resolveFiles("fix the report index jump in js/qa-review.js", tracked), ["js/qa-review.js"]);
  assert.deepEqual(work.resolveFiles("the qa-review-top.spec.js test and ./qa-review.html", tracked), ["tests/qa-review-top.spec.js", "qa-review.html"]);
  assert.deepEqual(work.resolveFiles("index.js is everywhere", tracked), []);
  assert.deepEqual(work.resolveFiles("nothing.js and e.g. no files", tracked), []);
  assert.deepEqual(work.resolveFiles("js/qa-review.js twice: js/qa-review.js", tracked), ["js/qa-review.js"]);
});

test("open work overlaps only where it touches one of the files, and names the shared ones", () => {
  const prs = [
    { number: 2948, branch: "fix/2938-report-jump", files: ["js/qa-review.js", "tests/qa-review-top.spec.js", "css/qa.css"] },
    { number: 2984, branch: "pagespeed/x", files: ["index.html"] },
  ];
  const hit = work.overlaps(["js/qa-review.js", "tests/qa-review-top.spec.js"], prs);
  assert.equal(hit.length, 1);
  assert.equal(hit[0].number, 2948);
  assert.deepEqual(hit[0].hits, ["js/qa-review.js", "tests/qa-review-top.spec.js"]);
  assert.deepEqual(work.overlaps([], prs), []);
  assert.deepEqual(work.overlaps(["js/qa-review.js"], [{ number: 1 }]), []);
});

test("a ticket is named by its branch number or a #ref in the PR's title or body", () => {
  assert.equal(work.branchTicket("fix/2938-report-jump"), 2938);
  assert.equal(work.branchTicket("jarvis/2605-fix-2605-be"), 2605);
  assert.equal(work.branchTicket("fix/2969"), 2969);
  assert.equal(work.branchTicket("pagespeed/safe-2026-11-08"), null);
  assert.deepEqual(work.ticketRefs("Index jump holds its heading (#2940, #2938)", "Fixes #2938."), [2940, 2938]);
  const pr = { branchTicket: 2938, refs: [2940] };
  assert.ok(work.namesTicket(pr, 2938));
  assert.ok(work.namesTicket(pr, 2940));
  assert.ok(!work.namesTicket(pr, 2888));
});

test("search words put file and code names first, then the title's specific words, without the area prefix or stop words", () => {
  const k = work.keywords("QA: The Report section index test failed once under a parallel run", "tests/qa-review-top.spec.js flaked in jumpToSection");
  assert.deepEqual(k.slice(0, 2), ["qa-review-top.spec.js", "jumpToSection"]);
  assert.ok(k.includes("parallel") && k.includes("section"));
  assert.ok(!k.some((w) => /^(qa|the|once|under|a)$/i.test(w)));
  assert.equal(k.length, 6);
  assert.deepEqual(work.keywords("Tests: qa-review-top 'on a phone ... a heading lands below Close' is flaky on CI").slice(0, 1), ["on a phone ... a heading lands below Close"]);
  const apostrophes = work.keywords("FE: The sample report's top case is weak because the site's file predates ranking");
  assert.ok(!apostrophes.some((w) => w.includes("top case")) && apostrophes.includes("weak"));
  assert.ok(!work.keywords("Fix #2938 and #2888 report").some((w) => /\d/.test(w)));
});

test("a duplicate needs two specific words in its title and comes within 60% of the best match", () => {
  const keys = work.keywords("CI: Pages deploy on main fails with no build job");
  const issues = [
    { number: 2992, title: "CI: Pages on main fails with no build job or logs, so merges after #2972 are not deployed", body: "" },
    { number: 2158, title: "Growth: Outbound through the existing Instantly setup", body: "build" },
    { number: 977, title: "DevOps: A batch queued right after merge times out waiting for Pages", body: "deploy job" },
  ];
  assert.deepEqual(work.rankDuplicates(keys, issues).map((i) => i.number), [2992]);
  const code = work.keywords("Process: ticket.sh bug files duplicates");
  const byCode = work.rankDuplicates(code, [{ number: 2274, title: "DevOps: ticket.sh done without a PR number failed", body: "it files duplicates" }]);
  assert.deepEqual(byCode.map((i) => i.number), [2274]);
  assert.deepEqual(work.rankDuplicates(keys, []), []);
});

test("the overlap line names PRs, worktrees and issues, and says 'no PR yet' only when the PR list was read", () => {
  const found = {
    prs: [{ number: 2948, branch: "fix/2938-report-jump", title: "Index jump holds its heading", hits: ["js/qa-review.js"] }],
    worktrees: [{ branch: "fix/2888-index-flake", live: true, hits: ["tests/qa-review-top.spec.js"] }],
    issues: [{ number: 2954, title: "FE: Report screenshots reserve no space", hits: ["qa-review.js"] }],
    prsKnown: true,
  };
  const text = work.formatWork(found);
  assert.match(text, /^Open work on the same files \(#2969\)/);
  assert.match(text, /- PR #2948 \(fix\/2938-report-jump\) Index jump holds its heading: js\/qa-review\.js/);
  assert.match(text, /- Worktree fix\/2888-index-flake, no PR yet, a live chat holds it: tests\/qa-review-top\.spec\.js/);
  assert.match(text, /- Open issue #2954 names qa-review\.js: FE: Report screenshots reserve no space/);
  assert.match(work.formatWork({ ...found, prsKnown: false }), /- Worktree fix\/2888-index-flake, a live chat holds it:/);
  assert.equal(work.formatWork({}), "");
});

test("a deadline returns the fallback instead of waiting, and a failure returns it too", async () => {
  assert.equal(await work.withDeadline(new Promise(() => {}), 10, "late"), "late");
  assert.equal(await work.withDeadline(Promise.reject(new Error("offline")), 1000, "failed"), "failed");
  assert.equal(await work.withDeadline(Promise.resolve("ok"), 1000, "late"), "ok");
});
