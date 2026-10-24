/* Posts that introduce the social hub (qa-review-social*.html): six topics, each written in all six languages.
   Twelve go out, every other day from START: each topic once in a woman's voice and once, in another language,
   in a man's. The other 24 are in the hub only (hold). Each post links to the hub page in its own language.
   node scripts/tips-studio/build.js --source promo-social-hub --batch promo-social-hub-2026-10 --no-translate */

const SITE = "https://carlosandmunoz.com";
const GUIDE = SITE + "/qa-review-social.html";
const { BRAND, tagLine } = require("../social-tags");
const { xPost } = require("./tips");
const HUB = require("../social-hub/copy").COPY;

const LANGS = ["en", "es", "pt", "de", "fr", "it"];
const START = "2026-10-26";
const CATS = { Social: { label: "Social", color: "#7ef6fb" } };

// Posting slots in Bogotá time, outside or at the edges of the daily review and tips windows.
const WINDOWS = {
  linkedin: ["12:00", "13:00"], x: ["13:30", "14:30"], facebook: ["19:30", "20:30"], instagram: ["20:30", "21:30"],
  "instagram-story": ["21:30", "22:30"], tiktok: ["12:30", "13:30"], youtube: ["14:00", "15:00"]
};

const WORDS = {
  en: { tryThis: "Try this", never: "Six languages, one feed", see: "Every post, in one place", bio: "Link in bio.", before: "Before", one: "One page", copy: "Copy", clip: "a typical clip, voiced and captioned", rss: "One RSS feed per language", own: "Our own site, October 2026", areas: ["SEO", "GEO", "Analytics", "Security", "A11y", "Speed"] },
  es: { tryThis: "Pruébalo", never: "Seis idiomas, un feed", see: "Todas las publicaciones, en un solo lugar", bio: "Enlace en la bio.", before: "Antes", one: "Una página", copy: "Copiar", clip: "un clip típico, con voz y subtítulos", rss: "Un feed RSS por idioma", own: "Nuestro propio sitio, octubre de 2026", areas: ["SEO", "GEO", "Analítica", "Seguridad", "Accesib.", "Velocidad"] },
  pt: { tryThis: "Experimente", never: "Seis idiomas, um feed", see: "Todas as publicações, em um só lugar", bio: "Link na bio.", before: "Antes", one: "Uma página", copy: "Copiar", clip: "um clipe típico, narrado e legendado", rss: "Um feed RSS por idioma", own: "Nosso próprio site, outubro de 2026", areas: ["SEO", "GEO", "Analytics", "Segurança", "Acessib.", "Velocidade"] },
  de: { tryThis: "Probieren Sie es aus", never: "Sechs Sprachen, ein Feed", see: "Alle Beiträge an einem Ort", bio: "Link in der Bio.", before: "Vorher", one: "Eine Seite", copy: "Kopieren", clip: "ein typischer Clip, gesprochen und untertitelt", rss: "Ein RSS-Feed pro Sprache", own: "Unsere eigene Website, Oktober 2026", areas: ["SEO", "GEO", "Analytics", "Sicherheit", "Barrierefr.", "Tempo"] },
  fr: { tryThis: "Essayez", never: "Six langues, un flux", see: "Toutes les publications, au même endroit", bio: "Lien en bio.", before: "Avant", one: "Une page", copy: "Copier", clip: "un clip type, commenté et sous-titré", rss: "Un flux RSS par langue", own: "Notre propre site, octobre 2026", areas: ["SEO", "GEO", "Analytique", "Sécurité", "Accessib.", "Vitesse"] },
  it: { tryThis: "Prova", never: "Sei lingue, un feed", see: "Tutti i post, in un unico posto", bio: "Link in bio.", before: "Prima", one: "Una pagina", copy: "Copia", clip: "una clip tipica, con voce e sottotitoli", rss: "Un feed RSS per lingua", own: "Il nostro sito, ottobre 2026", areas: ["SEO", "GEO", "Analytics", "Sicurezza", "Accessib.", "Velocità"] }
};

const UI = Object.fromEntries(LANGS.map((lang) => [lang, {
  tryThis: WORDS[lang].tryThis, tip: "Social", guided: "Social", never: WORDS[lang].never,
  end: HUB[lang].h1, endNote: HUB[lang].card.sub
}]));

const sfx = (lang) => (lang === "en" ? "" : "-" + lang);
const NETWORKS = ["YouTube", "TikTok", "LinkedIn", "X", "Facebook"];

const TOPICS = [
  {
    id: "one-page", tags: ["SocialMedia", "QA", "WebDev"],
    visual: (lang) => ({ type: "versus", left: { label: WORDS[lang].before, lines: ["YouTube · TikTok", "LinkedIn · X", "Facebook"], mark: "fail" }, right: { label: WORDS[lang].one, lines: ["carlosandmunoz.com", "/qa-review-social" + sfx(lang)], mark: "pass" } }),
    text: {
      en: { title: ["Every post,", "*one page.*"], body: "Tips, real site reviews and short clips from YouTube, TikTok, LinkedIn, X and Facebook, together in one feed you can search.", action: "Open the hub and filter by tips, site reviews or videos." },
      es: { title: ["Todas las publicaciones,", "*una sola página.*"], body: "Consejos, revisiones reales de sitios y clips cortos de YouTube, TikTok, LinkedIn, X y Facebook, juntos en un feed que puedes buscar.", action: "Abre el hub y filtra por consejos, revisiones de sitios o videos." },
      pt: { title: ["Todas as publicações,", "*uma só página.*"], body: "Dicas, análises reais de sites e clipes curtos do YouTube, TikTok, LinkedIn, X e Facebook, juntos em um feed pesquisável.", action: "Abra o hub e filtre por dicas, análises de sites ou vídeos." },
      de: { title: ["Alle Beiträge,", "*eine Seite.*"], body: "Tipps, echte Website-Prüfungen und kurze Clips von YouTube, TikTok, LinkedIn, X und Facebook, in einem durchsuchbaren Feed.", action: "Öffnen Sie den Hub und filtern Sie nach Tipps, Website-Prüfungen oder Videos." },
      fr: { title: ["Toutes les publications,", "*une seule page.*"], body: "Conseils, vraies revues de sites et clips courts de YouTube, TikTok, LinkedIn, X et Facebook, réunis dans un flux où chercher.", action: "Ouvrez le hub et filtrez par conseils, revues de sites ou vidéos." },
      it: { title: ["Tutti i post,", "*una sola pagina.*"], body: "Consigli, revisioni reali di siti e clip brevi da YouTube, TikTok, LinkedIn, X e Facebook, riuniti in un feed ricercabile.", action: "Apri l'hub e filtra per consigli, revisioni di siti o video." }
    }
  },
  {
    id: "copy-caption", tags: ["SocialMedia", "ContentMarketing", "QA"],
    visual: (lang) => ({ type: "check", items: NETWORKS.map((net) => [net, WORDS[lang].copy, "pass"]) }),
    text: {
      en: { title: ["Copy the caption.", "*Share it anywhere.*"], body: "Every post comes with its caption for LinkedIn, X, Facebook, TikTok and YouTube, plus the image to download. Reuse what helps your team.", action: "Pick a post, press Copy and paste it where your team talks." },
      es: { title: ["Copia el texto.", "*Compártelo donde quieras.*"], body: "Cada publicación trae su texto para LinkedIn, X, Facebook, TikTok y YouTube, y la imagen para descargar. Reutiliza lo que le sirva a tu equipo.", action: "Elige una publicación, pulsa Copiar y pégala donde habla tu equipo." },
      pt: { title: ["Copie a legenda.", "*Compartilhe onde quiser.*"], body: "Cada publicação traz a legenda para LinkedIn, X, Facebook, TikTok e YouTube, e a imagem para baixar. Reaproveite o que ajuda o seu time.", action: "Escolha uma publicação, toque em Copiar e cole onde o seu time conversa." },
      de: { title: ["Text kopieren.", "*Überall teilen.*"], body: "Jeder Beitrag hat seinen Text für LinkedIn, X, Facebook, TikTok und YouTube, dazu das Bild zum Herunterladen. Nutzen Sie, was Ihrem Team hilft.", action: "Wählen Sie einen Beitrag, klicken Sie auf Kopieren und fügen Sie ihn dort ein, wo Ihr Team spricht." },
      fr: { title: ["Copiez le texte.", "*Partagez-le partout.*"], body: "Chaque publication a son texte pour LinkedIn, X, Facebook, TikTok et YouTube, et son image à télécharger. Réutilisez ce qui aide votre équipe.", action: "Choisissez une publication, appuyez sur Copier et collez-la là où votre équipe échange." },
      it: { title: ["Copia il testo.", "*Condividilo ovunque.*"], body: "Ogni post ha il suo testo per LinkedIn, X, Facebook, TikTok e YouTube, più l'immagine da scaricare. Riusa ciò che aiuta il tuo team.", action: "Scegli un post, premi Copia e incollalo dove parla il tuo team." }
    }
  },
  {
    id: "clips", tags: ["ShortVideo", "QA", "WebDev"],
    visual: (lang) => ({ type: "stat", value: "12 s", caption: WORDS[lang].clip }),
    text: {
      en: { title: ["Short clips,", "*in your language.*"], body: "Voiced clips play right on the page, no app needed. Each one is spoken in English, Spanish, Portuguese, German, French or Italian.", action: "Press play on any card with a video." },
      es: { title: ["Clips cortos,", "*en tu idioma.*"], body: "Los clips con voz se reproducen en la misma página, sin apps. Cada uno habla en inglés, español, portugués, alemán, francés o italiano.", action: "Pulsa reproducir en cualquier tarjeta con video." },
      pt: { title: ["Clipes curtos,", "*no seu idioma.*"], body: "Os clipes narrados tocam na própria página, sem aplicativo. Cada um fala em inglês, espanhol, português, alemão, francês ou italiano.", action: "Toque em reproduzir em qualquer cartão com vídeo." },
      de: { title: ["Kurze Clips,", "*in Ihrer Sprache.*"], body: "Gesprochene Clips laufen direkt auf der Seite, ohne App. Jeder spricht Englisch, Spanisch, Portugiesisch, Deutsch, Französisch oder Italienisch.", action: "Klicken Sie bei einer Karte mit Video auf Abspielen." },
      fr: { title: ["Des clips courts,", "*dans votre langue.*"], body: "Les clips commentés se lisent sur la page, sans application. Chacun parle anglais, espagnol, portugais, allemand, français ou italien.", action: "Lancez la lecture sur n'importe quelle carte avec vidéo." },
      it: { title: ["Clip brevi,", "*nella tua lingua.*"], body: "Le clip con voce si guardano direttamente sulla pagina, senza app. Ognuna parla inglese, spagnolo, portoghese, tedesco, francese o italiano.", action: "Premi play su qualsiasi scheda con un video." }
    }
  },
  {
    id: "six-languages", tags: ["Localization", "SEO", "WebDev"],
    visual: () => ({ type: "check", items: LANGS.map((code) => [require("../social-hub/copy").LANGS[code].native, code, "pass"]) }),
    text: {
      en: { title: ["Six languages.", "*Pick yours.*"], body: "The hub has a page in English, Spanish, Portuguese, German, French and Italian. Filter the feed by the language a post is written or spoken in.", action: "Switch the page to your language with the flags at the top." },
      es: { title: ["Seis idiomas.", "*Elige el tuyo.*"], body: "El hub tiene una página en inglés, español, portugués, alemán, francés e italiano. Filtra el feed por el idioma en que está escrita o narrada cada publicación.", action: "Cambia la página a tu idioma con las banderas de arriba." },
      pt: { title: ["Seis idiomas.", "*Escolha o seu.*"], body: "O hub tem uma página em inglês, espanhol, português, alemão, francês e italiano. Filtre o feed pelo idioma em que cada publicação foi escrita ou narrada.", action: "Mude a página para o seu idioma com as bandeiras no topo." },
      de: { title: ["Sechs Sprachen.", "*Wählen Sie Ihre.*"], body: "Der Hub hat eine Seite auf Englisch, Spanisch, Portugiesisch, Deutsch, Französisch und Italienisch. Filtern Sie den Feed nach der Sprache eines Beitrags.", action: "Wechseln Sie die Sprache der Seite mit den Flaggen oben." },
      fr: { title: ["Six langues.", "*Choisissez la vôtre.*"], body: "Le hub a une page en anglais, espagnol, portugais, allemand, français et italien. Filtrez le flux selon la langue écrite ou parlée de chaque publication.", action: "Passez la page dans votre langue avec les drapeaux en haut." },
      it: { title: ["Sei lingue.", "*Scegli la tua.*"], body: "L'hub ha una pagina in inglese, spagnolo, portoghese, tedesco, francese e italiano. Filtra il feed per la lingua in cui ogni post è scritto o parlato.", action: "Passa la pagina alla tua lingua con le bandiere in alto." }
    }
  },
  {
    id: "follow", tags: ["RSS", "SocialMedia", "QA"],
    visual: (lang) => ({ type: "code", lines: ["curl -s https://carlosandmunoz.com/", "  assets/social/rss" + sfx(lang) + ".xml"], note: WORDS[lang].rss }),
    text: {
      en: { title: ["Follow it", "*your way.*"], body: "Read the hub in any RSS reader, one feed per language, or follow us on YouTube, TikTok, LinkedIn, X and Facebook.", action: "Add the hub's RSS feed to your reader." },
      es: { title: ["Síguelo", "*a tu manera.*"], body: "Lee el hub en cualquier lector RSS, con un feed por idioma, o síguenos en YouTube, TikTok, LinkedIn, X y Facebook.", action: "Añade el feed RSS del hub a tu lector." },
      pt: { title: ["Acompanhe", "*do seu jeito.*"], body: "Leia o hub em qualquer leitor RSS, com um feed por idioma, ou siga a gente no YouTube, TikTok, LinkedIn, X e Facebook.", action: "Adicione o feed RSS do hub ao seu leitor." },
      de: { title: ["Folgen Sie uns", "*auf Ihre Art.*"], body: "Lesen Sie den Hub in jedem RSS-Reader, mit einem Feed pro Sprache, oder folgen Sie uns auf YouTube, TikTok, LinkedIn, X und Facebook.", action: "Fügen Sie den RSS-Feed des Hubs Ihrem Reader hinzu." },
      fr: { title: ["Suivez-le", "*à votre façon.*"], body: "Lisez le hub dans n'importe quel lecteur RSS, avec un flux par langue, ou suivez-nous sur YouTube, TikTok, LinkedIn, X et Facebook.", action: "Ajoutez le flux RSS du hub à votre lecteur." },
      it: { title: ["Seguilo", "*a modo tuo.*"], body: "Leggi l'hub in qualsiasi lettore RSS, con un feed per lingua, oppure seguici su YouTube, TikTok, LinkedIn, X e Facebook.", action: "Aggiungi il feed RSS dell'hub al tuo lettore." }
    }
  },
  {
    id: "real-reviews", tags: ["QA", "SEO", "WebSecurity"],
    visual: (lang) => ({ type: "scores", overall: 86, areas: WORDS[lang].areas.map((name, i) => [name, [94, 89, 100, 54, 100, 88][i]]), note: WORDS[lang].own }),
    text: {
      en: { title: ["Real sites.", "*Real scores.*"], body: "Every day, public reviews of real sites become posts with their scores and the one fix that matters most. We reviewed our own site too.", action: "Open a site review in the hub and read its full report." },
      es: { title: ["Sitios reales.", "*Puntajes reales.*"], body: "Cada día, revisiones públicas de sitios reales se vuelven publicaciones con sus puntajes y el arreglo que más importa. También revisamos nuestro propio sitio.", action: "Abre una revisión de sitio en el hub y lee su informe completo." },
      pt: { title: ["Sites reais.", "*Notas reais.*"], body: "Todo dia, análises públicas de sites reais viram publicações com suas notas e a correção que mais importa. Também analisamos o nosso próprio site.", action: "Abra uma análise de site no hub e leia o relatório completo." },
      de: { title: ["Echte Websites.", "*Echte Werte.*"], body: "Jeden Tag werden öffentliche Prüfungen echter Websites zu Beiträgen, mit ihren Werten und der wichtigsten Korrektur. Auch unsere eigene Website haben wir geprüft.", action: "Öffnen Sie im Hub eine Website-Prüfung und lesen Sie den vollständigen Bericht." },
      fr: { title: ["De vrais sites.", "*De vrais scores.*"], body: "Chaque jour, des revues publiques de vrais sites deviennent des publications, avec leurs scores et la correction qui compte le plus. Nous avons aussi revu notre propre site.", action: "Ouvrez une revue de site dans le hub et lisez son rapport complet." },
      it: { title: ["Siti reali.", "*Punteggi reali.*"], body: "Ogni giorno, revisioni pubbliche di siti reali diventano post con i loro punteggi e la correzione che conta di più. Abbiamo revisionato anche il nostro sito.", action: "Apri una revisione di un sito nell'hub e leggi il report completo." }
    }
  }
];

function day(offset) { const d = new Date(START + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + offset); return d.toISOString().slice(0, 10); }
function plainTitle(tip) { return tip.title.join(" ").replace(/\*/g, "").replace(/\s+/g, " ").trim(); }

function post(t, lang, voice, date, hold) {
  const topic = TOPICS[t];
  const tip = Object.assign({ id: topic.id + "-" + lang, topic: topic.id, cat: "Social", lang, voice, date, tags: topic.tags,
    visual: topic.visual(lang), counter: "Social " + (t + 1) + " / " + TOPICS.length }, topic.text[lang], hold ? { hold: true } : {});
  const alt = plainTitle(tip) + ". " + tip.body;
  tip.alt = alt.length <= 300 ? alt : alt.slice(0, 299).replace(/\s+\S*$/, "") + "…";
  return tip;
}

// Each topic goes out first in LANGS[t] (woman), then in LANGS[t + 3] (man); its other four languages share its first day.
const queued = [];
for (let k = 0; k < TOPICS.length * 2; k += 1) {
  const t = k % TOPICS.length;
  const second = k >= TOPICS.length;
  queued.push(post(t, LANGS[second ? (t + 3) % LANGS.length : t], second ? "m" : "w", day(2 * k), false));
}
const held = [];
TOPICS.forEach((topic, t) => {
  LANGS.forEach((lang, i) => {
    if (lang === LANGS[t] || lang === LANGS[(t + 3) % LANGS.length]) return;
    held.push(post(t, lang, i % 2 ? "m" : "w", day(2 * t), true));
  });
});
const TIPS = queued.concat(held).sort((a, b) => a.date.localeCompare(b.date) || (a.hold ? 1 : 0) - (b.hold ? 1 : 0));

function hostFor(tip) { return "carlosandmunoz.com/qa-review-social" + sfx(tip.lang) + ".html"; }

function link(platform, tip) {
  const q = new URLSearchParams({ utm_source: platform, utm_medium: "social", utm_campaign: "social-hub-promo", utm_content: tip.id });
  return SITE + "/qa-review-social" + sfx(tip.lang) + ".html?" + q.toString();
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
    youtube: [tip.body, "", w.tryThis + ": " + tip.action, "", w.see + ": " + link("youtube", tip), "", "QA-lab URL Review · Social", "", tags("youtube")].join("\n")
  };
}

module.exports = { SITE, GUIDE, BRAND, CATS, TIPS, UI, WINDOWS, captions, link, plainTitle, hostFor };
