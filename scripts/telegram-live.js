#!/usr/bin/env node
/* The Live reports ring as a Telegram Mini App (#2549): live.html, opened from the bot's menu button, from links in
   the channel, and from t.me links that open one report.

     TELEGRAM_BOT_TOKEN=... node scripts/telegram-live.js setup        name, descriptions and commands in six languages,
                                                                        and the menu button that opens live.html
     TELEGRAM_BOT_TOKEN=... node scripts/telegram-live.js whoami       the bot's username and the links to use
     TELEGRAM_BOT_TOKEN=... TELEGRAM_CHANNEL=@name node scripts/telegram-live.js post [--dry-run]
                                                                        one channel post for the reports analyzed since the last one
     TELEGRAM_BOT_TOKEN=... node scripts/telegram-live.js chats        chats and channels the bot was added to (to find a channel id)

   TELEGRAM_APP is the Mini App's direct link from BotFather's /newapp, such as https://t.me/QALabLiveBot/live; a report
   opens in the app as <TELEGRAM_APP>?startapp=<report id>. Without it, links open live.html in the browser.
   A bot cannot create a channel or a Mini App direct link: both are made once in the Telegram app (BotFather).
   Channels only take URL buttons (web_app buttons work in private chats), so the post links the direct link.

   Every post goes into the ledger assets/social/telegram.json (scripts/social-ledger.js) under live/<analyzed date>;
   the newest date there is where the next post starts. The Live Reports workflow posts after each batch and
   scripts/commit-social-ledgers.sh commits the ledger. */

const fs = require("fs");
const path = require("path");
const ledgers = require("./social-ledger");

const ROOT = path.resolve(__dirname, "..");
const LEDGER = "assets/social/telegram.json";
const INDEX = path.join(ROOT, "assets/live-reports/index.json");
const SITE = "https://carlosandmunoz.com";
const APP_URL = SITE + "/live.html";
const TOP = 6;

const token = process.env.TELEGRAM_BOT_TOKEN || "";
const argv = process.argv.slice(2);
const cmd = argv[0] || "";
const dry = argv.includes("--dry-run");

const COPY = {
  "": {
    name: "QA-lab Live Reports",
    short: "Real sites, real reviews. Turn the ring of public site reports and open any of them. A new batch every day.",
    about: "QA-lab URL Review analyzes public sites for SEO, AI search (GEO), analytics, security, accessibility, and speed.\n\nTap Live reports to turn the ring, filter by sector or country, and open any report. New reviews are added every day.\n\nReview your own site at carlosandmunoz.com.",
    button: "Live reports", open: "Open the live reports"
  },
  es: {
    name: "QA-lab Reportes en vivo",
    short: "Sitios reales, revisiones reales. Gira el anillo de reportes de sitios públicos y abre cualquiera. Lote nuevo cada día.",
    about: "QA-lab URL Review analiza sitios públicos en SEO, búsqueda con IA (GEO), analítica, seguridad, accesibilidad y velocidad.\n\nToca Reportes en vivo para girar el anillo, filtrar por sector o país y abrir cualquier reporte. Cada día se suman revisiones nuevas.\n\nAnaliza tu propio sitio en carlosandmunoz.com.",
    button: "Reportes en vivo", open: "Abrir los reportes en vivo"
  },
  pt: {
    name: "QA-lab Relatórios ao vivo",
    short: "Sites reais, análises reais. Gire o anel de relatórios de sites públicos e abra qualquer um. Um lote novo por dia.",
    about: "O QA-lab URL Review analisa sites públicos em SEO, busca com IA (GEO), analytics, segurança, acessibilidade e velocidade.\n\nToque em Relatórios ao vivo para girar o anel, filtrar por setor ou país e abrir qualquer relatório. Novas análises entram todos os dias.\n\nAnalise o seu site em carlosandmunoz.com.",
    button: "Relatórios ao vivo", open: "Abrir os relatórios ao vivo"
  },
  de: {
    name: "QA-lab Live-Berichte",
    short: "Echte Websites, echte Prüfungen. Drehen Sie den Ring öffentlicher Website-Berichte und öffnen Sie jeden. Täglich neue.",
    about: "QA-lab URL Review prüft öffentliche Websites auf SEO, KI-Suche (GEO), Analytics, Sicherheit, Barrierefreiheit und Geschwindigkeit.\n\nTippen Sie auf Live-Berichte, um den Ring zu drehen, nach Branche oder Land zu filtern und jeden Bericht zu öffnen. Jeden Tag kommen neue Prüfungen hinzu.\n\nPrüfen Sie Ihre eigene Website auf carlosandmunoz.com.",
    button: "Live-Berichte", open: "Live-Berichte öffnen"
  },
  fr: {
    name: "QA-lab Rapports en direct",
    short: "De vrais sites, de vraies analyses. Faites tourner l’anneau des rapports de sites publics et ouvrez-les. Chaque jour.",
    about: "QA-lab URL Review analyse des sites publics : SEO, recherche par IA (GEO), analytics, sécurité, accessibilité et vitesse.\n\nTouchez Rapports en direct pour faire tourner l’anneau, filtrer par secteur ou pays et ouvrir n’importe quel rapport. De nouvelles analyses arrivent chaque jour.\n\nAnalysez votre propre site sur carlosandmunoz.com.",
    button: "Rapports en direct", open: "Ouvrir les rapports en direct"
  },
  it: {
    name: "QA-lab Report dal vivo",
    short: "Siti reali, analisi reali. Gira l’anello dei report di siti pubblici e apri quello che vuoi. Un lotto nuovo ogni giorno.",
    about: "QA-lab URL Review analizza siti pubblici per SEO, ricerca con IA (GEO), analytics, sicurezza, accessibilità e velocità.\n\nTocca Report dal vivo per girare l’anello, filtrare per settore o paese e aprire qualsiasi report. Ogni giorno arrivano nuove analisi.\n\nAnalizza il tuo sito su carlosandmunoz.com.",
    button: "Report dal vivo", open: "Apri i report dal vivo"
  }
};
const COMMANDS = {
  "": [["start", "Open the live reports"], ["live", "Open the live reports"]],
  es: [["start", "Abrir los reportes en vivo"], ["live", "Abrir los reportes en vivo"]],
  pt: [["start", "Abrir os relatórios ao vivo"], ["live", "Abrir os relatórios ao vivo"]],
  de: [["start", "Live-Berichte öffnen"], ["live", "Live-Berichte öffnen"]],
  fr: [["start", "Ouvrir les rapports en direct"], ["live", "Ouvrir les rapports en direct"]],
  it: [["start", "Apri i report dal vivo"], ["live", "Apri i report dal vivo"]]
};

async function api(method, body) {
  if (!token) throw new Error("Set TELEGRAM_BOT_TOKEN (BotFather > /mybots > API Token).");
  const res = await fetch("https://api.telegram.org/bot" + token + "/" + method, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body || {})
  });
  const json = await res.json().catch(() => ({ ok: false, description: "status " + res.status }));
  if (!json.ok) {
    const error = new Error(method + ": " + json.description);
    error.retryAfter = json.parameters && json.parameters.retry_after;
    throw error;
  }
  return json.result;
}

// setMyName allows a few changes a day; a 429 there must not stop the rest of the setup.
async function soft(method, body) {
  try { return await api(method, body); } catch (error) { console.warn("skipped " + error.message); return null; }
}

function appLink(id) {
  const app = (process.env.TELEGRAM_APP || "").replace(/\/+$/, "");
  if (app) return app + (id ? "?startapp=" + encodeURIComponent(id) : "");
  return APP_URL + "?" + (id ? "start=" + encodeURIComponent(id) + "&" : "") + "utm_source=telegram&utm_medium=social&utm_campaign=live-reports";
}

async function setup() {
  const me = await api("getMe");
  for (const [lang, copy] of Object.entries(COPY)) {
    const language_code = lang || undefined;
    await soft("setMyName", { name: copy.name, language_code });
    await api("setMyShortDescription", { short_description: copy.short, language_code });
    await api("setMyDescription", { description: copy.about, language_code });
    await api("setMyCommands", { commands: COMMANDS[lang].map(([command, description]) => ({ command, description })), language_code });
  }
  // One menu button for every private chat; Telegram has no per-language menu button text.
  await api("setChatMenuButton", { menu_button: { type: "web_app", text: COPY[""].button, web_app: { url: APP_URL } } });
  console.log("@" + me.username + " is set up. Menu button opens " + APP_URL);
  console.log("Still in BotFather (the Bot API cannot do these): /setuserpic, /newapp for a direct link (TELEGRAM_APP), and Bot Settings > Configure Mini App > Enable, with " + APP_URL);
}

async function whoami() {
  const me = await api("getMe");
  const menu = await api("getChatMenuButton", {});
  console.log(JSON.stringify({ username: me.username, name: me.first_name, menu, app: process.env.TELEGRAM_APP || null, mainApp: "https://t.me/" + me.username + "?startapp" }, null, 1));
}

async function chats() {
  const updates = await api("getUpdates", { allowed_updates: ["my_chat_member", "channel_post", "message"] });
  const seen = new Map();
  updates.forEach((u) => {
    const chat = (u.my_chat_member || u.channel_post || u.message || {}).chat;
    if (chat) seen.set(chat.id, { id: chat.id, type: chat.type, title: chat.title || chat.username, username: chat.username });
  });
  console.log(JSON.stringify([...seen.values()], null, 1));
}

function esc(text) {
  return String(text == null ? "" : text).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
}

function lastPosted(ledger) {
  return Object.keys(ledger.posts).filter((k) => k.startsWith("live/")).map((k) => k.slice(5)).sort().pop() || "";
}

function message(fresh, index) {
  const top = fresh.slice().sort((a, b) => b.overall - a.overall || a.name.localeCompare(b.name)).slice(0, TOP);
  const sectors = new Set(fresh.map((r) => r.sector).filter(Boolean));
  const countries = new Set(fresh.map((r) => r.country).filter(Boolean));
  const lines = top.map((r) => r.flag + " <a href=\"" + esc(appLink(r.id)) + "\">" + esc(r.name) + "</a>: <b>" + r.overall + "</b> (" + esc(r.grade) + ")");
  const head = fresh.length === 1 ? "<b>1 new live report</b>" : "<b>" + fresh.length + " new live reports</b>";
  const spread = [sectors.size > 1 ? sectors.size + " sectors" : "", countries.size > 1 ? countries.size + " countries" : ""].filter(Boolean).join(", ");
  return head + (spread ? " from " + spread : "") + ". The series now holds " + index.reports.length + " public sites.\n\n" +
    (fresh.length > TOP ? "Top scores in this batch:\n" : "") + lines.join("\n") +
    "\n\nOne automated analysis of public pages each, a starting point, not a verdict. Turn the ring and open any of them.";
}

async function post() {
  const channel = process.env.TELEGRAM_CHANNEL || "";
  if (!channel && !dry) throw new Error("Set TELEGRAM_CHANNEL to the channel's @username or -100 id.");
  const index = JSON.parse(fs.readFileSync(INDEX, "utf8"));
  const ledger = ledgers.read(LEDGER);
  // The first post covers only the newest batch, not the whole series.
  const newest = index.reports.map((r) => r.read || "").sort().pop();
  const since = lastPosted(ledger);
  const fresh = index.reports.filter((r) => r.read && (since ? r.read > since : r.read === newest));
  if (!fresh.length) { console.log("No reports analyzed after " + (since || "the start") + "."); return; }
  const day = fresh.map((r) => r.read).sort().pop();
  const text = message(fresh, index);
  const reply_markup = { inline_keyboard: [
    [{ text: "▶ " + COPY[""].open, url: appLink("") }],
    [{ text: "carlosandmunoz.com", url: SITE + "/qa-review.html?utm_source=telegram&utm_medium=social&utm_campaign=live-reports#live-reports" }]
  ] };
  if (dry) { console.log(text + "\n\n" + JSON.stringify(reply_markup)); return; }
  const sent = await api("sendMessage", { chat_id: channel, text, parse_mode: "HTML", reply_markup, link_preview_options: { is_disabled: true } });
  const handle = sent.chat.username ? "@" + sent.chat.username : String(sent.chat.id);
  const at = new Date(sent.date * 1000).toISOString();
  ledgers.record(ledger, "live/" + day, {
    channel: "telegram", profile: "Telegram " + handle, id: String(sent.message_id), at, result: "sent", checked: new Date().toISOString(),
    url: sent.chat.username ? "https://t.me/" + sent.chat.username + "/" + sent.message_id : ""
  });
  ledgers.write(LEDGER, ledger);
  console.log("Posted " + fresh.length + " reports (" + (since || "start") + " to " + day + ") to " + handle + ".");
}

const RUN = { setup, whoami, chats, post };
if (!RUN[cmd]) {
  console.error("usage: node scripts/telegram-live.js setup | whoami | chats | post [--dry-run]");
  process.exit(2);
}
RUN[cmd]().catch((error) => { console.error(error.message); process.exit(1); });
