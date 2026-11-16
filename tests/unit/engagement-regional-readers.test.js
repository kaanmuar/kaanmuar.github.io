"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const S = require("../../functions/engagement-sources");

const NOW = Date.parse("2026-11-05T15:00:00Z");
const hoursAgo = (h) => new Date(NOW - h * 3600000).toISOString();

test("Qiita reader maps tag items to the scout shape", async () => {
  const fetch = async (url) => {
    let host = "", path = "";
    try { const u = new URL(url); host = u.hostname; path = u.pathname; } catch (_) { /* ignore */ }
    if (host !== "qiita.com" || !path.startsWith("/api")) return { ok: false, json: async () => ({}) };
    return { ok: true, json: async () => [{ id: "abc", title: "Playwright E2E", url: "https://qiita.com/x/items/abc", created_at: hoursAgo(1), likes_count: 3, tags: [{ name: "playwright" }], user: { id: "dev", name: "Dev" } }] };
  };
  const out = await S.readAll({ fetch, now: NOW, env: {}, settings: { discoveryPack: "apac" } });
  assert.equal(out.read.qiita, 1);
  const p = out.posts.find((x) => x.network === "qiita");
  assert.equal(p.lang, "ja");
  assert.match(p.title, /Playwright/);
});

test("Stack Exchange reader queries multiple sites", async () => {
  const fetch = async (url) => {
    let host = "";
    try { host = new URL(url).hostname; } catch (_) { /* ignore */ }
    if (host !== "api.stackexchange.com") return { ok: false, json: async () => ({}) };
    return { ok: true, json: async () => ({ items: [{ question_id: 9, title: "WCAG focus order", link: "https://stackoverflow.com/q/9", score: 4, answer_count: 1, view_count: 90, creation_date: Math.floor(NOW / 1000) - 3600, tags: ["accessibility"], owner: { display_name: "Ana", user_id: 1, reputation: 100 }, body: "<p>How?</p>" }] }) };
  };
  const out = await S.readAll({ fetch, now: NOW, env: {}, settings: { discoveryPack: "western" } });
  assert.equal(out.read.stackexchange, 1);
  assert.match(out.posts[0].url, /stackoverflow/);
});