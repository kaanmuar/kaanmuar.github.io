#!/usr/bin/env node
/* Writes tests/fixtures/jarvis-geo-heat.json (#3112): the geo source's `heat` and `sectors` for the countries in
   tests/fixtures/jarvis-geo.json, from made-up replies, sends and leads run through functions/jarvis-geo-heat.js.
   The web and Android tests merge it into the geo fixture. Run again after changing the module's output. */
const fs = require("fs");
const path = require("path");
const heat = require("../functions/jarvis-geo-heat");

const root = path.join(__dirname, "..");
const geo = JSON.parse(fs.readFileSync(path.join(root, "tests/fixtures/jarvis-geo.json"), "utf8"));
const NOW = Date.parse("2026-11-09T12:00:00Z");
const PEOPLE = { CO: ["a.edu.co", "b.edu.co"], MX: ["c.mx"], BR: ["d.com.br"], ES: ["e.es"], US: ["f.com"] };
const SECTOR = { "a.edu.co": "university", "b.edu.co": "university", "c.mx": "university", "d.com.br": "university", "e.es": "company", "f.com": "startup" };

// A seeded walk so the fixture stays the same between runs.
let seed = 7;
const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const replies = [];
const sent = [];
Object.keys(PEOPLE).forEach((cc, n) => {
  const count = [26, 14, 4, 12, 6][n];
  for (let k = 0; k < count; k++) {
    const host = PEOPLE[cc][k % PEOPLE[cc].length];
    const day = Math.floor(rand() * 5.4);
    const hour = 13 + Math.floor(rand() * 9) + (rand() < 0.15 ? 6 : 0);
    replies.push({ from: `p${k}@${host}`, at: new Date(Date.UTC(2026, 10, 2 + day, hour % 24, Math.floor(rand() * 60))).toISOString(), category: rand() < 0.3 ? "Interested" : "not now" });
  }
  for (let k = 0; k < count * 3; k++) {
    const host = PEOPLE[cc][k % PEOPLE[cc].length];
    sent.push({ to: `s${k}@${host}`, at: new Date(Date.UTC(2026, 10, 2 + Math.floor(rand() * 5), 13 + Math.floor(rand() * 8), 5)).toISOString(), kind: "campaign" });
  }
});
const leads = [];
Object.keys(PEOPLE).forEach((cc) => PEOPLE[cc].forEach((host, n) => {
  const campaign = geo.countries.find((r) => r.cc === cc).camps[0].name;
  for (let k = 0; k < 6; k++) leads.push({ campaign, cc, email: `l${n}${k}@${host}`, host: k ? "" : host });
}));
leads.push({ campaign: "W1 B-es Americas", cc: "AR", email: "x@unmatched.ar" });
const campaigns = [
  { id: "c1", name: "W1 B-es Americas", status: "active", window: "Mon-Fri 09:00-17:00 America/Bogota", sent: 620, replies: 21 },
  { id: "c2", name: "W1 E-pt Brazil", status: "active", window: "Mon-Thu 08:00-12:00 America/Sao_Paulo", sent: 180, replies: 1 },
  { id: "c3", name: "W1 A-es Europe", status: "paused", window: "Tue-Thu 09:30-13:00 Europe/Madrid", sent: 140, replies: 7 },
  { id: "c4", name: "W1 A-en US", status: "active", window: "Mon-Fri 10:00-16:00 America/Chicago", sent: 90, replies: 3 }
];
const hosts = [];
geo.countries.forEach((r) => r.sectors.forEach((s) => { for (let k = 0; k < s.value; k++) hosts.push({ host: `${r.cc.toLowerCase()}${k}.example`, cc: r.cc, sector: s.label }); }));
Object.keys(SECTOR).forEach((h) => hosts.push({ host: h, cc: Object.keys(PEOPLE).find((cc) => PEOPLE[cc].includes(h)), sector: SECTOR[h] }));
["agency", "tvet", "bank"].forEach((sector, n) => { for (let k = 0; k < 4 + n * 3; k++) hosts.push({ host: `${sector}${k}.co`, cc: ["CO", "MX", "ES"][(k + n) % 3], sector }); });

const input = { now: NOW, sync: { leads: { rows: leads }, replies }, queue: { hosts }, marketing: { sent: { rows: sent }, campaigns: { rows: campaigns } } };
const out = {
  heat: heat.heatRows(Object.assign({ countries: geo.countries }, input)),
  sectors: heat.sectorGrid(input)
};
fs.writeFileSync(path.join(root, "tests/fixtures/jarvis-geo-heat.json"), JSON.stringify(out) + "\n");
console.log("heat", out.heat.replies, "replies,", out.heat.sends, "sends; sectors", out.sectors.list.join(", "), "·", out.sectors.rows.length, "countries");
