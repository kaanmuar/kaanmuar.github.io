"use strict";
/* The brand face a customer mail goes out as (#2312): owner notices, the reports owners claim from them, and the
   follow-up notes. en/de/fr/it mail comes from qalaburlreview@, es/pt from qaurlreview@; a mail with no language
   keeps the default sender (SENDGRID_FROM). Replies to a face address reach the mailInbound webhook through its
   ImprovMX alias (#2309), like qa@.

   Firebase deploys functions/ alone, so this mirrors scripts/brand-kit/faces.js and faceOf in scripts/face-route.js;
   tests/unit/mail-face.test.js fails when the copies differ. */

const SITE = "https://carlosandmunoz.com";
const DEFAULT = "en";

const FACES = {
  en: {
    id: "en",
    handle: "qalaburlreview",
    email: "qalaburlreview@carlosandmunoz.com",
    name: "QA-lab URL Review",
    langs: ["en", "de", "fr", "it"],
    hub: "qa-review-social.html"
  },
  es: {
    id: "es",
    handle: "qaurlreview",
    email: "qaurlreview@carlosandmunoz.com",
    name: "QA-lab URL Review · ES/PT",
    langs: ["es", "pt"],
    hub: "qa-review-social-es.html"
  }
};
const IDS = Object.keys(FACES);

const codeOf = (lang) => String(lang || "").trim().toLowerCase().slice(0, 2);

/** The face of a mail in lang, with the landing page of that language; null when the mail has no language. */
function faceOf(lang) {
  const code = codeOf(lang);
  if (!code) return null;
  const face = FACES[IDS.find((id) => FACES[id].langs.includes(code)) || DEFAULT];
  const page = face.langs.includes(code) ? code : face.langs[0];
  return Object.assign({}, face, {
    page: SITE + "/" + (page === "en" ? "qa-review.html" : "qa-review-" + page + ".html"),
    hubUrl: SITE + "/" + face.hub
  });
}

/**
 * From and Reply-To of a mail in lang. fallback: the default From address. replyTo: an address that must win,
 * such as an owner notice's reply+token@ thread address; otherwise replies go to the face, or to fallbackReplyTo.
 */
function envelope(lang, fallback, replyTo, fallbackReplyTo) {
  const face = faceOf(lang);
  if (!face) return { from: fallback, replyTo: replyTo || fallbackReplyTo };
  return { from: { email: face.email, name: face.name }, replyTo: replyTo || face.email };
}

/** True for the local part of a face address, so mail to it is read like mail to qa@. */
const isFaceAlias = (alias) => IDS.some((id) => FACES[id].handle === String(alias || "").toLowerCase());

module.exports = { DEFAULT, FACES, faceOf, envelope, isFaceAlias };
