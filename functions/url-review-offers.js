/**
 * Return discounts, 30-day passes, and follow-up notes.
 * A note is prepared only. Sending stays off until the asker checks the box.
 */
const core = require("./url-review-core");

const RETURN_TABLE = [
  { n: 1, percent: 10, label: "First return within 30 days" },
  { n: 2, percent: 15, label: "Second return within 30 days" },
  { n: 3, percent: 20, label: "Third return and each one after, within 30 days" }
];

const MONTHLY_PLANS = [
  {
    id: "glance",
    usd: 15,
    days: 30,
    runs: 0,
    pages: 0,
    depth: 0,
    frameworks: 0,
    history: true,
    tools: false,
    anchorUsd: 19,
    anchor: "Reopening one saved report starts at 19 USD."
  },
  {
    id: "return",
    usd: 49,
    days: 30,
    runs: 2,
    pages: 20,
    depth: 2,
    frameworks: 4,
    history: true,
    tools: false,
    anchorUsd: 138.7,
    anchor: "Two runs with 4 frameworks are 138.70 USD on the schedule."
  },
  {
    id: "bench",
    usd: 189,
    days: 30,
    runs: 4,
    pages: 20,
    depth: 2,
    frameworks: 8,
    history: true,
    tools: false,
    anchorUsd: 520.6,
    anchor: "Four runs with 8 frameworks are 520.60 USD on the schedule."
  },
  {
    id: "studio",
    usd: 399,
    days: 30,
    runs: 8,
    pages: 40,
    depth: 3,
    frameworks: 8,
    history: true,
    tools: false,
    anchorUsd: 1113.2,
    anchor: "Eight runs with 8 frameworks, 40 pages and 3 links deep, are 1,113.20 USD on the schedule."
  }
];

const LANGS = ["en", "es", "pt", "de", "fr", "it"];
const COUNTRY_LANG = {
  CO: "es", MX: "es", AR: "es", CL: "es", ES: "es", PE: "es", EC: "es",
  BR: "pt", PT: "pt", DE: "de", AT: "de", FR: "fr", IT: "it", US: "en", GB: "en", CA: "en", AU: "en"
};

function returnPercent(n) {
  const count = Math.max(0, Math.round(Number(n) || 0));
  if (count <= 0) return 0;
  if (count === 1) return 10;
  if (count === 2) return 15;
  return 20;
}

function applyReturn(cents, count, n) {
  const percent = returnPercent(n);
  const schedule = Math.max(0, Math.round(Number(cents) || 0));
  const items = Math.max(0, Math.round(Number(count) || 0));
  const floor = items * Math.round(core.PRICE_PER_FRAMEWORK * 50);
  const cut = Math.round(schedule * (100 - percent) / 100);
  const next = percent ? Math.max(floor, cut) : schedule;
  return { percent, cents: next, usd: next / 100, floorUsd: floor / 100 };
}

function languageOf(header, country) {
  const tag = String(header || "").split(",")[0].trim().slice(0, 2).toLowerCase();
  if (LANGS.indexOf(tag) !== -1) return tag;
  return COUNTRY_LANG[String(country || "").toUpperCase()] || "en";
}

function catalog() {
  const one = core.scheduleCents(1);
  const four = core.scheduleCents(4);
  const eight = core.scheduleCents(8);
  return {
    floor: "A return price never falls below half the 19 USD sticker for that many selections.",
    cadence: "At most three notes in seven days, and never twice inside 48 hours.",
    returnTable: RETURN_TABLE.map((row) => ({
      n: row.n,
      percent: row.percent,
      label: row.label,
      oneUsd: applyReturn(one, 1, row.n).usd,
      fourUsd: applyReturn(four, 4, row.n).usd,
      eightUsd: applyReturn(eight, 8, row.n).usd
    })),
    plans: MONTHLY_PLANS.map((plan) => Object.assign({}, plan, {
      share: plan.anchorUsd ? Math.round((plan.usd / plan.anchorUsd) * 100) : 100
    }))
  };
}

function planById(id) {
  return MONTHLY_PLANS.find((plan) => plan.id === id) || MONTHLY_PLANS[0];
}

const COPY = {
  en: {
    return: ["The page is still talking.", "Your case list for {host} is sitting where you left it. A return run in the next 30 days takes {percent}% off the schedule. The first selection stays 19 USD before that. Reply to this note, or open the review and run it again.", "Come back to the case list"],
    paid: ["You already opened the door.", "The first payment for {host} is in. A 30-day history pass keeps every saved report open. Glance is 15 USD. A return run still takes {percent}% off the schedule. Reply if you want a call-back and leave a number in the reply.", "Your report can stay open"],
    offer: ["Three notes a week, then quiet.", "The return table is 10% on the first return, 15% on the second, and 20% after that. It never prices a selection under 9.50 USD. {host} can be read again whenever you are ready.", "A return price is waiting"]
  },
  es: {
    return: ["La página sigue hablando.", "La lista de casos de {host} sigue donde la dejaste. Un regreso en los próximos 30 días baja {percent}% el tarifario. La primera selección sigue en 19 USD antes de eso. Responde esta nota, o abre la revisión y córrela otra vez.", "Vuelve a la lista de casos"],
    paid: ["Ya abriste la puerta.", "El primer pago de {host} quedó. Un pase de 30 días deja abiertos los informes guardados. Glance cuesta 15 USD. Un regreso también baja {percent}% el tarifario. Si quieres que te llamemos, responde y deja un número.", "Tu informe puede seguir abierto"],
    offer: ["Tres notas por semana, y después silencio.", "El regreso baja 10% la primera vez, 15% la segunda, y 20% desde la tercera. Ninguna selección queda bajo 9.50 USD. {host} se puede leer de nuevo cuando quieras.", "Hay un precio de regreso"]
  },
  pt: {
    return: ["A página ainda está falando.", "A lista de casos de {host} continua onde você a deixou. Uma volta em 30 dias tira {percent}% da tabela. A primeira seleção continua 19 USD antes disso. Responda, ou abra a revisão e rode de novo.", "Volte para a lista de casos"],
    paid: ["Você já abriu a porta.", "O primeiro pagamento de {host} entrou. Um passe de 30 dias mantém os relatórios abertos. Glance custa 15 USD. A volta também tira {percent}% da tabela. Se quiser um retorno de chamada, responda e deixe um número.", "Seu relatório pode continuar aberto"],
    offer: ["Três notas por semana, depois silêncio.", "A volta tira 10% na primeira, 15% na segunda e 20% a partir da terceira. Nenhuma seleção fica abaixo de 9,50 USD. {host} pode ser lido de novo quando você quiser.", "Há um preço de volta"]
  },
  de: {
    return: ["Die Seite redet noch.", "Die Fallliste für {host} liegt noch da. Eine Rückkehr in 30 Tagen nimmt {percent}% von der Staffel. Die erste Auswahl bleibt 19 USD davor. Antworte auf diese Notiz, oder öffne die Prüfung erneut.", "Komm zurück zur Fallliste"],
    paid: ["Die Tür ist schon offen.", "Die erste Zahlung für {host} ist da. Ein Pass für 30 Tage lässt die Berichte offen. Glance kostet 15 USD. Eine Rückkehr nimmt zusätzlich {percent}% von der Staffel. Wenn du einen Rückruf willst, antworte und lass eine Nummer da.", "Dein Bericht kann offen bleiben"],
    offer: ["Drei Notizen in der Woche, dann Ruhe.", "Die Rückkehr nimmt 10% beim ersten Mal, 15% beim zweiten und 20% ab dem dritten. Keine Auswahl fällt unter 9,50 USD. {host} kann wieder gelesen werden, wenn du soweit bist.", "Ein Rückkehrpreis wartet"]
  },
  fr: {
    return: ["La page parle encore.", "La liste de cas pour {host} est toujours là. Un retour dans les 30 jours retire {percent}% du barème. La première sélection reste à 19 USD avant cela. Répondez à cette note, ou ouvrez la revue à nouveau.", "Revenez à la liste de cas"],
    paid: ["La porte est déjà ouverte.", "Le premier paiement pour {host} est passé. Un passe de 30 jours garde les rapports ouverts. Glance coûte 15 USD. Un retour retire aussi {percent}% du barème. Pour un rappel, répondez et laissez un numéro.", "Votre rapport peut rester ouvert"],
    offer: ["Trois notes par semaine, puis le silence.", "Le retour retire 10% la première fois, 15% la deuxième, et 20% ensuite. Aucune sélection ne descend sous 9,50 USD. {host} peut être relu quand vous voulez.", "Un prix de retour attend"]
  },
  it: {
    return: ["La pagina sta ancora parlando.", "L'elenco dei casi per {host} è ancora lì. Un ritorno entro 30 giorni toglie il {percent}% dallo scaglione. La prima voce resta 19 USD prima di quello. Rispondi a questa nota, oppure apri di nuovo la revisione.", "Torna all'elenco dei casi"],
    paid: ["La porta è già aperta.", "Il primo pagamento per {host} è arrivato. Un pass di 30 giorni tiene aperti i rapporti. Glance costa 15 USD. Un ritorno toglie anche il {percent}% dallo scaglione. Se vuoi una richiamata, rispondi e lascia un numero.", "Il rapporto può restare aperto"],
    offer: ["Tre note a settimana, poi silenzio.", "Il ritorno toglie il 10% la prima volta, il 15% la seconda e il 20% dalla terza. Nessuna voce scende sotto 9,50 USD. {host} si può leggere di nuovo quando vuoi.", "C'è un prezzo di ritorno"]
  }
};

function fill(text, vars) {
  return String(text || "").replace(/\{(\w+)\}/g, (all, key) => (vars[key] == null ? all : String(vars[key])));
}

function messageFor(kind, lang, vars) {
  const pack = COPY[LANGS.indexOf(lang) === -1 ? "en" : lang] || COPY.en;
  const row = pack[kind] || pack.return;
  const body = fill(row[1], vars);
  return {
    lang: LANGS.indexOf(lang) === -1 ? "en" : lang,
    kind,
    subject: fill(row[2], vars),
    title: fill(row[0], vars),
    text: body + "\n\nQA-lab URL Review\nhttps://carlosandmunoz.com/qa-review.html\nReply stop to end these notes."
  };
}

function completed(row) {
  return row && (row.status === "complete" || row.status === "stopped") && row.report;
}

function queue(records, now) {
  const at = now ? new Date(now).getTime() : Date.now();
  const month = 30 * 24 * 60 * 60 * 1000;
  const week = 7 * 24 * 60 * 60 * 1000;
  const gap = 48 * 60 * 60 * 1000;
  const byEmail = new Map();
  (records || []).forEach((row) => {
    const email = String(row.email || "").trim().toLowerCase();
    if (!email || email.indexOf("@") === -1) return;
    if (!byEmail.has(email)) byEmail.set(email, []);
    byEmail.get(email).push(row);
  });
  const stopped = new Set();
  (records || []).forEach((row) => {
    if (row && row.status === "follow-stop" && row.email) stopped.add(String(row.email).toLowerCase());
  });
  const passes = (records || []).filter((row) => row && row.status === "monthly-pass" && row.email && Date.parse(row.paidUntil || "") > at);
  return Array.from(byEmail.entries()).map(([email, rows]) => {
    const runs = rows.filter(completed).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
    const latest = runs[runs.length - 1] || rows[rows.length - 1];
    const lastRunAt = runs.length ? Date.parse(runs[runs.length - 1].createdAt || "") : 0;
    const inMonth = runs.filter((row) => at - Date.parse(row.createdAt || "") < month);
    const prior = Math.max(0, inMonth.length - 1);
    const percent = returnPercent(prior + 1);
    const paidOnce = rows.some((row) => row.paid === true || row.status === "paid-report" || row.status === "run-credit");
    const pass = passes.find((row) => String(row.email).toLowerCase() === email);
    const asked = rows.some((row) => row.followUp === true);
    const lang = languageOf(latest && latest.acceptLanguage, latest && latest.country);
    const sent = rows.filter((row) => row.status === "follow-note").map((row) => Date.parse(row.createdAt || "")).filter((time) => time && at - time < week).sort((a, b) => b - a);
    const quiet = !lastRunAt || at - lastRunAt > week;
    let kind = "return";
    if (paidOnce && !pass) kind = "paid";
    else if (!quiet) kind = "offer";
    const host = (latest && latest.report && latest.report.host) || "";
    const note = messageFor(kind, lang, { host: host || "the page", percent: percent || 10, name: (latest && latest.name) || "" });
    let held = "";
    if (stopped.has(email)) held = "This address asked to stop.";
    else if (pass) held = "A 30-day pass is open. Notes wait.";
    else if (!asked) held = "This address did not ask for notes.";
    else if (sent.length >= 3) held = "Three notes already went out in seven days.";
    else if (sent[0] && at - sent[0] < gap) held = "The last note was inside 48 hours.";
    return {
      email,
      name: (latest && latest.name) || "",
      lang,
      kind,
      host,
      percent: percent || 10,
      returns: prior,
      paidOnce,
      asked,
      held,
      due: !held,
      lastRun: lastRunAt ? new Date(lastRunAt).toISOString() : "",
      subject: note.subject,
      title: note.title,
      text: note.text
    };
  }).sort((a, b) => Number(b.due) - Number(a.due) || String(a.email).localeCompare(String(b.email)));
}

function customerRun(row, open) {
  const report = row.report || {};
  const cases = Array.isArray(report.cases) ? report.cases : [];
  const pages = Array.isArray(report.pages) ? report.pages : [];
  const blur = (value) => {
    const text = String(value || "");
    if (open || text.length < 8) return text;
    const keep = Math.max(4, Math.ceil(text.length / 2));
    return text.slice(0, keep);
  };
  return {
    id: row.id || "",
    at: row.createdAt || "",
    status: row.status || "",
    host: (report.host) || "",
    url: open ? (row.requestedUrl || "") : blur(row.requestedUrl || ""),
    pages: row.pages || null,
    depth: row.depth || null,
    pageCount: report.counts ? report.counts.pages : pages.length,
    caseCount: report.counts ? report.counts.cases : cases.length,
    signalCount: Array.isArray(report.alerts) ? report.alerts.length : 0,
    frameworks: row.frameworks || [],
    open,
    statement: open ? (report.statement || "") : blur(report.statement || ""),
    paths: pages.slice(0, 20).map((page) => open ? (page.path || "") : blur(page.path || "")),
    cases: cases.slice(0, 24).map((item) => ({
      id: item.id || "",
      layer: item.layer || "",
      title: open ? (item.title || "") : blur(item.title || "")
    })),
    log: open ? (report.log || []).slice(-12).map((line) => line && line.text ? line.text : "") : []
  };
}

module.exports = {
  RETURN_TABLE,
  MONTHLY_PLANS,
  returnPercent,
  applyReturn,
  languageOf,
  catalog,
  planById,
  messageFor,
  queue,
  customerRun
};
