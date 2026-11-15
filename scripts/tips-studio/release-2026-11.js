/* What's new in QA-lab URL Review, November 2026 (#3325, #3331): the new security checks, the four ways to get a
   report's findings fixed, and failed reviews that are retried and promised by email. Three topics, each written in
   all six languages. Every post is held: it shows on the social hub and no queue posts it until Carlos lifts the hold.
   node scripts/tips-studio/build.js --source release-2026-11 --no-translate */

const SITE = "https://carlosandmunoz.com";
const GUIDE = SITE + "/qa-review.html";
const { BRAND, tagLine } = require("../social-tags");
const { xPost } = require("./tips");
const fixOffers = require("../../functions/url-review-fix-offers");

const LANGS = ["en", "es", "pt", "de", "fr", "it"];
const DATE = "2026-11-10";
const CAMPAIGN = "release-2026-11";
const KIND = "news";
const CATS = { News: { label: "URL Review", color: "#7ef6fb" } };

const WORDS = {
  en: { tryThis: "Try this", never: "New in every review", end: "Let your page do the talking.", endNote: "What's new in QA-lab URL Review.", see: "Review your site", bio: "Link in bio.", counter: "What's new", promise: "until your report is in", cats: ["Safe Browsing", "URL Scanner", "Blocklists", "Hack signs", "Lookalikes", "WordPress"], notes: ["every linked host", "Cloudflare", "SpamCop, NordSpam", "search spam, cloaking", "typosquat domains", "Wordfence"] },
  es: { tryThis: "Pruébalo", never: "Nuevo en cada revisión", end: "Deja que tu página hable.", endNote: "Novedades de QA-lab URL Review.", see: "Revisa tu sitio", bio: "Enlace en la bio.", counter: "Novedades", promise: "hasta que llegue tu informe", cats: ["Safe Browsing", "URL Scanner", "Listas negras", "Señales de hackeo", "Imitadores", "WordPress"], notes: ["cada host enlazado", "Cloudflare", "SpamCop, NordSpam", "spam, cloaking", "dominios typosquat", "Wordfence"] },
  pt: { tryThis: "Experimente", never: "Novo em toda revisão", end: "Deixe sua página falar.", endNote: "Novidades do QA-lab URL Review.", see: "Revise seu site", bio: "Link na bio.", counter: "Novidades", promise: "até o seu relatório chegar", cats: ["Safe Browsing", "URL Scanner", "Listas de bloqueio", "Sinais de invasão", "Imitadores", "WordPress"], notes: ["cada host vinculado", "Cloudflare", "SpamCop, NordSpam", "spam, cloaking", "domínios typosquat", "Wordfence"] },
  de: { tryThis: "Probieren Sie es aus", never: "Neu in jeder Prüfung", end: "Lassen Sie Ihre Seite sprechen.", endNote: "Neu bei QA-lab URL Review.", see: "Website prüfen", bio: "Link in der Bio.", counter: "Neu", promise: "bis Ihr Bericht da ist", cats: ["Safe Browsing", "URL Scanner", "Blocklisten", "Hack-Hinweise", "Doppelgänger", "WordPress"], notes: ["jeder verlinkte Host", "Cloudflare", "SpamCop, NordSpam", "Suchspam, Cloaking", "Tippfehler-Domains", "Wordfence"] },
  fr: { tryThis: "Essayez", never: "Nouveau dans chaque revue", end: "Laissez votre page parler.", endNote: "Les nouveautés de QA-lab URL Review.", see: "Revoir votre site", bio: "Lien en bio.", counter: "Nouveautés", promise: "jusqu'à ce que votre rapport arrive", cats: ["Safe Browsing", "URL Scanner", "Listes noires", "Signes de piratage", "Sosies", "WordPress"], notes: ["chaque hôte lié", "Cloudflare", "SpamCop, NordSpam", "spam, cloaking", "domaines typosquat", "Wordfence"] },
  it: { tryThis: "Prova", never: "Nuovo in ogni revisione", end: "Lascia parlare la tua pagina.", endNote: "Le novità di QA-lab URL Review.", see: "Revisiona il tuo sito", bio: "Link in bio.", counter: "Novità", promise: "finché il report non arriva", cats: ["Safe Browsing", "URL Scanner", "Blocklist", "Segni di violazione", "Sosia", "WordPress"], notes: ["ogni host collegato", "Cloudflare", "SpamCop, NordSpam", "spam, cloaking", "domini typosquat", "Wordfence"] }
};

const UI = Object.fromEntries(LANGS.map((lang) => [lang, {
  tryThis: WORDS[lang].tryThis, tip: WORDS[lang].counter, guided: WORDS[lang].counter, never: WORDS[lang].never,
  end: WORDS[lang].end, endNote: WORDS[lang].endNote
}]));

const sfx = (lang) => (lang === "en" ? "" : "-" + lang);
const MARKS = ["pass", "pass", "pass", "risk", "risk", "pass"];
const PACKS = fixOffers.PACKAGES.slice().sort((a, b) => a.usd - b.usd);
const FROM = PACKS[0].usd;

const TOPICS = [
  {
    id: "new-checks", tags: ["WebSecurity", "Phishing", "WordPress"],
    visual: (lang) => ({ type: "check", items: WORDS[lang].cats.map((name, i) => [name, WORDS[lang].notes[i], MARKS[i]]) }),
    text: {
      en: { title: ["Is your site", "*on a blocklist?*"], body: "Every review now checks the site, and every script, iframe and form host it loads, against Google Safe Browsing and the Cloudflare URL Scanner, plus spam blocklists, signs of a hack, lookalike domains and WordPress vulnerabilities.", action: "Run a review and read the Security findings first." },
      es: { title: ["¿Tu sitio está", "*en una lista negra?*"], body: "Cada revisión ahora comprueba el sitio, y cada host de scripts, iframes y formularios que carga, en Google Safe Browsing y el Cloudflare URL Scanner, además de listas negras de spam, señales de hackeo, dominios imitadores y vulnerabilidades de WordPress.", action: "Haz una revisión y lee primero los hallazgos de seguridad." },
      pt: { title: ["Seu site está", "*numa lista de bloqueio?*"], body: "Toda revisão agora verifica o site, e cada host de scripts, iframes e formulários que ele carrega, no Google Safe Browsing e no Cloudflare URL Scanner, além de listas de bloqueio de spam, sinais de invasão, domínios imitadores e vulnerabilidades do WordPress.", action: "Faça uma revisão e leia primeiro os achados de segurança." },
      de: { title: ["Steht Ihre Website", "*auf einer Blockliste?*"], body: "Jede Prüfung gleicht jetzt die Website und jeden geladenen Script-, iframe- und Formular-Host mit Google Safe Browsing und dem Cloudflare URL Scanner ab, dazu Spam-Blocklisten, Hinweise auf einen Hack, Doppelgänger-Domains und WordPress-Schwachstellen.", action: "Starten Sie eine Prüfung und lesen Sie zuerst die Sicherheitsbefunde." },
      fr: { title: ["Votre site est-il", "*sur une liste noire ?*"], body: "Chaque revue vérifie désormais le site, et chaque hôte de scripts, d'iframes et de formulaires qu'il charge, auprès de Google Safe Browsing et du Cloudflare URL Scanner, ainsi que les listes noires de spam, les signes de piratage, les domaines sosies et les vulnérabilités WordPress.", action: "Lancez une revue et lisez d'abord les constats de sécurité." },
      it: { title: ["Il tuo sito è", "*in una blocklist?*"], body: "Ogni revisione ora controlla il sito, e ogni host di script, iframe e moduli che carica, con Google Safe Browsing e il Cloudflare URL Scanner, oltre a blocklist antispam, segni di violazione, domini sosia e vulnerabilità di WordPress.", action: "Avvia una revisione e leggi per primi i risultati sulla sicurezza." }
    }
  },
  {
    id: "get-it-fixed", tags: ["WebDev", "QA", "SmallBusiness"],
    visual: (lang) => ({ type: "check", items: PACKS.map((item) => [item.name[lang], "US$" + item.usd, "pass"]) }),
    text: {
      en: { title: ["Found a problem?", "*Get it fixed.*"], body: "Every report now ends with four ways to fix what it found: do it yourself with Ask the report, ask for a quote, pick a fixed-price package, or book a 30-minute call.", action: "Packages start at US$" + FROM + " and end with a free re-review." },
      es: { title: ["¿Encontraste un problema?", "*Haz que lo arreglen.*"], body: "Cada informe ahora termina con cuatro formas de arreglar lo que encontró: hazlo tú con Pregúntale al informe, pide una cotización, elige un paquete de precio fijo o agenda una llamada de 30 minutos.", action: "Los paquetes cuestan desde US$" + FROM + " y terminan con una nueva revisión gratis." },
      pt: { title: ["Achou um problema?", "*Peça a correção.*"], body: "Todo relatório agora termina com quatro formas de corrigir o que encontrou: faça você mesmo com Pergunte ao relatório, peça um orçamento, escolha um pacote de preço fixo ou agende uma conversa de 30 minutos.", action: "Os pacotes custam a partir de US$" + FROM + " e terminam com uma nova revisão grátis." },
      de: { title: ["Problem gefunden?", "*Lassen Sie es beheben.*"], body: "Jeder Bericht endet jetzt mit vier Wegen zur Behebung: selbst mit Den Bericht fragen, per Angebot, mit einem Paket zum Festpreis oder in einem 30-Minuten-Gespräch.", action: "Pakete ab US$" + FROM + ", danach eine kostenlose Nachprüfung." },
      fr: { title: ["Un problème trouvé ?", "*Faites-le corriger.*"], body: "Chaque rapport se termine désormais par quatre façons de corriger ce qu'il a trouvé : vous-même avec Interroger le rapport, sur devis, avec un forfait à prix fixe ou lors d'un appel de 30 minutes.", action: "Les forfaits commencent à US$" + FROM + " et se terminent par une nouvelle revue gratuite." },
      it: { title: ["Trovato un problema?", "*Fallo correggere.*"], body: "Ogni report ora si chiude con quattro modi per correggere ciò che ha trovato: da solo con Chiedi al report, con un preventivo, con un pacchetto a prezzo fisso o con una chiamata di 30 minuti.", action: "I pacchetti partono da US$" + FROM + " e finiscono con una nuova revisione gratuita." }
    }
  },
  {
    id: "we-keep-trying", tags: ["QA", "WebDev", "Cloudflare"],
    visual: (lang) => ({ type: "stat", value: "48 h", caption: WORDS[lang].promise }),
    text: {
      en: { title: ["Review blocked?", "*We keep trying.*"], body: "When a site blocks the review, we find out why and retry with the method that fits, as a last resort in a real browser. If we can't finish right away, the full report reaches your inbox as soon as it's ready.", action: "Run a review: if it can't finish, you also get 20% off your next one." },
      es: { title: ["¿Revisión bloqueada?", "*Seguimos intentando.*"], body: "Cuando un sitio bloquea la revisión, averiguamos por qué y reintentamos con el método adecuado, como último recurso en un navegador real. Si no podemos terminar enseguida, el informe completo llega a tu correo en cuanto esté listo.", action: "Haz una revisión: si no puede terminar, también recibes 20% de descuento en la siguiente." },
      pt: { title: ["Revisão bloqueada?", "*Seguimos tentando.*"], body: "Quando um site bloqueia a revisão, descobrimos o motivo e tentamos de novo com o método certo, em último caso num navegador real. Se não der para terminar na hora, o relatório completo chega ao seu e-mail assim que estiver pronto.", action: "Faça uma revisão: se ela não puder terminar, você também ganha 20% de desconto na próxima." },
      de: { title: ["Prüfung blockiert?", "*Wir bleiben dran.*"], body: "Blockiert eine Website die Prüfung, finden wir den Grund und versuchen es mit der passenden Methode erneut, zuletzt in einem echten Browser. Lässt sie sich nicht sofort abschließen, kommt der vollständige Bericht per E-Mail, sobald er fertig ist.", action: "Starten Sie eine Prüfung: Wird sie nicht fertig, erhalten Sie zudem 20 % Rabatt auf die nächste." },
      fr: { title: ["Revue bloquée ?", "*Nous insistons.*"], body: "Quand un site bloque la revue, nous cherchons pourquoi et réessayons avec la bonne méthode, en dernier recours dans un vrai navigateur. Si elle ne peut pas aboutir tout de suite, le rapport complet arrive dans votre boîte mail dès qu'il est prêt.", action: "Lancez une revue : si elle ne peut pas aboutir, vous avez aussi 20 % de réduction sur la suivante." },
      it: { title: ["Revisione bloccata?", "*Continuiamo a provare.*"], body: "Quando un sito blocca la revisione, scopriamo perché e riproviamo con il metodo giusto, come ultima risorsa in un vero browser. Se non si può finire subito, il report completo arriva nella tua email appena è pronto.", action: "Avvia una revisione: se non può finire, ricevi anche il 20% di sconto sulla prossima." }
    }
  }
];

function plainTitle(tip) { return tip.title.join(" ").replace(/\*/g, "").replace(/\s+/g, " ").trim(); }

const TIPS = [];
TOPICS.forEach((topic, t) => {
  LANGS.forEach((lang, i) => {
    const tip = Object.assign({ id: topic.id + "-" + lang, topic: topic.id, cat: "News", kind: KIND, lang, voice: (i + t) % 2 ? "m" : "w",
      date: DATE, pin: true, hold: true, tags: topic.tags, visual: topic.visual(lang), counter: WORDS[lang].counter + " " + (t + 1) + " / " + TOPICS.length }, topic.text[lang]);
    const head = plainTitle(tip);
    const alt = head + (/[.?!]$/.test(head) ? " " : ". ") + tip.body;
    tip.alt = alt.length <= 300 ? alt : alt.slice(0, 299).replace(/\s+\S*$/, "") + "…";
    TIPS.push(tip);
  });
});

function hostFor(tip) { return "carlosandmunoz.com/qa-review" + sfx(tip.lang) + ".html"; }

function link(platform, tip) {
  const q = new URLSearchParams({ utm_source: platform, utm_medium: "social", utm_campaign: CAMPAIGN, utm_content: tip.id });
  return SITE + "/qa-review" + sfx(tip.lang) + ".html?" + q.toString();
}

function captions(tip) {
  const w = WORDS[tip.lang];
  const head = plainTitle(tip);
  const tags = (network) => tagLine(tip, network, tip.lang);
  return {
    linkedin: [head, "", tip.body, "", w.tryThis + ": " + tip.action, "", w.see + ": " + link("linkedin", tip), "", tags("linkedin")].join("\n"),
    x: xPost(head + "\n\n" + tip.action, link("x", tip), tags("x")),
    instagram: [head, "", tip.body, "", w.tryThis + ": " + tip.action, "", w.bio, "", tags("instagram")].join("\n"),
    facebook: [head, "", tip.body, "", w.tryThis + ": " + tip.action, "", link("facebook", tip), "", tags("facebook")].join("\n"),
    tiktok: head + " " + tip.action + " " + tags("tiktok"),
    youtubeTitle: (head + " #Shorts").slice(0, 100),
    youtube: [tip.body, "", w.tryThis + ": " + tip.action, "", w.see + ": " + link("youtube", tip), "", "QA-lab URL Review · " + w.counter, "", tags("youtube")].join("\n")
  };
}

module.exports = { SITE, GUIDE, BRAND, CATS, KIND, TIPS, UI, captions, link, plainTitle, hostFor, BATCH: CAMPAIGN };
