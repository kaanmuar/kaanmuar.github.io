/* Calls with Carlos (#1971): the meeting types, the free slots in his Google Calendar, the event with a Meet link
   that Google sends as the invite, and the book.html link every page and mail opens.

   Google: an OAuth client (GOOGLE_CALENDAR_CLIENT_ID in functions/.env, GOOGLE_CALENDAR_CLIENT_SECRET in Secret
   Manager) and Carlos's refresh token, stored by the connect flow in booking_private/google. Nothing here reads
   Firestore except callsSource; the HTTP function in index.js does the rest. */

const SITE = "https://carlosandmunoz.com";
const LANGS = ["en", "es", "pt", "de", "fr", "it"];
const TZ = "America/Bogota";
// Bogota keeps UTC-5 all year, so local time is a fixed shift.
const OFFSET_MS = -5 * 60 * 60 * 1000;
const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;
// "Any free time, weekdays only": the day is bounded so nobody books a 3 a.m. call.
const DAY_START_MIN = 8 * 60;
const DAY_END_MIN = 20 * 60;
const STEP_MIN = 15;
const BUFFER_MS = 10 * MINUTE;
const NOTICE_MS = 4 * 60 * MINUTE;
const HORIZON_DAYS = 21;
const MAX_UPCOMING_PER_EMAIL = 2;

const TYPES = {
  intro: { minutes: 15, product: "review" },
  walkthrough: { minutes: 30, product: "review" },
  cv: { minutes: 30, product: "cv" },
  call: { minutes: 30, product: "general" }
};

const LABELS = {
  en: { intro: "QA-lab URL Review intro", walkthrough: "URL Review report walkthrough", cv: "Call about a role", call: "Call with Carlos" },
  es: { intro: "Introducción a QA-lab URL Review", walkthrough: "Recorrido por tu informe de URL Review", cv: "Llamada sobre un puesto", call: "Llamada con Carlos" },
  pt: { intro: "Introdução ao QA-lab URL Review", walkthrough: "Tour pelo seu relatório do URL Review", cv: "Conversa sobre uma vaga", call: "Conversa com o Carlos" },
  de: { intro: "Einführung in QA-lab URL Review", walkthrough: "Durchgang durch Ihren URL-Review-Bericht", cv: "Gespräch über eine Stelle", call: "Gespräch mit Carlos" },
  fr: { intro: "Présentation de QA-lab URL Review", walkthrough: "Visite de votre rapport URL Review", cv: "Appel au sujet d'un poste", call: "Appel avec Carlos" },
  it: { intro: "Introduzione a QA-lab URL Review", walkthrough: "Giro guidato del tuo report URL Review", cv: "Chiamata per una posizione", call: "Chiamata con Carlos" }
};

const SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.freebusy",
  "openid",
  "email"
];
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const CAL = "https://www.googleapis.com/calendar/v3";

const langOf = (lang) => {
  const code = String(lang || "").slice(0, 2).toLowerCase();
  return LANGS.includes(code) ? code : "en";
};
const typeOf = (type) => (TYPES[type] ? type : "call");
const clip = (value, max) => String(value == null ? "" : value).replace(/\s+/g, " ").trim().slice(0, max);

// The page every "Schedule a call" button opens. `from` names the mail or page, for the utm_campaign.
function bookUrl(type, lang, opts) {
  const o = opts || {};
  const url = new URL(SITE + "/book.html");
  url.searchParams.set("type", typeOf(type));
  url.searchParams.set("lang", langOf(lang));
  if (/^[a-z0-9.\-]+\.[a-z]{2,}$/i.test(String(o.host || ""))) url.searchParams.set("host", clip(o.host, 120).toLowerCase());
  if (o.report) url.searchParams.set("review", clip(o.report, 80));
  if (o.from) {
    url.searchParams.set("utm_source", o.source || "email");
    url.searchParams.set("utm_campaign", clip(o.from, 60));
  }
  return url.toString();
}

const localDay = (ms) => Math.floor((ms + OFFSET_MS) / DAY) * DAY - OFFSET_MS;
const weekday = (ms) => new Date(ms + OFFSET_MS).getUTCDay();

// Every start time a call of `type` fits: weekdays, inside the day, past the notice, clear of busy time.
// busy: [{ start, end }] as ISO strings or ms, from freeBusy.
function freeSlots(busy, opts) {
  const o = opts || {};
  const now = Number(o.now) || Date.now();
  const length = TYPES[typeOf(o.type)].minutes * MINUTE;
  const days = Math.min(Number(o.days) || HORIZON_DAYS, HORIZON_DAYS);
  const blocked = (busy || []).map((b) => [Date.parse(b.start) || Number(b.start), Date.parse(b.end) || Number(b.end)])
    .filter((b) => b[0] && b[1]);
  const out = [];
  for (let d = 0; d <= days; d++) {
    const day = localDay(now) + d * DAY;
    const wd = weekday(day);
    if (wd === 0 || wd === 6) continue;
    for (let m = DAY_START_MIN; m + length / MINUTE <= DAY_END_MIN; m += STEP_MIN) {
      const start = day + m * MINUTE;
      const end = start + length;
      if (start < now + NOTICE_MS) continue;
      if (blocked.some((b) => start < b[1] + BUFFER_MS && end > b[0] - BUFFER_MS)) continue;
      out.push(new Date(start).toISOString());
    }
  }
  return out;
}

// The span freeBusy is asked about for freeSlots.
function busyWindow(now) {
  const from = localDay(now);
  return { timeMin: new Date(from).toISOString(), timeMax: new Date(from + (HORIZON_DAYS + 1) * DAY).toISOString() };
}

const EMAIL = /^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$/;

// The visitor's form, cleaned. Returns { ok, value } or { ok: false, error }.
function readBooking(body, now) {
  const b = body || {};
  if (!TYPES[b.type]) return { ok: false, error: "Pick a kind of call." };
  const start = Date.parse(b.start);
  if (!start) return { ok: false, error: "Pick a time." };
  const name = clip(b.name, 120);
  if (name.length < 2) return { ok: false, error: "Check the name." };
  const email = clip(b.email, 160).toLowerCase();
  if (!EMAIL.test(email)) return { ok: false, error: "Check the email." };
  const value = {
    type: b.type,
    lang: langOf(b.lang),
    start: new Date(start).toISOString(),
    end: new Date(start + TYPES[b.type].minutes * MINUTE).toISOString(),
    name,
    email,
    company: clip(b.company, 120),
    note: String(b.note == null ? "" : b.note).replace(/\r\n/g, "\n").trim().slice(0, 2000),
    host: clip(b.host, 120).toLowerCase().replace(/[^a-z0-9.\-]/g, ""),
    report: clip(b.report, 80).replace(/[^A-Za-z0-9_\-]/g, ""),
    ref: clip(b.ref, 60).replace(/[^A-Za-z0-9_.\-]/g, "")
  };
  if (!freeSlots([], { type: value.type, now }).includes(value.start)) return { ok: false, code: "taken", error: "That time is not open. Pick another one." };
  return { ok: true, value };
}

function reportUrl(lang, report) {
  const page = lang === "en" ? "qa-review.html" : "qa-review-" + lang + ".html";
  return SITE + "/" + page + "?report=" + encodeURIComponent(report);
}

// The Calendar event. Google mails the invite (with the Meet link) to the visitor from Carlos's calendar.
function eventBody(b, id) {
  const label = LABELS[b.lang][b.type];
  const lines = [
    label + " (" + TYPES[b.type].minutes + " min)",
    "",
    b.name + " <" + b.email + ">" + (b.company ? ", " + b.company : ""),
    b.host ? "Site: " + b.host : "",
    b.report ? "Report: " + reportUrl(b.lang, b.report) : "",
    b.note ? "\n" + b.note : "",
    "",
    "Booked at " + SITE + "/book.html" + (b.ref ? " from " + b.ref : "") + " · language " + b.lang
  ].filter((line, i, all) => line !== "" || all[i - 1] !== "");
  return {
    summary: label + ": " + b.name + " & Carlos A. Muñoz",
    description: lines.join("\n").slice(0, 7000),
    start: { dateTime: b.start, timeZone: TZ },
    end: { dateTime: b.end, timeZone: TZ },
    attendees: [{ email: b.email, displayName: b.name }],
    conferenceData: { createRequest: { requestId: "book-" + id, conferenceSolutionKey: { type: "hangoutsMeet" } } },
    reminders: { useDefault: true },
    guestsCanModify: false,
    extendedProperties: { private: { booking: id, type: b.type } }
  };
}

function authUrl(clientId, redirect, state) {
  const url = new URL(AUTH_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirect);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", SCOPES.join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", state);
  return url.toString();
}

async function postForm(fetchImpl, url, form) {
  const res = await fetchImpl(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form),
    signal: AbortSignal.timeout(15000)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error("Google token " + res.status + ": " + clip(data.error_description || data.error, 160));
  return data;
}

// The connected account's address, read from the id_token Google just returned over TLS.
function emailOf(idToken) {
  try {
    const payload = JSON.parse(Buffer.from(String(idToken || "").split(".")[1] || "", "base64url").toString("utf8"));
    return String(payload.email || "");
  } catch (error) { return ""; }
}

async function tokenFromCode({ clientId, secret, code, redirect, fetchImpl = fetch }) {
  const data = await postForm(fetchImpl, TOKEN_URL, { code, client_id: clientId, client_secret: secret, redirect_uri: redirect, grant_type: "authorization_code" });
  if (!data.refresh_token) throw new Error("Google sent no refresh token. Remove the app's access at myaccount.google.com/permissions and connect again.");
  return { refresh: data.refresh_token, email: emailOf(data.id_token), scope: String(data.scope || "") };
}

async function accessToken({ clientId, secret, refresh, fetchImpl = fetch }) {
  const data = await postForm(fetchImpl, TOKEN_URL, { client_id: clientId, client_secret: secret, refresh_token: refresh, grant_type: "refresh_token" });
  return data.access_token;
}

async function calendarCall(fetchImpl, token, path, body) {
  const res = await fetchImpl(CAL + path, {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error("Google Calendar " + res.status + ": " + clip(data.error && data.error.message, 200));
  return data;
}

async function busyTimes({ token, timeMin, timeMax, fetchImpl = fetch }) {
  const data = await calendarCall(fetchImpl, token, "/freeBusy", { timeMin, timeMax, timeZone: TZ, items: [{ id: "primary" }] });
  const cal = (data.calendars && data.calendars.primary) || {};
  if (cal.errors && cal.errors.length) throw new Error("Google Calendar: " + clip(cal.errors[0].reason, 80));
  return cal.busy || [];
}

async function createEvent({ token, booking, id, fetchImpl = fetch }) {
  const event = await calendarCall(fetchImpl, token, "/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all", eventBody(booking, id));
  const video = ((event.conferenceData && event.conferenceData.entryPoints) || []).find((e) => e.entryPointType === "video");
  return { eventId: event.id, meet: event.hangoutLink || (video && video.uri) || "", htmlLink: event.htmlLink || "" };
}

// Rows for Carlos's new-booking mail (owner-mail.js layout).
function ownerRows(b) {
  return [
    ["Call", LABELS.en[b.type] + " (" + TYPES[b.type].minutes + " min)"],
    ["When", new Date(b.start).toLocaleString("en-US", { timeZone: TZ, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) + " Bogota"],
    ["Who", b.name + " <" + b.email + ">"],
    b.company ? ["Company", b.company] : null,
    b.host ? ["Site", b.host] : null,
    b.report ? ["Report", reportUrl(b.lang, b.report)] : null,
    ["Language", b.lang],
    b.ref ? ["From", b.ref] : null,
    b.meet ? ["Meet", b.meet] : null
  ].filter(Boolean);
}

// Jarvis source: the connection and the calls ahead (Business > Calls, web and app).
async function callsSource(ctx) {
  const db = ctx.db;
  const now = ctx.now || Date.now();
  const since = now - (Number(ctx.days) || 7) * DAY;
  const [google, ahead, past] = await Promise.all([
    db.doc("booking_private/google").get(),
    db.collection("bookings").where("start", ">=", new Date(now - 60 * MINUTE).toISOString()).orderBy("start").limit(25).get(),
    db.collection("bookings").where("createdAt", ">=", new Date(since).toISOString()).get()
  ]);
  const g = google.exists ? google.data() || {} : {};
  const connected = Boolean(g.refresh);
  const upcoming = ahead.docs.map((doc) => {
    const b = doc.data() || {};
    return { id: doc.id, type: b.type, label: LABELS.en[b.type] || b.type, minutes: (TYPES[b.type] || TYPES.call).minutes, start: b.start, end: b.end, name: b.name, email: b.email, company: b.company || "", host: b.host || "", report: b.report || "", lang: b.lang, note: clip(b.note, 300), meet: b.meet || "", ref: b.ref || "" };
  }).filter((b) => b.start);
  const byType = {};
  past.docs.forEach((doc) => { const t = (doc.data() || {}).type || "call"; byType[t] = (byType[t] || 0) + 1; });
  return {
    ok: true,
    connected,
    account: g.email || "",
    connectedAt: g.connectedAt || "",
    error: g.error || "",
    upcoming,
    bookedInRange: past.size,
    byType,
    page: SITE + "/book.html",
    needs: connected ? [] : ["Calls: connect Google Calendar in Jarvis > Business > Calls so visitors can book."]
  };
}

module.exports = {
  SITE, LANGS, TZ, TYPES, LABELS, SCOPES, HORIZON_DAYS, MAX_UPCOMING_PER_EMAIL, DAY_START_MIN, DAY_END_MIN,
  langOf, bookUrl, freeSlots, busyWindow, readBooking, eventBody, authUrl, tokenFromCode, accessToken, busyTimes, createEvent, ownerRows, callsSource, emailOf
};
