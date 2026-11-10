/* The two brand faces (#2307) on the 11 networks: who posts which languages, each account's state, copy, links and
   the steps Carlos takes to sign it up. steps[0] is the sign-up itself, so an account that exists skips it;
   {email} and {handle} are filled in per face. scripts/brand-kit/build.js --face <id> renders a face's images, kit.json and
   checklist.md from this file; nothing is uploaded.

   Faces split by language so the two never post the same thing: @qalaburlreview posts en/de/fr/it, @qaurlreview
   es/pt. Each bio names the other face, so the pair reads as one brand in two languages rather than twin accounts.
   Profile links point at the face's landing page (site, written by scripts/build-face-pages.js, #2311), which links on
   to the review in each of the face's languages. The site's footers and social hub list both faces' accounts from
   accounts(); bios.long is the pitch in each of the face's languages, then the post line, then the other face. */

const SITE = "https://carlosandmunoz.com/";

// Longest text each field takes; build.js refuses copy that runs over.
const LIMITS = { name: 30, short: 80, bio: 150, about: 256, long: 1000 };

const FACES = {
  en: {
    id: "en",
    handle: "qalaburlreview",
    email: "qalaburlreview@carlosandmunoz.com",
    langs: ["en", "de", "fr", "it"],
    lang: "en",
    name: "QA-lab URL Review",
    other: "es",
    // Suffix of this face's secrets (scripts/face-route.js) and its posts a day per network (scripts/social-calendar.js).
    env: "",
    cadence: 5,
    live: true,
    // Rotates the cyan Fusion look; 0 keeps the look the live accounts already have.
    hue: 0,
    site: "qalaburlreview.html",
    hub: "qa-review-social.html",
    extra: null,
    copy: {
      lines: ["One public URL in.", "*A QA review out.*"],
      areas: "SEO · AI search · Analytics · Security · Accessibility · Speed",
      url: "carlosandmunoz.com/qa-review",
      langs: "English · Deutsch · Français · Italiano"
    },
    bios: {
      short: "Is your site safe? We check, fix from $69. EN·DE·FR·IT. ES/PT: {other}",
      bio: "Is your site safe? We check deeper, fix it at a fixed price from $69, and you always get your report. EN·DE·FR·IT. Español/Português: {other}",
      about: "Is your site safe? We check deeper than most: phishing lists, hacked-site signs, lookalike domains, linked hosts. Fixed-price fixes from $69 with a free re-review, and your report always arrives. EN·DE·FR·IT. Español y português: {other}",
      long: [
        "QA-lab URL Review tells you whether your site is safe, and looks deeper than most checkers: phishing and malware lists, signs of a hacked site, lookalike domains and every host your pages load or link to. If something needs fixing, we fix it at a fixed price from $69, then re-review it for free. And you always get your report: if the first run can't finish, the full report reaches your inbox within 48 hours.",
        "Ist Ihre Website sicher? Wir prüfen gründlicher, beheben zum Festpreis ab 69 US$, und Ihr Bericht kommt immer an.",
        "Votre site est-il sûr ? Nous vérifions plus en profondeur, corrigeons à prix fixe dès 69 US$, et votre rapport arrive toujours.",
        "Il tuo sito è sicuro? Controlliamo più a fondo, lo sistemiamo a prezzo fisso da 69 US$ e il tuo report arriva sempre.",
        "Live Reports, tips, skits and live runs, posted in English, Deutsch, Français and Italiano.",
        "En español y português: {other}"
      ].join("\n\n")
    },
    highlights: { reports: "Live Reports", tips: "Tips", skits: "Skits", runs: "Live runs", guide: "How it works" }
  },
  es: {
    id: "es",
    handle: "qaurlreview",
    email: "qaurlreview@carlosandmunoz.com",
    langs: ["es", "pt"],
    lang: "es",
    name: "QA-lab URL Review · ES/PT",
    other: "en",
    env: "_ES",
    // A new account starts at 3 a day. Live since its first accounts (Threads, Instagram) connected (Carlos, 2026-11-02);
    // a face that is not live plans its languages in @qalaburlreview's 5 a day.
    cadence: 3,
    live: true,
    // Cyan to amber, so the two faces never share an avatar.
    hue: -150,
    site: "qaurlreview.html",
    hub: "qa-review-social-es.html",
    extra: { label: "Português", page: "qa-review-pt.html" },
    copy: {
      lines: ["Entra una URL pública.", "*Sale una revisión QA.*"],
      areas: "SEO · Búsqueda con IA · Analítica · Seguridad · Accesibilidad · Velocidad",
      url: "carlosandmunoz.com/qa-review-es",
      langs: "Español · Português"
    },
    bios: {
      short: "¿Tu sitio es seguro? Arreglos desde 69 USD. ES·PT. EN/DE/FR/IT: {other}",
      bio: "¿Tu sitio es seguro? Revisamos más a fondo, corregimos a precio fijo desde 69 USD y tu informe siempre llega. ES·PT. EN/DE/FR/IT: {other}",
      about: "¿Tu sitio es seguro? Revisamos más a fondo: phishing, señales de hackeo, dominios parecidos y hosts enlazados. Arreglos a precio fijo desde 69 USD con nueva revisión gratis, y tu informe siempre llega. ES·PT. EN/DE/FR/IT: {other}",
      long: [
        "QA-lab URL Review te dice si tu sitio es seguro y revisa más a fondo que la mayoría de los verificadores: listas de phishing y malware, señales de un sitio hackeado, dominios parecidos y cada host que tus páginas cargan o enlazan. Si hay algo que corregir, lo corregimos a precio fijo desde 69 USD y luego lo revisamos de nuevo gratis. Y tu informe siempre llega: si la primera revisión no puede terminar, recibes el informe completo por correo en un plazo de 48 horas.",
        "Seu site é seguro? Verificamos mais a fundo, corrigimos a preço fixo a partir de US$ 69 e seu relatório sempre chega.",
        "Informes en vivo, consejos, sketches y revisiones en directo, en español y português.",
        "English, Deutsch, Français, Italiano: {other}"
      ].join("\n\n")
    },
    highlights: { reports: "Informes en vivo", tips: "Consejos", skits: "Sketches", runs: "En directo", guide: "Cómo funciona" }
  }
};

/* Per network: the account state per face, where each piece of copy goes, how the other face is named in a bio,
   the profile URL, and the images. images[].kind is a frame.html painter; safe is the area every screen shows. */
const NETWORKS = [
  {
    id: "x", name: "X",
    exists: { en: true, es: false },
    profile: (h) => "https://x.com/" + h,
    mention: (h) => "@" + h,
    fields: [["Name", "name"], ["Bio (160)", "bio"], ["Website", "site"]],
    images: [
      { file: "avatar-400.jpg", w: 400, h: 400, kind: "avatar", circle: true, where: "Profile photo" },
      { file: "header-1500x500.jpg", w: 1500, h: 500, kind: "header", fx: { subject: [0.95, 0], zoom: 1.5 }, where: "Header photo; the profile photo covers the lower left" }
    ],
    steps: ["Sign up at x.com/i/flow/signup with {email} and the handle {handle}; X asks for a phone number and a CAPTCHA."],
    access: "Connect the account in Buffer (#2310)."
  },
  {
    id: "youtube", name: "YouTube",
    exists: { en: true, es: false },
    profile: (h) => "https://www.youtube.com/@" + h,
    mention: (h) => "@" + h,
    fields: [["Name", "name"], ["Handle", "handle"], ["Description (1000)", "long"], ["Links (14)", "links"], ["Contact email", "email"]],
    images: [
      { file: "avatar-800.jpg", w: 800, h: 800, kind: "avatar", circle: true, where: "Picture" },
      { file: "banner-2560x1440.jpg", w: 2560, h: 1440, kind: "youtube", fx: { subject: [0.4, 0.02], zoom: 2.6 }, safe: [507, 508, 1546, 423], where: "Banner image; phones show only the outlined middle" },
      { file: "watermark-150.png", w: 150, h: 150, kind: "watermark", where: "Video watermark (Customization > Branding)" }
    ],
    steps: [
      "Create a Google account at accounts.google.com/signup with \"Use your existing email\" and {email}, then studio.youtube.com > Create channel with the handle {handle}.",
      "Verify the channel by phone (youtube.com/verify) so custom thumbnails and videos over 15 minutes work."
    ],
    access: "Connect the channel in Buffer (#2310)."
  },
  {
    id: "tiktok", name: "TikTok",
    exists: { en: true, es: false },
    profile: (h) => "https://www.tiktok.com/@" + h,
    mention: (h) => "@" + h,
    fields: [["Name", "name"], ["Bio (80)", "short"], ["Website", "site"]],
    images: [{ file: "avatar-1080.jpg", w: 1080, h: 1080, kind: "avatar", circle: true, where: "Profile photo" }],
    steps: [
      "Sign up at tiktok.com/signup with {email}, then set the username to {handle}.",
      "Settings > Account > Switch to Business Account; personal accounts can't add a website link."
    ],
    access: "Connect the account in Buffer (#2310)."
  },
  {
    id: "reddit", name: "Reddit",
    exists: { en: true, es: false },
    profile: (h) => "https://www.reddit.com/user/" + h + "/",
    mention: (h) => "u/" + h,
    fields: [["Display name", "name"], ["About (200)", "bio"], ["Social links (5)", "links"]],
    images: [
      { file: "avatar-256.png", w: 256, h: 256, kind: "avatar", circle: true, where: "Avatar" },
      { file: "banner-1920x384.jpg", w: 1920, h: 384, kind: "strip", fx: { subject: [0, 0], zoom: 1.6 }, safe: [640, 0, 640, 384], where: "Banner; the copy stays in the middle third" }
    ],
    steps: ["Sign up at reddit.com/register with {email} and the username {handle}; Reddit can't rename a username later."],
    access: "None: Reddit posts stay manual."
  },
  {
    id: "facebook", name: "Facebook",
    exists: { en: true, es: false },
    profile: (h) => "https://www.facebook.com/" + h,
    mention: (h) => "fb.com/" + h,
    fields: [["Page name", "name"], ["Username", "handle"], ["Intro (101)", "short"], ["About", "long"], ["Website", "site"], ["Email", "email"], ["Categories", "Software, Internet Company"]],
    images: [
      { file: "avatar-720.jpg", w: 720, h: 720, kind: "avatar", circle: true, where: "Profile picture" },
      { file: "cover-1640x624.jpg", w: 1640, h: 624, kind: "strip", fx: { subject: [0.3, 0], zoom: 1.8 }, safe: [265, 0, 1109, 624], where: "Cover photo; phones show only the outlined middle" }
    ],
    steps: [
      "A Page has no login of its own: create it from your Facebook profile at facebook.com/pages/create, then set the username {handle} and {email} as the Page email.",
      "Link the face's Instagram to this Page (Page settings > Linked accounts); Buffer only publishes to Instagram through a linked Page."
    ],
    access: "Add the Page to the Meta app \"QA-lab Page Publisher\", then pipe a user token of that app: pbpaste | FACE={face} FACEBOOK_PAGE_ID=<Page id> node scripts/meta-token.js page. It sets FACEBOOK_PAGE_TOKEN{env}, and scripts/facebook-queue.js posts (#2310)."
  },
  {
    id: "devto", name: "dev.to", label: "DEV",
    exists: { en: true, es: false },
    profile: (h) => "https://dev.to/" + h,
    mention: (h) => "dev.to/" + h,
    fields: [["Name", "name"], ["Username", "handle"], ["Bio (200)", "bio"], ["Website", "site"]],
    images: [{ file: "avatar-1000.jpg", w: 1000, h: 1000, kind: "avatar", circle: true, where: "Profile image (dev.to has no banner)" }],
    steps: ["Sign up at dev.to/enter with email: {email}, username {handle}."],
    access: "Settings > Extensions > DEV Community API Keys: generate a key named QA-lab poster, then store it: pbpaste | gh secret set DEVTO_API_KEY{env} -R kaanmuar/kaanmuar.github.io. scripts/devto-queue.js then posts one article a day (#2326)."
  },
  {
    id: "bluesky", name: "Bluesky",
    exists: { en: true, es: false },
    profile: (h) => "https://bsky.app/profile/" + h + ".bsky.social",
    mention: (h) => "@" + h + ".bsky.social",
    fields: [["Display name", "name"], ["Description (256)", "about"]],
    images: [
      { file: "avatar-1000.jpg", w: 1000, h: 1000, kind: "avatar", circle: true, where: "Avatar" },
      { file: "banner-3000x1000.jpg", w: 1500, h: 500, scale: 2, kind: "header", fx: { subject: [0.95, 0], zoom: 1.5 }, where: "Banner; the avatar covers the lower left" }
    ],
    steps: ["Create account on bsky.app with {email} and the handle {handle}."],
    access: "Settings > Privacy and security > App passwords: make one and set the repo secrets BLUESKY_HANDLE{env} ({handle}.bsky.social) and BLUESKY_APP_PASSWORD{env} (#2310)."
  },
  {
    id: "mastodon", name: "Mastodon",
    exists: { en: true, es: false },
    profile: (h) => "https://mastodon.social/@" + h,
    mention: (h) => "@" + h + "@mastodon.social",
    fields: [["Display name", "name"], ["Bio (500)", "about"], ["Extra fields (4)", "fields"]],
    images: [
      { file: "avatar-400.jpg", w: 400, h: 400, kind: "avatar", where: "Avatar (rounded square)" },
      { file: "header-1500x500.jpg", w: 1500, h: 500, kind: "header", fx: { subject: [0.95, 0], zoom: 1.5 }, where: "Header; the avatar covers the lower left" }
    ],
    steps: [
      "Sign up at mastodon.social/auth/sign_up with {email} and the username {handle}, then confirm the email.",
      "Preferences > Public profile: put the Website link below in the first extra field and save. The face landing page links back with rel=\"me\" once this file marks the account as existing, so Mastodon shows the field as verified; save the profile again if it was set before."
    ],
    access: "Preferences > Development > New application with write:statuses, write:media, read:accounts and read:statuses: set the repo secrets MASTODON_URL{env} (https://mastodon.social) and MASTODON_TOKEN{env} (#2310)."
  },
  {
    id: "instagram", name: "Instagram",
    exists: { en: false, es: true },
    profile: (h) => "https://www.instagram.com/" + h + "/",
    mention: (h) => "@" + h,
    fields: [["Name", "name"], ["Bio (150)", "bio"], ["Links (5)", "links"], ["Highlight names", "highlights"]],
    images: [
      { file: "avatar-1080.jpg", w: 1080, h: 1080, kind: "avatar", circle: true, where: "Profile picture" },
      ...["reports", "tips", "skits", "runs", "guide"].map((id) => ({ file: "highlight-" + id + ".jpg", w: 1080, h: 1920, kind: "highlight", theme: id, fx: { subject: [0, 0.3], zoom: 2.4, t: 9.5 }, circle: "highlight", where: "Highlight cover: " + id }))
    ],
    steps: [
      "Sign up at instagram.com/accounts/emailsignup with {email} and the username {handle}; add it to the same Accounts Center so one app switches between faces.",
      "Settings > Account type and tools > Switch to professional account (Business), then link the face's Facebook Page."
    ],
    access: "Nothing in Buffer: once linked to the face's Facebook Page, FACE={face} node scripts/meta-token.js page also sets INSTAGRAM_USER_ID{env}, and scripts/open-social-queue.js posts (#2310)."
  },
  {
    id: "threads", name: "Threads",
    exists: { en: false, es: true },
    profile: (h) => "https://www.threads.com/@" + h,
    mention: (h) => "@" + h,
    fields: [["Bio (150)", "bio"], ["Link", "site"]],
    images: [{ file: "avatar-1080.jpg", w: 1080, h: 1080, kind: "avatar", circle: true, where: "Profile picture (Threads can import it from Instagram)" }],
    steps: ["Threads has no sign-up of its own: open the Threads app, log in with the face's Instagram (@{handle}) and keep its handle."],
    access: "Nothing in Buffer: a Threads user token of the app (User Token Generator) through pbpaste | FACE={face} node scripts/meta-token.js threads sets THREADS_TOKEN{env}, and scripts/open-social-queue.js posts (#2310)."
  },
  {
    id: "linkedin", name: "LinkedIn",
    // The English page has run since October (Premium until 2026-11-19, Buffer posts to it); only the Spanish face is new.
    exists: { en: true, es: false },
    profile: (h) => "https://www.linkedin.com/company/" + (h === "qalaburlreview" ? "qalab-url-review" : h),
    mention: (h) => "linkedin.com/company/" + (h === "qalaburlreview" ? "qalab-url-review" : h),
    fields: [["Page name", "name"], ["Public URL", "handle"], ["Tagline (120)", "short"], ["Overview", "long"], ["Website", "site"], ["Industry", "Software Development"]],
    images: [
      { file: "logo-400.png", w: 400, h: 400, kind: "avatar", where: "Page logo" },
      { file: "cover-1128x191@2x.jpg", w: 1128, h: 191, scale: 2, kind: "strip", fx: { subject: [0.9, 0], zoom: 1.4 }, safe: [260, 0, 868, 191], where: "Page cover; the logo covers the lower left" }
    ],
    steps: ["A Page has no login of its own: create it from your LinkedIn profile at linkedin.com/company/setup/new (Company, public URL {handle}), and add {email} as the page contact."],
    access: "Connect the Page in Buffer (#2310)."
  }
];

const utm = (network, face) => "?utm_source=" + network + "&utm_medium=profile&utm_campaign=profile-link&utm_content=face-" + face;

// The order the site lists accounts in: footers, the social hub's Follow row and the face pages.
const ORDER = ["youtube", "tiktok", "instagram", "threads", "linkedin", "x", "facebook", "bluesky", "mastodon", "reddit", "devto"];
const ordered = () => ORDER.map((id) => NETWORKS.find((n) => n.id === id));
const accounts = (face) => ordered().filter((n) => n.exists[face.id]).map((n) => ({ net: n.id, name: n.label || n.name, url: n.profile(face.handle) }));

// The brand's own Live Reports channels (#2549), in every language, so they belong to neither face: a Telegram
// channel with the @qalab_live_bot Mini App, and a subreddit with the Devvit app. Listed after both faces' accounts,
// and after a face's own links in the kits' link lists, under label[face].
const CHANNELS = [
  { net: "telegram", name: "Telegram", app: "Telegram", mention: "@qalab_live", url: "https://t.me/qalab_live", label: { en: "Live Reports on Telegram", es: "Informes en vivo en Telegram" } },
  { net: "subreddit", name: "r/QALabLiveReports", app: "Reddit", mention: "r/QALabLiveReports", url: "https://www.reddit.com/r/QALabLiveReports/", label: { en: "r/QALabLiveReports", es: "r/QALabLiveReports" } }
];

module.exports = { SITE, LIMITS, FACES, NETWORKS, ORDER, CHANNELS, ordered, accounts, utm };
