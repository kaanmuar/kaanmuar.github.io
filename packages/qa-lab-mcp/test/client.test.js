import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import {
  PROD_RUN,
  PROD_URL,
  runBase,
  reviewBase,
  readNdjson,
  textResult,
  previewUrl,
  getReport
} from "../src/client.js";

describe("qa-lab-mcp client (#3480)", () => {
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

  it("get_report POSTs to reviewUrl /review/open", async () => {
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
    assert.equal(JSON.parse(seen.opts.body).id, "aabbcc");
    assert.equal(JSON.parse(seen.opts.body).session.length, 64);
    assert.equal(out.isError, false);
  });
});
