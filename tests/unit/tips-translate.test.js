const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const dir = path.join(__dirname, '../../scripts/tips-studio');

function py(call, ...args) {
  const code = 'import json, sys; from translate import *; args = json.loads(sys.argv[1]); print(json.dumps(' + call + ', ensure_ascii=False))';
  return JSON.parse(execFileSync(process.env.PYTHON || 'python3', ['-c', code, JSON.stringify(args)], { cwd: dir, encoding: 'utf8' }));
}
const keepHosts = (src, out) => py('keep_hosts(*args)', src, out);
const pieces = (text) => py('pieces(*args)', text);
const keepCase = (cases) => py('[keep_case(*c[:3]) for c in args[0]]', cases);
// The fake translator upper-cases each fragment, so anything left as written never went to it.
const translate = (text) => py('translate(args[0], "es", {"es\\x00" + p: p.upper() for p in pieces(args[0])})', text);

test('a domain the translator spaced is put back together from the English', () => {
  assert.equal(keepHosts('postobon.com: 49. The gap: labels.', 'postobon. com: 49. A lacuna: rótulos.'), 'postobon.com: 49. A lacuna: rótulos.');
  assert.equal(keepHosts('Real run on whatsapp.com', 'Ejecución real en whatsapp .com'), 'Ejecución real en whatsapp.com');
  assert.equal(keepHosts('co.computrabajo.com scores 68', 'co. computrabajo. com obtiene 68'), 'co.computrabajo.com obtiene 68');
});

test('an English clip never asks the translator', () => {
  const code = 'import json, translate; translate.gtx = lambda *a: (_ for _ in ()).throw(SystemExit("asked")); cache = {}; translate.fill(["Hello there."], "en", cache); print(json.dumps(cache))';
  assert.equal(execFileSync(process.env.PYTHON || 'python3', ['-c', code], { cwd: dir, encoding: 'utf8' }).trim(), '{}');
});

test('a sentence that ends before a host is left alone', () => {
  assert.equal(keepHosts('Speed 76. co.computrabajo.com, 91 pages', 'Velocidad 76. co.computrabajo.com, 91 páginas'), 'Velocidad 76. co.computrabajo.com, 91 páginas');
  assert.equal(keepHosts('No host here. Done.', 'Aquí no hay host. Listo.'), 'Aquí no hay host. Listo.');
});

test('brand and product names, handles and category labels never reach the translator', () => {
  assert.deepEqual(pieces('Requested reviews · QA-lab URL Review'), ['Requested reviews']);
  assert.deepEqual(pieces('One analysis, requested through QA-lab URL Review. A starting point.'), ['One analysis, requested through', 'A starting point.']);
  assert.deepEqual(pieces('Horror headers · QA'), ['Horror headers']);
  assert.deepEqual(pieces('See the Live Reports on carlosandmunoz.com/qa-review.html by @kaanmuar'), ['See the', 'on', 'by']);
  assert.equal(translate('Requested reviews · QA-lab URL Review'), 'REQUESTED REVIEWS · QA-lab URL Review');
  assert.equal(translate('Horror headers · QA\nhttps://carlosandmunoz.com/x #QA'), 'HORROR HEADERS · QA\nhttps://carlosandmunoz.com/x #QA');
  assert.equal(translate('Built on QA-lab, not on guesses'), 'BUILT ON QA-lab, NOT ON GUESSES');
});

test('each emphasised span keeps its marks through translation', () => {
  assert.deepEqual(pieces('*your HTML,* not your app.'), ['your HTML,', 'not your app.']);
  assert.equal(translate('*your HTML,* not your app.'), '*YOUR HTML,* NOT YOUR APP.');
  assert.equal(translate('One header. *180 days* of HTTPS only.'), 'ONE HEADER. *180 DAYS* OF HTTPS ONLY.');
  assert.equal(translate('*one canonical.*'), '*ONE CANONICAL.*');
  assert.equal(translate('*QA-lab URL Review*'), '*QA-lab URL Review*');
});

test('a finished translation is split into the same fragments as its English', () => {
  const pair = (src, out) => py('pair(*args)', src, out);
  assert.deepEqual(pair('One header. *180 days* of HTTPS only.', 'Un encabezado. *180 días* solo de HTTPS.'),
    [['One header.', 'Un encabezado.'], ['180 days', '180 días'], ['of HTTPS only.', 'solo de HTTPS.']]);
  assert.deepEqual(pair('Requested reviews · QA-lab URL Review', 'Análisis solicitados · QA-lab URL Review'), [['Requested reviews', 'Análisis solicitados']]);
  assert.deepEqual(pair('The answer.\n\nGuide: https://x.com/a\n\n#QA #WebDev', 'La respuesta.\n\nGuía: https://x.com/a'),
    [['The answer.', 'La respuesta.'], ['Guide:', 'Guía:']]);
  assert.deepEqual(pair('*One point apart.*', 'Un punto de diferencia.'), []);
  assert.deepEqual(pair('Read it · QA-lab', 'Léelo QA-lab'), []);
});

test('a translation left behind by an English edit is not learned as the new English', () => {
  const src = (title, body) => ({ ui: {}, clips: { a: { lang: 'es', strings: { title, body } } } });
  const done = (title, body) => ({ ui: {}, clips: { a: { title, body } }, cache: {} });
  const versions = [
    [src('Answer in our next post.', 'Ten pages.'), done('Respuesta en nuestra próxima publicación.', 'Diez páginas.')],
    [src('Answer comes out tomorrow.', 'Twelve pages.'), done('Respuesta en nuestra próxima publicación.', 'Doce páginas.')]
  ];
  assert.deepEqual(py('seed(args[0])', versions), {
    'es\u0000Answer in our next post.': 'Respuesta en nuestra próxima publicación.',
    'es\u0000Ten pages.': 'Diez páginas.',
    'es\u0000Twelve pages.': 'Doce páginas.'
  });
});

test('no batch is committed with translations but an empty cache', () => {
  const root = path.join(__dirname, '../../media/social-posts');
  const empty = fs.readdirSync(root).filter((batch) => {
    const file = path.join(root, batch, 'i18n.json');
    if (!fs.existsSync(file)) return false;
    const done = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Object.keys(done.clips || {}).length && !Object.keys(done.cache || {}).length;
  });
  assert.deepEqual(empty, [], 'run python3 scripts/tips-studio/translate.py media/social-posts/<batch> --seed');
});

test('a translated fragment starts in the case the English starts', () => {
  const cases = [
    ['Exorcise it', 'exorcizarlo', 'es', 'Exorcizarlo'],
    ['Tip', 'consejo', 'es', 'Consejo'],
    ['not your app.', 'No es tu app.', 'es', 'no es tu app.'],
    ['every input', 'Jede Eingabe', 'de', 'Jede Eingabe'],
    ['iPhone users', 'iPhone usuarios', 'es', 'iPhone usuarios'],
    ['180 days', '180 días', 'es', '180 días']
  ];
  assert.deepEqual(keepCase(cases), cases.map((c) => c[3]));
});
