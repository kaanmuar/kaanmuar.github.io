const test = require("node:test");
const assert = require("node:assert/strict");
const roundup = require("../../scripts/sweep-roundup");
const admin = require("../../js/social-hub-admin");

const fail = (id) => ({ verdict: "fail", msg: { title: { id } } });

function week(n) {
  return Array.from({ length: n }, (_, i) => ({
    series: "auto", read: "2026-10-2" + (6 + (i % 4)), host: "www.site" + i + ".example", name: "Example Company " + i, country: ["CO", "MX", "ES"][i % 3], overall: 50 + i,
    fix: [fail("a11y-labels.title"), fail("a11y-labels.title"), i % 2 ? fail("sec-hsts.title") : { verdict: "risk", msg: { title: { id: "sec-hsts.title" } } }, i % 4 === 0 ? fail("ax-title.link-name") : fail("unknown.title")]
  }));
}

test("counts each failed check once per sweep site in the week before the run day", () => {
  const cards = week(40).concat([{ series: "auto", read: "2026-11-02", fix: [fail("a11y-labels.title")] }, { series: "runs-3", read: "2026-10-27", fix: [fail("a11y-labels.title")] }]);
  const r = roundup.roundup(cards, "2026-11-02");
  assert.equal(r.from, "2026-10-26");
  assert.equal(r.to, "2026-11-01");
  assert.equal(r.sites, 40);
  assert.equal(r.countries, 3);
  assert.deepEqual(r.issues.map((i) => [i.id, i.share]), [["a11y-labels.title", 100], ["sec-hsts.title", 50], ["ax-title.link-name", 25]]);
});

test("the post names no swept site and links to the sample report", () => {
  const r = roundup.roundup(week(40), "2026-11-02");
  const p = roundup.proposal(r);
  assert.match(p.id, admin.PROPOSAL_ID);
  assert.equal(p.own, true);
  assert.equal(p.image, "assets/social/sweep-roundup/2026-11-02.jpg");
  assert.ok(admin.imageOk(p.image));
  assert.match(p.summary, /40 public websites in 3 countries/);
  assert.match(p.summary, /among each site's top issues/);
  assert.ok(!/site\d+\.example|Example Company/.test(p.summary + p.title));
  assert.equal(p.url, "https://carlosandmunoz.com/qa-review.html?sample=1&week=2026-11-02");
  assert.match(p.summary, /See one full case and its fix in our sample report:\nhttps:\/\/carlosandmunoz\.com\/qa-review\.html\?sample=1&week=2026-11-02\n/);
});

test("assertNeutral stops a host or a whole-word site name, not a common word inside a label", () => {
  const r = { hosts: ["www.acme-shop.example"], names: ["Links", "Contrast Studio"] };
  assert.throws(() => roundup.assertNeutral("Seen on acme-shop.example", r), /names a swept site/);
  assert.throws(() => roundup.assertNeutral("Thanks, Contrast Studio!", r), /names a swept site/);
  assert.equal(roundup.assertNeutral("Links with no readable name; text with too little contrast", r), "Links with no readable name; text with too little contrast");
});

test("each week's link differs, so an approved round-up does not hide the next one", () => {
  const live = { items: [{ url: roundup.link("2026-11-02") }], decisions: {} };
  const next = roundup.proposal(roundup.roundup(week(40).map((c) => Object.assign({}, c, { read: c.read.replace("2026-10-2", "2026-11-0") })), "2026-11-09"));
  assert.equal(admin.pendingProposals([next], live).length, 1);
});

test("the book keeps the newest round-ups and replaces a rerun of the same week", () => {
  const p = (date) => ({ id: date.replace(/-/g, "").padEnd(12, "0").slice(0, 12), date });
  let book = null;
  ["2026-09-28", "2026-10-05", "2026-10-12", "2026-10-19", "2026-10-26", "2026-11-02", "2026-11-09"].forEach((d) => { book = roundup.nextBook(book, p(d), "now"); });
  book = roundup.nextBook(book, p("2026-11-09"), "now");
  assert.deepEqual(book.proposals.map((x) => x.date), ["2026-11-09", "2026-11-02", "2026-10-26", "2026-10-19", "2026-10-12", "2026-10-05"]);
});

test("mergeProposals joins the field sweep and round-up books; own posts carry no Via credit", () => {
  const merged = admin.mergeProposals({ built: "2026-11-01T13:00:00Z", proposals: [{ id: "aaaaaaaaaaaa" }] }, null, { built: "2026-11-02T14:00:00Z", proposals: [{ id: "bbbbbbbbbbbb" }, { id: "aaaaaaaaaaaa" }] });
  assert.deepEqual(merged.proposals.map((p) => p.id), ["aaaaaaaaaaaa", "bbbbbbbbbbbb"]);
  assert.equal(merged.built, "2026-11-02T14:00:00Z");
  const own = admin.proposalDraft({ id: "bbbbbbbbbbbb", title: "Nightly sweep", url: "https://carlosandmunoz.com/qa-review.html?week=2026-11-02", source: "URL Review nightly sweep", own: true, summary: "Body", date: "2026-11-02" }, "2026-11-02");
  assert.equal(own.text, "Body");
  const theirs = admin.proposalDraft({ id: "aaaaaaaaaaaa", title: "News", url: "https://example.org/a", source: "Example", summary: "Body", date: "2026-11-01" }, "2026-11-02");
  assert.match(theirs.text, /Via Example, 2026-11-01\.$/);
});

test("the card shows the shares and no site", () => {
  const html = roundup.cardHtml(roundup.roundup(week(40), "2026-11-02"));
  assert.match(html, /100%<\/b><span>Form fields without a label/);
  assert.ok(!/site\d+\.example/.test(html));
});
