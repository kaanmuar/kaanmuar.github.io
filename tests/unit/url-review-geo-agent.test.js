"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const geo = require("../../functions/url-review-geo-agent");
const insights = require("../../functions/url-review-insights");

test("parseLlmsTxt accepts llmstxt.org layout", () => {
  const body = "# Acme\n\n> One-line summary.\n\n## Pages\n\n- [Home](https://acme.test/)\n";
  const report = geo.parseLlmsTxt(body, { status: 200, html: false });
  assert.equal(report.ok, true);
  assert.equal(report.complete, true);
  assert.equal(report.sections, 1);
  assert.equal(report.links, 1);
});

test("parseLlmsTxt flags missing summary and sections", () => {
  const body = "# Acme\n\n- https://acme.test/\n";
  const report = geo.parseLlmsTxt(body, { status: 200, html: false });
  assert.equal(report.ok, true);
  assert.ok(report.gaps.includes("summary"));
  assert.ok(report.gaps.includes("sections"));
});

test("parseAiCatalog parses JSON objects only", () => {
  assert.equal(geo.parseAiCatalog('{"version":1,"resources":[]}', { status: 200, html: false }).ok, true);
  assert.equal(geo.parseAiCatalog("[]", { status: 200, html: false }).ok, false);
  assert.equal(geo.parseAiCatalog("<html>", { status: 200, html: true }).ok, false);
});

test("detectWebMcp finds document.modelContext in static HTML", () => {
  const html = '<script>document.modelContext.registerTool({name:"x"},{});</script>';
  const report = geo.detectWebMcp(html);
  assert.equal(report.found, true);
  assert.equal(report.tools, true);
  assert.equal(geo.detectWebMcp("<p>Hello</p>").found, false);
});

test("classifyAgentMarkdown distinguishes markdown from HTML", () => {
  assert.equal(geo.classifyAgentMarkdown({ status: 200, contentType: "text/markdown", body: "# Hi\n", html: false }).markdown, true);
  assert.equal(geo.classifyAgentMarkdown({ status: 200, contentType: "text/html", body: "<!doctype html><html></html>", html: true }).markdown, false);
});

test("draftLlmsTxt uses only supplied review facts", () => {
  const text = geo.draftLlmsTxt({
    name: "Acme",
    description: "Widgets for factories.",
    origin: "https://acme.test",
    pages: [{ path: "/pricing", url: "https://acme.test/pricing", title: "Pricing", description: "Plans." }]
  });
  assert.match(text, /^# Acme/);
  assert.match(text, /> Widgets for factories\./);
  assert.match(text, /\[Pricing\]\(https:\/\/acme\.test\/pricing\): Plans\./);
  assert.doesNotMatch(text, /Invented/);
});

test("insights fix kit skips llms.txt when published file is complete", () => {
  const llmsBody = "# Acme\n\n> Summary.\n\n## Pages\n\n- [Home](https://acme.test/)\n";
  const page = { path: "/", url: "https://acme.test/", inspect: { title: "Acme", description: "Summary." } };
  const kit = insights.analyze({
    pages: [page],
    robotsText: "",
    extras: { llms: { status: 200, html: false, body: llmsBody } }
  }).fixkit;
  assert.equal(kit.llmsTxt, "");
});