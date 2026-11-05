const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

// Run 41923995425 built a 398 MB artifact, then sat on updating_pages until deploy-pages
// hit its 10 minute cap and the status came back blank. The job has to try once more.
test("a Pages deploy that comes back blank is tried once more", () => {
  const yml = fs.readFileSync(path.join(__dirname, "../../.github/workflows/pages.yml"), "utf8");
  const deploy = yml.split(/^ {2}deploy:/m)[1];
  assert.ok(deploy, "deploy job");
  assert.match(deploy, /timeout-minutes: 30/);
  assert.match(deploy, /id: deployment\n\s+continue-on-error: true\n\s+uses: actions\/deploy-pages@v5/);
  assert.match(deploy, /id: redeploy\n\s+if: steps\.deployment\.outcome == 'failure'\n\s+uses: actions\/deploy-pages@v5/);
  assert.match(deploy, /steps\.deployment\.outputs\.page_url \|\| steps\.redeploy\.outputs\.page_url/);
  assert.equal((deploy.match(/uses: actions\/deploy-pages@v5/g) || []).length, 2);
  assert.doesNotMatch(deploy.split("id: redeploy")[1], /continue-on-error/);
});
