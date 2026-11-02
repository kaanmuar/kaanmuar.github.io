// A Firestore stand-in for the Jarvis action tests: added rows (jarvis_actions) plus docs by id (jarvis_countdowns).
function fakeDb(rows) {
  const added = rows || [];
  const docs = {};
  const store = (name) => (docs[name] = docs[name] || new Map());
  const all = (name) => added.filter((r) => r._c === name).concat(Array.from(store(name).values()));
  const wrap = (r) => ({ data: () => Object.assign({}, r) });
  const ref = (name, id) => ({
    create: async (row) => { if (store(name).has(id)) throw new Error("6 ALREADY_EXISTS"); store(name).set(id, Object.assign({}, row)); },
    get: async () => { const d = store(name).get(id); return { exists: !!d, data: () => d && Object.assign({}, d) }; },
    update: async (patch) => { if (!store(name).has(id)) throw new Error("5 NOT_FOUND"); store(name).set(id, Object.assign({}, store(name).get(id), patch)); },
    set: async (row, opts) => { store(name).set(id, Object.assign({}, opts && opts.merge ? store(name).get(id) : {}, row)); }
  });
  return {
    added,
    doc: (name, id) => store(name).get(id),
    docs: (name) => Array.from(store(name).values()),
    collection: (name) => ({
      add: async (row) => { added.push(Object.assign({ _c: name }, row)); },
      doc: (id) => ref(name, id),
      where: (field, op, value) => ({ limit: () => ({ get: async () => ({ docs: all(name).filter((r) => (op === "in" ? value.includes(r[field]) : r[field] === value)).map(wrap) }) }) }),
      orderBy: (field) => ({ limit: (n) => ({ get: async () => ({ docs: all(name).slice().sort((a, b) => String(b[field]).localeCompare(String(a[field]))).slice(0, n).map(wrap) }) }) })
    }),
    runTransaction: async (fn) => fn({ get: (r) => r.get(), update: (r, patch) => { r.update(patch); } })
  };
}

module.exports = { fakeDb };
