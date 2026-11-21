const test = require("node:test");
const assert = require("node:assert/strict");
const R = require("../../functions/retention");

const NOW = Date.parse("2026-11-19T12:00:00Z");
const ago = (months) => {
	const d = new Date(NOW);
	d.setUTCMonth(d.getUTCMonth() - months);
	return d.toISOString();
};
const policy = (name) => R.POLICY.find((p) => p.collection === name);

test("outreach rows go 12 months after the latest contact, not the first", () => {
	const old = { stage: "found", updatedAt: ago(14), createdAt: ago(20), threads: [{ lastAt: ago(13) }] };
	assert.equal(R.decide(policy("outreach_people"), old, NOW), "delete");
	const recentThread = { stage: "found", updatedAt: ago(14), createdAt: ago(20), threads: [{ lastAt: ago(3) }] };
	assert.equal(R.decide(policy("outreach_people"), recentThread, NOW), "keep");
	const futureStep = { stage: "found", updatedAt: ago(20), createdAt: ago(20), nextAt: "2027-01-01T00:00:00Z" };
	assert.equal(R.decide(policy("outreach_people"), futureStep, NOW), "keep");
});

test("a declined or blocked person past the period is trimmed to a stub, and the stub is kept", () => {
	const blocked = { stage: "blocked", kind: "social", network: "x", handle: "a", email: "a@b.co", updatedAt: ago(15), name: "Ana", notes: "private", dms: [{ at: ago(15), text: "hi" }] };
	assert.equal(R.decide(policy("outreach_people"), blocked, NOW), "trim");
	const stub = R.stubOf(blocked, NOW);
	assert.equal(stub.trimmed, true);
	assert.equal(stub.email, "a@b.co");
	assert.equal(stub.handle, "a");
	assert.equal(stub.stage, "blocked");
	assert.equal("name" in stub || "notes" in stub || "dms" in stub, false);
	assert.equal(R.decide(policy("outreach_people"), stub, NOW), "keep");
});

test("engagement posts take the latest of seen, decided, posted and updated", () => {
	const p = policy("engagement_posts");
	assert.equal(R.decide(p, { seenAt: ago(13), decidedAt: ago(2) }, NOW), "keep");
	assert.equal(R.decide(p, { seenAt: ago(13), decidedAt: ago(13), postedAt: ago(13) }, NOW), "delete");
});

test("messages and ratings keep 24 months, and read Firestore timestamps as well as ISO text", () => {
	const ts = { toDate: () => new Date(Date.parse(ago(23))) };
	assert.equal(R.decide(policy("messages"), { createdAt: ts }, NOW), "keep");
	assert.equal(R.decide(policy("messages"), { createdAt: ago(25) }, NOW), "delete");
	assert.equal(R.decide(policy("ratings"), { createdAt: ago(25) }, NOW), "delete");
});

test("a booking is kept until 24 months after its call, even when made long before", () => {
	const future = { createdAt: ago(30), start: "2027-03-01T15:00:00Z", end: "2027-03-01T15:30:00Z" };
	assert.equal(R.decide(policy("bookings"), future, NOW), "keep");
	const past = { createdAt: ago(30), start: ago(26), end: ago(26) };
	assert.equal(R.decide(policy("bookings"), past, NOW), "delete");
});

test("an unpaid fix request goes 12 months after its last change; a paid one follows the tax period", () => {
	const p = policy("url_review_fix_requests");
	assert.equal(R.decide(p, { createdAt: ago(20), updatedAt: ago(13), status: "new" }, NOW), "delete");
	assert.equal(R.decide(p, { createdAt: ago(20), updatedAt: ago(3), status: "quoted" }, NOW), "keep");
	assert.equal(R.decide(p, { createdAt: ago(20), updatedAt: ago(15), status: "done", paidAt: ago(15) }, NOW), "keep");
	assert.equal(R.decide(p, { createdAt: ago(20), updatedAt: ago(15), paid: { priceUsd: 99 }, paidAt: ago(15) }, NOW), "keep");
	assert.equal(
		R.decide(p, { createdAt: "2018-06-01T00:00:00Z", paidAt: "2018-06-01T00:00:00Z", paid: true }, NOW),
		"delete"
	);
	assert.equal(
		R.decide(p, { createdAt: "2018-06-01T00:00:00Z", paidAt: "2018-06-01T00:00:00Z", paid: true, taxHold: true }, NOW),
		"keep"
	);
});

test("payment rows and coupon redemptions go on January 1 of the sixth year after the payment", () => {
	const pay = policy("url_reviews");
	const redeem = policy("url_review_redemptions");
	assert.equal(R.decide(pay, { status: "done", createdAt: "2018-06-01T00:00:00Z" }, NOW), "keep");
	assert.equal(R.decide(pay, { status: "paid-report", createdAt: "2018-06-01T00:00:00Z" }, NOW), "delete");
	assert.equal(R.decide(pay, { status: "run-credit", createdAt: "2026-10-01T00:00:00Z" }, NOW), "keep");
	assert.equal(R.decide(pay, { status: "monthly-pass", createdAt: "2018-06-01T00:00:00Z", taxHold: true }, NOW), "keep");
	assert.equal(
		R.decide(pay, { status: "paid-addon", createdAt: "2018-06-01T00:00:00Z", expireAt: "2099-01-01T00:00:00Z" }, NOW),
		"keep"
	);
	assert.equal(R.decide(redeem, { at: "2018-06-01T00:00:00Z" }, NOW), "delete");
	assert.equal(R.decide(redeem, { at: "2026-10-01T00:00:00Z" }, NOW), "keep");
});

test("webhook claim records go 3 months after the last touch (#3837)", () => {
	const p = policy("webhook_events");
	assert.equal(R.decide(p, { firstSeenAt: ago(4), finishedAt: ago(4) }, NOW), "delete");
	assert.equal(R.decide(p, { firstSeenAt: ago(4), lastSeenAt: ago(1) }, NOW), "keep");
});

test("a row without a readable date is kept, not deleted", () => {
	assert.equal(R.decide(policy("ratings"), {}, NOW), "undated");
	assert.equal(R.decide(policy("messages"), { createdAt: "not a date" }, NOW), "undated");
});

// A small Firestore stand-in: collections of docs keyed by id, with the query calls sweep() makes.
function fakeDb(data) {
	const writes = [];
	const store = {};
	for (const [name, docs] of Object.entries(data)) store[name] = new Map(Object.entries(docs));
	const db = {
		writes,
		collection(name) {
			const map = store[name] || (store[name] = new Map());
			const ref = (id) => ({ id, path: name + "/" + id, get data() { return map.get(id); } });
			const docRef = (id) => ({
				id,
				set: async (v) => { writes.push({ op: "set", name, id, v }); map.set(id, v); },
			});
			const query = (start, limit) => ({
				orderBy() { return query(start, limit); },
				limit(n) { return query(start, n); },
				startAfter(doc) { return query(doc.id, limit); },
				async get() {
					const ids = [...map.keys()].sort().filter((id) => !start || id > start).slice(0, limit);
					return {
						size: ids.length,
						empty: ids.length === 0,
						docs: ids.map((id) => ({ id, ref: { id, name }, data: () => map.get(id) })),
					};
				},
			});
			return Object.assign(query(null, 300), { doc: docRef });
		},
		batch() {
			const ops = [];
			return {
				delete: (ref) => ops.push({ op: "delete", name: ref.name, id: ref.id }),
				set: (ref, v) => ops.push({ op: "set", name: ref.name, id: ref.id, v }),
				commit: async () => {
					for (const o of ops) {
						writes.push(o);
						if (o.op === "delete") store[o.name].delete(o.id);
						else store[o.name].set(o.id, o.v);
					}
				},
			};
		},
	};
	return db;
}

test("a dry run plans the work and writes nothing but its run record", async () => {
	const db = fakeDb({
		messages: { m1: { createdAt: ago(30) }, m2: { createdAt: ago(1) } },
		outreach_people: { p1: { stage: "blocked", updatedAt: ago(20), email: "x@y.co" }, p2: { stage: "found", updatedAt: ago(1) } },
	});
	const report = await R.sweep(db, { now: NOW, apply: false });
	assert.equal(report.collections.messages.delete, 1);
	assert.equal(report.collections.messages.keep, 1);
	assert.equal(report.collections.outreach_people.trim, 1);
	assert.equal(report.apply, false);
	assert.deepEqual(db.writes.map((w) => w.name), ["retention_runs"]);
});

test("apply deletes expired rows, leaves a stub for a stopped person, and keeps the rest", async () => {
	const db = fakeDb({
		messages: { m1: { createdAt: ago(30) }, m2: { createdAt: ago(1) } },
		outreach_people: { p1: { stage: "blocked", updatedAt: ago(20), email: "x@y.co", name: "X" }, p2: { stage: "found", updatedAt: ago(1) } },
	});
	const report = await R.sweep(db, { now: NOW, apply: true });
	assert.equal(report.apply, true);
	const names = [...db.writes.filter((w) => w.op === "delete").map((w) => w.name + "/" + w.id)];
	assert.deepEqual(names, ["messages/m1"]);
	const stub = db.writes.find((w) => w.op === "set" && w.name === "outreach_people");
	assert.equal(stub.v.trimmed, true);
	assert.equal(stub.v.email, "x@y.co");
	assert.equal(stub.v.name, undefined);
});

test("the per-run cap defers the rest to the next run", async () => {
	const db = fakeDb({ messages: { a: { createdAt: ago(30) }, b: { createdAt: ago(30) }, c: { createdAt: ago(30) } } });
	const report = await R.sweep(db, { now: NOW, apply: true, maxWrites: 2 });
	assert.equal(report.collections.messages.delete, 2);
	assert.equal(report.collections.messages.deferred, 1);
	assert.equal(db.writes.filter((w) => w.op === "delete").length, 2);
});
