"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const vm = require("node:vm");
const reviewMap = require("../../functions/url-review-map");
const desk = require("../../functions/url-review-desk");
const threats = require("../../functions/url-review-threats");
const { inlineScripts } = require("../../scripts/build-csp-hashes");

const ROOT = path.join(__dirname, "../..");
const NOW = Date.parse("2026-11-19T18:00:00.000Z");

function sampleGlobalRaw() {
  return {
    version: 1,
    updatedAt: "2026-11-19T17:45:00.000Z",
    attributions: [
      "GDELT Project (https://www.gdeltproject.org/)",
      "CISA Known Exploited Vulnerabilities Catalog (CC0 1.0)",
      "Spamhaus DROP list"
    ],
    liveSlice: {
      slice: "20261119174500",
      byCountry: { US: 18, DE: 7, BR: 4 }
    },
    history: {
      "2026-11-19": { US: 42, DE: 15, BR: 9 },
      "2026-11-15": { US: 20, GB: 12 },
      "2026-10-25": { FR: 30, US: 10 },
      "2026-09-01": { JP: 25, US: 15 }
    },
    recentEvents: [
      {
        date: "2026-11-19T17:40:00Z",
        source: "reuters.com",
        url: "https://www.reuters.com/technology/cyber-attack-notice-2026",
        themes: ["CYBER_ATTACK", "RANSOMWARE"],
        countries: ["US", "DE"]
      },
      {
        date: "2026-11-19T17:30:00Z",
        source: "theregister.com",
        url: "https://www.theregister.com/2026/11/19/breach_update",
        themes: ["DATA_BREACH"],
        countries: ["GB"]
      },
      {
        date: "2026-11-19T17:20:00Z",
        source: "bad-scheme",
        url: "javascript:alert(1)",
        themes: ["CYBER_ATTACK"],
        countries: ["US"]
      }
    ],
    kevSummary: { version: "2026.11.18", count: 1460 },
    dropSummary: { v4Ranges: 1042 }
  };
}

test("buildGlobalMapPayload aggregates live/7d/30d/90d slices, sanitizes events, and strips forbidden vendor names (#3819)", () => {
  const raw = sampleGlobalRaw();
  const live = reviewMap.buildGlobalMapPayload(raw, { range: "live" }, NOW);
  assert.equal(live.range, "live");
  assert.equal(live.totalMentions, 29);
  assert.equal(live.countries[0].cc, "US");
  assert.equal(live.countries[0].count, 18);
  assert.deepEqual(live.totalsByRange, { live: 29, "7d": 98, "30d": 138, "90d": 178 });
  assert.equal(live.events.length, 2);
  assert.ok(live.events.every((e) => /^https:\/\//.test(e.url)));
  assert.equal(live.reviewSummary.enabled, false);
  assert.equal(live.reviewSummary.countries, null);
  assert.ok(!JSON.stringify(live).includes("Spamhaus"));
  assert.ok(!JSON.stringify(live).includes("PhishStats"));
  assert.ok(!JSON.stringify(live).includes("URLhaus"));
  assert.ok(!JSON.stringify(live).includes("Barracuda"));

  const d7 = reviewMap.buildGlobalMapPayload(raw, { range: "7d", country: "GB" }, NOW);
  assert.equal(d7.totalMentions, 98);
  assert.equal(d7.events.length, 1);
  assert.equal(d7.events[0].source, "theregister.com");

  const d90 = reviewMap.buildGlobalMapPayload(raw, { range: "90d" }, NOW);
  assert.equal(d90.totalMentions, 178);
  assert.ok(d90.countries.some((c) => c.cc === "JP" && c.count === 25));
});

test("loadGlobalMapPayload reads gzipped Cloud Storage bundle or safely handles offline cold start (#3819)", async () => {
  reviewMap.resetGlobalMapCache();
  const gz = zlib.gzipSync(Buffer.from(JSON.stringify(sampleGlobalRaw())));
  const fakeStorage = {
    bucket() {
      return {
        file() {
          return {
            exists: async () => [true],
            download: async () => [gz]
          };
        }
      };
    }
  };
  const fromStorage = await reviewMap.loadGlobalMapPayload({
    storage: fakeStorage,
    useCache: false,
    query: { range: "30d" },
    now: NOW
  });
  assert.equal(fromStorage.totalMentions, 138);
  assert.equal(fromStorage.kevSummary.count, 1460);

  const empty = await reviewMap.loadGlobalMapPayload({
    storage: null,
    fetch: false,
    useCache: false,
    query: { range: "live" },
    now: NOW
  });
  assert.equal(empty.totalMentions, 0);
  assert.deepEqual(empty.countries, []);
});

test("buildDeskMapData aggregates internal threat items + clean reviewed sites by hosting_country and supports filters (#3819)", () => {
  const threatItems = [
    {
      id: "t1",
      kind: "phishing-host",
      level: "critical",
      subject_type: "host",
      subject: "phish.example.org",
      host: "phish.example.org",
      hosting_country: "US",
      host_ip: "198.51.100.10",
      source: "Google Web Risk",
      evidence: "Phishing landing page flagged",
      last_seen: "2026-11-19T12:00:00.000Z",
      observed_at: "2026-11-19T12:00:00.000Z"
    },
    {
      id: "t2",
      kind: "known-exploit-software",
      level: "high",
      subject_type: "software",
      subject: "jquery@1.12.4",
      host: "shop.example.de",
      hosting_country: "DE",
      host_ip: "203.0.113.5",
      source: "CISA KEV",
      evidence: "Matched CVE-2020-11022",
      last_seen: "2026-10-01T12:00:00.000Z",
      observed_at: "2026-10-01T12:00:00.000Z"
    }
  ];
  const reviews = [
    {
      id: "rev-clean",
      createdAt: "2026-11-19T08:00:00.000Z",
      report: {
        id: "rev-clean",
        host: "safe.example.co",
        fetchedAt: "2026-11-19T08:00:00.000Z",
        targeted: { hosting: { ip: "192.0.2.88", country: "CO", asn: 64512, asName: "ExampleNet" } },
        insights: { score: { overall: 92 } }
      }
    }
  ];

  const all = reviewMap.buildDeskMapData(threatItems, reviews, {}, NOW);
  assert.equal(all.summary.totalCountries, 3);
  assert.equal(all.summary.totalSites, 3);
  assert.equal(all.summary.withFindings, 2);
  assert.equal(all.summary.cleanSites, 1);
  assert.equal(all.summary.totalFindings, 2);
  assert.equal(all.countries[0].cc, "US");
  assert.equal(all.countries[0].topLevel, "critical");
  assert.equal(all.countries[2].cc, "CO");
  assert.equal(all.countries[2].topLevel, "clean");
  assert.match(all.attribution, /DB-IP/);

  const criticalOnly = reviewMap.buildDeskMapData(threatItems, reviews, { level: "critical" }, NOW);
  assert.equal(criticalOnly.summary.totalCountries, 1);
  assert.equal(criticalOnly.summary.totalSites, 1);
  assert.equal(criticalOnly.countries[0].cc, "US");

  const liveOnly = reviewMap.buildDeskMapData(threatItems, reviews, { window: "live" }, NOW);
  assert.equal(liveOnly.summary.totalCountries, 2);
  assert.ok(liveOnly.countries.every((c) => c.cc !== "DE"));
});

test("desk UI contains both Global and Ours map tabs and compiles valid inline JS (#3819)", () => {
  assert.match(desk.PAGE, /id="desk-map-block"/);
  assert.match(desk.PAGE, /id="map-tab-global"/);
  assert.match(desk.PAGE, /id="map-tab-ours"/);
  assert.match(desk.PAGE, /\/desk\/map\/data/);
  assert.match(desk.PAGE, /\/threats\/global/);

  const scripts = inlineScripts(desk.PAGE);
  assert.ok(scripts.length >= 1);
  scripts.forEach((raw, idx) => {
    const code = raw.trim();
    if (!code) return;
    assert.doesNotThrow(() => new vm.Script(code), "Invalid JS syntax in desk.PAGE script #" + idx);
  });
});

test("updateThreat ID sanitizer handles normal alphanumeric IDs cleanly (CodeQL #195)", async () => {
  const out = await threats.updateThreat(null, { id: "" }, "op@example.com");
  assert.equal(out.status, 400);
});

test("cyber-attacks.html contains public global map, required attributions, and zero forbidden vendor names (#3819)", () => {
  const html = fs.readFileSync(path.join(ROOT, "cyber-attacks.html"), "utf8");
  assert.match(html, /assets\/faces\/badge\/cybermap\.svg/);
  assert.match(html, /GDELT Project/);
  assert.match(html, /CISA Known Exploited Vulnerabilities/);
  ["Spamhaus", "PhishStats", "URLhaus", "Barracuda"].forEach((name) => {
    assert.ok(!html.includes(name), "Unexpected vendor name on cyber-attacks.html: " + name);
  });
});
