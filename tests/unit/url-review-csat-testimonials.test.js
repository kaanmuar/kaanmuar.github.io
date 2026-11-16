const test = require("node:test");
const assert = require("node:assert/strict");
const testimonials = require("../../functions/url-review-csat-testimonials.js");
const csat = require("../../functions/url-review-csat.js");

test("qualifies needs quote ok, stars, NPS and comment length", () => {
  assert.equal(testimonials.qualifies({ quoteOk: true, rating: 5, nps: 9, comment: "This report was clear and actionable." }), true);
  assert.equal(testimonials.qualifies({ quoteOk: false, rating: 5, nps: 9, comment: "x".repeat(30) }), false);
  assert.equal(testimonials.qualifies({ quoteOk: true, rating: 3, nps: 9, comment: "x".repeat(30) }), false);
  assert.equal(testimonials.qualifies({ quoteOk: true, rating: 5, nps: 6, comment: "x".repeat(30) }), false);
});

test("recurWindow is 7–8 days before now", () => {
  const now = new Date("2026-11-16T15:00:00Z");
  const w = csat.recurWindow(now);
  assert.equal(w.after, "2026-11-08T15:00:00.000Z");
  assert.equal(w.before, "2026-11-09T15:00:00.000Z");
});

function mockDb(seed) {
  const data = JSON.parse(JSON.stringify(seed || {}));
  const path = (name, id) => `${name}/${id}`;
  const ref = (name, id) => ({
    id: id || "",
    get: async () => ({ exists: !!data[path(name, id)], data: () => data[path(name, id)] || {} }),
    set: async (patch, opts) => {
      data[path(name, id)] = Object.assign({}, data[path(name, id)] || {}, patch);
    },
    collection: (n) => collection(n)
  });
  const runTransaction = async (fn) => {
    const tx = {
      get: async (r) => r.get(),
      set: (r, patch) => r.set(patch)
    };
    await fn(tx);
  };
  function collection(name) {
    return {
      doc: (id) => ref(name, id),
      where: (field, op, value) => ({
        limit: () => ({
          get: async () => {
            const docs = Object.keys(data).filter((k) => k.startsWith(name + "/") && data[k][field] === value).map((k) => {
              const id = k.slice(name.length + 1);
              return { id, data: () => data[k], ref: ref(name, id) };
            });
            return { empty: !docs.length, docs };
          }
        })
      }),
      add: async (row) => {
        const id = "gen" + Object.keys(data).length;
        data[path(name, id)] = row;
        return ref(name, id);
      }
    };
  }
  return { data, collection, runTransaction };
}

test("decide approves into CV testimonials and socialHub live", async () => {
  const db = mockDb({
    "url_review_csat_testimonials/c1": { status: "pending", host: "acme.com", quote: "Great review process.", rating: 5, nps: 10, lang: "en", reviewId: "rev1", createdAt: "2026-11-15T12:00:00Z" },
    "socialHub/live": { json: "{\"version\":1,\"items\":[],\"edits\":{}}" }
  });
  const out = await testimonials.decide(db, { id: "c1", decision: "approved", operator: "owner@test.com" });
  assert.equal(out.decision, "approved");
  assert.equal(out.cv, true);
  assert.equal(out.social, true);
  assert.equal(db.data["url_review_csat_testimonials/c1"].status, "approved");
  assert.ok(Object.keys(db.data).some((k) => k.startsWith("testimonials/")));
  const live = JSON.parse(db.data["socialHub/live"].json);
  assert.equal(live.items.length, 1);
  assert.match(live.items[0].id, /^pick\/csat-/);
});

test("decide dismisses without publishing", async () => {
  const db = mockDb({
    "url_review_csat_testimonials/c2": { status: "pending", host: "x.com", quote: "x".repeat(30), rating: 5, nps: 9, createdAt: "2026-11-15T12:00:00Z" }
  });
  const out = await testimonials.decide(db, { id: "c2", decision: "dismissed" });
  assert.equal(out.decision, "dismissed");
  assert.equal(out.cv, false);
  assert.equal(db.data["url_review_csat_testimonials/c2"].status, "dismissed");
});