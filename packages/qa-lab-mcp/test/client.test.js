import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { baseUrl, DEFAULT_BASE, readNdjson, textResult } from "../src/client.js";

describe("qa-lab-mcp client (#3480)", () => {
  it("defaults the review base URL", () => {
    assert.equal(baseUrl({}), DEFAULT_BASE);
    assert.equal(baseUrl({ QA_LAB_REVIEW_URL: "http://127.0.0.1:8787/" }), "http://127.0.0.1:8787");
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
});
