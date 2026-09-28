const catalog = require('./catalog.json');

function wantedSet() {
  return new Set(String(process.env.CATALOG_IDS || '').split(',').map((item) => item.trim()).filter(Boolean));
}

function decorate(row) {
  return {
    id: row.id,
    layer: row.layer,
    title: row.title,
    path: row.path,
    phone: !!row.phone,
    async run(session) {
      if (row.phone) await session.setPhone();
      else await session.setDesktop();
      await session.open(row.path);
      await session.runCatalog(row.id);
    }
  };
}

const ALL = catalog.map(decorate);
const wanted = wantedSet();
const CASES = ALL.filter((item) => !wanted.size || wanted.has(item.id));

module.exports = { ALL, CASES, catalog };
