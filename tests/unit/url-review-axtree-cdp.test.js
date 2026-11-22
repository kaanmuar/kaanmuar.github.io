const test = require("node:test");
const assert = require("node:assert/strict");
const cdp = require("../../functions/url-review-axtree-cdp");
const axtree = require("../../functions/url-review-axtree");

function node(nodeId, role, name, extra) {
  return Object.assign(
    {
      nodeId: String(nodeId),
      ignored: false,
      role: { type: "role", value: role },
      name: { type: "computedString", value: name },
      childIds: [],
      backendDOMNodeId: 100 + Number(nodeId),
    },
    extra
  );
}

function sampleTree() {
  return {
    nodes: [
      node(1, "RootWebArea", "Shop", { childIds: ["2", "3", "4"] }),
      node(2, "heading", "Shop", {
        properties: [{ name: "level", value: { type: "integer", value: 1 } }],
        parentId: "1",
      }),
      node(3, "main", "", { parentId: "1", childIds: ["4"] }),
      node(4, "link", "", { parentId: "3" }),
    ],
  };
}

function mockSession(tree, opts) {
  const calls = [];
  const failEnable = opts && opts.failEnable;
  return {
    calls,
    async send(method, params) {
      calls.push({ method, params });
      if (method === "Accessibility.enable") {
        if (failEnable) throw new Error("already enabled");
        return {};
      }
      if (method === "Accessibility.getFullAXTree") return tree;
      throw new Error("unexpected CDP method " + method);
    },
    async detach() {
      calls.push({ method: "detach" });
    },
  };
}

test("enabled is off by default and respects env and options", () => {
  assert.equal(cdp.enabled({ env: {} }), false);
  assert.equal(cdp.enabled({ env: { QA_AXTREE_CDP: "1" } }), true);
  assert.equal(cdp.enabled({ env: { URL_REVIEW_AXTREE_CDP: "true" } }), true);
  assert.equal(cdp.enabled({ env: { QA_AXTREE_CDP: "1" }, enabled: false }), false);
  assert.equal(cdp.enabled({ env: {}, axtreeCdp: true }), true);
  assert.equal(cdp.enabled({ env: {}, force: true }), true);
});

test("fetchTree enables Accessibility then reads getFullAXTree", async () => {
  const tree = sampleTree();
  const session = mockSession(tree);
  const got = await cdp.fetchTree(session);
  assert.deepEqual(got, tree);
  assert.deepEqual(
    session.calls.map((row) => row.method),
    ["Accessibility.enable", "Accessibility.getFullAXTree"]
  );
});

test("fetchTree still works when Accessibility.enable throws", async () => {
  const tree = sampleTree();
  const session = mockSession(tree, { failEnable: true });
  const got = await cdp.fetchTree(session);
  assert.deepEqual(got, tree);
  assert.equal(session.calls[1].method, "Accessibility.getFullAXTree");
});

test("attach is a no-op when disabled", async () => {
  const session = mockSession(sampleTree());
  const out = await cdp.attach(session, { env: {} });
  assert.deepEqual(out, { attached: false, reason: "disabled" });
  assert.equal(session.calls.length, 0);
});

test("attach pipes a mocked CDP tree into reduce for extras.axtree", async () => {
  const tree = sampleTree();
  const session = mockSession(tree);
  const out = await cdp.attach(session, {
    enabled: true,
    url: "https://example.com/",
    keepTree: true,
  });
  assert.equal(out.attached, true);
  assert.equal(out.tree, tree);
  assert.equal(out.report.total, 4);
  assert.equal(out.report.counts["ax-link-name"], 1);
  assert.equal(out.axtree, out.report);

  const rows = [];
  axtree.findings(out.axtree, (...args) => rows.push(args), { findings: [] });
  assert.ok(rows.some((row) => row[3] === "a11y-axtree-link-name"));
});

test("attach opens a Puppeteer-style page session and detaches it", async () => {
  const tree = sampleTree();
  const session = mockSession(tree);
  const page = {
    async createCDPSession() {
      return session;
    },
  };
  const out = await cdp.attach(page, { enabled: true, keepTree: false, url: "https://example.com/" });
  assert.equal(out.attached, true);
  assert.equal(out.tree, undefined);
  assert.ok(out.report);
  assert.ok(session.calls.some((row) => row.method === "detach"));
});

test("attach opens a Playwright-style page session", async () => {
  const tree = sampleTree();
  const session = mockSession(tree);
  let gotPage = null;
  const page = {
    context: {
      async newCDPSession(target) {
        gotPage = target;
        return session;
      },
    },
  };
  const out = await cdp.attach(page, { force: true, reduce: false });
  assert.equal(gotPage, page);
  assert.equal(out.attached, true);
  assert.equal(out.axtree, tree);
  assert.equal(out.report, undefined);
});

test("openSession rejects a page with no CDP API", async () => {
  await assert.rejects(() => cdp.openSession({}), /CDP session API/);
});
