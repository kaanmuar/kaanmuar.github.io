// Firestore as Jarvis uses it, counting reads the way Firestore bills them: one per document returned, one for an
// empty query, one per count or aggregation. Rows are { collection: [{ id, ...fields }] }; docs holds set documents.
function fakeDb(rows) {
  const docs = {};
  const stats = { reads: 0, queries: [] };
  const ms = (v) => (v && typeof v.toDate === "function" ? v.toDate().getTime() : v instanceof Date ? v.getTime() : typeof v === "string" ? Date.parse(v) : v);
  const plainValue = (value) => typeof value === "boolean" || typeof value === "string" && !/^\d{4}-/.test(value);
  const pass = (row, [field, op, value]) => {
    if (row[field] === undefined) return false;
    const a = plainValue(value) ? row[field] : ms(row[field]);
    const b = plainValue(value) ? value : ms(value);
    return op === ">=" ? a >= b : op === ">" ? a > b : op === "<" ? a < b : op === "==" ? a === b : false;
  };
  const pick = (row, fields) => {
    if (!fields) return Object.assign({}, row);
    const out = {};
    fields.forEach((f) => {
      const [head, sub] = f.split(".");
      if (!(head in row)) return;
      if (!sub) out[head] = row[head];
      else if (row[head] && sub in row[head]) out[head] = Object.assign(out[head] || {}, { [sub]: row[head][sub] });
    });
    return out;
  };
  const merge = (a, b) => {
    const out = Object.assign({}, a);
    Object.keys(b).forEach((k) => { out[k] = b[k] && typeof b[k] === "object" && !Array.isArray(b[k]) && !(b[k] instanceof Date) && a[k] ? merge(a[k], b[k]) : b[k]; });
    return out;
  };
  const matching = (name, filters) => (rows[name] || []).filter((r) => filters.every((f) => pass(r, f)));
  const query = (name, filters, fields, order, cap) => ({
    where: (f, op, v) => query(name, filters.concat([[f, op, v]]), fields, order, cap),
    orderBy: (f, dir) => query(name, filters, fields, { f, desc: dir === "desc" }, cap),
    select: (...f) => query(name, filters, f, order, cap),
    limit: (n) => query(name, filters, fields, order, n),
    count: () => ({ get: async () => { stats.reads += 1; return { data: () => ({ count: matching(name, filters).length }) }; } }),
    aggregate: (spec) => ({
      get: async () => {
        stats.reads += 1;
        const list = matching(name, filters);
        const out = {};
        Object.keys(spec).forEach((k) => { out[k] = list.reduce((sum, r) => sum + (Number(r[spec[k].field]) || 0), 0); });
        return { data: () => out };
      }
    }),
    get: async () => {
      let list = matching(name, filters);
      if (order) list = list.slice().sort((x, y) => (order.desc ? -1 : 1) * (ms(x[order.f]) - ms(y[order.f])));
      if (cap) list = list.slice(0, cap);
      stats.reads += Math.max(1, list.length);
      stats.queries.push(name);
      return { docs: list.map((r) => ({ id: r.id, data: () => pick(r, fields), get: (f) => r[f] })) };
    },
    doc: (id) => ({
      get: async () => { stats.reads += 1; const d = docs[name + "/" + id]; return { exists: !!d, data: () => d }; },
      set: async (value, opts) => { docs[name + "/" + id] = opts && opts.merge ? merge(docs[name + "/" + id] || {}, value) : value; },
      delete: async () => { delete docs[name + "/" + id]; }
    })
  });
  return { collection: (name) => query(name, []), docs, stats };
}

// The aggregate field spec Firestore's AggregateField.sum makes.
const sum = (field) => ({ field });

module.exports = { fakeDb, sum };
