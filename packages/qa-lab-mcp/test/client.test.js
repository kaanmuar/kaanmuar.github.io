import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import {
  PROD_RUN,
  PROD_URL,
  TERMS_VERSION,
  runBase,
  reviewBase,
  readNdjson,
  textResult,
  previewUrl,
  crawlUrl,
  getReport,
  deviceKey,
  authHeaders
} from "../src/client.js";

describe("qa-lab-mcp client (#3480 / #3626)", () => {
  it("defaults run + review bases; local REVIEW_URL covers both", () => {
    assert.equal(runBase({}), PROD_RUN);
    assert.equal(reviewBase({}), PROD_URL);
    assert.equal(runBase({ QA_LAB_REVIEW_URL: "http://127.0.0.1:8768/" }), "http://127.0.0.1:8768");
    assert.equal(reviewBase({ QA_LAB_REVIEW_URL: "http://127.0.0.1:8768/" }), "http://127.0.0.1:8768");
  });

  it("parses the last NDJSON done line", async () => {
    const res = {
      async text() {
        return '{"type":"log","text":"hi"}\n{"type":"done","report":{"id":"abc","host":"ex.com"}}\n';
      }
    };
    const done = await readNdjson(res);
    assert.equal(done.type, "done");
    assert.equal(done.report.id, "abc");
  });

  it("wraps payloads as MCP text content", () => {
    const ok = textResult({ id: "1" });
    assert.equal(ok.isError, false);
    assert.match(ok.content[0].text, /"id": "1"/);
    const bad = textResult("nope", true);
    assert.equal(bad.isError, true);
    assert.equal(bad.content[0].text, "nope");
  });

  it("preview_url POSTs to reviewRun with openedAt and a browser UA", async () => {
    let seen;
    const fetchImpl = mock.fn(async (url, opts) => {
      seen = { url, opts };
      return {
        ok: true,
        headers: { get: () => "application/x-ndjson" },
        async text() {
          return '{"type":"done","report":{"id":"deadbeef","host":"example.com"},"softLeft":4,"softCap":5}\n';
        }
      };
    });
    const out = await previewUrl("https://example.com", {}, fetchImpl);
    assert.equal(seen.url, PROD_RUN + "/review/preview");
    assert.match(seen.opts.headers["user-agent"], /Chrome/);
    const body = JSON.parse(seen.opts.body);
    assert.equal(body.url, "https://example.com");
    assert.ok(Date.now() - body.openedAt >= 1000);
    assert.equal(out.isError, false);
    assert.match(out.content[0].text, /deadbeef/);
  });

  it("preview_url sends x-qa-lab-mcp-key when QA_LAB_MCP_KEY is set", async () => {
    let seen;
    const key = "mcp-test-key-at-least-24-chars!!";
    const fetchImpl = mock.fn(async (url, opts) => {
      seen = { url, opts };
      return {
        ok: true,
        headers: { get: () => "application/x-ndjson" },
        async text() {
          return '{"type":"done","report":{"id":"aa","host":"ex.com"}}\n';
        }
      };
    });
    await previewUrl("https://ex.com", { QA_LAB_MCP_KEY: key }, fetchImpl);
    assert.equal(seen.opts.headers["x-qa-lab-mcp-key"], key);
  });

  it("crawl_url refuses without QA_LAB_API_TOKEN", async () => {
    const out = await crawlUrl("https://example.com", {}, {});
    assert.equal(out.isError, true);
    assert.match(out.content[0].text, /account API token/i);
  });

  it("crawl_url POSTs /review with Bearer account token and terms", async () => {
    let seen;
    const token = ["qlat", "aabbccddeeff0011", "a".repeat(48)].join("_"); // fixture
    const fetchImpl = mock.fn(async (url, opts) => {
      seen = { url, opts };
      return {
        ok: true,
        headers: { get: () => "application/x-ndjson" },
        async text() {
          return '{"type":"done","report":{"id":"ff00aa","host":"example.com"},"paid":true}\n';
        }
      };
    });
    const out = await crawlUrl(
      "https://example.com",
      { frameworks: ["Playwright", "Cypress"], pages: 40 },
      { QA_LAB_API_TOKEN: token },
      fetchImpl
    );
    assert.equal(seen.url, PROD_RUN + "/review");
    assert.equal(seen.opts.headers.authorization, "Bearer " + token);
    assert.equal(seen.opts.headers["x-qa-lab-api-token"], token);
    const body = JSON.parse(seen.opts.body);
    assert.equal(body.url, "https://example.com");
    assert.equal(body.termsAccepted, true);
    assert.equal(body.termsVersion, TERMS_VERSION);
    assert.equal(body.reasonCode, "allowed");
    assert.deepEqual(body.frameworks, ["Playwright", "Cypress"]);
    assert.equal(body.pages, 40);
    assert.equal(body.deviceKey.length, 64);
    assert.equal(out.isError, false);
    assert.match(out.content[0].text, /ff00aa/);
  });

  it("derives a stable deviceKey from the API token when unset", () => {
    const token = ["qlat", "aabbccddeeff0011", "b".repeat(48)].join("_"); // fixture
    const a = deviceKey({ QA_LAB_API_TOKEN: token });
    const b = deviceKey({ QA_LAB_API_TOKEN: token });
    assert.equal(a.length, 64);
    assert.equal(a, b);
  });

  it("authHeaders prefer account token over bare JSON", () => {
    const token = ["qlat", "aabbccddeeff0011", "c".repeat(48)].join("_"); // fixture
    const h = authHeaders({ QA_LAB_API_TOKEN: token, QA_LAB_MCP_KEY: "mcp-test-key-at-least-24-chars!!" });
    assert.equal(h.authorization, "Bearer " + token);
    assert.equal(h["x-qa-lab-mcp-key"], "mcp-test-key-at-least-24-chars!!");
  });

  it("get_report POSTs to reviewUrl /review/open with api token", async () => {
    let seen;
    const token = ["qlat", "aabbccddeeff0011", "d".repeat(48)].join("_"); // fixture
    const fetchImpl = mock.fn(async (url, opts) => {
      seen = { url, opts };
      return {
        ok: true,
        async json() {
          return { id: "aabbcc", paid: true, report: { id: "aabbcc", host: "x.test" } };
        }
      };
    });
    const out = await getReport("aabbcc!!", { QA_LAB_API_TOKEN: token }, fetchImpl);
    assert.equal(seen.url, PROD_URL + "/review/open");
    assert.equal(JSON.parse(seen.opts.body).id, "aabbcc");
    assert.equal(JSON.parse(seen.opts.body).apiToken, token);
    assert.equal(seen.opts.headers.authorization, "Bearer " + token);
    assert.equal(out.isError, false);
  });

  it("get_report still accepts session for v1", async () => {
    let seen;
    const fetchImpl = mock.fn(async (url, opts) => {
      seen = { url, opts };
      return {
        ok: true,
        async json() {
          return { id: "aabbcc", paid: true, report: { id: "aabbcc", host: "x.test" } };
        }
      };
    });
    const out = await getReport("aabbcc!!", { QA_LAB_SESSION: "s".repeat(64) }, fetchImpl);
    assert.equal(seen.url, PROD_URL + "/review/open");
    assert.equal(JSON.parse(seen.opts.body).session.length, 64);
    assert.equal(out.isError, false);
  });
});
