const test = require("node:test");
const assert = require("node:assert/strict");
const i18n = require("../../scripts/social-hub/i18n");

test("hosts, numbers, URLs, hashtags and code become numbered placeholders, one template per sentence", () => {
  const text = "uber.com scored 66 of 100.\nThe gap: page titles. Full report: https://carlosandmunoz.com/qa-review.html?live=u-uber-com #QA\nCode: <img src=\"/a.jpg\" alt=\"…\">";
  assert.deepEqual(i18n.templates(text), ["⟦1⟧ scored ⟦2⟧ of ⟦3⟧.", "The gap: page titles.", "Full report: ⟦1⟧ ⟦2⟧", "Code: ⟦1⟧"]);
});

test("a caption is rebuilt from the book with its own values, in the order the translation puts them", () => {
  const book = {
    "⟦1⟧ scored ⟦2⟧ of ⟦3⟧.": "⟦2⟧ de ⟦3⟧ para ⟦1⟧.",
    "The gap: page titles.": "La brecha: títulos de página.",
    "Full report: ⟦1⟧ ⟦2⟧": { text: "Informe completo: ⟦1⟧ ⟦2⟧", machine: true }
  };
  const out = i18n.translate("uber.com scored 66 of 100.\nThe gap: page titles. Full report: https://x.io/r?a=1 #QA", book);
  assert.equal(out, "66 de 100 para uber.com.\nLa brecha: títulos de página. Informe completo: https://x.io/r?a=1 #QA");
});

test("a missing sentence or a lost placeholder leaves the caption untranslated", () => {
  assert.equal(i18n.translate("New sentence here.", {}), null);
  assert.equal(i18n.translate("uber.com scored 66 of 100.", { "⟦1⟧ scored ⟦2⟧ of ⟦3⟧.": "⟦1⟧ obtuvo ⟦2⟧." }), null);
});

test("a post gets only the languages whose book covers every field", () => {
  const caption = { title: "Fix it.", linkedin: "Fix it.\nNow.", x: "Fix it." };
  const books = { es: { "Fix it.": "Arréglalo.", "Now.": "Ya." }, pt: { "Fix it.": "Corrija." } };
  assert.deepEqual(i18n.captionsFor(caption, books), { es: { title: "Arréglalo.", linkedin: "Arréglalo.\nYa.", x: "Arréglalo." } });
});
