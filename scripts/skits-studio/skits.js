/* Situational promo skits (#1041): Gemini (Veo) actors speak the scene in their own voices, then the real
   URL Review page fills in a report, then the actors land the line. One Gemini generation per language.

   Each skit has, per language: the cast and room for the prompt, the three lines (A sets it up, B asks, a beat
   with no talking while A types, A lands it), the scene tag, the caption over the product part, and the post copy.
   promptFor(skit, lang) is the text to paste in gemini.google.com with Create video on and Landscape (16:9).
   A take can set crop [x, y, w, h] (fractions of the frame) to leave something out, and cut [end of the setup,
   start of the payoff] in seconds when the beat is not the clip's longest pause.
   Never write "tripod" in a prompt: Veo draws one in front of the desk. */

const SITE = "https://carlosandmunoz.com";
const LANGS = ["en", "es", "pt", "de", "fr", "it"];
const PAGE = { en: "qa-review.html", es: "qa-review-es.html", pt: "qa-review-pt.html", de: "qa-review-de.html", fr: "qa-review-fr.html", it: "qa-review-it.html" };
const SPEECH = { en: "American English", es: "neutral Latin American Spanish", pt: "Brazilian Portuguese", de: "German", fr: "French from France", it: "Italian" };

// Shared by every skit: the end card and the product window's title, in the clip's language.
const UI = {
  en: { end: "Paste a URL. Get the review.", endNote: "QA, SEO, accessibility, security, performance and privacy, from one URL.", window: "URL Review", play: "Skit · sound on", bio: "Link in bio." },
  es: { end: "Pega una URL. Recibe la revisión.", endNote: "QA, SEO, accesibilidad, seguridad, rendimiento y privacidad, desde una URL.", window: "Revisión de URL", play: "Sketch · con sonido", bio: "Enlace en la bio." },
  pt: { end: "Cole uma URL. Receba a revisão.", endNote: "QA, SEO, acessibilidade, segurança, desempenho e privacidade, a partir de uma URL.", window: "Revisão de URL", play: "Esquete · com som", bio: "Link na bio." },
  de: { end: "URL einfügen. Review erhalten.", endNote: "QA, SEO, Barrierefreiheit, Sicherheit, Performance und Datenschutz aus einer URL.", window: "URL-Review", play: "Sketch · Ton an", bio: "Link in der Bio." },
  fr: { end: "Collez une URL. Recevez la revue.", endNote: "QA, SEO, accessibilité, sécurité, performance et vie privée, à partir d'une URL.", window: "Revue d'URL", play: "Sketch · avec le son", bio: "Lien dans la bio." },
  it: { end: "Incolla un URL. Ricevi la revisione.", endNote: "QA, SEO, accessibilità, sicurezza, prestazioni e privacy, da un URL.", window: "Revisione URL", play: "Sketch · audio attivo", bio: "Link nella bio." }
};

const SKITS = [
  {
    id: "friday-release",
    cat: "QA",
    tags: ["QA", "Release", "BrokenLinks"],
    // What the screen recording types and what the report shows; the host is reserved for examples (RFC 2606).
    host: "shop.example.com",
    broken: 2,
    area: "SEO",
    lang: {
      en: {
        // Veo drew a tripod in front of the desk in this take; the crop keeps both faces and leaves it out.
        crop: [0.12, 0, 0.78, 0.68],
        alt: "Two coworkers at a desk on a Friday afternoon. She says they release in an hour, he asks if anyone checked the site, she runs a URL Review, finds two broken links, fixes them and smiles.",
        finding: "2 internal links answer 404",
        room: "a modern open-plan software office",
        a: "a Black woman in her early 30s with natural curly hair and a dark green sweater, the developer",
        b: "a white man in his late 50s with a short grey beard, glasses and a light blue shirt, the product manager",
        lines: ["We release in an hour.", "Did anyone check the site?", "Two broken links. Fixed. Ship it."],
        scene: "Friday, 5:00 pm",
        found: "2 broken links, before the release.",
        title: "Friday, 5 pm: we release in an hour. Did anyone check the site?",
        body: "Two broken links, found and fixed before the release. Paste a URL and get a review of the site's public pages: QA, SEO, accessibility, security, performance and privacy.",
        cta: "Review your site before you ship"
      },
      es: {
        alt: "Dos compañeros en un escritorio un viernes por la tarde. Él dice que salen a producción en una hora, ella pregunta si alguien revisó el sitio, él corre una revisión de URL, encuentra dos enlaces rotos, los arregla y sonríe.",
        finding: "2 enlaces internos responden 404",
        room: "a bright coworking office in Bogotá with plants",
        a: "a young Afro-Latino man in his mid 20s with short twists and a mustard hoodie, the developer",
        b: "a Latina woman in her late 40s with shoulder-length dark hair, reading glasses and a navy blazer, the team lead",
        lines: ["Salimos a producción en una hora.", "¿Alguien revisó el sitio?", "Dos enlaces rotos. Listo. ¡A producción!"],
        scene: "Viernes, 5:00 p. m.",
        found: "2 enlaces rotos, antes del lanzamiento.",
        title: "Viernes, 5 p. m.: salimos en una hora. ¿Alguien revisó el sitio?",
        body: "Dos enlaces rotos, encontrados y arreglados antes del lanzamiento. Pega una URL y recibe una revisión de las páginas públicas del sitio: QA, SEO, accesibilidad, seguridad, rendimiento y privacidad.",
        cta: "Revisa tu sitio antes de publicar"
      },
      pt: {
        alt: "Dois colegas numa mesa numa sexta à tarde. Ela diz que sobem em uma hora, ele pergunta se alguém conferiu o site, ela roda uma revisão de URL, acha dois links quebrados, corrige e sorri.",
        finding: "2 links internos respondem 404",
        room: "a bright startup office in São Paulo",
        a: "a Japanese-Brazilian woman in her mid 40s with a short black bob and a mustard cardigan, the developer",
        b: "a young Black Brazilian man in his early 20s with braids and a white t-shirt, the designer",
        lines: ["A gente sobe em uma hora.", "Alguém conferiu o site?", "Dois links quebrados. Corrigido. Pode subir!"],
        scene: "Sexta, 17h",
        found: "2 links quebrados, antes do lançamento.",
        title: "Sexta, 17h: a gente sobe em uma hora. Alguém conferiu o site?",
        body: "Dois links quebrados, achados e corrigidos antes do lançamento. Cole uma URL e receba uma revisão das páginas públicas do site: QA, SEO, acessibilidade, segurança, desempenho e privacidade.",
        cta: "Revise seu site antes de publicar"
      },
      de: {
        alt: "Zwei Kollegen an einem Schreibtisch am Freitagnachmittag. Sie sagt, in einer Stunde geht es live, er fragt, ob jemand die Website geprüft hat, sie startet ein URL-Review, findet zwei kaputte Links, behebt sie und lächelt.",
        finding: "2 interne Links antworten mit 404",
        room: "a minimalist software office in Berlin with white brick walls",
        a: "a woman of Turkish descent in her late 20s wearing a burgundy headscarf and a grey blazer, the developer",
        b: "a white German man in his mid 40s with red hair, a red beard and a black t-shirt, the team lead",
        lines: ["In einer Stunde gehen wir live.", "Hat jemand die Website geprüft?", "Zwei kaputte Links. Gefixt. Raus damit!"],
        scene: "Freitag, 17 Uhr",
        found: "2 kaputte Links, vor dem Release.",
        title: "Freitag, 17 Uhr: In einer Stunde gehen wir live. Hat jemand die Website geprüft?",
        body: "Zwei kaputte Links, gefunden und behoben vor dem Release. URL einfügen und ein Review der öffentlichen Seiten erhalten: QA, SEO, Barrierefreiheit, Sicherheit, Performance und Datenschutz.",
        cta: "Prüf deine Website vor dem Release"
      },
      fr: {
        alt: "Deux collègues à un bureau un vendredi après-midi. Il dit qu'ils mettent en prod dans une heure, elle demande si quelqu'un a vérifié le site, il lance une revue d'URL, trouve deux liens cassés, les corrige et sourit.",
        finding: "2 liens internes répondent 404",
        room: "a Paris software office with exposed wooden beams",
        a: "a man of North African descent in his mid 30s with short black hair, light stubble and a navy overshirt, the developer",
        b: "a white French woman in her early 60s with short silver hair and red glasses, the project manager",
        lines: ["On met en prod dans une heure.", "Quelqu'un a vérifié le site ?", "Deux liens cassés. Corrigés. On livre !"],
        scene: "Vendredi, 17 h",
        found: "2 liens cassés, avant la mise en prod.",
        title: "Vendredi, 17 h : on met en prod dans une heure. Quelqu'un a vérifié le site ?",
        body: "Deux liens cassés, trouvés et corrigés avant la mise en prod. Collez une URL et recevez une revue des pages publiques du site : QA, SEO, accessibilité, sécurité, performance et vie privée.",
        cta: "Vérifiez votre site avant de livrer"
      },
      it: {
        alt: "Due colleghi a una scrivania un venerdì pomeriggio. Lei dice che rilasciano tra un'ora, lui chiede se qualcuno ha controllato il sito, lei lancia una revisione URL, trova due link rotti, li sistema e sorride.",
        finding: "2 link interni rispondono 404",
        room: "a design studio in Milan with large windows",
        a: "a South Asian Italian woman in her early 20s with long black hair in a ponytail and a yellow sweater, the developer",
        b: "an Italian man in his late 60s with white hair and a tweed jacket, the agency owner",
        lines: ["Rilasciamo tra un'ora.", "Qualcuno ha controllato il sito?", "Due link rotti. Sistemati. Si va!"],
        scene: "Venerdì, ore 17",
        found: "2 link rotti, prima del rilascio.",
        title: "Venerdì, ore 17: rilasciamo tra un'ora. Qualcuno ha controllato il sito?",
        body: "Due link rotti, trovati e sistemati prima del rilascio. Incolla un URL e ricevi una revisione delle pagine pubbliche del sito: QA, SEO, accessibilità, sicurezza, prestazioni e privacy.",
        cta: "Controlla il sito prima di rilasciare"
      }
    }
  }
];

function promptFor(skit, lang) {
  const t = skit.lang[lang];
  const [one, two, three] = t.lines;
  return [
    "Realistic 8-second live-action video, 16:9 landscape. The camera is completely still: no camera movement, no zoom, no cuts, and no camera equipment anywhere in the shot. No music, no on-screen text, no subtitles, no logos.",
    "Friday at 5 pm in " + t.room + ", warm late-afternoon window light. Two coworkers sit side by side at one desk, close together in the centre of the frame, framed from the chest up, both faces fully visible the whole time, an open laptop on the desk in front of them with its screen facing away from the camera.",
    "On the left: " + t.a + ". On the right: " + t.b + ". Natural, upbeat, a little stressed. They speak " + SPEECH[lang] + " with real lip-synced mouth movement and natural body movement.",
    "0 to 2 s: the person on the left glances at a watch and says: \"" + one + "\"",
    "2 to 4 s: the person on the right turns to them, eyebrows raised, and asks: \"" + two + "\"",
    "4 to 5.5 s: no talking; the person on the left types quickly on the laptop and they both lean in to look at the screen.",
    "5.5 to 8 s: the person on the left exhales, smiles with relief and says: \"" + three + "\" The person on the right laughs and gives a thumbs-up.",
    "Audio: only their voices and quiet office ambience."
  ].join("\n");
}

function pageFor(lang) { return SITE + "/" + PAGE[lang]; }

module.exports = { SITE, LANGS, UI, SKITS, promptFor, pageFor };
