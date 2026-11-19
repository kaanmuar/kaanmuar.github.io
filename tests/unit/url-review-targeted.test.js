"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const hostGeo = require("../../functions/url-review-host-geo");
const targeted = require("../../functions/url-review-targeted");
const insights = require("../../functions/url-review-insights");
const core = require("../../functions/url-review-core");
const publish = require("../../functions/url-review-publish");
const ownerNotice = require("../../functions/url-review-owner-notice");
const findingsEn = require("../../functions/url-review-findings-en");
const findingsCopy = require("../../functions/url-review-findings-copy");

const SAMPLE_CSV = [
  "1.0.0.0,1.0.0.255,AU",
  "8.8.8.0,8.8.8.255,US",
  "93.184.216.0,93.184.216.255,US",
  "185.220.100.0,185.220.103.255,DE"
].join("\n");

const SAMPLE_DROP4 = [
  JSON.stringify({ type: "metadata", copyright: "(c) The Spamhaus Project" }),
  JSON.stringify({ cidr: "45.155.205.0/24", sblid: "SBL12345" })
].join("\n");

const SAMPLE_ASNDROP = [
  JSON.stringify({ type: "metadata", copyright: "(c) The Spamhaus Project" }),
  JSON.stringify({ asn: 64496, asname: "BAD-HOSTING", cc: "NL" })
].join("\n");

const SAMPLE_KEV = {
  catalogVersion: "2026.11.18",
  dateReleased: "2026-11-18T12:00:00Z",
  vulnerabilities: [
    {
      cveID: "CVE-2024-99999",
      vendorProject: "jQuery",
      product: "jQuery",
      vulnerabilityName: "Sample Prototype Issue",
      dateAdded: "2026-11-01",
      knownRansomwareCampaignUse: "Known",
      forensicTriage: "Yes"
    }
  ]
};

const SAMPLE_GKG = [
  "ID1\t20261119120000\t1\tbleepingcomputer.com\thttps://bleepingcomputer.com/news/acme-retail.de-breach\t\t\tCYBER_ATTACK;DATA_BREACH\t\t1#United States#US#US#38#-97#0\t\t\t\tAcme Retail",
  "ID2\t20261119120500\t1\tshop.acme-retail.de\thttps://shop.acme-retail.de/blog/security\t\t\tCYBER_ATTACK\t\t1#Germany#GM#GM#51#9#0\t\t\t\tAcme Retail"
].join("\n");

function fakeRes(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => (typeof body === "string" ? JSON.parse(body) : body),
    text: async () => (typeof body === "string" ? body : JSON.stringify(body))
  };
}

test("DB-IP index compacts IPv4 ranges and resolves hosting country, ASN, and FIPS codes (#3816)", async () => {
  const index = hostGeo.buildDbipIndex(SAMPLE_CSV, "2026-11");
  assert.equal(index.count, 4);
  assert.equal(hostGeo.lookupIpCountry("8.8.8.8", index), "US");
  assert.equal(hostGeo.lookupIpCountry("185.220.101.5", index), "DE");
  assert.equal(hostGeo.lookupIpCountry("192.0.2.1", index), "");

  const geo = await hostGeo.inspectHostGeo("shop.example.com", {
    index,
    resolver: {
      resolve4: async () => ["127.0.0.1", "185.220.101.5"],
      resolve6: async () => [],
      resolveTxt: async (q) => q.includes(".origin.") ? [["24940 | 185.220.100.0/22 | NL | ripe | 2018-01-01"]] : [["HETZNER-AS, DE"]]
    },
    fetch: false
  });
  assert.equal(geo.ip, "185.220.101.5");
  assert.deepEqual(geo.ips, ["185.220.101.5"]);
  assert.equal(geo.country, "DE");
  assert.equal(geo.asn, 24940);
  assert.equal(geo.asName, "HETZNER-AS, DE");
  assert.equal(hostGeo.fipsToIso2("GM"), "DE");
  assert.equal(hostGeo.fipsToIso2("UK"), "GB");
});

test("targeted.check detects CISA KEV, OSV (excluding non-commercial prefixes), DROP, Feodo, CertSpotter and GDELT (#3816)", async () => {
  const feeds = {
    kev: targeted.parseCisaKev(SAMPLE_KEV),
    dropV4: targeted.parseDropV4(SAMPLE_DROP4),
    asnDrop: targeted.parseAsnDrop(SAMPLE_ASNDROP),
    feodo: targeted.parseFeodo([{ ip_address: "45.155.205.42", malware: "Pikabot", port: 443, last_online: "2026-11-18" }]),
    tor: targeted.parseTorExits("45.155.205.42\n"),
    gdelt: targeted.parseGdeltGkg(SAMPLE_GKG)
  };
  const dbip = hostGeo.buildDbipIndex(SAMPLE_CSV, "2026-11");
  const fakeFetch = async (url, init) => {
    const parsed = new URL(url);
    if (parsed.hostname === "api.osv.dev" && parsed.pathname === "/v1/querybatch") {
      return fakeRes(200, {
        results: [
          { vulns: [{ id: "GHSA-aaaa-1111" }, { id: "CHAINGUARD-skip-me" }] },
          { vulns: [{ id: "GHSA-bbbb-2222" }] }
        ]
      });
    }
    if (parsed.hostname === "api.osv.dev" && parsed.pathname === "/v1/vulns/GHSA-aaaa-1111") {
      return fakeRes(200, { id: "GHSA-aaaa-1111", aliases: ["CVE-2024-99999"], summary: "jQuery KEV issue" });
    }
    if (parsed.hostname === "api.osv.dev" && parsed.pathname === "/v1/vulns/GHSA-bbbb-2222") {
      return fakeRes(200, { id: "GHSA-bbbb-2222", aliases: ["CVE-2024-11111"], summary: "Lodash issue" });
    }
    if (parsed.hostname === "api.first.org" && parsed.pathname === "/data/v1/epss") {
      return fakeRes(200, { data: [{ cve: "CVE-2024-99999", epss: "0.82", percentile: "0.99" }, { cve: "CVE-2024-11111", epss: "0.60", percentile: "0.91" }] });
    }
    if (parsed.hostname === "api.certspotter.com") {
      return fakeRes(200, Array.from({ length: 26 }, (_, i) => ({
        id: String(i),
        not_before: new Date().toISOString(),
        dns_names: ["*.shop.example.com"]
      })));
    }
    return fakeRes(404, {});
  };

  const result = await targeted.check({
    url: "https://shop.acme-retail.de/",
    host: "shop.acme-retail.de",
    cert: { missingIntermediate: "R3" },
    libraries: [
      { name: "jQuery", version: "3.5.0" },
      { name: "lodash", version: "4.17.20" }
    ]
  }, {
    allowTestHost: true,
    feeds,
    index: dbip,
    certspotterKey: "cs_test_key",
    resolver: {
      resolve4: async () => ["45.155.205.42"],
      resolve6: async () => [],
      resolveTxt: async (q) => q.includes(".origin.") ? [["64496 | 45.155.205.0/24 | NL | ripe | 2020-01-01"]] : [["BAD-HOSTING"]]
    },
    fetch: fakeFetch,
    now: Date.parse("2026-11-19T12:00:00Z")
  });

  assert.equal(result.status, "critical");
  assert.equal(result.kevHits.length, 1);
  assert.equal(result.kevHits[0].cve, "CVE-2024-99999");
  assert.equal(result.osvHits.length, 1);
  assert.equal(result.osvHits[0].name, "lodash");
  assert.equal(result.feodoHit.malware, "Pikabot");
  assert.equal(result.dropIpHit.cidr, "45.155.205.0/24");
  assert.equal(result.dropAsnHit.asn, 64496);
  assert.equal(result.torHit, "45.155.205.42");
  assert.equal(result.breachNews.length, 1);
  assert.equal(new URL(result.breachNews[0].url).hostname, "bleepingcomputer.com");
  assert.ok(result.certCheck.anomalies.length >= 2);
  // Marketing compliance: never print "Spamhaus" in user-facing items or attributions.
  assert.ok(!JSON.stringify(result.items).toLowerCase().includes("spamhaus"));
  assert.ok(!JSON.stringify(result.attributions).toLowerCase().includes("spamhaus"));

  const added = [];
  targeted.addFindings(result, (area, verdict, severity, key, title, evidence, fix, opts) => {
    added.push({ area, verdict, severity, key, title, evidence, fix, opts });
  });
  const keys = added.map((f) => f.key);
  assert.deepEqual(keys, ["sec-kev", "sec-osv", "sec-feodo", "sec-drop", "sec-breach-news", "sec-cert-anomaly"]);

  // Verify all 6 languages render every finding without leaving placeholders.
  for (const row of added) {
    assert.ok(!/\{[a-z]+\}/.test(findingsEn.english(row.title)));
    assert.ok(!/\{[a-z]+\}/.test(findingsEn.english(row.evidence)));
    for (const lang of ["es", "pt", "de", "fr", "it"]) {
      const book = findingsCopy.COPY[lang];
      const t = findingsEn.render(book, row.title);
      const e = findingsEn.render(book, row.evidence);
      const x = findingsEn.render(book, row.fix);
      assert.ok(t && !/\{[a-z]+\}/.test(t), lang + " " + row.key + " title");
      assert.ok(e && !/\{[a-z]+\}/.test(e), lang + " " + row.key + " evidence");
      assert.ok(x && !/\{[a-z]+\}/.test(x), lang + " " + row.key + " fix");
    }
  }
});

test("previewReport, publicReport and ownerNotice never leak targeted findings or report.targeted (#3816, #3818)", () => {
  const report = {
    id: "r1",
    status: "complete",
    fetchedAt: "2026-11-19T12:00:00Z",
    finalUrl: "https://shop.example.com/",
    host: "shop.example.com",
    limits: { pagesRead: 5, maxPages: 10 },
    pages: [{ url: "https://shop.example.com/", path: "/", status: 200 }, { url: "https://shop.example.com/about", path: "/about", status: 200 }],
    cases: [{ id: "SEC-10", layer: "Security", title: "Check libs" }],
    targeted: { status: "critical", level: "critical", items: [{ kind: "c2-indicator", level: "critical", subject: "1.2.3.4" }] },
    insights: {
      score: { overall: 50, grade: "D", areas: { Security: { score: 20 } } },
      findings: [
        { key: "sec-kev", area: "Security", verdict: "fail", severity: "critical", rank: 1, title: "KEV CVE found", evidence: "CVE-2024-99999", fix: "Upgrade" },
        { key: "sec-feodo", area: "Security", verdict: "fail", severity: "critical", rank: 2, title: "Feodo C2 IP", evidence: "1.2.3.4", fix: "Clean" },
        { key: "sec-hsts", area: "Security", verdict: "fail", severity: "medium", rank: 3, title: "HSTS missing", evidence: "Missing header", fix: "Send HSTS" }
      ]
    }
  };

  const preview = core.previewReport(report);
  assert.equal(preview.targeted, undefined);
  assert.ok(!preview.insights.findings.some((f) => f.key === "sec-kev" || f.key === "sec-feodo"));

  const pub = publish.publicReport(report);
  assert.equal(pub.targeted, undefined);
  assert.ok(!pub.insights.findings.some((f) => f.key === "sec-kev" || f.key === "sec-feodo"));

  // Feodo listing holds the site off Live Reports cleanly.
  assert.equal(publish.heldReason({ status: "complete", report }, []), "threat-listed");

  // Owner email must never treat targeted-only findings as a critical notice trigger.
  const withoutFeodo = JSON.parse(JSON.stringify(report));
  withoutFeodo.insights.findings = [report.insights.findings[0], report.insights.findings[2]];
  assert.equal(ownerNotice.criticalSecurity(withoutFeodo), false);
});

test("targeted.lines names the sources read and skipped and never the level (#3848)", () => {
  assert.deepEqual(targeted.lines(null), ["The attack and exploit sources did not answer in time."]);
  const out = targeted.lines({ level: "critical", status: "critical", sourcesRead: ["CISA KEV", "OSV.dev"], sourcesSkipped: ["CertSpotter CT (no key)"], items: [{ level: "critical" }] });
  assert.deepEqual(out, [
    "Attack and exploit sources read: CISA KEV, OSV.dev.",
    "Attack and exploit sources skipped: CertSpotter CT (no key)."
  ]);
  assert.ok(!out.join(" ").match(/critical|signal/i));
  assert.deepEqual(targeted.lines({ sourcesRead: [], sourcesSkipped: [] }), ["Attack and exploit sources read: none."]);
});

test('the botnet count is the Feodo servers online now, by country, and the map keeps the last one when a refresh has no list (#3910)', () => {
  const feodo = targeted.parseFeodo([
    { ip_address: "50.16.16.211", status: "online", country: "US", malware: "QakBot", port: 443, last_online: "2026-11-19" },
    { ip_address: "203.0.113.9", status: "online", country: "DE", malware: "Dridex", port: 443 },
    { ip_address: "203.0.113.10", status: "offline", country: "DE", malware: "Dridex", port: 443 },
    { ip_address: "198.51.100.4", status: "online", country: "bad", malware: "Emotet", port: 80 }
  ]);
  assert.equal(feodo.ips["203.0.113.10"].online, false);
  const now = targeted.botnetNowSummary(feodo, "2026-11-19T22:00:00.000Z");
  assert.equal(now.online, 3);
  assert.deepEqual(now.countries.map((x) => [x.cc, x.count]).sort(), [["??", 1], ["DE", 1], ["US", 1]]);
  const map = targeted.updateGlobalMapHistory(null, { byCountry: {}, mentions: [], slice: "" }, null, "", Date.parse("2026-11-19T22:00:00Z"), feodo);
  assert.equal(map.botnetNow.online, 3);
  const kept = targeted.updateGlobalMapHistory(map, { byCountry: {}, mentions: [], slice: "" }, null, "", Date.parse("2026-11-19T23:00:00Z"), null);
  assert.equal(kept.botnetNow.online, 3);
});
