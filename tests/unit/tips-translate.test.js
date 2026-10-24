const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const dir = path.join(__dirname, '../../scripts/tips-studio');

function keepHosts(src, out) {
  const code = 'import json, sys; from translate import keep_hosts; print(json.dumps(keep_hosts(sys.argv[1], sys.argv[2]), ensure_ascii=False))';
  return JSON.parse(execFileSync(process.env.PYTHON || 'python3', ['-c', code, src, out], { cwd: dir, encoding: 'utf8' }));
}

test('a domain the translator spaced is put back together from the English', () => {
  assert.equal(keepHosts('postobon.com: 49. The gap: labels.', 'postobon. com: 49. A lacuna: rótulos.'), 'postobon.com: 49. A lacuna: rótulos.');
  assert.equal(keepHosts('Real run on whatsapp.com', 'Ejecución real en whatsapp .com'), 'Ejecución real en whatsapp.com');
  assert.equal(keepHosts('co.computrabajo.com scores 68', 'co. computrabajo. com obtiene 68'), 'co.computrabajo.com obtiene 68');
});

test('a sentence that ends before a host is left alone', () => {
  assert.equal(keepHosts('Speed 76. co.computrabajo.com, 91 pages', 'Velocidad 76. co.computrabajo.com, 91 páginas'), 'Velocidad 76. co.computrabajo.com, 91 páginas');
  assert.equal(keepHosts('No host here. Done.', 'Aquí no hay host. Listo.'), 'Aquí no hay host. Listo.');
});
