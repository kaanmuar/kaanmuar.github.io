"use strict";
// An in-memory Firestore, enough for the engagement scout, the poster, a decision and the Jarvis source.
// Increments are { inc: n } (deps.inc), merged into numbers on a merge set.

function fakeDb() {
  const data = new Map();
  const get = (path) => data.get(path);
  const merge = (a, b) => {
    const out = Object.assign({}, a);
    Object.entries(b).forEach(([k, v]) => {
      if (v && v.inc !== undefined) out[k] = (out[k] || 0) + v.inc;
      else if (v && typeof v === "object" && !Array.isArray(v)) out[k] = merge(out[k] || {}, v);
      else out[k] = v;
    });
    return out;
  };
  const setPath = (obj, dotted, v) => { const parts = dotted.split("."); let o = obj; parts.slice(0, -1).forEach((p) => { o[p] = Object.assign({}, o[p]); o = o[p]; }); o[parts[parts.length - 1]] = v; };
  const at = (obj, dotted) => dotted.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
  const snap = (path) => ({ id: path.split("/").pop(), exists: data.has(path), data: () => JSON.parse(JSON.stringify(get(path) || {})), get: (k) => at(get(path) || {}, k), ref: docRef(path) });
  function docRef(path) {
    return {
      path, id: path.split("/").pop(),
      get: async () => snap(path),
      set: async (v, o) => { data.set(path, o && o.merge ? merge(get(path) || {}, v) : merge({}, v)); },
      update: async (v) => { const cur = JSON.parse(JSON.stringify(get(path) || {})); Object.entries(v).forEach(([k, x]) => setPath(cur, k, x)); data.set(path, cur); },
      delete: async () => { data.delete(path); }
    };
  }
  const passes = (x, op, v) => (op === "==" ? x === v : op === ">=" ? x >= v : op === "<" ? x < v : op === "in" ? v.includes(x) : true);
  function query(coll, filters, order, lim) {
    return {
      where: (f, op, v) => query(coll, filters.concat([[f, op, v]]), order, lim),
      orderBy: (f, dir) => query(coll, filters, [f, dir || "asc"], lim),
      limit: (n) => query(coll, filters, order, n),
      get: async () => {
        let rows = Array.from(data.keys()).filter((p) => p.startsWith(coll + "/") && p.split("/").length === 2).map((p) => snap(p));
        filters.forEach(([f, op, v]) => { rows = rows.filter((s) => passes(at(s.data(), f), op, v)); });
        if (order) rows.sort((a, b) => String(at(a.data(), order[0])).localeCompare(String(at(b.data(), order[0]))) * (order[1] === "desc" ? -1 : 1));
        return { docs: rows.slice(0, lim || rows.length) };
      }
    };
  }
  return {
    data,
    collection: (name) => Object.assign(query(name, [], null, 0), { doc: (id) => docRef(name + "/" + id) }),
    getAll: async (...refs) => refs.map((r) => snap(r.path)),
    batch: () => { const ops = []; return { set: (r, v) => ops.push(() => r.set(v)), update: (r, v) => ops.push(() => r.update(v)), commit: async () => { for (const op of ops) await op(); } }; },
    runTransaction: async (fn) => fn({ get: (r) => r.get(), update: (r, v) => r.update(v), set: (r, v) => r.set(v) })
  };
}

module.exports = { fakeDb };
