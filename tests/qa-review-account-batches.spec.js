const { test, expect } = require("./net-guard");
const auth = require("../functions/url-review-auth");
const offers = require("../functions/url-review-offers");
const own = require("./unit/fixtures/review-wordpress.json");

const ANA = "a".repeat(64);

test("the account page lists bulk review batches and reopens them on qa-review", async ({ page }) => {
  const store = auth.memoryStore();
  const started = await auth.startEmail(store, { email: "ana@example.com", deviceKey: ANA, ip: "1.1.1.1" });
  const signed = await auth.finishEmail(store, { id: started.id, code: started.code, deviceKey: ANA });
  const records = [
    { id: "ab12", email: "ana@example.com", status: "complete", paid: true, createdAt: "2026-10-24T10:00:00Z", report: Object.assign({}, own, { id: "ab12" }) }
  ];
  const at = Date.parse("2026-10-24T12:00:00Z");
  await page.addInitScript(({ session }) => {
    localStorage.setItem("qa-review-analytics", "necessary");
    localStorage.setItem("qa-review-session", JSON.stringify({ session, email: "ana@example.com", provider: "email" }));
    localStorage.setItem("qa-review-device-key", JSON.stringify("a".repeat(64)));
  }, { session: signed.session });
  await page.route("http://127.0.0.1:8768/**", async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    const cors = { "access-control-allow-origin": req.headers().origin || "*", "access-control-allow-credentials": "true", "access-control-allow-headers": "content-type" };
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: Object.assign({ "access-control-allow-methods": "GET,POST" }, cors) });
    const body = req.postData() ? JSON.parse(req.postData()) : {};
    const json = (status, data) => route.fulfill({ status, contentType: "application/json", headers: cors, body: JSON.stringify(data) });
    if (path === "/auth/session") {
      const checked = await auth.checkSession(store, Object.assign({}, body, { deviceKey: ANA }));
      return json(checked.ok ? 200 : checked.status, checked);
    }
    const file = offers.accountFile(records, "ana@example.com", at);
    if (path === "/account/runs") {
      return json(200, Object.assign({}, file, {
        comparisons: [],
        batches: [{ id: "batch9", at: "2026-10-20T10:00:00Z", status: "done", hosts: ["bulk.example", "pair.example"], done: 2, total: 2 }]
      }));
    }
    return json(200, path === "/auth/providers" ? { providers: [{ id: "email" }] } : { items: [] });
  });
  await page.goto("/qa-review-account.html");
  const batches = page.locator("#saved-batches");
  await expect(batches).toBeVisible({ timeout: 20000 });
  await expect(batches.getByRole("heading", { name: "Bulk reviews" })).toBeVisible();
  await expect(batches.getByRole("link", { name: "bulk.example, pair.example" })).toHaveAttribute("href", "qa-review.html?batch=batch9");
  await expect(batches.locator("li .muted")).toContainText("Finished");
  await expect(batches.locator("li .muted")).toContainText("2 of 2 ready");
});
