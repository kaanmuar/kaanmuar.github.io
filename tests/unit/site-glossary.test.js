const test = require("node:test");
const assert = require("node:assert/strict");
const Glossary = require("../../js/site-glossary.js");

const { fix, check, line, FIXES } = Glossary;

test("Spanish: a review is a revisión, never a reseña", () => {
  assert.equal(fix("¿Qué es una reseña?", "es"), "¿Qué es una revisión?");
  assert.equal(fix("Lee lo que la reseña hará. Las reseñas guardadas.", "es"), "Lee lo que la revisión hará. Las revisiones guardadas.");
});

test("Spanish: a read is an análisis, with the masculine article", () => {
  assert.equal(fix("Una lectura pública, sin acceso.", "es"), "Un análisis público, sin acceso.");
  assert.equal(fix("Para una lectura más extensa o profunda, y para cada lectura posterior", "es"), "Para un análisis más extenso o profundo, y para cada análisis posterior");
  assert.equal(fix("Sitios reales. Lecturas reales.", "es"), "Sitios reales. Análisis reales.");
  assert.equal(fix("Leemos GOV.UK. Leímos la BBC.", "es"), "Analizamos GOV.UK. Analizamos la BBC.");
  assert.equal(fix("Páginas leídas", "es"), "Páginas analizadas");
});

test("Spanish: reading words that mean reading stay", () => {
  for (const text of ["Solo lectura.", "El orden de lectura importa.", "La BBC decide quién puede leerlo.", "Python.org se lee bien.", "Un lector de pantalla"]) {
    assert.equal(fix(text, "es"), text);
  }
});

test("Spanish is Latin American and uses tú", () => {
  assert.equal(fix("Vea informes en directo de sitios reales", "es"), "Mira informes en vivo de sitios reales");
  assert.equal(fix("Consulte un informe de muestra.", "es"), "Consulta un informe de muestra.");
  assert.equal(fix("Guarda el vídeo en tu ordenador o en el móvil.", "es"), "Guarda el video en tu computador o en el celular.");
  assert.equal(fix("Todos los controles permanecen desactivados hasta que usted acepte.", "es"), "Todos los controles permanecen desactivados hasta que aceptes.");
  assert.equal(fix("no envía cabeceras de seguridad", "es"), "no envía encabezados de seguridad");
  assert.equal(fix("pulsa una sola vez el botón", "es"), "presiona una sola vez el botón");
});

test("product names survive machine translation", () => {
  assert.equal(fix("Faro 95 móvil", "es"), "Lighthouse 95 móvil");
  assert.equal(fix("Farol 95 móvel", "pt"), "Lighthouse 95 móvel");
  assert.equal(fix("Faro 95 mobile", "it"), "Lighthouse 95 mobile");
  assert.equal(fix("El faro de la costa", "es"), "El faro de la costa");
  assert.equal(line("QA-lab", "es"), "QA-lab");
  assert.equal(line("URL Review", "de"), "URL Review");
  for (const name of ["Safe Browsing", "MTA-STS", "TLS-RPT", "BIMI", "Impressum", "RDAP", "retire.js"]) assert.equal(line(name, "fr"), name);
  assert.equal(fix("Las listas de Navegación Segura de Google no marcan el sitio.", "es"), "Las listas de Safe Browsing de Google no marcan el sitio.");
  assert.equal(fix("As listas de Navegação Segura do Google", "pt"), "As listas de Safe Browsing do Google");
  assert.equal(fix("Les listes de Navigation sécurisée de Google", "fr"), "Les listes de Safe Browsing de Google");
  assert.equal(fix("Le liste di Navigazione sicura di Google", "it"), "Le liste di Safe Browsing di Google");
  assert.equal(fix("comparado con la lista de retirar.js", "es"), "comparado con la lista de retire.js");
});

test("Portuguese is Brazilian and keeps read-only", () => {
  assert.equal(fix("A resenha mostra a leitura pública.", "pt"), "A revisão mostra a análise pública.");
  assert.equal(fix("Salve o ficheiro no ecrã do telemóvel.", "pt"), "Salve o arquivo na tela do celular.");
  assert.equal(fix("Só leitura.", "pt"), "Só leitura.");
});

test("German, French, and Italian drop the reading metaphor", () => {
  assert.equal(fix("Was ist eine Rezension? Wir haben GOV.UK gelesen.", "de"), "Was ist eine Prüfung? Wir haben GOV.UK geprüft.");
  assert.equal(fix("Une lecture publique. Nous avons lu GOV.UK.", "fr"), "Une analyse publique. Nous avons analysé GOV.UK.");
  assert.equal(fix("Consultation en lecture seule.", "fr"), "Consultation en lecture seule.");
  assert.equal(fix("Una lettura pubblica. La recensione. Abbiamo letto GOV.UK.", "it"), "Un’analisi pubblica. La revisione. Abbiamo analizzato GOV.UK.");
  assert.equal(fix("Sola lettura.", "it"), "Sola lettura.");
});

test("curated lines replace whole headings", () => {
  assert.equal(line("What a review is", "es"), "¿Qué es una revisión?");
  assert.equal(line("  What a   review is ", "pt"), "O que é uma revisão");
  assert.equal(line("What a review is", "en"), null);
  assert.equal(line("Something else", "es"), null);
});

test("every fix is stable when applied twice and check() names what it caught", () => {
  const samples = {
    es: "¿Qué es una reseña? Una lectura pública. Vea informes en directo. Faro 95 móvil. Las cabeceras.",
    pt: "A resenha. Uma leitura. O ficheiro.",
    de: "Eine Rezension. Die Lesung.",
    fr: "Une lecture. Une critique.",
    it: "Una recensione. Una lettura."
  };
  for (const [lang, text] of Object.entries(samples)) {
    const once = fix(text, lang);
    assert.notEqual(once, text, lang);
    assert.equal(fix(once, lang), once, lang);
    assert.ok(check(text, lang).length > 0, lang);
    assert.deepEqual(check(once, lang).filter((note) => !/tú|masculine/.test(note)), [], lang + ": " + once);
  }
  assert.deepEqual(Object.keys(FIXES).sort(), ["de", "es", "fr", "it", "pt"]);
  assert.equal(fix("A review of the site.", "en"), "A review of the site.");
});
