/**
 * This is the complete code for your functions/index.js file.
 * It handles sending emails for both message replies and rating replies
 * using your specific SendGrid Dynamic Template IDs.
 */

// Import necessary Firebase and SendGrid modules
const functions = require("firebase-functions/v1");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue, Timestamp, AggregateField } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");
const { getAuth } = require("firebase-admin/auth");
const { getStorage } = require("firebase-admin/storage");
const sgMail = require("@sendgrid/mail");

// Initialize Firebase Admin SDK
initializeApp();
// An optional field left undefined is dropped instead of failing the whole write, such as a finished review's report.
getFirestore().settings({ ignoreUndefinedProperties: true });

// Keys and tokens are Secret Manager secrets, bound per function in ./secrets.
// Plain settings such as SENDGRID_FROM are env vars in functions/.env.
const SECRETS = require("./secrets");
const OWNER_EMAIL = "kaanmuar@gmail.com";
const TOPIC_LABELS = {
  opportunity: "Job Opportunity / Collaboration",
  inquiry: "Project Inquiry",
  feedback: "CV Feedback",
  other: "Other"
};


const withMail = functions.runWith({ secrets: SECRETS.mail });
const withMailAndGithub = functions.runWith({ secrets: SECRETS.mailWithGithub });
const KEEP_MS = 365 * 24 * 60 * 60 * 1000;

// Rows that carry expireAt are deleted by a Firestore TTL policy once it passes.
function keepUntil() {
  return new Date(Date.now() + KEEP_MS);
}
const siteReport = require("./site-report-mail");
const ownerLayout = require("./owner-mail");
const ops = require("./ops-schedule");
const githubApp = require("./github-app");

// Runs a scheduled job and leaves its outcome in ops_runs/<job> for opsWatchdog. A job may return a
// short note ("12 sent") for the digest.
async function track(job, run) {
  const ref = getFirestore().collection("ops_runs").doc(job);
  const startedAt = new Date().toISOString();
  try {
    const note = await run();
    await ref.set({ job, startedAt, endedAt: new Date().toISOString(), ok: true, note: typeof note === "string" ? note : "", error: "" });
  } catch (error) {
    await ref.set({ job, startedAt, endedAt: new Date().toISOString(), ok: false, note: "", error: String((error && error.message) || error).slice(0, 300) })
      .catch((write) => console.error("ops_runs/" + job + " was not written:", write));
    throw error;
  }
  return null;
}

// A v1 schedule from the ops table, on Bogotá time, tracked in ops_runs.
function scheduled(builder, job, run) {
  return builder.pubsub.schedule(ops.cron(job)).timeZone(ops.TIME_ZONE).onRun(() => track(job, run));
}

function prepareMail() {
  const apiKey = process.env.SENDGRID_API_KEY;
  const from = process.env.SENDGRID_FROM;
  if (!apiKey || !from) {
    console.error("SendGrid key or from-address is not configured.");
    return null;
  }
  sgMail.setApiKey(apiKey);
  return from;
}

/**
 * This is a generic function that triggers when a new document is created in the "mail" collection.
 * It sends an email using the data from the document. This function remains the same.
 */
exports.sendEmailOnNewMail = withMail.firestore
  .document("mail/{docId}")
  .onCreate(async (snap, context) => {
    const from = prepareMail();
    if (!from) return null;
    const mailData = snap.data();

    // Basic validation
    if (!mailData.to || !mailData.templateId) {
      console.error("Missing 'to' or 'templateId' in mail document:", context.params.docId);
      return null;
    }

    const msg = {
      to: mailData.to,
      from: from,
      templateId: mailData.templateId,
      dynamic_template_data: mailData.dynamicTemplateData || {},
    };

    try {
      console.log(`Sending email to ${msg.to} using template ${msg.templateId}`);
      await sgMail.send(msg);
      console.log("Email sent successfully!");
      return snap.ref.update({ status: "sent", sentAt: FieldValue.serverTimestamp() });
    } catch (error) {
      console.error("Error sending email:", error);
      if (error.response) {
        console.error(error.response.body);
      }
      return snap.ref.update({ status: "error", errorMessage: error.toString() });
    }
  });

/**
 * UPDATED FUNCTION
 * This function triggers when an admin responds to a MESSAGE.
 * It queues an email using the specific template ID for message replies.
 */
exports.queueEmailOnMessageResponse = functions.firestore
  .document("messages/{messageId}")
  .onUpdate(async (change, context) => {
    const newData = change.after.data();
    const oldData = change.before.data();

    // Trigger only when the 'response' field is newly added
    if (newData.response && !oldData.response) {
      const newMail = {
        to: newData.email,
        // YOUR MESSAGE RESPONSE TEMPLATE ID
        templateId: "d-44eba8ad4165473a81c1154d398ef82f",
        dynamicTemplateData: {
          subject: "Response regarding your message",
          recipient_name: newData.name,
          original_message: newData.message,
          admin_response: newData.response,
        },
      };

      try {
        await getFirestore().collection("mail").add(Object.assign({}, newMail, { expireAt: keepUntil() }));
        console.log(`Message reply to ${newData.email} has been successfully queued.`);
      } catch (error) {
        console.error("Error queueing message reply:", error);
      }
    }
    return null;
  });

/**
 * NEW FUNCTION
 * This function triggers when an admin responds to a RATING.
 * It queues an email using the specific template ID for rating replies.
 */
exports.queueEmailOnRatingResponse = functions.firestore
  .document("ratings/{ratingId}")
  .onUpdate(async (change, context) => {
    const newData = change.after.data();
    const oldData = change.before.data();

    // Trigger only when the 'response' field is newly added
    if (newData.response && !oldData.response) {
      // Logic to convert the numeric rating (e.g., 4) into stars (e.g., ★★★★☆)
      const rating = newData.rating || 0;
      const stars = '★'.repeat(rating) + '☆'.repeat(5 - rating);

      const newMail = {
        to: newData.email,
        // YOUR CV RATE RESPONSE TEMPLATE ID
        templateId: "d-8d630958ddd4407eb0d5b2f88a87d07b",
        dynamicTemplateData: {
          subject: "Thank you for your feedback on my CV!",
          recipient_name: newData.name,
          rating_stars: stars, // Pass the generated star string
          original_comment: newData.comment,
          admin_response: newData.response,
        },
      };

      try {
        await getFirestore().collection("mail").add(Object.assign({}, newMail, { expireAt: keepUntil() }));
        console.log(`Rating reply to ${newData.email} has been successfully queued.`);
      } catch (error) {
        console.error("Error queueing rating reply:", error);
      }
    }
    return null;
  });

function clip(value, max) {
  const text = String(value == null ? "" : value).replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  return text.slice(0, max) + "…";
}

function clipBlock(value, max) {
  const text = String(value == null ? "" : value).replace(/\r\n/g, "\n").trim();
  if (text.length <= max) return text;
  return text.slice(0, max) + "…";
}

function adminRespondUrl(type, id) {
  const docId = String(id || "").trim();
  if (!docId || (type !== "message" && type !== "rating")) return "";
  const url = new URL("https://kaanmuar.github.io/admin.html");
  url.searchParams.set("respond", type);
  url.searchParams.set("id", docId);
  return url.toString();
}

// An owner email that moved to Jarvis pushes sends only when its switch is on in Jarvis settings (#1672).
async function mailOn(key) {
  const settings = await jarvis.readSettings(getFirestore());
  return settings.mail[key] === true;
}

async function sendOwnerEmail({ subject, intro, rows, body, respondUrl, buttonLabel, to, replyTo, eyebrow }) {
  const from = prepareMail();
  if (!from) return false;
  const { text, html } = ownerLayout.ownerMail({ intro, rows, body, respondUrl, buttonLabel, eyebrow: eyebrow || (to === REVIEW_ALERT_TO ? "QA-lab URL Review" : "") });
  await sgMail.send(Object.assign({
    to: to || OWNER_EMAIL,
    from: from,
    subject: clip(subject, 140),
    text: text.slice(0, 16000),
    html: html
  }, replyTo ? { replyTo } : {}));
  return true;
}

exports.notifyOwnerOnMessage = withMail.firestore
  .document("messages/{messageId}")
  .onCreate(async (snap) => {
    try { await noteFormBurst(); }
    catch (error) { console.error("Form burst note failed:", error); }
    const data = snap.data() || {};
    const topic = TOPIC_LABELS[data.topic] || data.topic || "—";
    try {
      if (await mailOn("messages")) await sendOwnerEmail({
        subject: "New CV message — " + clip(topic, 60),
        intro: "New message on your CV",
        rows: [
          { label: "From", value: clip(data.name, 120) },
          { label: "Email", value: clip(data.email, 120) },
          { label: "Topic", value: clip(topic, 80) },
          { label: "Attachment", value: data.fileURL ? "Yes" : "No" }
        ],
        body: clipBlock(data.message, 2000),
        respondUrl: adminRespondUrl("message", snap.id)
      });
    } catch (error) {
      console.error("Owner message notification failed:", error);
    }
    await pushOwner(jarvisMailPush.messageMessage(snap.id, data, topic));
    return null;
  });

exports.notifyOwnerOnRating = withMail.firestore
  .document("ratings/{ratingId}")
  .onCreate(async (snap) => {
    try { await noteFormBurst(); }
    catch (error) { console.error("Form burst note failed:", error); }
    const data = snap.data() || {};
    const score = Math.min(5, Math.max(0, Number(data.rating) || 0));
    try {
      if (await mailOn("ratings")) await sendOwnerEmail({
        subject: "New CV feedback — " + score + "/5",
        intro: "New feedback on your CV",
        rows: [
          { label: "From", value: clip(data.name, 120) },
          { label: "Email", value: clip(data.email, 120) },
          { label: "Rating", value: score + " out of 5" }
        ],
        body: clipBlock(data.comment, 2000) || "(no comment)",
        respondUrl: adminRespondUrl("rating", snap.id)
      });
    } catch (error) {
      console.error("Owner rating notification failed:", error);
    }
    await pushOwner(jarvisMailPush.ratingMessage(snap.id, data));
    return null;
  });

exports.notifyOwnerOnVisit = withMail.firestore
  .document("visits/{visitId}")
  .onCreate(async () => null);

const CV_ORIGINS = new Set([
  "https://carlosandmunoz.com",
  "https://www.carlosandmunoz.com",
  "https://kaanmuar.github.io",
  "http://127.0.0.1:8765",
  "http://localhost:8765",
  "http://127.0.0.1:8901",
  "http://localhost:8901"
]);

function decodePlace(value) {
  const raw = String(value || "").replace(/\+/g, " ");
  try { return decodeURIComponent(raw); } catch (error) { return raw; }
}

exports.noteCvVisit = functions.runWith({ maxInstances: 10 }).https.onRequest(async (req, res) => {
  const origin = String(req.get("origin") || "");
  const allowed = CV_ORIGINS.has(origin);
  res.set("Access-Control-Allow-Origin", allowed ? origin : "https://carlosandmunoz.com");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");
  res.set("Cache-Control", "no-store");
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }
  if (!allowed || req.method !== "POST") {
    res.status(allowed ? 405 : 403).json({ error: "This page cannot note a visit." });
    return;
  }
  const body = req.body || {};
  const query = /^[A-Za-z0-9=&%_.?+-]{0,120}$/.test(String(body.query || "")) ? String(body.query || "") : "";
  const record = {
    source: "cv",
    site: "cv",
    page: clip(body.page || "index.html", 80) || "index.html",
    query: query,
    lang: clip(body.lang || "en", 12) || "en",
    referrerHost: clip(body.referrerHost || "", 80),
    screen: body.screen === "phone" ? "phone" : "desktop",
    timezone: clip(body.timezone || "", 60),
    languages: clip(body.languages || "", 80),
    title: clip(body.title || "", 120),
    label: siteReport.linkFromQuery(query) || "cv",
    ip: clip(req.ip || "", 80),
    userAgent: clip(req.get("user-agent"), 300),
    acceptLanguage: clip(req.get("accept-language"), 120),
    country: clip(req.get("x-appengine-country") || "", 8),
    region: clip(decodePlace(req.get("x-appengine-region") || ""), 80),
    city: clip(decodePlace(req.get("x-appengine-city") || ""), 80)
  };
  const stamp = FieldValue.serverTimestamp();
  const batch = getFirestore().batch();
  batch.set(getFirestore().collection("visits").doc(), Object.assign({}, record, { createdAt: stamp }));
  batch.set(getFirestore().collection("site_events").doc(), {
    site: "cv",
    kind: "visit",
    name: "visit",
    label: record.label,
    lang: record.lang,
    referrerHost: record.referrerHost,
    query: query,
    screen: record.screen,
    page: record.page,
    title: record.title,
    timezone: record.timezone,
    languages: record.languages,
    ip: record.ip,
    userAgent: record.userAgent,
    acceptLanguage: record.acceptLanguage,
    country: record.country,
    region: record.region,
    city: record.city,
    createdAt: stamp
  });
  try {
    await batch.commit();
  } catch (error) {
    console.error("CV visit note failed:", error);
    res.status(500).json({ error: "The visit was not saved." });
    return;
  }
  res.status(204).send("");
});

const crypto = require("crypto");
const FORM_WINDOW_MS = 10 * 60 * 1000;
const FORM_BURST = 8;
const FORM_HOLD_MS = 30 * 60 * 1000;
const CHALLENGE_MS = 5 * 60 * 1000;
const CAPTCHA_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function hashAnswer(value) {
  return crypto.createHash("sha256").update(String(value || "").trim().toLowerCase()).digest("hex");
}

function randomCaptchaText() {
  let text = "";
  for (let i = 0; i < 5; i++) text += CAPTCHA_ALPHABET[crypto.randomInt(CAPTCHA_ALPHABET.length)];
  return text;
}

function captchaImage(text) {
  const glyphs = text.split("").map((ch, i) => {
    const x = 16 + i * 30;
    const y = 38 + (i % 2 === 0 ? -4 : 6);
    const rot = (i * 8) - 16;
    return `<text x="${x}" y="${y}" transform="rotate(${rot} ${x} ${y})" font-family="Georgia,serif" font-size="28" fill="#1a2832">${ch}</text>`;
  }).join("");
  const lines = [0, 1, 2, 3].map((n) => {
    const y = 10 + n * 12;
    return `<line x1="0" y1="${y}" x2="168" y2="${y + 6}" stroke="#8aa0ad" stroke-width="1"/>`;
  }).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="168" height="56" viewBox="0 0 168 56"><rect width="168" height="56" fill="#f4f7f8"/>${lines}${glyphs}</svg>`;
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}

async function formGate() {
  const snap = await getFirestore().doc("abuse/forms").get();
  if (!snap.exists) return { required: false };
  const data = snap.data() || {};
  const until = data.until && data.until.toMillis ? data.until.toMillis() : 0;
  return { required: data.captcha === true && until > Date.now() };
}

async function noteFormBurst() {
  const ref = getFirestore().doc("abuse/forms");
  await getFirestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const now = Date.now();
    const prev = snap.exists ? snap.data() : {};
    const start = prev.windowStart && prev.windowStart.toMillis ? prev.windowStart.toMillis() : 0;
    const until = prev.until && prev.until.toMillis ? prev.until.toMillis() : 0;
    const holding = prev.captcha === true && until > now;
    if (holding) {
      tx.set(ref, { count: (prev.count || 0) + 1 }, { merge: true });
      return;
    }
    if (!start || now - start > FORM_WINDOW_MS) {
      tx.set(ref, {
        windowStart: Timestamp.fromMillis(now),
        count: 1,
        captcha: false,
        until: null
      });
      return;
    }
    const count = (prev.count || 0) + 1;
    const captcha = count >= FORM_BURST;
    tx.set(ref, {
      windowStart: prev.windowStart,
      count,
      captcha,
      until: captcha ? Timestamp.fromMillis(now + FORM_HOLD_MS) : null
    });
  });
}

exports.getFormChallenge = functions.https.onCall(async () => {
  const gate = await formGate();
  if (!gate.required) return { required: false };
  const text = randomCaptchaText();
  const ref = getFirestore().collection("form_challenges").doc();
  await ref.set({
    answer: hashAnswer(text),
    expiresAt: Timestamp.fromMillis(Date.now() + CHALLENGE_MS)
  });
  return { required: true, id: ref.id, image: captchaImage(text) };
});

function cleanText(value, max) {
  return String(value == null ? "" : value).trim().slice(0, max);
}

exports.submitGuardedForm = functions.https.onCall(async (data) => {
  const gate = await formGate();
  if (!gate.required) {
    throw new functions.https.HttpsError("failed-precondition", "The form check is not active.");
  }
  const payload = data || {};
  const kind = payload.kind === "rating" ? "rating" : (payload.kind === "message" ? "message" : "");
  if (!kind) throw new functions.https.HttpsError("invalid-argument", "Unknown form.");
  const challengeId = String(payload.challengeId || "");
  const ref = challengeId ? getFirestore().collection("form_challenges").doc(challengeId) : null;
  const challenge = ref ? await ref.get() : null;
  const expires = challenge && challenge.exists && challenge.data().expiresAt && challenge.data().expiresAt.toMillis
    ? challenge.data().expiresAt.toMillis()
    : 0;
  const expected = challenge && challenge.exists ? String(challenge.data().answer || "") : "";
  const given = hashAnswer(payload.answer);
  let match = false;
  try {
    match = expected.length === given.length && crypto.timingSafeEqual(Buffer.from(given, "hex"), Buffer.from(expected, "hex"));
  } catch (error) {
    match = false;
  }
  if (challenge && challenge.exists) await ref.delete();
  if (!challenge || !challenge.exists || expires < Date.now() || !match) {
    throw new functions.https.HttpsError("invalid-argument", "The characters did not match.");
  }

  const email = cleanText(payload.email, 120).toLowerCase();
  if (!/^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$/.test(email)) {
    throw new functions.https.HttpsError("invalid-argument", "Check the email.");
  }
  const blocked = await getFirestore().doc("blocked_senders/" + email).get();
  if (blocked.exists) throw new functions.https.HttpsError("permission-denied", "Could not send.");
  const name = cleanText(payload.name, 120);
  if (name.length < 2) throw new functions.https.HttpsError("invalid-argument", "Check the name.");

  if (kind === "message") {
    const topic = cleanText(payload.topic, 40);
    const message = cleanText(payload.message, 8000);
    const fileURL = cleanText(payload.fileURL, 2048);
    if (!["opportunity", "inquiry", "feedback", "other"].includes(topic) || message.length < 10) {
      throw new functions.https.HttpsError("invalid-argument", "Check the message.");
    }
    if (fileURL && !/^https:\/\/.+/.test(fileURL)) {
      throw new functions.https.HttpsError("invalid-argument", "Check the attachment.");
    }
    await getFirestore().collection("messages").add({
      name,
      email,
      topic,
      message,
      fileURL,
      status: "inbox",
      createdAt: FieldValue.serverTimestamp()
    });
    return { ok: true };
  }

  const rating = Number(payload.rating);
  const comment = cleanText(payload.comment, 4000);
  if ([1, 2, 3, 4, 5].indexOf(rating) === -1) {
    throw new functions.https.HttpsError("invalid-argument", "Check the rating.");
  }
  await getFirestore().collection("ratings").add({
    name,
    email,
    rating,
    comment,
    status: "pending",
    isAnonymous: false,
    createdAt: FieldValue.serverTimestamp()
  });
  return { ok: true };
});

function bogotaParts(date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const read = (type) => Number(parts.find((part) => part.type === type).value);
  return { year: read("year"), month: read("month"), day: read("day") };
}

function bogotaStart(year, month, day) {
  return new Date(Date.UTC(year, month - 1, day, 5, 0, 0));
}

function shiftParts(parts, days) {
  const shifted = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() };
}

function dateStamp(parts) {
  return parts.year + "-" + String(parts.month).padStart(2, "0") + "-" + String(parts.day).padStart(2, "0");
}

function quarterWindow(now) {
  const endMs = now.getTime();
  const end = new Date(endMs - (endMs % (15 * 60 * 1000)));
  const start = new Date(end.getTime() - 15 * 60 * 1000);
  const clock = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Bogota",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).format(end);
  return { start: start, end: end, label: dateStamp(bogotaParts(end)) + " " + clock };
}

function previousQuarter(current) {
  return {
    start: new Date(current.start.getTime() - 15 * 60 * 1000),
    end: current.start,
    phrase: "previous 15 minutes"
  };
}

function reportWindow(period, now) {
  const today = bogotaParts(now);
  if (period === "daily") {
    const start = shiftParts(today, -1);
    return { start: bogotaStart(start.year, start.month, start.day), end: bogotaStart(today.year, today.month, today.day), label: dateStamp(start) };
  }
  if (period === "weekly") {
    const start = shiftParts(today, -7);
    return { start: bogotaStart(start.year, start.month, start.day), end: bogotaStart(today.year, today.month, today.day), label: dateStamp(start) };
  }
  const firstThis = { year: today.year, month: today.month, day: 1 };
  const firstPrev = today.month === 1
    ? { year: today.year - 1, month: 12, day: 1 }
    : { year: today.year, month: today.month - 1, day: 1 };
  return {
    start: bogotaStart(firstPrev.year, firstPrev.month, firstPrev.day),
    end: bogotaStart(firstThis.year, firstThis.month, firstThis.day),
    label: dateStamp(firstPrev).slice(0, 7)
  };
}

const ACTION_LABELS = {
  share_cv: "Share",
  open_simulator: "Open studio",
  open_qa_lab: "Open lab",
  open_contact_widget: "Contact",
  submit_message: "Message",
  submit_rating: "Rating",
  sim_run_sprint: "Sprint start",
  sim_sprint_complete: "Sprint finish",
  site_tour_start: "Tour",
  open_clip: "Clip",
  company_site: "Company site"
};

const EXPORT_LABELS = {
  export_cv: "CV file",
  print_cv: "Print",
  lab_report: "Lab report",
  studio_report: "Studio report"
};

function actionTitle(row) {
  const raw = String(row.name || "click").slice(0, 40);
  const title = ACTION_LABELS[raw] || raw;
  const detail = String(row.label || "").trim().slice(0, 40);
  if ((raw === "site_tour_start" || raw === "open_clip" || raw === "company_site") && detail && detail !== "start") {
    return title + " (" + detail + ")";
  }
  return title;
}

function bump(map, key) {
  const name = String(key || "").slice(0, 80);
  if (!name) return;
  map[name] = (map[name] || 0) + 1;
}

const PLAIN_VISIT_LABELS = { cv: true, studio: true, lab: true, popup: true, direct: true };

function linkCode(label) {
  const code = String(label || "").trim().toLowerCase();
  if (!code || code.length > 40 || PLAIN_VISIT_LABELS[code]) return "";
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(code)) return "";
  return code;
}

function eventDate(row) {
  const value = row && row.createdAt;
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  if (value instanceof Date) return value;
  if (value._seconds) return new Date(value._seconds * 1000);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function bogotaHour(date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Bogota",
    hour: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const hour = parts.find((part) => part.type === "hour");
  return hour ? Number(hour.value) % 24 : 0;
}

function tallyLine(map, limit) {
  const keys = Object.keys(map).sort((a, b) => map[b] - map[a] || a.localeCompare(b));
  if (!keys.length) return "None";
  return keys.slice(0, limit || 40).map((key) => key + " " + map[key]).join(", ");
}

function peakKey(map) {
  const keys = Object.keys(map);
  if (!keys.length) return "";
  keys.sort((a, b) => map[b] - map[a] || a.localeCompare(b));
  return keys[0];
}

function hourLine(hours) {
  const key = peakKey(hours);
  if (!key) return "None";
  const hour = Number(key);
  const next = String((hour + 1) % 24).padStart(2, "0");
  return key + ":00–" + next + ":00 (" + hours[key] + " opens)";
}

function dayLine(days) {
  const key = peakKey(days);
  if (!key) return "None";
  return key + " (" + days[key] + " opens)";
}

function screenLine(screens) {
  return "Phone " + screens.phone + ", desktop " + screens.desktop + ", unrecorded " + screens.unrecorded;
}

function linkLine(map) {
  const keys = Object.keys(map).sort((a, b) => map[b] - map[a] || a.localeCompare(b));
  if (!keys.length) return "";
  return keys.slice(0, 40).map((key) => key + " " + map[key]).join(", ");
}

function summarizeEvents(rows) {
  const sites = {
    cv: { opens: 0, clicks: 0, exports: 0, runs: 0 },
    studio: { opens: 0, clicks: 0, exports: 0, runs: 0 },
    lab: { opens: 0, clicks: 0, exports: 0, runs: 0 },
    review: { opens: 0, clicks: 0, exports: 0, runs: 0 }
  };
  const exportsBy = {};
  const actions = {};
  const langs = {};
  const referrers = {};
  const days = {};
  const hours = {};
  const screens = { phone: 0, desktop: 0, unrecorded: 0 };
  const linkOpens = {};
  const pages = {};
  const countries = {};
  const cities = {};
  const zones = {};
  let opens = 0;
  let clicks = 0;
  let exportsCount = 0;
  let runs = 0;
  rows.forEach((row) => {
    const bucket = sites[row.site] || sites.cv;
    bump(pages, row.page);
    bump(countries, row.country);
    bump(cities, row.city);
    bump(zones, row.timezone);
    if (row.kind === "visit") {
      opens += 1;
      bucket.opens += 1;
      const code = linkCode(row.label);
      if (code) bump(linkOpens, code);
      bump(langs, row.lang || "en");
      bump(referrers, siteReport.visitSource(row));
      const screen = row.screen === "phone" || row.screen === "desktop" ? row.screen : "unrecorded";
      screens[screen] += 1;
      const when = eventDate(row);
      if (when) {
        bump(days, dateStamp(bogotaParts(when)));
        bump(hours, String(bogotaHour(when)).padStart(2, "0"));
      }
    } else if (row.kind === "export") {
      exportsCount += 1;
      bucket.exports += 1;
      const raw = String(row.name || "export").slice(0, 40);
      const label = EXPORT_LABELS[raw] || raw;
      bump(exportsBy, row.label ? label + " (" + String(row.label).slice(0, 40) + ")" : label);
    } else if (row.kind === "run") {
      runs += 1;
      bucket.runs += 1;
    } else {
      clicks += 1;
      bucket.clicks += 1;
      bump(actions, actionTitle(row));
    }
  });
  return {
    opens: opens,
    clicks: clicks,
    exports: exportsCount,
    runs: runs,
    sites: sites,
    exportsBy: exportsBy,
    actions: actions,
    langs: langs,
    referrers: referrers,
    days: days,
    hours: hours,
    screens: screens,
    linkOpens: linkOpens,
    pages: pages,
    countries: countries,
    cities: cities,
    zones: zones,
    busiestDay: dayLine(days),
    busiestHour: hourLine(hours)
  };
}

function previousWindow(period, current) {
  const start = bogotaParts(current.start);
  if (period === "daily") {
    const prev = shiftParts(start, -1);
    return { start: bogotaStart(prev.year, prev.month, prev.day), end: current.start, phrase: "previous day" };
  }
  if (period === "weekly") {
    const prev = shiftParts(start, -7);
    return { start: bogotaStart(prev.year, prev.month, prev.day), end: current.start, phrase: "previous 7 days" };
  }
  const first = start.month === 1
    ? { year: start.year - 1, month: 12, day: 1 }
    : { year: start.year, month: start.month - 1, day: 1 };
  return { start: bogotaStart(first.year, first.month, first.day), end: current.start, phrase: "previous month" };
}

function compareLine(summary, previous, phrase) {
  return "opens " + summary.opens + " vs " + previous.opens
    + ", clicks " + summary.clicks + " vs " + previous.clicks
    + ", exports " + summary.exports + " vs " + previous.exports
    + ", lab runs " + summary.runs + " vs " + previous.runs
    + " (" + phrase + ")";
}

function isHubEvent(row) {
  return row.kind === "view" || /^(hub|post)_/.test(String(row.name || ""));
}

async function loadEvents(start, end) {
  const rows = [];
  let cursor = null;
  for (;;) {
    let query = getFirestore().collection("site_events")
      .where("createdAt", ">=", Timestamp.fromDate(start))
      .where("createdAt", "<", Timestamp.fromDate(end))
      .orderBy("createdAt", "asc")
      .limit(400);
    if (cursor) query = query.startAfter(cursor);
    const snap = await query.get();
    if (snap.empty) break;
    // Social hub views and clicks are counted by refreshSocialHubStats, not in the site reports.
    snap.forEach((doc) => {
      const row = doc.data() || {};
      if (!isHubEvent(row)) rows.push(row);
    });
    cursor = snap.docs[snap.docs.length - 1];
    if (snap.size < 400 || rows.length >= 20000) break;
  }
  return rows;
}

async function countCreated(name, start, end) {
  const snap = await getFirestore().collection(name)
    .where("createdAt", ">=", Timestamp.fromDate(start))
    .where("createdAt", "<", Timestamp.fromDate(end))
    .count()
    .get();
  return snap.data().count;
}

async function sendPeriodReport(period) {
  const window = period === "quarter" ? quarterWindow(new Date()) : reportWindow(period, new Date());
  const earlier = period === "quarter" ? previousQuarter(window) : previousWindow(period, window);
  const id = period === "quarter"
    ? "cv-15-" + window.label.replace(/[\s:]/g, "-")
    : period + "-" + window.label;
  const events = (await loadEvents(window.start, window.end)).filter((row) => row.site !== "review");
  const previousEvents = (await loadEvents(earlier.start, earlier.end)).filter((row) => row.site !== "review");
  let messageRows = [];
  let ratingRows = [];
  try {
    const startStamp = Timestamp.fromDate(window.start);
    const endStamp = Timestamp.fromDate(window.end);
    messageRows = await loadBound("messages", "createdAt", startStamp, endStamp);
    ratingRows = await loadBound("ratings", "createdAt", startStamp, endStamp);
  } catch (countError) {
    console.error(period + " inbox load skipped:", countError);
  }
  if (period === "quarter" && !events.length && !messageRows.length && !ratingRows.length) return null;
  const ref = getFirestore().collection("site_reports").doc(id);
  const claimed = await getFirestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() || {} : {};
    if (data.emailedAt) return false;
    tx.set(ref, { period: period, label: window.label, sending: true }, { merge: true });
    return true;
  });
  if (!claimed) return null;
  try {
    const summary = summarizeEvents(events);
    const previous = summarizeEvents(previousEvents);
    const messages = messageRows.length;
    const ratings = ratingRows.length;
    const siteLine = (name) => {
      const row = summary.sites[name];
      return row.opens + " opens, " + row.clicks + " clicks, " + row.exports + " exports, " + row.runs + " runs";
    };
    await ref.set({
      period: period,
      label: window.label,
      start: Timestamp.fromDate(window.start),
      end: Timestamp.fromDate(window.end),
      opens: summary.opens,
      clicks: summary.clicks,
      exports: summary.exports,
      runs: summary.runs,
      sites: summary.sites,
      exportsBy: summary.exportsBy,
      actions: summary.actions,
      langs: summary.langs,
      referrers: summary.referrers,
      days: summary.days,
      hours: summary.hours,
      screens: summary.screens,
      linkOpens: summary.linkOpens,
      pages: summary.pages,
      countries: summary.countries,
      cities: summary.cities,
      zones: summary.zones,
      busiestDay: summary.busiestDay,
      busiestHour: summary.busiestHour,
      previous: { opens: previous.opens, clicks: previous.clicks, exports: previous.exports, runs: previous.runs },
      messages: messages,
      ratings: ratings,
      createdAt: FieldValue.serverTimestamp()
    }, { merge: true });
    const title = period === "quarter" ? "15-minute" : period.charAt(0).toUpperCase() + period.slice(1);
    const rows = [
      { label: "Opens", value: String(summary.opens) },
      { label: "Link opens", value: linkLine(summary.linkOpens) },
      { label: "Clicks", value: String(summary.clicks) },
      { label: "Exports", value: String(summary.exports) },
      { label: "Lab runs", value: String(summary.runs) },
      { label: "Versus", value: compareLine(summary, previous, earlier.phrase) },
      { label: "CV", value: siteLine("cv") },
      { label: "Studio", value: siteLine("studio") },
      { label: "Lab", value: siteLine("lab") },
      { label: "Languages", value: tallyLine(summary.langs) },
      { label: "Referrers", value: tallyLine(summary.referrers) },
      { label: "Actions", value: tallyLine(summary.actions) },
      { label: "Export types", value: tallyLine(summary.exportsBy) },
      { label: "Screen", value: screenLine(summary.screens) },
      { label: "Pages", value: tallyLine(summary.pages) },
      { label: "Countries", value: tallyLine(summary.countries) },
      { label: "Cities", value: tallyLine(summary.cities) },
      { label: "Time zones", value: tallyLine(summary.zones) },
      { label: "Hours", value: tallyLine(summary.hours, 24) + " America/Bogota" },
      { label: "Days", value: tallyLine(summary.days, 31) },
      { label: "Busiest hour", value: summary.busiestHour + " America/Bogota" }
    ];
    if (period !== "daily") rows.push({ label: "Busiest day", value: summary.busiestDay });
    rows.push({ label: "Messages", value: String(messages) });
    rows.push({ label: "Ratings", value: String(ratings) });
    const sent = await sendOwnerEmail({
      subject: title + " CV site — " + window.label,
      intro: title + " CV site report for " + window.label,
      rows: rows,
      body: [siteReport.reportBody(events, actionTitle), siteReport.inboxBody(messageRows, ratingRows)].filter(Boolean).join("\n\n"),
      respondUrl: "https://carlosandmunoz.com/admin.html",
      buttonLabel: "Open statistics"
    });
    if (!sent) throw new Error("Site report email was not sent.");
    await ref.set({ emailedAt: FieldValue.serverTimestamp(), sending: false }, { merge: true });
  } catch (error) {
    await ref.set({ sending: false }, { merge: true });
    console.error(period + " site report failed:", error);
    throw error;
  }
  return null;
}

exports.emailDailySiteReport = scheduled(withMail, "emailDailySiteReport", async () => (await mailOn("siteDaily")) ? sendPeriodReport("daily") : "mail off in Jarvis settings");
exports.emailWeeklySiteReport = scheduled(withMail, "emailWeeklySiteReport", () => sendPeriodReport("weekly"));
exports.emailMonthlySiteReport = scheduled(withMail, "emailMonthlySiteReport", () => sendPeriodReport("monthly"));
exports.emailQuarterSiteReport = scheduled(withMail, "emailQuarterSiteReport", async () => (await mailOn("siteQuarter")) ? sendPeriodReport("quarter") : "mail off in Jarvis settings");

const reviewMail = require("./url-review-mail");

async function loadBound(name, field, startVal, endVal) {
  const rows = [];
  let cursor = null;
  for (;;) {
    let query = getFirestore().collection(name)
      .where(field, ">=", startVal)
      .where(field, "<", endVal)
      .orderBy(field, "asc")
      .limit(400);
    if (cursor) query = query.startAfter(cursor);
    const snap = await query.get();
    if (snap.empty) break;
    snap.forEach((doc) => rows.push(Object.assign({ id: doc.id }, doc.data() || {})));
    cursor = snap.docs[snap.docs.length - 1];
    if (snap.size < 400 || rows.length >= 5000) break;
  }
  return rows;
}

function loadSummaries(name, fields, start, end) {
  return getFirestore().collection(name)
    .where("at", ">=", start.toISOString())
    .where("at", "<", end.toISOString())
    .select(...fields)
    .limit(2000)
    .get()
    .then((snap) => snap.docs.map((doc) => Object.assign({ id: doc.id }, doc.data())));
}

// What went out after the reviews in a period. Single-field ranges only, so no composite index is needed.
async function loadFollowUp(start, end) {
  const db = getFirestore();
  const within = (name, field, fields) => db.collection(name).where(field, ">=", start).where(field, "<", end).select(...fields).limit(5000).get()
    .then((snap) => snap.docs.map((doc) => doc.data()));
  const [notes, notices, unlisted, replies, redemptions] = await Promise.all([
    within("url_review_notes", "createdAt", ["status"]),
    within("url_review_owner_notice_log", "sentAt", ["domain"]),
    within("url_review_unlisted", "at", ["via"]),
    within("url_review_owner_replies", "at", ["kind"]),
    within("url_review_redemptions", "at", ["test"])
  ]);
  return {
    notes: notes.filter((row) => row.status === "follow-note").length,
    stops: notes.filter((row) => row.status === "follow-stop").length,
    notices: notices.length,
    unlisted: unlisted.length,
    replies: replies.length,
    redemptions: redemptions.filter((row) => !row.test).length
  };
}

// A failure bug seen closed on GitHub is marked once, so only the open ones are asked about again.
async function loadFailureBugs() {
  const snap = await getFirestore().collection("url_review_failure_bugs").get();
  const token = await githubApp.token();
  return Promise.all(snap.docs.map(async (doc) => {
    const bug = Object.assign({ key: doc.id }, doc.data());
    if (!bug.issue || bug.closedAt) return bug;
    try {
      const res = await fetch("https://api.github.com/repos/" + BUG_REPO + "/issues/" + bug.issue, {
        headers: Object.assign({ Accept: "application/vnd.github+json", "User-Agent": "qa-lab-url-review", "X-GitHub-Api-Version": "2022-11-28" }, token ? { Authorization: "Bearer " + token } : {})
      });
      const issue = res.ok ? await res.json() : null;
      if (issue && issue.state === "closed") {
        bug.closedAt = issue.closed_at || new Date().toISOString();
        await doc.ref.update({ closedAt: bug.closedAt });
      }
    } catch (error) {
      console.error("Failure bug #" + bug.issue + " state was not read:", error);
    }
    return bug;
  }));
}

// Country-sweep and rival-sweep reviews are counted in the ops digest, not as reviews people asked for.
function askedFor(rows) {
  return rows.filter((row) => row.source !== "sweep" && row.source !== "rivals");
}

async function sendReviewPeriodReport(period) {
  const window = period === "quarter" ? quarterWindow(new Date()) : reportWindow(period, new Date());
  const earlier = period === "quarter" ? previousQuarter(window) : previousWindow(period, window);
  const id = "review-" + period + "-" + window.label.replace(/[\s:]/g, "-");
  const startStamp = Timestamp.fromDate(window.start);
  const endStamp = Timestamp.fromDate(window.end);
  const [opens, allReviews, captures, alerts, pageEvents, failed, priorFailed, reruns] = await Promise.all([
    loadBound("url_review_opens", "createdAt", startStamp, endStamp),
    loadBound("url_reviews", "createdAt", window.start.toISOString(), window.end.toISOString()),
    loadBound("url_review_captures", "at", window.start.toISOString(), window.end.toISOString()),
    loadBound("url_review_alerts", "at", window.start.toISOString(), window.end.toISOString()),
    loadEvents(window.start, window.end).then((rows) => rows.filter((row) => row.site === "review")),
    loadSummaries("url_review_failures", reviewFailures.SUMMARY_FIELDS, window.start, window.end),
    loadSummaries("url_review_failures", ["kind", "cause"], earlier.start, window.start),
    loadSummaries("url_review_reruns", reviewFailures.RERUN_FIELDS, window.start, window.end)
  ]);
  const reviews = askedFor(allReviews);
  if (period === "quarter" && !opens.length && !reviews.length && !captures.length && !alerts.length && !pageEvents.length) return null;
  const ref = getFirestore().collection("url_review_reports").doc(id);
  const claimed = await getFirestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() || {} : {};
    if (data.emailedAt) return false;
    tx.set(ref, { period: period, label: window.label, sending: true }, { merge: true });
    return true;
  });
  if (!claimed) return null;
  try {
    const summary = reviewMail.summarizePeriod(opens, reviews, captures, alerts);
    const [priorOpens, priorReviews] = await Promise.all([
      loadBound("url_review_opens", "createdAt", Timestamp.fromDate(earlier.start), startStamp),
      loadBound("url_reviews", "createdAt", earlier.start.toISOString(), window.start.toISOString()).then(askedFor)
    ]);
    const previous = reviewMail.summarizePeriod(priorOpens, priorReviews, [], []);
    const followUp = period === "quarter" ? null : await loadFollowUp(window.start.toISOString(), window.end.toISOString());
    const quiet = period === "quarter" && !failed.length && !reruns.length;
    const failures = reviewFailures.periodFailures({
      failures: failed,
      previous: priorFailed,
      reruns,
      bugs: quiet ? [] : await loadFailureBugs(),
      phrase: earlier.phrase,
      deskUrl: REVIEW_FN_URL + "/desk/failures"
    });
    await ref.set({
      period: period,
      label: window.label,
      start: startStamp,
      end: endStamp,
      opens: summary.opens,
      reviews: summary.reviews,
      captures: summary.captures,
      alerts: summary.alerts,
      paidUsd: summary.paidUsd,
      paidCount: summary.paidCount,
      paidKinds: summary.paidKinds,
      paidRuns: summary.paidRuns,
      visitors: summary.visitors,
      claims: summary.claims,
      turnedAway: summary.turnedAway,
      averageScore: summary.averageScore,
      mailed: summary.mailed,
      followUp: followUp,
      sweep: allReviews.length - reviews.length,
      pages: summary.pages,
      countries: summary.countries,
      cities: summary.cities,
      langs: summary.langs,
      referrers: summary.referrers,
      screens: summary.screens,
      zones: summary.zones,
      hours: summary.hours,
      statuses: summary.statuses,
      hosts: summary.hosts,
      frameworks: summary.frameworks,
      reasons: summary.reasons,
      captureKinds: summary.captureKinds,
      previous: { opens: previous.opens, reviews: previous.reviews, paidUsd: previous.paidUsd },
      failures: { failed: failures.failed, stopped: failures.stopped, previous: failures.previous, cleared: failures.cleared, causes: failures.causes, hosts: failures.hosts, reruns: failures.reruns, openBugs: failures.openBugs },
      createdAt: FieldValue.serverTimestamp()
    }, { merge: true });
    const title = period === "quarter" ? "15-minute" : period.charAt(0).toUpperCase() + period.slice(1);
    const pageBody = pageEvents.length ? siteReport.reportBody(pageEvents, actionTitle) : "";
    const sent = await sendOwnerEmail({
      eyebrow: "QA-lab URL Review",
      subject: reviewMail.reportSubject(title, window.label, summary, failures.failed),
      intro: title + " QA-lab URL Review report for " + window.label,
      rows: reviewMail.reportRows(summary, previous, earlier.phrase, {
        failures: quiet ? [] : failures.rows,
        followUp,
        sweep: period === "quarter" ? null : allReviews.length - reviews.length
      }),
      body: [summary.body, quiet ? "" : failures.body, pageBody].filter(Boolean).join("\n\n")
    });
    if (!sent) throw new Error("URL review report email was not sent.");
    await ref.set({ emailedAt: FieldValue.serverTimestamp(), sending: false }, { merge: true });
  } catch (error) {
    await ref.set({ sending: false }, { merge: true });
    console.error(period + " URL review report failed:", error);
    throw error;
  }
  return null;
}

exports.emailDailyReviewReport = scheduled(withMailAndGithub, "emailDailyReviewReport", async () => (await mailOn("reviewDaily")) ? sendReviewPeriodReport("daily") : "mail off in Jarvis settings");
exports.emailWeeklyReviewReport = scheduled(withMailAndGithub, "emailWeeklyReviewReport", () => sendReviewPeriodReport("weekly"));
exports.emailMonthlyReviewReport = scheduled(withMailAndGithub, "emailMonthlyReviewReport", () => sendReviewPeriodReport("monthly"));
exports.emailQuarterReviewReport = scheduled(withMailAndGithub, "emailQuarterReviewReport", async () => (await mailOn("reviewQuarter")) ? sendReviewPeriodReport("quarter") : "mail off in Jarvis settings");

async function probeFailure(url) {
  let host = "";
  try { host = new URL(url).hostname; } catch (error) { host = ""; }
  const probe = { at: new Date().toISOString() };
  probe.dns = await require("dns").promises.lookup(host, { all: true, verbatim: true })
    .then((rows) => ({ addresses: rows.slice(0, 6).map((row) => row.address) }), (error) => ({ error: String(error.code || error.message || "lookup failed").slice(0, 60) }));
  if (probe.dns.error) return probe;
  probe.plain = await urlReview.probeRead(url);
  const plain = probe.plain;
  const target = plain.url || reviewFailures.unreadUrl(plain, url);
  if (reviewFailures.probeNeedsTcp(plain)) probe.tcp = await urlReview.tcpCheck(target, 6000);
  if (!reviewFailures.probeNeedsBrowser(plain, probe.tcp)) return probe;
  const started = Date.now();
  const browsed = await browseForReview({ url: target, paths: [], html: true, probe: true }, null)
    .catch((error) => ({ ok: false, error: String((error && error.message) || "").slice(0, 120) }));
  const view = browsed && browsed.ok && browsed.start ? browsed.start : null;
  probe.browser = view ? {
    ok: true,
    untagged: !!browsed.untagged,
    status: view.status || 0,
    docStatus: view.docStatus || 0,
    finalUrl: String(view.finalUrl || "").slice(0, 300),
    challenge: view.html ? urlReview.challengeOf(view.finalUrl || target, view.headers || {}, view.html) : "",
    words: view.renderedWords || 0,
    ms: Date.now() - started
  } : { ok: false, error: browsed ? browsed.error || "no answer" : "no browser key", ms: Date.now() - started };
  return probe;
}

async function diagnoseReviewFailures() {
  const db = getFirestore();
  const col = db.collection("url_review_failures");
  const since = new Date(Date.now() - 3 * 86400000).toISOString();
  const [alertSnap, savedSnap] = await Promise.all([
    db.collection("url_review_alerts").where("at", ">=", since).get(),
    col.where("at", ">=", new Date(Date.now() - reviewFailures.RECHECK_DAYS * 86400000).toISOString()).get()
  ]);
  const runIds = new Set(savedSnap.docs.map((doc) => doc.get("runId")).filter(Boolean));
  const urls = new Set(savedSnap.docs.map((doc) => doc.get("url")));
  const missing = alertSnap.docs.map((doc) => Object.assign({ id: doc.id }, doc.data()))
    .filter((row) => row.kind === "failed" && (row.runId ? !runIds.has(row.runId) : !urls.has(row.url)));
  await Promise.all(missing.map((row) => col.doc(row.runId || "alert-" + row.id).set(reviewFailures.failureFromAlert(row))));
  const now = Date.now();
  const recheck = savedSnap.docs.filter((doc) => reviewFailures.recheckDue(doc.data(), now));
  const pending = (await col.where("diagnosedAt", "==", null).limit(40).get()).docs.concat(recheck).slice(0, 40);
  const byUrl = new Map();
  pending.forEach((doc) => byUrl.set(doc.get("url"), (byUrl.get(doc.get("url")) || []).concat(doc)));
  const queue = Array.from(byUrl.entries());
  const worker = async () => {
    for (let next = queue.shift(); next; next = queue.shift()) {
      const [url, docs] = next;
      const input = docs.every((doc) => (doc.get("cause") || {}).id === "input");
      let probe = null;
      try {
        probe = input ? null : JSON.parse(JSON.stringify(await probeFailure(url)));
      } catch (error) {
        console.error("Failure probe failed for " + url + ":", error);
        continue;
      }
      await Promise.all(docs.map((doc) => doc.ref.update({
        diagnosis: input
          ? { cause: "input", causeLabel: doc.get("cause").label, now: "input", nowLabel: "The address itself is refused, not the site", cleared: false, rerun: false, summary: doc.get("cause").label + "." }
          : reviewFailures.diagnose(doc.data(), probe),
        probe,
        diagnosedAt: new Date().toISOString(),
        checks: FieldValue.increment(1)
      })));
    }
  };
  await Promise.all([worker(), worker()]);
  console.log("URL review failures: " + missing.length + " taken from alerts, " + pending.length + " diagnosed (" + recheck.length + " checked again) across " + byUrl.size + " addresses.");
  return null;
}

exports.diagnoseReviewFailures = scheduled(functions.runWith({ timeoutSeconds: 540, memory: "512MB", secrets: SECRETS.diagnoseReviewFailures }), "diagnoseReviewFailures", () => diagnoseReviewFailures());

async function rerunFailure(group) {
  const db = getFirestore();
  const ref = db.collection("url_review_reruns").doc();
  const startedAt = Date.now();
  const lines = [];
  const log = (text) => { if (lines.length < 5000) lines.push({ t: Date.now() - startedAt, text }); };
  const options = group.options || {};
  let record = null;
  let error = null;
  try {
    log("Re-run of a failed review of " + group.url + ". " + group.trigger.label);
    if (group.source === "sweep") {
      record = (await sweepReview(group.sweep, { log, stopped: () => Date.now() - startedAt > 240000 })).record;
    } else {
      const report = await urlReview.reviewTarget(group.url, {
        log,
        stopped: () => Date.now() - startedAt > 240000,
        maxPages: options.pages || undefined,
        maxDepth: options.depth || undefined,
        pageLang: options.pageLang || "",
        section: options.section === true,
        passive: !!(group.intake && group.intake.reasonCode === "compare"),
        browse: browseForReview,
        pagespeed: process.env.PAGESPEED_KEY ? (url) => urlReview.pageSpeed(url, process.env.PAGESPEED_KEY) : undefined,
        crux: process.env.CRUX_KEY || process.env.PAGESPEED_KEY ? (url) => urlReview.cruxHistory(url, process.env.CRUX_KEY || process.env.PAGESPEED_KEY) : undefined,
        webrisk: process.env.WEBRISK_KEY ? (url) => urlReview.webRisk(url, process.env.WEBRISK_KEY) : undefined
      });
      record = urlReview.intakeRecord(Object.assign({}, group.intake, {
        url: group.url,
        name: group.name,
        email: group.email,
        frameworks: options.frameworks || [],
        pages: options.pages,
        depth: options.depth,
        pageLang: options.pageLang || "",
        section: options.section === true
      }), report, { deviceId: (group.intake || {}).deviceId });
    }
  } catch (caught) {
    error = caught;
  }
  const doc = reviewFailures.rerunDoc(group, { record, error, lines, startedAt, endedAt: Date.now() });
  await ref.set(doc);
  const mark = reviewFailures.rerunMark(ref.id, doc);
  await Promise.all(group.failureIds.map((id) => db.collection("url_review_failures").doc(id).update({ rerun: mark })));
  return doc;
}

async function rerunReviewFailures() {
  const db = getFirestore();
  const col = db.collection("url_review_failures");
  const since = new Date(Date.now() - reviewFailures.RERUN_DAYS * 86400000).toISOString();
  const rows = (await col.where("at", ">=", since).get()).docs.map((doc) => Object.assign({ id: doc.id }, doc.data()));
  const emails = Array.from(new Set(rows.filter((row) => row.email && reviewFailures.rerunTrigger(row)).map((row) => row.email)));
  const reviewed = [];
  for (const email of emails) {
    const snap = await db.collection("url_reviews").where("email", "==", email).select("email", "createdAt", "status", "report.host").limit(60).get();
    snap.docs.forEach((doc) => reviewed.push(doc.data()));
  }
  const plan = reviewFailures.rerunPlan(rows, reviewed, 8);
  const at = new Date().toISOString();
  await Promise.all(plan.skipped.flatMap((group) => group.failureIds.map((id) => col.doc(id).update({ rerun: { at, status: "skipped", reason: group.skip } }))));
  const started = Date.now();
  const done = [];
  for (const group of plan.runs) {
    if (Date.now() - started > 1500000) break;
    try {
      done.push(await rerunFailure(group));
    } catch (error) {
      console.error("Re-run of " + group.url + " was not saved:", error);
    }
  }
  console.log("URL review re-runs: " + done.length + " of " + plan.runs.length + " ran, " + plan.skipped.length + " skipped.");
  if (!done.length) return null;
  const mail = reviewFailures.rerunMail(done);
  await pushOwner(jarvisMailPush.rerunMessage(done, REVIEW_FN_URL + "/desk"));
  if (await mailOn("reruns")) await sendOwnerEmail({ to: REVIEW_ALERT_TO, subject: mail.subject, intro: mail.intro, rows: mail.rows, body: mail.body, respondUrl: REVIEW_FN_URL + "/desk", buttonLabel: "Open the review desk" });
  return null;
}

exports.rerunReviewFailures = require("firebase-functions/v2/scheduler").onSchedule({
  schedule: ops.cron("rerunReviewFailures"),
  timeZone: ops.TIME_ZONE,
  timeoutSeconds: 1800,
  memory: "1GiB",
  secrets: SECRETS.rerunReviewFailures
}, () => track("rerunReviewFailures", () => rerunReviewFailures()));

const BUG_REPO = "kaanmuar/kaanmuar.github.io";
const BUG_TICKET = 320;
const BOARD = { project: "PVT_kwDOFLbZIM4BokiS", status: "PVTSSF_lADOFLbZIM4BokiSzhnEBTE", backlog: "3f4ac4fe" };

async function github(path, body, token) {
  const res = await fetch("https://api.github.com" + path, Object.assign({
    method: body === undefined ? "GET" : "POST",
    headers: { Authorization: "Bearer " + token, Accept: "application/vnd.github+json", "Content-Type": "application/json", "User-Agent": "qa-lab-url-review", "X-GitHub-Api-Version": "2022-11-28" }
  }, body === undefined ? {} : { body: JSON.stringify(body) }));
  const data = await res.json().catch(() => ({}));
  if (!res.ok || (data.errors && data.errors.length)) throw new Error("GitHub " + path + " answered " + res.status + ": " + JSON.stringify(data.errors || data.message || "").slice(0, 300));
  return data;
}

async function openFailureBug(bug, token) {
  const issue = await github("/repos/" + BUG_REPO + "/issues", { title: bug.title, body: bug.body, labels: ["bug", "area:be"] }, token);
  const boardToken = await githubApp.token("board");
  const board = github("/graphql", { query: "mutation($p:ID!,$c:ID!){addProjectV2ItemById(input:{projectId:$p,contentId:$c}){item{id}}}", variables: { p: BOARD.project, c: issue.node_id } }, boardToken)
    .then((added) => github("/graphql", {
      query: "mutation($p:ID!,$i:ID!,$f:ID!,$o:String!){updateProjectV2ItemFieldValue(input:{projectId:$p,itemId:$i,fieldId:$f,value:{singleSelectOptionId:$o}}){projectV2Item{id}}}",
      variables: { p: BOARD.project, i: added.data.addProjectV2ItemById.item.id, f: BOARD.status, o: BOARD.backlog }
    }, boardToken));
  const parent = github("/repos/" + BUG_REPO + "/issues/" + BUG_TICKET + "/sub_issues", { sub_issue_id: issue.id }, token);
  (await Promise.allSettled([board, parent])).filter((step) => step.status === "rejected")
    .forEach((step) => console.error("Failure bug #" + issue.number + " was opened, but not filed on the board or under #" + BUG_TICKET + ":", step.reason));
  return issue;
}

async function fileReviewFailureBugs() {
  const token = await githubApp.token();
  if (!token) {
    console.log("URL review failure bugs: no GitHub token is set, so no bug was opened.");
    return null;
  }
  const db = getFirestore();
  const since = new Date(Date.now() - reviewFailures.RERUN_DAYS * 86400000).toISOString();
  const read = (name) => db.collection(name).where("at", ">=", since).get().then((snap) => snap.docs.map((doc) => Object.assign({ id: doc.id }, doc.data())));
  const filed = db.collection("url_review_failure_bugs");
  const [failed, reruns, known] = await Promise.all([read("url_review_failures"), read("url_review_reruns"), filed.get()]);
  const rows = known.docs.map((doc) => Object.assign({ key: doc.id }, doc.data()));
  const bugs = reviewFailures.bugPlan(failed, reruns, rows.map((row) => row.key));
  const opened = [];
  for (const bug of bugs) {
    const ref = filed.doc(bug.key);
    try {
      await ref.create({ cause: bug.cause, fix: bug.fix, title: bug.title, runs: bug.runs, hosts: bug.hosts.slice(0, 40), ids: bug.ids, firstAt: bug.firstAt, lastAt: bug.lastAt, openedAt: new Date().toISOString(), issue: null });
    } catch (error) {
      if (error.code !== 6) console.error("Failure bug for " + bug.key + " could not be claimed:", error);
      continue;
    }
    try {
      const issue = await openFailureBug(bug, token);
      await ref.update({ issue: issue.number, url: issue.html_url });
      opened.push("#" + issue.number + " " + bug.key);
    } catch (error) {
      console.error("Failure bug for " + bug.key + " was not opened:", error);
      await ref.delete();
    }
  }
  const commented = [];
  for (const note of reviewFailures.bugFollowUps(failed, reruns, rows)) {
    const ref = filed.doc(note.key);
    const bug = rows.find((row) => row.key === note.key) || {};
    try {
      const issue = await github("/repos/" + BUG_REPO + "/issues/" + note.issue, undefined, token);
      if (issue.state === "closed") {
        await ref.update({ closedAt: issue.closed_at || new Date().toISOString() });
        continue;
      }
      await github("/repos/" + BUG_REPO + "/issues/" + note.issue + "/comments", { body: note.body }, token);
      await ref.update({
        runs: FieldValue.increment(note.runs),
        hosts: Array.from(new Set((bug.hosts || []).concat(note.hosts))).slice(0, 40),
        ids: FieldValue.arrayUnion(...note.ids),
        lastAt: note.lastAt,
        commentedAt: new Date().toISOString()
      });
      commented.push("#" + note.issue + " +" + note.runs);
    } catch (error) {
      console.error("Failure bug #" + note.issue + " was not updated with " + note.runs + " new runs:", error);
    }
  }
  console.log("URL review failure bugs: " + opened.length + " of " + bugs.length + " new cause classes opened" + (opened.length ? " (" + opened.join(", ") + ")" : "") + ", " + commented.length + " open bugs updated" + (commented.length ? " (" + commented.join(", ") + ")" : "") + ".");
  return null;
}

exports.fileReviewFailureBugs = scheduled(functions.runWith({ timeoutSeconds: 120, memory: "512MB", secrets: SECRETS.fileReviewFailureBugs }), "fileReviewFailureBugs", () => fileReviewFailureBugs());

// GitHub starts scheduled runs hours late or skips them, so Cloud Scheduler starts the Live Reports batch:
// when today's batch (auto-YYYY-MM-DD, dated in UTC) is neither on main nor underway, it dispatches the
// workflow. The workflow's own schedule slots are the backups.
const LIVE_REPORTS_WORKFLOW = "auto-live-reports.yml";

async function githubGet(path, token) {
  const res = await fetch("https://api.github.com" + path, {
    headers: { Authorization: "Bearer " + token, Accept: "application/vnd.github+json", "User-Agent": "qa-lab-url-review", "X-GitHub-Api-Version": "2022-11-28" }
  });
  if (!res.ok) throw new Error("GitHub " + path + " answered " + res.status);
  return res.json();
}

async function ensureLiveReportsBatch() {
  const token = await githubApp.token();
  if (!token) {
    console.log("Live Reports watchdog: no GitHub token is set, so the batch was not checked.");
    return null;
  }
  const today = new Date().toISOString().slice(0, 10);
  const repo = "/repos/" + BUG_REPO;
  const commits = await githubGet(repo + "/commits?sha=main&per_page=100&since=" + today + "T00:00:00Z", token);
  if (commits.some((c) => c.commit.message.includes("(auto-" + today + ")"))) {
    console.log("Live Reports watchdog: batch auto-" + today + " is on main.");
    return null;
  }
  const runs = await githubGet(repo + "/actions/workflows/" + LIVE_REPORTS_WORKFLOW + "/runs?per_page=20&created=%3E%3D" + today, token);
  const underway = runs.workflow_runs.filter((run) => run.status !== "completed");
  if (underway.length) {
    console.log("Live Reports watchdog: batch auto-" + today + " is not on main yet, but run " + underway[0].html_url + " is " + underway[0].status + ".");
    return null;
  }
  await github(repo + "/actions/workflows/" + LIVE_REPORTS_WORKFLOW + "/dispatches", { ref: "main", inputs: { backup: "true" } }, token);
  const finished = runs.workflow_runs.map((run) => run.event + " " + run.conclusion).join(", ") || "none";
  console.log("Live Reports watchdog: dispatched batch auto-" + today + " (today's earlier runs: " + finished + ").");
  return null;
}

exports.ensureLiveReportsBatch = scheduled(withMailAndGithub, "ensureLiveReportsBatch", () => ensureLiveReportsBatch());

// The same for the Facebook queue: Cloud Scheduler starts it unless today's run (UTC) succeeded or is underway.
const FACEBOOK_WORKFLOW = "facebook-page.yml";

async function dispatchFacebookQueue() {
  const token = await githubApp.token();
  if (!token) {
    console.log("Facebook queue: no GitHub token is set, so the workflow was not started.");
    return null;
  }
  const today = new Date().toISOString().slice(0, 10);
  const path = "/repos/" + BUG_REPO + "/actions/workflows/" + FACEBOOK_WORKFLOW;
  const runs = (await githubGet(path + "/runs?per_page=20&created=%3E%3D" + today, token)).workflow_runs || [];
  const ran = runs.find((run) => run.status !== "completed" || run.conclusion === "success");
  if (ran) {
    console.log("Facebook queue: run " + ran.html_url + " is " + (ran.conclusion || ran.status) + " today.");
    return null;
  }
  await github(path + "/dispatches", { ref: "main" }, token);
  console.log("Facebook queue: dispatched " + FACEBOOK_WORKFLOW + " (today's earlier runs: " + (runs.map((run) => run.event + " " + run.conclusion).join(", ") || "none") + ").");
  return null;
}

exports.dispatchFacebookQueue = scheduled(withMailAndGithub, "dispatchFacebookQueue", () => dispatchFacebookQueue());

exports.refreshSocialHubStats = scheduled(functions.runWith({ timeoutSeconds: 120, memory: "512MB" }), "refreshSocialHubStats", () =>
  require("./social-hub-stats").refresh(getFirestore()));

exports.exportFirestoreWeekly = scheduled(withMail, "exportFirestoreWeekly", async () => {
  const projectId = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || "carlosm-interactive-cv";
  const stamp = dateStamp(bogotaParts(new Date()));
  try {
    const firestore = require("@google-cloud/firestore");
    const client = new firestore.v1.FirestoreAdminClient();
    const [operation] = await client.exportDocuments({
      name: client.databasePath(projectId, "(default)"),
      outputUriPrefix: "gs://" + projectId + "-backups/firestore/" + stamp
    });
    console.log("Firestore export started:", operation && operation.name ? operation.name : stamp);
  } catch (error) {
    console.error("Firestore export failed:", error);
    await pushOwner(jarvisMailPush.backupMessage(stamp, error && error.message));
    try {
      await sendOwnerEmail({
        subject: "Firestore backup did not start",
        intro: "The weekly Firestore backup did not start",
        rows: [{ label: "Day", value: stamp }],
        body: clip(error && error.message ? error.message : "Export failed", 500)
      });
    } catch (mailError) {
      console.error("Backup failure email failed:", mailError);
    }
    throw error;
  }
  return null;
});

async function noteReviewOpen(req) {
  const record = reviewMail.openRecord(req.body || {}, {
    ip: req.ip || "",
    userAgent: req.get("user-agent"),
    acceptLanguage: req.get("accept-language"),
    country: req.get("x-appengine-country") || "",
    region: req.get("x-appengine-region") || "",
    city: req.get("x-appengine-city") || ""
  });
  if (!record) return;
  await getFirestore().collection("url_review_opens").add(Object.assign({}, record, {
    createdAt: FieldValue.serverTimestamp(),
    expireAt: keepUntil()
  }));
}

async function mailReviewedSites(ip, source) {
  const urls = reviewMail.reviewUrls(source);
  if (!urls.length) return;
  let record = null;
  const address = clip(ip, 80);
  if (address) {
    const snap = await getFirestore().collection("url_review_opens").where("ip", "==", address).limit(8).get();
    let newest = null;
    snap.docs.forEach((doc) => {
      const data = doc.data() || {};
      const when = data.createdAt && data.createdAt.toMillis ? data.createdAt.toMillis() : 0;
      if (!newest || when >= newest.when) newest = { when, data, ref: doc.ref };
    });
    if (newest) {
      record = newest.data;
      await newest.ref.set({ urls }, { merge: true });
    }
  }
  const merged = Object.assign({}, record || {}, {
    name: (source && source.name) || "",
    email: (source && source.email) || "",
    requestedUrl: source && source.requestedUrl,
    clientUrl: source && source.clientUrl,
    report: source && source.report,
    urls
  });
  if (await mailOn("reviewOpened")) await sendOwnerEmail({
    eyebrow: "QA-lab URL Review",
    subject: "QA-lab URL Review was opened",
    intro: "Someone opened the QA-lab URL Review",
    rows: reviewMail.openRows(merged, 0)
  });
}

// A comparison notice carries the scores, problems, and market presence. A mail failure still leaves the comparison saved.
async function mailComparison(notice) {
  if (!notice) return;
  await pushOwner(jarvisMailPush.comparisonMessage(notice));
  if (!(await mailOn("comparisons"))) return;
  try {
    await sendOwnerEmail({
      eyebrow: "QA-lab URL Review",
      subject: notice.subject,
      intro: notice.intro,
      rows: notice.rows,
      respondUrl: notice.respondUrl,
      buttonLabel: notice.buttonLabel || "Open the comparison"
    });
  } catch (error) {
    console.error("Comparison notice failed:", error);
  }
}

const urlReview = require("./url-review-core");
const newsWire = require("./news-wire");
const reviewDesk = require("./url-review-desk");
const reviewFailures = require("./url-review-failures");
const reviewPublish = require("./url-review-publish");
const REVIEW_ALERT_TO = "qa@carlosandmunoz.com";
const customerMail = require("./url-review-customer-mail");
const reviewOffers = require("./url-review-offers");
const reviewPass = require("./url-review-pass");
const reviewCompare = require("./url-review-compare");
const compareMail = require("./url-review-compare-mail");
const reviewMulti = require("./url-review-multi");
const reviewMarket = require("./url-review-market");
const ownerNotice = require("./url-review-owner-notice");
const ownerMail = require("./url-review-owner-mail");
const accountData = require("./url-review-account-data");
const ownerProofs = require("./url-review-owner-proof");

async function ownerProofRows(email) {
  if (!ownerProofs.emailOf(email)) return [];
  try {
    const snap = await getFirestore().collection(ownerProofs.COLLECTION).where("email", "==", ownerProofs.emailOf(email)).limit(50).get();
    return snap.docs.map((doc) => Object.assign({ id: doc.id }, doc.data()));
  } catch (error) {
    console.error("Owner proofs read failed:", error);
    return [];
  }
}

// Site verification is off until REVIEW_VERIFY_KEY is set: no token is issued or checked.
function siteTokenFor(email) {
  const key = process.env.REVIEW_VERIFY_KEY || "";
  return key ? (host) => ownerProofs.siteToken(key, email, host) : null;
}

async function rememberSiteProof(email, host, how) {
  const row = ownerProofs.siteRecord({ email, host, how });
  if (!row.email || !row.host) return null;
  await getFirestore().collection(ownerProofs.COLLECTION).doc(ownerProofs.docId("site", row.email, row.host)).set(row);
  return row;
}
const ownerContactSearch = require("./url-review-owner-contacts");
const REVIEW_FN_URL = process.env.REVIEW_FN_URL || "https://us-central1-carlosm-interactive-cv.cloudfunctions.net/reviewUrl";

async function stopLinkFor(email, lang) {
  const token = crypto.randomBytes(16).toString("hex");
  await getFirestore().collection("url_review_stop_links").doc(token).set({
    email: String(email || "").trim().toLowerCase(),
    lang: customerMail.langOf(lang),
    createdAt: new Date().toISOString(),
    expireAt: keepUntil()
  });
  return REVIEW_FN_URL + "/notes/stop?t=" + token;
}

async function sendAskerMail(email, mail, stopUrl, category, attachments, replyTo) {
  const from = prepareMail();
  if (!from) return false;
  await sgMail.send(Object.assign({
    to: email,
    from: from,
    replyTo: replyTo || REVIEW_ALERT_TO,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
    categories: [category],
    trackingSettings: { clickTracking: { enable: false, enableText: false }, openTracking: { enable: false } }
  }, stopUrl ? {
    headers: {
      "List-Unsubscribe": "<" + stopUrl + ">",
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click"
    }
  } : {}, attachments && attachments.length ? { attachments } : {}));
  return true;
}

// The browser function prints the HTML with no script and no network; the answer is the PDF in base64.
const PDF_INLINE_MAX = 7000000;
const PDF_STORED_MAX = 40000000;
const PDF_BUCKET = "carlosm-interactive-cv.firebasestorage.app";

// max: the longest base64 PDF accepted. A reply from this function is capped at 10 MB, so a larger PDF is
// stored and fetched by its link.
async function printHtml(html, max) {
  const key = process.env.BROWSER_KEY;
  if (!key) return null;
  try {
    const res = await fetch(BROWSER_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "x-review-key": key },
      body: JSON.stringify({ kind: "pdf", html }),
      signal: AbortSignal.timeout(60000)
    });
    const body = res.ok ? await res.json() : null;
    if (!body || !body.ok || !body.pdf || body.pdf.length > (max || PDF_INLINE_MAX)) return null;
    return body.pdf;
  } catch (error) {
    console.error("PDF print failed:", error && error.message);
    return null;
  }
}

// A PDF too large to send back, kept under comparison-pdfs/ (deleted after a day by the bucket's lifecycle rule)
// and fetched by its download-token link, which is unguessable and needs no signing.
async function storePdf(base64, filename) {
  const token = crypto.randomUUID();
  const file = getStorage().bucket(PDF_BUCKET).file("comparison-pdfs/" + token + ".pdf");
  await file.save(Buffer.from(base64, "base64"), {
    resumable: false,
    contentType: "application/pdf",
    metadata: {
      contentDisposition: 'attachment; filename="' + String(filename).replace(/[^\w.-]/g, "") + '"',
      cacheControl: "private, max-age=3600",
      metadata: { firebaseStorageDownloadTokens: token }
    }
  });
  return "https://firebasestorage.googleapis.com/v0/b/" + PDF_BUCKET + "/o/" + encodeURIComponent(file.name) + "?alt=media&token=" + token;
}

async function reportPdfFor(record) {
  if (!process.env.BROWSER_KEY) return null;
  let page = null;
  try {
    page = customerMail.reportPdf(record);
  } catch (error) {
    console.error("Report PDF failed:", error && error.message);
    return null;
  }
  const pdf = await printHtml(page.html);
  return pdf ? { content: pdf, filename: page.filename, type: "application/pdf", disposition: "attachment" } : null;
}

async function mailReportToAsker(record) {
  if (!record || !record.email || !record.report) return;
  if (record.status !== "complete" && record.status !== "stopped") return;
  const [stopUrl, pdf] = await Promise.all([stopLinkFor(record.email, record.lang), reportPdfFor(record)]);
  const mail = customerMail.reportMail(record, { stopUrl, attached: !!pdf });
  await sendReportMail(record.id, () => sendAskerMail(record.email, mail, stopUrl, "url-review-report", pdf ? [pdf] : []), !!pdf);
}

// The period report counts report mails from this mark, so a report that never reached the asker shows there.
async function sendReportMail(id, send, pdf) {
  const mark = { at: new Date().toISOString(), sent: false, pdf };
  try {
    mark.sent = (await send()) === true;
    if (!mark.sent) mark.error = "mail is not configured";
  } catch (error) {
    mark.error = String((error && error.message) || "mail failed").slice(0, 200);
    throw error;
  } finally {
    if (id) await getFirestore().collection("url_reviews").doc(id).set({ mail: mark }, { merge: true }).catch((error) => console.error("Report mail mark failed:", error));
  }
}

async function noteSharedOpen(ref, record) {
  const at = new Date().toISOString();
  const step = await getFirestore().runTransaction(async (tx) => {
    const next = reviewAuth.sharedOpenStep((await tx.get(ref)).data(), at);
    tx.set(ref, { sharedOpen: next.sharedOpen }, { merge: true });
    return next;
  });
  if (!step.notify) return;
  let sent = false;
  try {
    sent = await sendAskerMail(record.email, customerMail.sharedOpenMail(record, at), "", "url-review-shared-open");
  } finally {
    // The next open by another account tries the notice again.
    if (!sent) await ref.set({ sharedOpen: { noticeAt: "" } }, { merge: true });
  }
}

async function ownerStops(emails, domain) {
  const db = getFirestore();
  const keys = [].concat(emails || [], "@" + domain).filter((key) => key && key !== "@");
  const snaps = await Promise.all(keys.map((key) => db.collection("url_review_owner_stops").doc(key).get()));
  return new Set(keys.filter((key, i) => snaps[i].exists));
}

async function unlistedHosts() {
  const snap = await getFirestore().collection("url_review_unlisted").get();
  return snap.docs.map((doc) => doc.id);
}

function searchOwnerContacts(report, options) {
  const search = options && options.search === false ? async () => [] : urlReview.webSearch;
  return ownerContactSearch.discover(report, {
    fetchPage: (url) => urlReview.fetchExtra(url, () => false),
    analyze: urlReview.analyzeHtml,
    github: async (name) => {
      const res = await fetch("https://api.github.com/users/" + encodeURIComponent(name), { headers: { accept: "application/vnd.github+json", "user-agent": "qa-lab-url-review" }, signal: AbortSignal.timeout(6000) });
      return res.ok ? res.json() : null;
    },
    search,
    emailsInText: urlReview.emailsInText,
    registrable: urlReview.registrable
  });
}

// options.search === false skips the web search, so no Brave or Tavily credit is spent.
async function queueOwnerNotice(record, options) {
  const report = record && record.report;
  if (!report || !report.host) return;
  const domain = ownerNotice.domainOf(report.host);
  const ref = getFirestore().collection("url_review_owner_notices").doc(domain);
  const [unlisted, domainStop, last] = await Promise.all([unlistedHosts(), ownerStops([], domain), ref.get()]);
  if (ownerNotice.heldBack(record, { unlisted, stopped: domainStop, notice: last.exists ? last.data() : null })) return;
  let more = [];
  try { more = await searchOwnerContacts(report, options); } catch (error) { console.error("Owner contact search failed:", error && error.message); }
  const ranked = ownerNotice.rankContacts(((report.contacts && report.contacts.found) || []).concat(more), report.host);
  const stopped = await ownerStops(ranked.slice(0, 12).map((row) => row.email), domain);
  const usable = ownerNotice.usableContacts(record, ranked, stopped);
  if (usable.length) await ref.set(Object.assign(ownerNotice.noticeRow(record, usable), { expireAt: keepUntil() }));
}

// Send or Drop on a pending owner notice, from the desk or Jarvis. Returns { status } or { error }.
async function decideOwnerNotice(rawDomain, send, email, operator) {
  const domain = String(rawDomain || "").toLowerCase().replace(/[^a-z0-9.-]/g, "").slice(0, 120);
  const db = getFirestore();
  const ref = db.collection("url_review_owner_notices").doc(domain || "-");
  const decidedAt = new Date().toISOString();
  let notice = null;
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() : null;
    if (!data || data.status !== "pending") return;
    notice = data;
    tx.update(ref, send ? { status: "sending" } : { status: "dropped", decidedAt, by: operator });
  });
  if (!notice) return { error: "That notice is not waiting for a decision." };
  if (!send) return { status: "dropped" };
  let result;
  try {
    result = await sendOwnerNotice(notice, String(email || ""));
  } catch (error) {
    console.error("Owner notice failed:", error);
    result = { error: String((error && error.message) || "The notice failed.").slice(0, 200) };
  }
  if (result.error) {
    await ref.update({ status: "pending", lastError: result.error });
    return { error: result.error };
  }
  const sentTo = result.notice;
  await ref.update({ status: "sent", sentAt: decidedAt, decidedAt, by: operator, cardId: result.card.id, email: sentTo.email, source: sentTo.source, sourceUrl: sentTo.sourceUrl || "", lastError: "", expireAt: keepUntil() });
  await db.collection("url_review_owner_notice_log").add({
    domain: notice.domain,
    host: notice.host,
    email: sentTo.email,
    source: sentTo.source,
    sourceUrl: sentTo.sourceUrl || "",
    reviewId: notice.reviewId,
    cardId: result.card.id,
    sentAt: decidedAt,
    by: operator,
    expireAt: keepUntil()
  });
  return { status: "sent", email: sentTo.email };
}

async function liveReportIndex() {
  const res = await fetch(customerMail.SITE + "/assets/live-reports/index.json", { cache: "no-store", signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error("Live Reports index answered " + res.status);
  return res.json();
}

// Sends a pending notice once its card is public. Returns { error } or { card }.
async function sendOwnerNotice(queued, email) {
  const notice = ownerNotice.addressed(queued, email);
  if (!notice) return { error: "That address is not one of the contacts found for this site." };
  const [unlisted, stopped, index, reviewSnap] = await Promise.all([
    unlistedHosts(),
    ownerStops([notice.email], notice.domain),
    liveReportIndex(),
    getFirestore().collection("url_reviews").doc(notice.reviewId || "-").get()
  ]);
  const card = ownerNotice.liveCard(index, notice.host);
  const blocked = ownerNotice.sendBlock(notice, { stopped, unlisted, card });
  if (blocked) return { error: blocked };
  const review = reviewSnap.exists ? reviewSnap.data() : null;
  const score = review && review.report && review.report.insights ? review.report.insights.score : null;
  const token = crypto.randomBytes(16).toString("hex");
  await getFirestore().collection("url_review_owner_links").doc(token).set({
    domain: notice.domain,
    host: notice.host,
    email: notice.email,
    lang: notice.lang,
    reviewId: notice.reviewId,
    cardId: card.id,
    claims: 0,
    createdAt: new Date().toISOString(),
    expireAt: keepUntil()
  });
  const link = REVIEW_FN_URL + "/owner?t=" + token + "&do=";
  const links = {
    claim: link + "claim",
    unlist: link + "unlist",
    stop: link + "stop",
    live: customerMail.pageUrl(notice.lang, { live: card.id, utm_campaign: "owner-notice" })
  };
  const sent = await sendAskerMail(notice.email, ownerMail.noticeMail(notice, card, links, score), links.stop, "url-review-owner-notice", null, ownerReplyTo(token));
  return sent ? { card, notice } : { error: "SendGrid is not configured, so nothing was sent." };
}

// A pass reminder is about a purchase, not a follow-up note, so it goes out whether or not notes are live.
async function sendReviewNotes() {
  try {
    await sendPassRenewals();
  } catch (error) {
    console.error("Pass renewals failed:", error);
  }
  if (process.env.REVIEW_NOTES_LIVE !== "1") return null;
  const db = getFirestore();
  const now = Date.now();
  const since = new Date(now - 31 * 24 * 60 * 60 * 1000).toISOString();
  const [runSnap, passSnap, stopSnap, noteSnap] = await Promise.all([
    db.collection("url_reviews").where("createdAt", ">", since)
      .select("email", "status", "createdAt", "report.host", "name", "lang", "acceptLanguage", "country", "paid", "followUp").limit(2000).get(),
    db.collection("url_reviews").where("status", "==", "monthly-pass").select("email", "status", "paidUntil").limit(500).get(),
    db.collection("url_review_notes").where("status", "==", "follow-stop").select("email", "status").limit(5000).get(),
    db.collection("url_review_notes").where("createdAt", ">", since).select("email", "status", "createdAt").limit(5000).get()
  ]);
  const rows = (snap) => snap.docs.map((doc) => Object.assign({ id: doc.id }, doc.data()));
  const records = rows(runSnap).concat(rows(passSnap), rows(stopSnap), rows(noteSnap));
  const due = reviewOffers.queue(records, now).filter((note) => note.due).slice(0, 60);
  for (const note of due) {
    try {
      const stopUrl = await stopLinkFor(note.email, note.lang);
      const coupon = await mintReturnCoupon(note);
      const sent = await sendAskerMail(note.email, customerMail.noteMail(note, { stopUrl, coupon }), stopUrl, "url-review-note");
      if (sent) {
        await db.collection("url_review_notes").add({
          status: "follow-note",
          email: note.email,
          kind: note.kind,
          scene: note.scene,
          reportId: note.reportId || "",
          createdAt: new Date().toISOString(),
          expireAt: keepUntil()
        });
      }
    } catch (error) {
      console.error("Review note failed:", error);
    }
  }
  return null;
}

// Monday to Saturday at 10:00 Bogotá: Ley 2300 de 2023 keeps commercial contact off Sundays and outside daytime hours.
exports.sendReviewNotes = scheduled(withMail, "sendReviewNotes", () => sendReviewNotes());

// Claims one pending owner notice, sends it, and records the outcome. Shared by sendOwnerNotices and
// scripts/owner-notice-send-all.js. Returns { outcome, reason, email, source, sourceUrl, sentAt }.
async function sendQueuedNotice(ref, by) {
  const db = getFirestore();
  let notice = null;
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() : null;
    if (!data || data.status !== "pending") return;
    notice = data;
    tx.update(ref, { status: "sending" });
  });
  if (!notice) {
    const snap = await ref.get();
    return { outcome: "skipped", reason: snap.exists ? "already-" + snap.data().status : "no-contact" };
  }
  let result;
  try {
    result = await sendOwnerNotice(notice, notice.email);
  } catch (error) {
    result = { error: String((error && error.message) || "The notice failed.").slice(0, 200) };
  }
  if (result.error) {
    await ref.update({ status: "pending", lastError: result.error, tries: FieldValue.increment(1) });
    return { outcome: "failed", reason: result.error, email: notice.email };
  }
  const at = new Date().toISOString();
  const sent = result.notice;
  await ref.update({ status: "sent", sentAt: at, decidedAt: at, by, cardId: result.card.id, email: sent.email, source: sent.source, sourceUrl: sent.sourceUrl || "", lastError: "", expireAt: keepUntil() });
  await db.collection("url_review_owner_notice_log").add({
    domain: notice.domain, host: notice.host, email: sent.email, source: sent.source, sourceUrl: sent.sourceUrl || "",
    reviewId: notice.reviewId, cardId: result.card.id, sentAt: at, by, expireAt: keepUntil()
  });
  return { outcome: "sent", email: sent.email, source: sent.source, sourceUrl: sent.sourceUrl || "", sentAt: at };
}

// Sends (or drops) one held re-run: the desk's Send button and Jarvis's rerun-held action. Null when it is no longer held.
async function releaseHeldRerun(id, send, by) {
  const db = getFirestore();
  const ref = db.collection("url_review_reruns").doc(String(id || "-"));
  const decidedAt = new Date().toISOString();
  let doc = null;
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() : null;
    if (!data || data.status !== "held" || !data.record) return;
    doc = data;
    tx.update(ref, { status: send ? "sent" : "dropped", decidedAt, by });
  });
  if (!doc) return null;
  if (!send) return { status: "dropped" };
  const record = reviewFailures.sentRecord(doc, decidedAt);
  await db.collection("url_reviews").doc(record.id).set(record);
  await countReviewed(record.report);
  try {
    await queueOwnerNotice(record);
  } catch (error) {
    console.error("Owner notice queue failed:", error);
  }
  let mailed = true;
  try {
    await mailReportToAsker(record);
  } catch (error) {
    mailed = false;
    console.error("Re-run mail to the asker failed:", error);
    await ref.update({ mailError: String((error && error.message) || "mail failed").slice(0, 200) });
  }
  return { status: "sent", reportId: record.id, mailed };
}

const NOTICE_TRIES = 3;

// Monday to Saturday late morning: pending notices whose site is now on Live Reports, up to the daily cap.
async function sendOwnerNotices() {
  if (process.env.OWNER_NOTICES_LIVE !== "1") return "off: OWNER_NOTICES_LIVE is not 1";
  const cap = ops.budget("ownerNoticesPerDay", process.env);
  const [pending, index] = await Promise.all([
    getFirestore().collection("url_review_owner_notices").where("status", "==", "pending").limit(300).get(),
    liveReportIndex()
  ]);
  const ready = pending.docs.filter((doc) => (doc.data().tries || 0) < NOTICE_TRIES && ownerNotice.liveCard(index, doc.data().host));
  const tally = { sent: 0, failed: 0, skipped: 0 };
  for (const doc of ready) {
    if (tally.sent >= cap) break;
    const row = await sendQueuedNotice(doc.ref, "sendOwnerNotices");
    tally[row.outcome] = (tally[row.outcome] || 0) + 1;
    if (row.outcome === "failed") console.error("Owner notice to " + doc.id + " failed: " + row.reason);
    if (row.outcome === "sent") await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  return tally.sent + " sent, " + tally.failed + " failed, " + (pending.size - ready.length) + " waiting for a card";
}

exports.sendOwnerNotices = scheduled(functions.runWith({ timeoutSeconds: 300, memory: "512MB", secrets: SECRETS.mail }), "sendOwnerNotices", () => sendOwnerNotices());

const sweep = require("./url-review-sweep");

async function sweepJson(name) {
  const res = await fetch(customerMail.SITE + "/assets/sweep/" + name, { cache: "no-store", signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error("Sweep seeds " + name + " answered " + res.status);
  return res.json();
}

// Reviewed by anyone (or the sweep, which may have landed on another host) within REVISIT_DAYS.
async function reviewedLately(host) {
  const since = new Date(Date.now() - sweep.REVISIT_DAYS * 864e5).toISOString();
  const reviews = getFirestore().collection("url_reviews");
  const snaps = await Promise.all([
    reviews.where("report.host", "==", host).select("createdAt").limit(20).get(),
    reviews.where("sweep.host", "==", host).select("createdAt").limit(20).get()
  ]);
  return snaps.some((snap) => snap.docs.some((doc) => String(doc.get("createdAt") || "") > since));
}

// Up to sweep.PER_TICK sites a tick, one after another, at night, without web search. SWEEP_LIVE=1 turns it on.
async function sweepReviews() {
  if (process.env.SWEEP_LIVE !== "1") return "off: SWEEP_LIVE is not 1";
  const tickStarted = Date.now();
  const db = getFirestore();
  const ref = db.collection("url_review_sweep").doc("state");
  const day = new Date().toISOString().slice(0, 10);
  const cap = ops.budget("sweepPerDay", process.env);
  let state = (await ref.get()).data() || {};
  if (sweep.doneOn(state, day) >= cap) return "daily cap reached";
  const [index, unlisted, outreachDoc] = await Promise.all([sweepJson("index.json"), unlistedHosts(), db.collection("url_review_sweep").doc("outreach").get()]);
  const countries = Object.keys(index.countries || {}).filter((cc) => index.countries[cc] > 0);
  if (!countries.length) return "no seeds";
  const outreach = (outreachDoc.data() || {}).hosts || [];
  const seeds = new Map();
  const notes = [];
  for (let n = 0; n < sweep.PER_TICK; n += 1) {
    if (sweep.doneOn(state, day) >= cap) {
      notes.push("daily cap reached");
      break;
    }
    if (!sweep.roomForReview(Date.now() - tickStarted)) break;
    const tick = await sweepOne(state, day, countries, index, unlisted, seeds, outreach);
    state = tick.state;
    await ref.set(state);
    notes.push(tick.note);
    if (!tick.reviewed) break;
  }
  return notes.join("; ");
}

// The next outreach prospect, else the next site of the lap, reviewed and tallied.
// Returns the moved-on state, a note, and whether a review ran.
async function sweepOne(state, day, countries, index, unlisted, seeds, outreach) {
  let target = null;
  for (let tries = 0; tries < 8 && !target; tries += 1) {
    let candidate;
    const pick = sweep.nextOutreach(state, outreach, day);
    if (pick) {
      state = pick.state;
      candidate = pick.target;
    } else {
      const slot = sweep.nextSlot(state, countries);
      state = slot.state;
      if (!seeds.has(slot.cc)) seeds.set(slot.cc, (await sweepJson(slot.cc + ".json")).hosts || []);
      const hosts = seeds.get(slot.cc);
      if (!hosts.length) continue;
      candidate = { host: hosts[slot.at % hosts.length], cc: slot.cc, month: index.month || "", rank: (slot.at % hosts.length) + 1 };
    }
    const bare = reviewPublish.bare(candidate.host);
    if (!candidate.host || unlisted.some((u) => bare === u || bare.endsWith("." + u)) || await reviewedLately(candidate.host)) {
      state = sweep.tally(state, day, "skipped", Object.assign({}, candidate, { at: new Date().toISOString(), outcome: "skipped" }));
      continue;
    }
    target = candidate;
  }
  if (!target) return { state, note: "nothing to review", reviewed: false };
  const startedAt = Date.now();
  const lines = [];
  const log = (text) => { if (lines.length < 5000) lines.push({ t: Date.now() - startedAt, text }); };
  let outcome = "done";
  let note = "";
  let reason = "";
  try {
    const { record, report } = await sweepReview(target, { log, stopped: () => Date.now() - startedAt > sweep.REVIEW_MS });
    note = target.host + " (" + target.cc + ") " + record.status + ", " + ((report.limits && report.limits.pagesRead) || 0) + " pages";
  } catch (error) {
    outcome = "failed";
    reason = String((error && error.message) || error).slice(0, 160);
    note = target.host + " (" + target.cc + ") failed: " + reason;
    console.error("Sweep review of " + note);
    await saveSweepFailure(target, error, lines, startedAt);
  }
  state = sweep.tally(state, day, outcome, Object.assign({}, target, { at: new Date().toISOString(), outcome, note }, reason ? { reason } : {}));
  return { state, note, reviewed: true };
}

// One sweep review, saved like any other: its url_reviews row, the counts, and its queued owner notice.
// Also the path a re-run of a failed sweep review takes, so it has no asker to email.
async function sweepReview(target, controls) {
  const value = sweep.intake(target);
  const report = await urlReview.reviewTarget(value.url, Object.assign({
    mentions: false,
    browse: browseForReview,
    pagespeed: process.env.PAGESPEED_KEY ? (page) => urlReview.pageSpeed(page, process.env.PAGESPEED_KEY) : undefined,
    crux: process.env.CRUX_KEY || process.env.PAGESPEED_KEY ? (page) => urlReview.cruxHistory(page, process.env.CRUX_KEY || process.env.PAGESPEED_KEY) : undefined,
    webrisk: process.env.WEBRISK_KEY ? (page) => urlReview.webRisk(page, process.env.WEBRISK_KEY) : undefined
  }, controls));
  const record = Object.assign(urlReview.intakeRecord(value, report, { country: target.cc.toUpperCase() }), { source: "sweep", sweep: target });
  await getFirestore().collection("url_reviews").doc(record.id).set(record);
  await countReviewed(record.report);
  try {
    await queueOwnerNotice(record, { search: false });
  } catch (error) {
    console.error("Owner notice queue failed for " + target.host + ":", error);
  }
  return { record, report };
}

async function saveSweepFailure(target, error, lines, startedAt) {
  try {
    const col = getFirestore().collection("url_review_failures");
    const runId = "sweep-" + col.doc().id;
    const run = Object.assign({}, sweep.intake(target), { kind: "failed", runId, error, lines, startedAt, endedAt: Date.now(), source: "sweep", sweep: target });
    await col.doc(runId).set(reviewFailures.failureRecord(run));
  } catch (saveError) {
    console.error("Sweep failure log save failed for " + target.host + ":", saveError);
  }
}

exports.sweepReviews = require("firebase-functions/v2/scheduler").onSchedule({
  schedule: ops.cron("sweepReviews"),
  timeZone: ops.TIME_ZONE,
  timeoutSeconds: sweep.TICK_SECONDS,
  memory: "1GiB",
  maxInstances: 1,
  secrets: SECRETS.sweep
}, () => track("sweepReviews", () => sweepReviews()));

const rivals = require("./url-review-rivals");

// Reviews of a host (with or without www.) that could go public; the newest recent one, or null.
async function latestPublicReview(host, unlisted) {
  const reviews = getFirestore().collection("url_reviews");
  const name = rivals.bare(host);
  const snaps = await Promise.all([name, "www." + name].map((value) => reviews.where("report.host", "==", value).limit(20).get()));
  const records = [].concat(...snaps.map((snap) => snap.docs.map((doc) => Object.assign({ id: doc.id }, doc.data()))));
  return rivals.latestPublic(records, unlisted);
}

function findRivals(host, field, lang) {
  return rivals.findRivals(host, {
    search: (query) => urlReview.webSearch(query),
    ranker: (domains) => reviewMarket.trancoRanks(domains),
    registrable: urlReview.registrable
  }, field, lang);
}

// Looks up a report's natural competitors once per kind of competition and stores them on the record:
// the site's own field in report.rivals, a picked field or topic in report.rivalsBy.<key>.
async function rivalsOf(ref, data, field) {
  const stored = rivals.storedFor(data.report, field);
  if (stored) return stored;
  const found = await findRivals(data.report.host, field, data.report.observed && data.report.observed.lang);
  const value = { at: new Date().toISOString(), ownRank: found.ownRank, list: found.list };
  if (field) await ref.update({ ["report.rivalsBy." + field.key]: Object.assign({ term: field.term }, value) });
  else await ref.update({ "report.rivals": value, rivalsAt: value.at });
  return value;
}

/* Rival sweep: after the country sweep, each tick takes one step for one country-sweep site: find its
   2-3 natural competitors (web search + Tranco), then review each competitor passively unless a recent
   public review exists, then store the comparison in url_review_rivals/<baseId> for /publishable.
   SWEEP_LIVE=1 turns it on, like the country sweep. */
async function rivalSweep() {
  if (process.env.SWEEP_LIVE !== "1") return "off: SWEEP_LIVE is not 1";
  const db = getFirestore();
  const ref = db.collection("url_review_sweep").doc("rivals");
  const day = new Date().toISOString().slice(0, 10);
  let state = (await ref.get()).data() || {};
  const unlisted = await unlistedHosts();
  if (!state.job) {
    if (rivals.doneOn(state, day) >= ops.budget("rivalsPerDay", process.env)) return "daily cap reached";
    const recent = await db.collection("url_reviews").orderBy("createdAt", "desc").limit(120).get();
    const base = rivals.pickBase(recent.docs.map((doc) => Object.assign({ id: doc.id }, doc.data())), state, unlisted);
    if (!base) return "no country-sweep site waiting";
    let found = { list: [] };
    try {
      const value = await rivalsOf(db.collection("url_reviews").doc(base.id), base);
      found = { list: value.list || [] };
    } catch (error) {
      console.error("Rival lookup failed for " + base.report.host + ":", error);
    }
    state = rivals.started(state, base, found, day);
    await ref.set(state);
    return base.report.host + ": " + (found.list.map((row) => row.host).join(", ") || "no competitors found");
  }
  const job = state.job;
  const next = job.list.find((row) => !row.done);
  let note = "";
  if (next) {
    const fresh = unlisted.some((u) => next.host === u || next.host.endsWith("." + u)) ? "unlisted" : await latestPublicReview(next.host, unlisted) ? "fresh" : "";
    next.outcome = fresh || "done";
    if (!fresh) {
      const startedAt = Date.now();
      try {
        const value = rivals.intake(next.host, job.host, sweep.langOf(job.cc));
        const report = await urlReview.reviewTarget(value.url, {
          stopped: () => Date.now() - startedAt > 240000,
          mentions: false,
          passive: true,
          browse: browseForReview,
          pagespeed: process.env.PAGESPEED_KEY ? (page) => urlReview.pageSpeed(page, process.env.PAGESPEED_KEY) : undefined,
          crux: process.env.CRUX_KEY || process.env.PAGESPEED_KEY ? (page) => urlReview.cruxHistory(page, process.env.CRUX_KEY || process.env.PAGESPEED_KEY) : undefined,
          webrisk: process.env.WEBRISK_KEY ? (page) => urlReview.webRisk(page, process.env.WEBRISK_KEY) : undefined
        });
        const record = Object.assign(urlReview.intakeRecord(value, report, { country: job.cc.toUpperCase() }), { source: "rivals", rivalOf: job.baseId });
        await db.collection("url_reviews").doc(record.id).set(record);
        await countReviewed(record.report);
        try {
          await queueOwnerNotice(record, { search: false });
        } catch (error) {
          console.error("Owner notice queue failed for " + next.host + ":", error);
        }
      } catch (error) {
        next.outcome = "failed";
        console.error("Rival review failed for " + next.host + ":", error);
      }
    }
    next.done = true;
    note = next.host + " " + next.outcome;
  }
  if (job.list.every((row) => row.done)) {
    const baseSnap = await db.collection("url_reviews").doc(job.baseId).get();
    const base = Object.assign({ id: job.baseId }, baseSnap.data() || {});
    const records = await Promise.all(job.list.map((row) => latestPublicReview(row.host, unlisted)));
    const summary = base.report && base.report.insights ? rivals.socialSummary(base, records, base.report.rivals) : null;
    const outcome = summary && summary.rivals.length ? "done" : "failed";
    if (outcome === "done") await db.collection("url_review_rivals").doc(job.baseId).set(Object.assign({ createdAt: new Date().toISOString() }, summary));
    state = Object.assign(rivals.tally(state, day, outcome, { host: job.host, at: new Date().toISOString(), outcome, rivals: job.list.map((row) => row.host + " " + row.outcome) }), { job: null });
    note = (note ? note + "; " : "") + job.host + " compared with " + ((summary && summary.rivals.map((row) => row.host).join(", ")) || "none");
  } else {
    state = Object.assign({}, state, { job });
  }
  await ref.set(state);
  return note;
}

exports.rivalSweep = require("firebase-functions/v2/scheduler").onSchedule({
  schedule: ops.cron("rivalSweep"),
  timeZone: ops.TIME_ZONE,
  timeoutSeconds: 540,
  memory: "1GiB",
  maxInstances: 1,
  secrets: SECRETS.sweep
}, () => track("rivalSweep", () => rivalSweep()));

// Each morning: any job that failed or went quiet past its gap is mailed at once; on Mondays the mail
// goes out anyway, with last week's sweep, notices and re-runs against their budgets.
async function opsWatchdog() {
  const db = getFirestore();
  const now = Date.now();
  const metaRef = db.collection("ops_state").doc("watchdog");
  const meta = (await metaRef.get()).data() || {};
  const since = meta.since || new Date(now).toISOString();
  if (!meta.since) await metaRef.set({ since });
  const runs = {};
  (await db.collection("ops_runs").get()).forEach((doc) => { runs[doc.id] = doc.data(); });
  const problems = ops.overdue(runs, now, since);
  const sweepState = (await db.collection("url_review_sweep").doc("state").get()).data() || {};
  const sweepCap = ops.budget("sweepPerDay", process.env);
  const lastNight = sweep.night(sweepState, new Date(now).toISOString().slice(0, 10), sweepCap);
  if (process.env.SWEEP_LIVE === "1" && lastNight.short) problems.push({ job: "sweepReviews", why: "last night reviewed " + (lastNight.done + lastNight.failed) + " of " + sweepCap });
  const token = await githubApp.token();
  for (const row of ops.JOBS.filter((item) => item.host === "github")) {
    if (!token) break;
    try {
      const data = await githubGet("/repos/" + BUG_REPO + "/actions/workflows/" + row.job + "/runs?per_page=1&status=success", token);
      const last = (data.workflow_runs || [])[0];
      const quietSince = last ? Date.parse(last.updated_at) : Date.parse(since);
      if (now - quietSince > row.gap * 3600000) problems.push({ job: row.job, why: last ? "last success " + last.updated_at : "no successful run" });
    } catch (error) {
      problems.push({ job: row.job, why: "could not be checked: " + error.message });
    }
  }
  const monday = new Date(now).getUTCDay() === 1;
  if (!problems.length && !monday) return "all " + ops.JOBS.length + " jobs on time";
  const weekAgo = new Date(now - 7 * 864e5).toISOString();
  const [notices, reruns, replies, waiting] = await Promise.all([
    db.collection("url_review_owner_notice_log").where("sentAt", ">=", weekAgo).count().get(),
    db.collection("url_review_reruns").where("at", ">=", weekAgo).count().get(),
    db.collection("url_review_owner_replies").where("at", ">=", weekAgo).count().get(),
    db.collection("url_review_owner_replies").where("status", "==", "waiting").count().get()
  ]);
  const swept = sweep.totals(sweepState, weekAgo.slice(0, 10));
  const rows = problems.map((p) => ({ label: p.job, value: p.why })).concat([
    { label: "Country sweep, last night", value: lastNight.done + " reviewed, " + lastNight.failed + " failed, " + lastNight.skipped + " skipped (cap " + sweepCap + ")" },
    { label: "Country sweep, 7 days", value: swept.done + " reviewed, " + swept.failed + " failed, " + swept.skipped + " skipped (cap " + sweepCap + "/day" + (process.env.SWEEP_LIVE === "1" ? "" : ", off") + ")" },
    { label: "Owner notices, 7 days", value: notices.data().count + " sent (cap " + ops.budget("ownerNoticesPerDay", process.env) + "/day" + (process.env.OWNER_NOTICES_LIVE === "1" ? "" : ", off") + ")" },
    { label: "Failure re-runs, 7 days", value: String(reruns.data().count) },
    { label: "Owner replies, 7 days", value: replies.data().count + " in, " + waiting.data().count + " waiting for a decision" }
  ]);
  await pushOwner(jarvisMailPush.opsMessage(problems, ops.JOBS.filter((row) => row.host !== "github").map((row) => row.job)));
  if (!problems.length || await mailOn("ops")) await sendOwnerEmail({
    to: REVIEW_ALERT_TO,
    subject: problems.length ? "Ops: " + problems.length + " scheduled job" + (problems.length === 1 ? "" : "s") + " missed or failed" : "Ops: weekly digest, every job on time",
    intro: problems.length ? "These jobs failed or went quiet for longer than their schedule allows." : "Every scheduled job ran on time last week.",
    rows,
    respondUrl: "https://console.cloud.google.com/logs/query?project=carlosm-interactive-cv",
    buttonLabel: "Open the logs"
  });
  return problems.length + " problems mailed";
}

exports.opsWatchdog = scheduled(withMailAndGithub, "opsWatchdog", () => opsWatchdog());

const ownerReplies = require("./url-review-owner-replies");
const OWNER_REPLIES_URL = process.env.OWNER_REPLIES_URL || "https://us-central1-carlosm-interactive-cv.cloudfunctions.net/ownerReplies";

// Until the reply subdomain's MX points at SendGrid Inbound Parse, owners reply to the alert inbox.
function ownerReplyTo(token) {
  const domain = process.env.OWNER_REPLY_DOMAIN || "";
  return domain && token ? "reply+" + token + "@" + domain : REVIEW_ALERT_TO;
}

// Plain text of an HTML-only reply, for reading: no tag survives, and no angle bracket is decoded back.
function htmlText(html) {
  let text = String(html || "").replace(/<(br|\/p|\/div|\/tr)[^>]*>/gi, "\n");
  let before;
  do {
    before = text;
    text = text.replace(/<[^<>]*>/g, "");
  } while (text !== before);
  return text.replace(/[<>]/g, "").replace(/&nbsp;/g, " ").replace(/&(lt|gt);/g, "")
    .replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, "\"").replace(/&amp;/g, "&");
}

async function applyReplyAction(action, row) {
  const db = getFirestore();
  const at = new Date().toISOString();
  const domain = row.noticeDomain || row.domain;
  if (action === "stop-address" && row.noticeEmail) {
    await db.collection("url_review_owner_stops").doc(row.noticeEmail).set({ at, via: "reply-bounce", domain });
  }
  if (action === "stop-domain" && domain) {
    await Promise.all([row.from, "@" + domain].filter(Boolean).map((key) => db.collection("url_review_owner_stops").doc(key).set({ at, via: "reply-" + row.kind, domain })));
  }
  if (action === "unlist" && row.host) {
    await db.collection("url_review_unlisted").doc(reviewPublish.bare(row.host)).set({ at, via: "owner-reply", domain });
    await db.collection("url_review_owner_notices").doc(domain).set({ unlistedAt: at }, { merge: true });
  }
}

// Points the domain's notice at the address the owner gave, and sends it now. Returns "" or why not.
async function resendNotice(row, email) {
  if (!urlReview.emailSyntax(email)) return "That is not an email address.";
  if (!row.noticeDomain) return "This reply matched no owner notice, so there is nothing to send.";
  const ref = getFirestore().collection("url_review_owner_notices").doc(row.noticeDomain);
  const snap = await ref.get();
  if (!snap.exists) return "The notice for " + row.noticeDomain + " is gone.";
  const notice = snap.data();
  if (notice.status === "sending") return "That notice is being sent right now.";
  const candidates = [{ email, sources: ["owner-reply"], url: "", onDomain: urlReview.mailboxMatchesHost(email, notice.host) }]
    .concat((notice.candidates || []).filter((item) => item.email !== email));
  await ref.update({ status: "pending", email, candidates, tries: 0, lastError: "", redirectedFrom: row.from, redirectedAt: new Date().toISOString() });
  const sent = await sendQueuedNotice(ref, "owner-reply");
  return sent.outcome === "sent" ? "" : "Saved, but not sent yet: " + (sent.reason || sent.outcome);
}

async function noticeForReply(reply) {
  const db = getFirestore();
  const link = reply.token ? (await db.collection("url_review_owner_links").doc(reply.token).get()).data() || null : null;
  const notices = db.collection("url_review_owner_notices");
  let snap = null;
  const byDomain = (link && link.domain) || (reply.domain ? ownerNotice.domainOf(reply.domain) : "");
  if (byDomain) snap = await notices.doc(byDomain).get();
  if ((!snap || !snap.exists) && reply.from) {
    const hit = await notices.where("email", "==", reply.from).limit(1).get();
    snap = hit.empty ? null : hit.docs[0];
  }
  return { link, ref: snap && snap.exists ? snap.ref : null, notice: snap && snap.exists ? snap.data() : null };
}

// The Decide page's buttons and Jarvis's notification buttons: resend, stop, unlist or done.
async function decideOwnerReply(ref, row, action, rawEmail) {
  if (row.status !== "waiting" || ["resend", "stop", "unlist", "done"].indexOf(action) === -1) return { conflict: true, row };
  const email = String(rawEmail || "").trim().toLowerCase().slice(0, 200);
  let problem = "";
  if (action === "resend") problem = ownerReplies.resendChoices(row).includes(email) ? await resendNotice(row, email) : "Pick one of the addresses in the reply.";
  else if (action !== "done") await applyReplyAction(action === "stop" ? "stop-domain" : "unlist", row);
  const decided = { status: "decided", decision: action, decidedAt: new Date().toISOString(), decidedEmail: action === "resend" ? email : "" };
  const saved = !problem || problem.startsWith("Saved");
  if (saved) await ref.update(decided);
  return { problem, saved, row: Object.assign({}, row, saved ? decided : {}) };
}

async function takeOwnerReply(mail, auth) {
  const reply = ownerReplies.read(mail);
  const { link, ref, notice } = await noticeForReply(reply);
  const decision = ownerReplies.plan(reply, notice);
  const id = crypto.randomBytes(16).toString("hex");
  const row = Object.assign({}, reply, {
    at: new Date().toISOString(),
    noticeDomain: ref ? ref.id : "",
    host: (notice && notice.host) || (link && link.host) || "",
    noticeEmail: (link && link.email) || (notice && notice.email) || "",
    spf: clip(auth.spf, 40),
    dkim: clip(auth.dkim, 200),
    status: decision.status,
    propose: decision.propose,
    applied: decision.apply,
    expireAt: keepUntil()
  });
  await getFirestore().collection("url_review_owner_replies").doc(id).set(row);
  for (const action of decision.apply) await applyReplyAction(action, row);
  if (ref) await ref.set({ lastReplyAt: row.at, lastReplyKind: row.kind }, { merge: true });
  if (row.kind !== "auto" && row.kind !== "bounce") {
    await pushOwner(jarvisMailPush.ownerReplyMessage(id, row, ownerReplies.summary(row, decision), OWNER_REPLIES_URL + "/decide?t=" + id));
    if (await mailOn("ownerReplies")) await sendOwnerEmail({
      to: REVIEW_ALERT_TO,
      replyTo: row.from,
      subject: "Owner reply: " + ownerReplies.summary(row, decision),
      intro: ownerReplies.summary(row, decision),
      rows: [
        { label: "From", value: row.from },
        { label: "Site", value: row.host || "no notice matched" },
        { label: "Subject", value: row.subject },
        { label: "Mail checks", value: "SPF " + (row.spf || "none") + ", DKIM " + (row.dkim || "none") },
        { label: "Forwarded by", value: row.forwardedBy }
      ],
      body: row.words,
      respondUrl: OWNER_REPLIES_URL + "/decide?t=" + id,
      buttonLabel: row.status === "waiting" ? "Decide" : "See what was done"
    });
  }
  return id;
}

function replyPage(id, row, message) {
  const esc = ownerLayout.escapeHtml;
  const action = OWNER_REPLIES_URL + "/decide?t=" + id;
  const button = (value, label, extra) => "<form method=\"post\" action=\"" + esc(action) + "\" style=\"margin:10px 0\"><input type=\"hidden\" name=\"do\" value=\"" + value + "\">" + (extra || "") + "<button style=\"padding:10px 16px;border-radius:8px;border:0;background:#0e7490;color:#fff;font-size:14px\">" + esc(label) + "</button></form>";
  const choices = ownerReplies.resendChoices(row);
  const proposed = String(row.propose || "").startsWith("resend:") && choices.includes(row.propose.slice(7)) ? row.propose.slice(7) : choices[0];
  const radios = choices.map((email) => "<label style=\"display:block;margin:6px 0\"><input type=\"radio\" name=\"email\" value=\"" + esc(email) + "\" required" + (email === proposed ? " checked" : "") + "> " + esc(email) + "</label>").join("");
  const open = row.status === "waiting";
  return "<!DOCTYPE html><html><head><meta charset=\"utf-8\"><meta name=\"robots\" content=\"noindex\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>Owner reply</title></head>" +
    "<body style=\"font-family:Arial,sans-serif;max-width:640px;margin:24px auto;padding:0 16px;color:#1c2833\">" +
    "<h1 style=\"font-size:20px\">" + esc(ownerReplies.KIND_LABELS[row.kind] || row.kind) + "</h1>" +
    (message ? "<p style=\"padding:12px;background:#fef3c7;border-radius:8px\">" + esc(message) + "</p>" : "") +
    "<p><b>" + esc(row.from) + "</b> about " + esc(row.host || "no matched notice") + " · " + esc(row.at) + "</p>" +
    "<pre style=\"white-space:pre-wrap;background:#f4f7f8;padding:12px;border-radius:8px\">" + esc(row.words) + "</pre>" +
    (open
      ? (choices.length ? button("resend", "Send the notice to the chosen address", radios) : "") +
        button("stop", "Stop notices to " + (row.noticeDomain || row.domain)) +
        (row.host ? button("unlist", "Take " + row.host + " off Live Reports") : "") +
        button("done", "Handled, nothing to do")
      : "<p>Status: " + esc(row.status) + (row.decision ? " (" + esc(row.decision) + ")" : "") + (row.applied && row.applied.length ? " · applied: " + esc(row.applied.join(", ")) : "") + "</p>") +
    "</body></html>";
}

exports.ownerReplies = functions.runWith({ timeoutSeconds: 60, memory: "256MB", secrets: SECRETS.ownerReplies }).https.onRequest(async (req, res) => {
  res.set("X-Robots-Tag", "noindex");
  try {
    if (req.path.startsWith("/inbound")) {
      const key = process.env.OWNER_REPLY_KEY || "";
      const given = String(req.query.key || "");
      if (!key || given.length !== key.length || !crypto.timingSafeEqual(Buffer.from(given), Buffer.from(key))) {
        res.status(403).send("Forbidden");
        return;
      }
      if (req.method !== "POST" || !req.rawBody || req.rawBody.length > 8e6) {
        res.status(400).send("Expected an Inbound Parse POST");
        return;
      }
      const form = await new Response(req.rawBody, { headers: { "content-type": req.get("content-type") || "" } }).formData();
      const field = (name) => String(form.get(name) || "");
      const id = await takeOwnerReply({
        from: field("from"),
        to: field("to") + " " + field("envelope"),
        subject: field("subject"),
        text: field("text") || htmlText(field("html")),
        headers: field("headers")
      }, { spf: field("SPF"), dkim: field("dkim") });
      res.status(200).send("ok " + id);
      return;
    }
    if (req.path.startsWith("/decide")) {
      res.set("Content-Type", "text/html; charset=utf-8");
      const id = String(req.query.t || "").replace(/[^a-f0-9]/g, "").slice(0, 32);
      const ref = id.length === 32 ? getFirestore().collection("url_review_owner_replies").doc(id) : null;
      const snap = ref ? await ref.get() : null;
      if (!snap || !snap.exists) {
        res.status(404).send("<p>This reply is gone or the link is wrong.</p>");
        return;
      }
      const row = snap.data();
      if (req.method !== "POST") {
        res.status(200).send(replyPage(id, row, ""));
        return;
      }
      const out = await decideOwnerReply(ref, row, String((req.body && req.body.do) || ""), (req.body && req.body.email) || "");
      if (out.conflict) {
        res.status(409).send(replyPage(id, row, "This reply was already decided."));
        return;
      }
      res.status(200).send(replyPage(id, out.row, out.problem || "Done."));
      return;
    }
    res.status(404).send("Not found");
  } catch (error) {
    console.error("ownerReplies failed:", error);
    res.status(500).send("Something failed; Inbound Parse will try again.");
  }
});

// Weekday mornings: replies still waiting for a decision after a day, in one mail.
async function remindOwnerReplies() {
  const snap = await getFirestore().collection("url_review_owner_replies").where("status", "==", "waiting").limit(50).get();
  const old = snap.docs.filter((doc) => Date.now() - Date.parse(doc.get("at") || "") > 20 * 3600000);
  if (!old.length) return "nothing waiting";
  await sendOwnerEmail({
    to: REVIEW_ALERT_TO,
    subject: "Owner replies: " + old.length + " waiting for a decision",
    intro: old.length + " owner repl" + (old.length === 1 ? "y is" : "ies are") + " still waiting for a decision.",
    rows: old.map((doc) => ({ label: doc.get("domain") || doc.get("from"), value: (ownerReplies.KIND_LABELS[doc.get("kind")] || doc.get("kind")) + " · " + OWNER_REPLIES_URL + "/decide?t=" + doc.id })),
    respondUrl: OWNER_REPLIES_URL + "/decide?t=" + old[0].id,
    buttonLabel: "Decide the oldest"
  });
  return old.length + " waiting";
}

exports.remindOwnerReplies = scheduled(withMail, "remindOwnerReplies", async () => (await mailOn("ownerRemind")) ? remindOwnerReplies() : "in the evening digest (mail off in Jarvis settings)");

// Refunds, disputes and unmatched payments stay instant email; the other review events wait for the evening digest (#1672).
const INSTANT_REVIEW_MAIL = new Set(["payment-refunded", "payment-disputed", "payment-unmatched"]);

async function rememberReview(kind, source) {
  const note = reviewDesk.alertFrom(kind, source || {});
  try {
    await getFirestore().collection("url_review_alerts").add({
      at: note.at,
      kind: note.kind,
      title: note.title,
      detail: note.detail,
      runId: note.runId,
      url: note.url,
      name: note.name,
      email: note.email,
      status: note.status,
      priceUsd: note.priceUsd,
      paid: note.paid,
      expireAt: keepUntil()
    });
  } catch (error) {
    console.error("Review alert record failed:", error);
  }
  try {
    if (INSTANT_REVIEW_MAIL.has(kind) || await mailOn("reviewEvents")) await sendOwnerEmail({
      to: REVIEW_ALERT_TO,
      subject: note.subject,
      intro: note.title,
      rows: note.rows,
      body: note.detail
    });
  } catch (error) {
    console.error("Review alert mail failed:", error);
  }
  await pushOwner(jarvisNotify.paymentMessage(kind, source || {}, note) || jarvisNotify.reviewMessage(kind, source || {}) || jarvisMailPush.runMessage(source || {}, note));
}
const REVIEW_ORIGINS = new Set([
  "https://carlosandmunoz.com",
  "https://www.carlosandmunoz.com",
  "https://kaanmuar.github.io",
  "http://127.0.0.1:8765",
  "http://localhost:8765"
]);

function reviewOrigin(req) {
  const origin = String(req.get("origin") || "");
  return REVIEW_ORIGINS.has(origin) ? origin : "https://carlosandmunoz.com";
}

function freeRunKey(email) {
  const key = String(email || "").trim().toLowerCase();
  if (!key || key.length > 160 || key.indexOf("@") === -1 || key.indexOf("/") !== -1) return "";
  return key;
}

async function hasFreeRuns(email) {
  const key = freeRunKey(email);
  if (!key) return false;
  const listed = String(process.env.FREE_RUN_EMAILS || "").split(",").map(freeRunKey).filter(Boolean);
  if (listed.indexOf(key) !== -1) return true;
  try {
    const snap = await getFirestore().collection("url_review_free_runs").doc(key).get();
    return snap.exists;
  } catch (error) {
    console.error("Free-run lookup failed:", error);
    return false;
  }
}

async function reviewRowsFor(deviceId, ip) {
  const col = getFirestore().collection("url_reviews");
  const none = Promise.resolve({ docs: [] });
  // Credits and their use are read on their own, so a device with many runs cannot push a paid credit out of the 20 rows.
  const [byDevice, byIp, credits, spent] = await Promise.all([
    deviceId ? col.where("deviceId", "==", deviceId).limit(20).get() : none,
    ip ? col.where("ip", "==", ip).limit(20).get() : none,
    deviceId ? col.where("deviceId", "==", deviceId).where("status", "==", "run-credit").limit(100).get() : none,
    deviceId ? col.where("deviceId", "==", deviceId).where("status", "==", "run-credit-used").limit(200).get() : none
  ]);
  const map = new Map();
  byDevice.docs.concat(byIp.docs, credits.docs, spent.docs).forEach((doc) => map.set(doc.id, Object.assign({ id: doc.id }, doc.data())));
  return Array.from(map.values()).map((row) => Object.assign({}, row, {
    createdAt: row.createdAt && row.createdAt.toDate ? row.createdAt.toDate().toISOString() : row.createdAt
  }));
}

// A code with perEmail is counted against the redemptions of the payer's address; without an address it stays closed.
async function couponFor(code, purpose, reportId, email) {
  const key = reviewOffers.cleanCode(code);
  if (!key) return null;
  try {
    const snap = await getFirestore().collection("url_review_coupons").doc(key).get();
    const coupon = snap.exists ? Object.assign({ code: key }, snap.data()) : null;
    const address = String(email || "").trim().toLowerCase();
    let used = null;
    if (coupon && Number(coupon.perEmail) > 0 && address) {
      const prior = await getFirestore().collection("url_review_redemptions").where("code", "==", key).where("email", "==", address).limit(Number(coupon.perEmail)).get();
      used = prior.size;
    }
    return reviewOffers.couponOpen(coupon, purpose, reportId, null, used) ? coupon : null;
  } catch (error) {
    console.error("Coupon lookup failed:", error);
    return null;
  }
}

async function runsForEmail(email) {
  if (!email) return [];
  const snap = await getFirestore().collection("url_reviews").where("email", "==", email).select("status", "createdAt").limit(60).get();
  return snap.docs.map((doc) => doc.data());
}

// A first run's wider read and a comparison keep their list price: no return step and no code.
async function returnPrice(priced, opts) {
  const cents = Math.round(Number(priced.usd) * 100);
  if (priced.billing === "scope" || priced.billing === "compare") return reviewOffers.discountFor(cents, priced.count, {});
  const coupon = await couponFor(opts.coupon, opts.purpose, opts.reportId, opts.email);
  const rows = opts.rows || (opts.purpose === "report" ? await runsForEmail(opts.email) : await reviewRowsFor(opts.deviceId, opts.ip));
  return reviewOffers.discountFor(cents, priced.count, { returns: reviewOffers.returnsBefore(rows, opts.before), coupon });
}

// purpose=pass&plan= prices a pass; pass=<plan> with a run's choices prices only what the run asks beyond that plan.
// Neither takes a return step or a code. null for every other quote.
async function quotePass(query) {
  const q = query || {};
  if (q.purpose === "pass") {
    const chosen = reviewOffers.knownPlan(String(q.plan || ""));
    if (!chosen) {
      const error = new Error("Choose the Freelancer, Team, or Pro pass.");
      error.status = 400;
      throw error;
    }
    const quote = await urlReview.copQuote(chosen.usd);
    return { usd: chosen.usd, cop: quote.pesos, rate: quote.rate, count: 1, frameworks: [], tools: [], plan: chosen.id, pass: reviewOffers.passPlans().find((row) => row.id === chosen.id) };
  }
  if (!q.pass) return null;
  const chosen = reviewOffers.knownPlan(String(q.pass));
  if (!chosen) {
    const error = new Error("That pass is not a QA-lab pass.");
    error.status = 400;
    throw error;
  }
  const priced = urlReview.priceForPassExtras(chosen, { frameworks: String(q.frameworks || ""), tools: String(q.tools || ""), pages: q.pages, depth: q.depth });
  const quote = priced.cents ? await urlReview.copQuote(priced.usd) : { pesos: 0, rate: 0 };
  return {
    usd: priced.usd,
    cop: quote.pesos,
    rate: quote.rate,
    count: priced.count,
    frameworks: priced.frameworks,
    tools: priced.tools,
    discount: priced.discount,
    extra: priced.extra,
    pages: priced.pages,
    depth: priced.depth,
    billing: "pass",
    plan: chosen.id,
    frameworkUsd: priced.frameworkUsd,
    scopeUsd: priced.scopeUsd,
    pageUsd: priced.pageUsd,
    depthUsd: priced.depthUsd
  };
}

function dealFields(deal) {
  return deal && deal.percent
    ? { listUsd: deal.listUsd, percent: deal.percent, discountSource: deal.source, coupon: deal.code }
    : {};
}

async function mintReturnCoupon(note) {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const code = "BACK-" + Array.from({ length: 8 }, () => alphabet[crypto.randomInt(alphabet.length)]).join("");
  await getFirestore().collection("url_review_coupons").doc(code).set(reviewOffers.returnCoupon(note));
  return code;
}

async function redeemCoupon(code, record) {
  const key = reviewOffers.cleanCode(code);
  if (!key) return;
  const db = getFirestore();
  try {
    await db.runTransaction(async (tx) => {
      const ref = db.collection("url_review_coupons").doc(key);
      const redemption = record && record.reference ? db.collection("url_review_redemptions").doc("ref-" + record.reference) : db.collection("url_review_redemptions").doc();
      const [snap, done] = await Promise.all([tx.get(ref), tx.get(redemption)]);
      if (!snap.exists || done.exists) return;
      tx.update(ref, { uses: Number((snap.data() || {}).uses || 0) + 1, lastUsedAt: new Date().toISOString() });
      tx.set(redemption, Object.assign({ code: key, at: new Date().toISOString(), expireAt: urlReview.paymentExpireAt() }, record));
    });
  } catch (error) {
    console.error("Coupon redemption failed:", error);
  }
}

const UNMATCHED = "This payment does not match an open checkout.";

// The confirm page and the PayPal webhook can arrive together. Only the one that claims the checkout fulfils it;
// a claim older than two minutes was left by a call that failed part way, so the next one finishes it.
async function claimCheckout(result, testRun) {
  const db = getFirestore();
  const ref = db.collection("url_reviews").doc(result.reference);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const open = snap.exists ? snap.data() || {} : null;
    const sameLink = !result.linkId || (open && open.externalId === result.linkId);
    if (!open || open.provider !== result.provider || open.amount !== result.amount || !sameLink || (open.test === true) !== testRun) return { state: "unmatched", open };
    if (open.status === "paid") return { state: "done", open };
    const claimedAt = Date.parse(open.claimedAt || "") || 0;
    if (open.status === "claimed" && Date.now() - claimedAt < 120000) return { state: "busy", open };
    if (open.status !== "checkout-open" && open.status !== "claimed") return { state: "unmatched", open };
    tx.update(ref, { status: "claimed", claimedAt: new Date().toISOString(), paidOrderId: result.sessionId });
    return { state: "claimed", open };
  });
}

async function noteUnmatchedPayment(result, testRun, reason) {
  const order = String(result.sessionId || "").replace(/[^A-Z0-9]/g, "").slice(0, 22);
  const row = {
    status: "payment-unmatched",
    provider: result.provider,
    sessionId: order,
    captureId: result.captureId || "",
    reference: result.reference || "",
    amount: result.capturedAmount || result.amount || 0,
    currency: result.capturedCurrency || result.currency || "",
    reason,
    test: testRun,
    createdAt: new Date().toISOString(),
    expireAt: urlReview.paymentExpireAt()
  };
  try {
    const ref = getFirestore().collection("url_reviews").doc("unmatched-" + order);
    if ((await ref.get()).exists) return;
    await ref.set(row);
  } catch (error) {
    console.error("Unmatched payment record failed:", error);
  }
  await rememberReview("payment-unmatched", Object.assign({ priceUsd: row.amount }, row));
}

// The address's passes and its unspent extras credits: all a run on a pass and the standing read.
async function passRowsFor(email) {
  if (!email) return [];
  const col = getFirestore().collection("url_reviews");
  const [passes, credits] = await Promise.all([
    col.where("email", "==", email).where("status", "==", "monthly-pass").limit(40).get(),
    col.where("email", "==", email).where("passExtra", "==", true).where("usedAt", "==", "").limit(40).get()
  ]);
  return passes.docs.concat(credits.docs).map((doc) => Object.assign({ id: doc.id }, doc.data()));
}

async function giveBackPassRun(passId, creditId) {
  try {
    await reviewPass.giveBackPassRun(getFirestore(), passId, creditId);
  } catch (error) {
    console.error("Pass run give-back failed:", error);
  }
}

// A run on an open pass with a run left: no charge within the plan, and the options over it once they are paid.
// null when the run is not a pass run, or when a parallel run took the pass's last run first.
async function passDecision(email, value) {
  const rows = await passRowsFor(email);
  const run = reviewOffers.passRun(rows, email, value, Date.now());
  if (!run) return null;
  const extras = run.extras || { usd: 0 };
  const left = reviewOffers.passLeft(run.row);
  if (run.due) {
    return {
      ok: false,
      code: "payment",
      pass: run.plan.id,
      message: "This run uses one of your " + run.plan.name + " pass runs. The options over the plan ask for payment before it starts.",
      priceUsd: extras.usd,
      count: extras.count,
      frameworks: extras.frameworks,
      tools: extras.tools,
      pages: extras.pages,
      depth: extras.depth,
      billing: "pass",
      frameworkUsd: extras.frameworkUsd,
      scopeUsd: extras.scopeUsd,
      pageUsd: extras.pageUsd,
      depthUsd: extras.depthUsd,
      runsLeft: left
    };
  }
  if (!(await reviewPass.takePassRun(getFirestore(), run.row.id, run.credit && run.credit.id))) return null;
  return { ok: true, consumeId: run.credit ? run.credit.id : "", pass: { id: run.row.id, plan: run.plan.id, name: run.plan.name, left: left - 1, extrasUsd: extras.usd } };
}

async function sendPassRenewals() {
  const db = getFirestore();
  const now = Date.now();
  const snap = await db.collection("url_reviews").where("status", "==", "monthly-pass").limit(500).get();
  const due = reviewOffers.renewalsDue(snap.docs.map((doc) => Object.assign({ id: doc.id }, doc.data())), now);
  for (const row of due) {
    const ref = db.collection("url_reviews").doc(row.id);
    try {
      const claimed = await db.runTransaction(async (tx) => {
        const fresh = await tx.get(ref);
        if (!fresh.exists || fresh.get("renewalSentAt")) return false;
        tx.update(ref, { renewalSentAt: new Date(now).toISOString() });
        return true;
      });
      if (!claimed) continue;
      const sent = await sendAskerMail(row.email, reviewOffers.renewalMail(row), "", "url-review-pass-renewal");
      if (!sent) await ref.update({ renewalSentAt: FieldValue.delete() });
    } catch (error) {
      console.error("Pass renewal note failed:", error);
    }
  }
}

async function fulfillPayment(result, ctx) {
  const { choice, testRun, deviceId, via } = ctx;
  if (!result.paid) {
    if (result.captured) {
      await noteUnmatchedPayment(result, testRun, "PayPal captured " + result.capturedAmount + " " + result.capturedCurrency + ", which is not a QA-lab price.");
      return { code: 402, body: { paid: false, error: UNMATCHED } };
    }
    return {
      code: 402,
      body: {
        paid: false,
        pending: !!result.pending,
        error: result.pending ? "The payment is still pending. Nothing was unlocked." : "The payment is not confirmed. No charge was recorded here."
      }
    };
  }
  if (!result.reference) {
    await noteUnmatchedPayment(result, testRun, "The PayPal order carries no checkout reference.");
    return { code: 402, body: { paid: false, error: UNMATCHED } };
  }
  const claim = await claimCheckout(result, testRun);
  if (claim.state === "unmatched") {
    await noteUnmatchedPayment(result, testRun, claim.open ? "The open checkout differs in amount, provider, mode or status." : "No open checkout has this reference.");
    return { code: 402, body: { paid: false, error: UNMATCHED } };
  }
  const open = claim.open;
  const paidBody = (purpose) => Object.assign({ paid: true, purpose, priceUsd: Number(open.priceUsd || result.amount) || 0, reference: result.reference, test: testRun },
    purpose === "report" ? { reportId: String(open.reportId || "") } : {});
  if (claim.state !== "claimed") {
    const purpose = open.paidPurpose || reviewOffers.paidPurpose(open.purpose);
    return { code: 200, body: paidBody(purpose) };
  }
  const checkoutRef = getFirestore().collection("url_reviews").doc(result.reference);
  const closeCheckout = (paidPurpose) => checkoutRef.update({ status: "paid", paidAt: new Date().toISOString(), paidPurpose, expireAt: urlReview.paymentExpireAt() });
  if (open.status === "checkout-open") {
    // Checkouts confirmed before claims existed stayed open; their payment rows carry the order id.
    const existing = await getFirestore().collection("url_reviews").where("sessionId", "==", result.sessionId).limit(1).get();
    if (!existing.empty) {
      const prior = existing.docs[0].data() || {};
      const purpose = prior.report ? "report" : reviewOffers.paidPurpose(prior.purpose);
      await closeCheckout(purpose);
      return { code: 200, body: paidBody(purpose) };
    }
  }
  const paidPurpose = reviewOffers.paidPurpose(open.purpose);
  const paidReport = String(open.reportId || "").replace(/[^a-f0-9]/g, "").slice(0, 32);
  const payer = String(open.deviceId || deviceId || "").replace(/[^a-f0-9]/g, "").slice(0, 32);
  const paidFrameworks = open.frameworks || [];
  const paidTools = open.tools || [];
  const paidLayers = open.layers || [];
  const paidAlerts = Number(open.alertCount) || 0;
  const paidPrice = open.priceUsd || result.amount;
  const paidCompare = reviewCompare.cleanId(open.compareWith);
  const captureId = result.captureId || "";
  const payerEmail = result.payerEmail || "";
  const payerName = result.payerName || "";
  const who = { name: payerName, email: String(open.email || "") || payerEmail };
  if (open.coupon) {
    const owner = paidReport ? await getFirestore().collection("url_reviews").doc(paidReport).get() : null;
    const email = String((owner && owner.exists && owner.get("email")) || open.email || "").trim().toLowerCase();
    await redeemCoupon(open.coupon, { reference: result.reference, purpose: paidPurpose, reportId: paidReport, email, priceUsd: paidPrice, listUsd: open.listUsd || null, percent: open.percent || 0, test: testRun });
  }
  if (paidPurpose === "report" && paidReport) {
    const runRef = getFirestore().collection("url_reviews").doc(paidReport);
    await runRef.set({
      paid: true,
      sessionId: result.sessionId,
      provider: result.provider,
      test: testRun
    }, { merge: true });
    // The run and its report go after 12 months; the payment is tax support for five years.
    const run = (await runRef.get()).data() || {};
    await getFirestore().collection("url_reviews").doc("paid-report-" + paidReport).set(reviewOffers.reportPayment(run, {
      reportId: paidReport,
      provider: result.provider,
      method: choice,
      sessionId: result.sessionId,
      captureId,
      payerEmail,
      payerName,
      reference: result.reference,
      test: testRun,
      priceUsd: paidPrice,
      amount: result.amount,
      currency: result.currency,
      createdAt: new Date().toISOString(),
      expireAt: urlReview.paymentExpireAt()
    }));
    await rememberReview("paid", {
      via,
      name: payerName,
      email: run.email || who.email,
      id: paidReport,
      status: "paid-report",
      paid: true,
      test: testRun,
      priceUsd: paidPrice,
      provider: result.provider,
      purpose: paidPurpose,
      frameworks: paidFrameworks,
      sessionId: result.sessionId
    });
  } else if (paidPurpose === "pass") {
    const passEmail = String(open.email || "").trim().toLowerCase();
    const made = await reviewPass.writePass(getFirestore(), open, {
      provider: result.provider,
      method: choice,
      deviceId: payer,
      sessionId: result.sessionId,
      captureId,
      reference: result.reference,
      test: testRun,
      amount: result.amount,
      currency: result.currency,
      lang: open.lang || "",
      createdAt: new Date().toISOString(),
      expireAt: urlReview.paymentExpireAt()
    }, await passRowsFor(passEmail));
    if (made) await rememberReview("pass-paid", Object.assign({ via }, made));
  } else if (reviewOffers.ADDONS.indexOf(paidPurpose) !== -1) {
    const runRef = paidReport ? getFirestore().collection("url_reviews").doc(paidReport) : null;
    const runSnap = runRef ? await runRef.get() : null;
    const run = runSnap && runSnap.exists ? runSnap.data() || {} : {};
    if (runSnap && runSnap.exists) {
      const opened = { addons: FieldValue.arrayUnion(paidPurpose) };
      if (paidPurpose === "cases" && paidLayers.length) opened.addonLayers = FieldValue.arrayUnion(...paidLayers);
      await runRef.update(opened);
    }
    const addon = reviewOffers.addonPayment(run, {
      purpose: paidPurpose,
      reportId: paidReport,
      layers: paidPurpose === "cases" ? paidLayers : undefined,
      alertCount: paidPurpose === "alerts" ? paidAlerts : undefined,
      provider: result.provider,
      method: choice,
      deviceId: payer,
      sessionId: result.sessionId,
      captureId,
      payerEmail,
      payerName,
      reference: result.reference,
      test: testRun,
      priceUsd: paidPrice,
      amount: result.amount,
      currency: result.currency,
      createdAt: new Date().toISOString(),
      expireAt: urlReview.paymentExpireAt()
    });
    await getFirestore().collection("url_reviews").doc("paid-" + paidPurpose + "-" + String(result.reference || result.sessionId).replace(/[^A-Za-z0-9-]/g, "").slice(0, 64)).set(addon);
    await rememberReview("addon-paid", Object.assign({ id: paidReport, via }, addon, { name: payerName, email: addon.email || who.email }));
  } else {
    const credit = {
      status: "run-credit",
      paid: true,
      test: testRun,
      provider: result.provider,
      method: choice,
      deviceId: payer,
      email: String(open.email || ""),
      payerEmail,
      payerName,
      sessionId: result.sessionId,
      captureId,
      reference: result.reference,
      purpose: paidPurpose,
      frameworks: paidFrameworks,
      tools: paidTools,
      pages: open.pages || urlReview.INCLUDED_PAGES,
      depth: open.depth || urlReview.INCLUDED_DEPTH,
      billing: open.billing || "run",
      compareWith: paidCompare,
      createdAt: new Date().toISOString(),
      priceUsd: paidPrice,
      amount: result.amount,
      currency: result.currency,
      expireAt: urlReview.paymentExpireAt()
    };
    // The options over a pass belong to the signed-in address that runs on it, on any device.
    if (open.passExtra === true) Object.assign(credit, { passExtra: true, plan: open.plan || "", email: open.email || "", usedAt: "" });
    // One comparison checkout pays for each competitor run: one credit per competitor, each tied to the base review.
    // The first credit carries the payment; the others name it, so the amount is counted once.
    const competitors = paidCompare && open.billing === "compare" ? Math.max(1, Math.min(urlReview.MAX_COMPETITORS, Number(open.competitors) || 1)) : 1;
    await getFirestore().collection("url_reviews").doc("credit-" + result.reference).set(competitors > 1 ? Object.assign({}, credit, { competitors }) : credit);
    for (let n = 2; n <= competitors; n += 1) {
      await getFirestore().collection("url_reviews").doc("credit-" + result.reference + "-" + n).set(Object.assign({}, credit, { priceUsd: 0, amount: 0, paidWith: "credit-" + result.reference, competitors }));
    }
    await rememberReview("run-paid", Object.assign({ via }, credit, competitors > 1 ? { competitors } : {}, who));
  }
  await closeCheckout(paidPurpose);
  await mailAfterPayment(open, result, { purpose: paidPurpose, reportId: paidReport, priceUsd: paidPrice, captureId, test: testRun });
  return { code: 200, body: paidBody(paidPurpose) };
}

// The receipt, and the full report when a report is bought after its run; a mail that fails never undoes the payment.
async function mailAfterPayment(open, result, paid) {
  const db = getFirestore();
  const runSnap = paid.reportId ? await db.collection("url_reviews").doc(paid.reportId).get().catch(() => null) : null;
  const run = runSnap && runSnap.exists ? Object.assign({ id: runSnap.id }, runSnap.data()) : null;
  const to = String(open.email || (run && run.email) || result.payerEmail || "").trim().toLowerCase();
  const receipt = async () => {
    const mark = { at: new Date().toISOString(), sent: false };
    try {
      mark.sent = (await sendAskerMail(to, customerMail.receiptMail({
        lang: open.lang || (run && run.lang),
        purpose: paid.purpose,
        host: (run && run.report && run.report.host) || "",
        priceUsd: paid.priceUsd,
        listUsd: open.listUsd,
        coupon: open.coupon,
        percent: open.percent,
        reference: result.reference,
        orderId: result.sessionId,
        captureId: paid.captureId,
        paidAt: mark.at,
        test: paid.test
      }), "", "url-review-receipt")) === true;
      if (!mark.sent) mark.error = "mail is not configured";
    } catch (error) {
      mark.error = String((error && error.message) || "mail failed").slice(0, 200);
      console.error("Receipt mail failed:", error);
    }
    await db.collection("url_reviews").doc(result.reference).set({ receipt: mark }, { merge: true }).catch((error) => console.error("Receipt mark failed:", error));
  };
  await Promise.all([
    to ? receipt() : null,
    paid.purpose === "report" && run ? mailReportToAsker(run).catch((error) => console.error("Paid report mail failed:", error)) : null
  ]);
}

function paypalKeys(mode) {
  const sandbox = mode === "sandbox";
  return {
    provider: "paypal",
    paypalClientId: (sandbox ? process.env.PAYPAL_SANDBOX_CLIENT_ID : process.env.PAYPAL_CLIENT_ID) || "",
    paypalSecret: (sandbox ? process.env.PAYPAL_SANDBOX_CLIENT_SECRET : process.env.PAYPAL_CLIENT_SECRET) || "",
    paypalMode: sandbox ? "sandbox" : (process.env.PAYPAL_MODE || ""),
    webhookId: (sandbox ? process.env.PAYPAL_SANDBOX_WEBHOOK_ID : process.env.PAYPAL_WEBHOOK_ID) || ""
  };
}

async function reversePayment(ids, keys, testRun) {
  let orderId = ids.orderId;
  let captureStatus = "";
  if (ids.captureId) {
    const capture = await urlReview.paypalCapture(keys, ids.captureId);
    if (capture) {
      orderId = orderId || capture.orderId;
      captureStatus = capture.status;
    }
  }
  if (!orderId) return false;
  const db = getFirestore();
  const snap = await db.collection("url_reviews").where("sessionId", "==", orderId).limit(20).get();
  const rows = snap.docs.map((doc) => Object.assign({ id: doc.id }, doc.data()));
  let kind = "dispute";
  if (ids.type === "PAYMENT.CAPTURE.REVERSED") kind = "refund";
  if (ids.type === "PAYMENT.CAPTURE.REFUNDED") kind = captureStatus === "PARTIALLY_REFUNDED" ? "partial-refund" : "refund";
  const updates = reviewOffers.reversalUpdates(rows, {
    kind,
    status: ids.disputeStatus,
    disputeId: ids.disputeId,
    outcome: ids.disputeOutcome,
    refundedUsd: ids.refundAmount
  });
  for (const update of updates) {
    const ref = db.collection("url_reviews").doc(update.id);
    if (update.removeAddon) {
      await ref.update({ addons: FieldValue.arrayRemove(update.removeAddon) }).catch(() => {});
    } else {
      await ref.set(update.set, { merge: true });
    }
  }
  const payment = rows.find((row) => ["paid-report", "paid-addon", "run-credit", "run-credit-refunded", "monthly-pass"].indexOf(row.status) !== -1) || rows[0] || {};
  await rememberReview(kind === "dispute" ? "payment-disputed" : "payment-refunded", {
    id: payment.reportId || payment.id || "",
    email: payment.email || "",
    status: kind === "dispute" ? "disputed" : kind,
    purpose: payment.purpose || "",
    priceUsd: payment.priceUsd,
    test: testRun,
    sessionId: orderId,
    refundedUsd: kind === "partial-refund" ? ids.refundAmount : (kind === "refund" ? payment.priceUsd : 0),
    disputeStatus: ids.disputeStatus,
    disputeOutcome: ids.disputeOutcome,
    reason: rows.length ? "" : "No payment row carries this PayPal order."
  });
  return true;
}

// PayPal posts each event to /paypal-webhook/live or /paypal-webhook/sandbox. A non-2xx answer makes PayPal retry for three days.
async function handlePayPalWebhook(req, res, mode) {
  const keys = paypalKeys(mode);
  const testRun = mode === "sandbox";
  const event = req.body || {};
  let verified = false;
  try {
    verified = await urlReview.verifyPayPalWebhook(keys, req.headers || {}, event);
  } catch (error) {
    console.error("PayPal webhook verification failed:", error);
    res.status(503).json({ error: "Verification is unavailable." });
    return;
  }
  if (!verified) {
    res.status(400).json({ error: "The event signature did not verify." });
    return;
  }
  const ids = urlReview.paypalEventIds(event);
  try {
    if (ids.type === "CHECKOUT.ORDER.APPROVED" || ids.type === "PAYMENT.CAPTURE.COMPLETED") {
      let orderId = ids.orderId;
      if (!orderId && ids.captureId) orderId = ((await urlReview.paypalCapture(keys, ids.captureId)) || {}).orderId || "";
      if (orderId) {
        const result = await urlReview.inspectPayment(Object.assign({}, keys, { sessionId: orderId }));
        if (result.paid || result.captured) await fulfillPayment(result, { choice: "paypal", testRun, deviceId: "", via: "PayPal webhook" });
      }
    } else if (ids.type === "PAYMENT.CAPTURE.REFUNDED" || ids.type === "PAYMENT.CAPTURE.REVERSED" || ids.type.indexOf("CUSTOMER.DISPUTE.") === 0) {
      await reversePayment(ids, keys, testRun);
    }
  } catch (error) {
    console.error("PayPal webhook " + ids.type + " failed:", error);
    res.status(500).json({ error: "The event could not be applied." });
    return;
  }
  res.status(200).json({ ok: true });
}

const BROWSER_URL = process.env.BROWSER_URL || "https://europe-west1-carlosm-interactive-cv.cloudfunctions.net/reviewBrowser";
// Longer than the browser pass may run (BUDGET_MAX_MS, 110 s, in url-review-browser.js), shorter than reviewBrowser's 120 s timeout.
const BROWSER_WAIT_MS = 116000;

async function browseForReview(job, log, onStart) {
  const key = process.env.BROWSER_KEY;
  if (!key) return null;
  const res = await fetch(BROWSER_URL, {
    method: "POST",
    headers: { "content-type": "application/json", "x-review-key": key },
    body: JSON.stringify(Object.assign({}, job, { stream: true })),
    signal: AbortSignal.timeout(BROWSER_WAIT_MS)
  });
  if (!res.ok) return { ok: false, error: res.status === 429 ? "the browser was busy" : "status " + res.status };
  if (!/ndjson/i.test(res.headers.get("content-type") || "")) return res.json();
  return readBrowserStream(res.body, log, onStart);
}

async function readBrowserStream(body, log, onStart) {
  const decoder = new TextDecoder();
  let buf = "";
  let result = null;
  const take = (part) => {
    if (!part.trim()) return;
    let msg;
    try { msg = JSON.parse(part); } catch (error) { return; }
    if (msg.type === "log" && typeof log === "function") log(String(msg.text || "").slice(0, 400));
    if (msg.type === "start" && msg.start && typeof onStart === "function") onStart(msg.start);
    if (msg.type === "done") result = msg.result;
  };
  for await (const chunk of body) {
    buf += decoder.decode(chunk, { stream: true });
    const parts = buf.split("\n");
    buf = parts.pop();
    parts.forEach(take);
  }
  take(buf + decoder.decode());
  return result || { ok: false, error: "the browser stream ended before its result" };
}

const reviewAuth = require("./url-review-auth");
const reviewPhrase = require("./url-review-phrase");
const reviewOAuth = require("./url-review-oauth");
// Each OAuth provider registers exactly this address as its redirect URI.
const REVIEW_OAUTH_PAGE = "https://carlosandmunoz.com/qa-review.html";

// TTL deletes an account 12 months after its last sign-in; a manual delete counts too.
exports.dropReviewAuthUser = functions.firestore
  .document("url_review_accounts/{email}")
  .onDelete(async (snap, context) => {
    const email = (snap.data() || {}).email || context.params.email;
    const dropped = await reviewAuth.dropAuthUsers(getAuth(), email);
    if (dropped) console.log("Dropped " + dropped + " Firebase Auth user(s) for a deleted review account.");
    return null;
  });

async function mailSignIn(started, lang, page) {
  const from = prepareMail();
  if (!from) return false;
  const mail = customerMail.signInMail(lang, started, page);
  await sgMail.send({
    to: started.email,
    from: from,
    replyTo: REVIEW_ALERT_TO,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
    categories: ["url-review-sign-in"],
    trackingSettings: { clickTracking: { enable: false, enableText: false }, openTracking: { enable: false } }
  });
  return true;
}

async function sendSignIn(res, store, input) {
  const started = await reviewAuth.startEmail(store, input);
  if (!started.ok) {
    res.status(started.status).json({ error: started.error, field: started.field || "" });
    return;
  }
  if (!(await mailSignIn(started, input.lang, input.page))) {
    res.status(503).json({ error: "Sign-in email is not available right now. Try again later." });
    return;
  }
  res.status(200).json({ ok: true, id: started.id, sentTo: reviewAuth.maskEmail(started.email) });
}

async function reviewSignIn(req, res, pathName) {
  const store = reviewAuth.firestoreStore(getFirestore());
  const body = req.body || {};
  const enabled = process.env.REVIEW_SIGN_IN_PROVIDERS;
  if (req.method === "GET" && pathName.endsWith("/auth/providers")) {
    res.status(200).json({ providers: reviewAuth.enabledProviders(enabled, reviewOAuth.ready(process.env)) });
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ error: "Use POST." });
    return;
  }
  const answer = (result) => {
    if (result.ok) res.status(200).json({ ok: true, session: result.session, email: result.email, provider: result.provider, name: result.name || "", picture: result.picture || "" });
    else res.status(result.status).json({ error: result.error, code: result.code || "" });
  };
  if (pathName.endsWith("/auth/email")) {
    const human = urlReview.humanCheck(body, req.headers);
    if (!human.ok) {
      res.status(400).json({ error: human.message });
      return;
    }
    const email = reviewAuth.cleanEmail(body.email);
    if (email && !(await urlReview.emailCanReceive(email))) {
      res.status(400).json({ error: "This address cannot receive email. Check it for typos.", field: "email" });
      return;
    }
    await sendSignIn(res, store, { email, deviceKey: body.deviceKey, ip: req.ip, lang: body.lang, page: body.page });
    return;
  }
  if (pathName.endsWith("/auth/email/finish")) {
    answer(await reviewAuth.finishEmail(store, body));
    return;
  }
  if (pathName.endsWith("/auth/provider")) {
    let decoded = null;
    try {
      decoded = await getAuth().verifyIdToken(String(body.idToken || ""));
    } catch (error) {
      res.status(401).json({ error: "That sign-in was not accepted. Try again." });
      return;
    }
    const result = await reviewAuth.providerSignIn(store, decoded, { deviceKey: body.deviceKey, profile: body.profile, googleAccessToken: body.googleAccessToken, enabled });
    if (result.verifyEmail) {
      await sendSignIn(res, store, { email: result.email, provider: result.provider, uid: result.uid, deviceKey: body.deviceKey, ip: req.ip, lang: body.lang, page: body.page });
      return;
    }
    answer(result);
    return;
  }
  const oauthStart = pathName.match(/\/auth\/oauth\/([a-z]+)\/start$/);
  if (oauthStart) {
    const result = await reviewOAuth.startOAuth(store, { provider: oauthStart[1], deviceKey: body.deviceKey, ip: req.ip, enabled, env: process.env, redirectUri: REVIEW_OAUTH_PAGE });
    if (result.ok) res.status(200).json({ ok: true, url: result.url });
    else res.status(result.status).json({ error: result.error });
    return;
  }
  if (pathName.endsWith("/auth/oauth/finish")) {
    const result = await reviewOAuth.finishOAuth(store, { state: body.state, code: body.code, error: body.error, deviceKey: body.deviceKey, enabled, env: process.env });
    if (result.verifyEmail) {
      await sendSignIn(res, store, { email: result.email, provider: result.provider, uid: result.uid, deviceKey: body.deviceKey, ip: req.ip, lang: body.lang, page: body.page });
      return;
    }
    answer(result);
    return;
  }
  if (pathName.endsWith("/auth/session")) {
    const result = await reviewAuth.checkSession(store, Object.assign({}, body, { touch: false }));
    if (result.ok) res.status(200).json({ ok: true, email: result.email, provider: result.provider });
    else res.status(result.status).json({ error: result.error, signIn: true });
    return;
  }
  if (pathName.endsWith("/auth/signout")) {
    await reviewAuth.closeSession(store, body.session);
    res.status(200).json({ ok: true });
    return;
  }
  res.status(404).json({ error: "Not found." });
}

// The account page signs in through /auth/*; the session and device key come in the body.
async function reviewAccount(req, res, pathName) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Use POST." });
    return;
  }
  const db = getFirestore();
  const signedIn = await reviewAuth.checkSession(reviewAuth.firestoreStore(db), Object.assign({}, req.body || {}, { touch: false }));
  if (!signedIn.ok) {
    res.status(signedIn.status).json({ error: signedIn.error, signIn: true });
    return;
  }
  if (pathName.endsWith("/account/runs")) {
    const snap = await db.collection("url_reviews").where("email", "==", signedIn.email).limit(200).get();
    const freeAccount = await hasFreeRuns(signedIn.email);
    const file = reviewOffers.accountFile(snap.docs.map((doc) => Object.assign({ id: doc.id }, doc.data())), signedIn.email, Date.now(), { freeAccount });
    res.status(200).json(Object.assign(file, { comparisons: await savedComparisons(db, signedIn.email) }));
    return;
  }
  if (pathName.indexOf("/account/comparison/") !== -1) {
    await reviewComparison(req, res, pathName, db, signedIn.email);
    return;
  }
  if (pathName.endsWith("/account/compare")) {
    const snap = await db.collection("url_reviews").where("email", "==", signedIn.email).limit(200).get();
    const records = snap.docs.map((doc) => Object.assign({ id: doc.id }, doc.data()));
    const file = reviewOffers.accountFile(records, signedIn.email, Date.now(), { freeAccount: await hasFreeRuns(signedIn.email) });
    const open = new Set(file.runs.filter((run) => run.open).map((run) => run.id));
    const made = reviewCompare.savedComparison(records, signedIn.email, req.body && req.body.ids, (row) => open.has(row.id));
    if (!made.error) {
      const base = records.find((row) => reviewCompare.cleanId(row.id) === made.base.id);
      await mailComparison(compareMail.accountNotice(made, { email: signedIn.email, name: base && base.name }));
    }
    res.status(made.error ? 400 : 200).json(made);
    return;
  }
  if (pathName.endsWith("/account/stop")) {
    await db.collection("url_review_notes").add({
      status: "follow-stop",
      email: signedIn.email,
      via: "account",
      createdAt: new Date().toISOString()
    });
    await rememberReview("follow-stop", { status: "follow-stop", email: signedIn.email });
    res.status(200).json({ ok: true });
    return;
  }
  if (pathName.endsWith("/account/export")) {
    const data = await accountData.exportAccount(reviewAuth.firestoreStore(db), signedIn.email);
    res.status(200).json(data);
    return;
  }
  if (pathName.endsWith("/account/delete-runs")) {
    const ids = Array.isArray(req.body && req.body.ids) ? req.body.ids.slice(0, 200) : [];
    if (!ids.length) {
      res.status(400).json({ error: "Pick at least one review to delete." });
      return;
    }
    const counts = await accountData.deleteRuns(reviewAuth.firestoreStore(db), signedIn.email, ids);
    console.log("Review runs deleted on request:", JSON.stringify(counts));
    res.status(200).json(Object.assign({ ok: true }, counts));
    return;
  }
  if (pathName.endsWith("/account/delete")) {
    const confirm = String((req.body && req.body.confirm) || "").trim().toLowerCase();
    if (confirm !== String(signedIn.email).toLowerCase()) {
      res.status(400).json({ error: "Type the address you are signed in with to confirm." });
      return;
    }
    const counts = await accountData.deleteAccount(reviewAuth.firestoreStore(db), signedIn.email, { authApi: getAuth() });
    console.log("Review account deleted on request:", JSON.stringify(counts));
    res.status(200).json({ ok: true, paymentsKept: counts.paymentsKept || 0 });
    return;
  }
  if (pathName.endsWith("/account/verify") || pathName.endsWith("/account/verify-check")) {
    const tokenFor = siteTokenFor(signedIn.email);
    const host = ownerProofs.hostOf(req.body && req.body.host);
    const proofs = async () => (await ownerProofRows(signedIn.email)).map((row) => {
      const shown = ownerProofs.publicRow(row.id, row);
      delete shown.by;
      return shown;
    }).filter((row) => row.until > new Date().toISOString());
    if (!tokenFor) {
      res.status(200).json({ available: false, proofs: await proofs() });
      return;
    }
    if ((req.body && req.body.host) && !host) {
      res.status(400).json({ error: "Enter a public host name, such as shop.example.com." });
      return;
    }
    const token = host ? tokenFor(host) : "";
    const given = host ? { host, token, txt: ownerProofs.PREFIX + token, meta: "<meta name=\"qa-lab-verify\" content=\"" + token + "\">" } : {};
    if (pathName.endsWith("/account/verify-check") && host) {
      const found = await urlReview.proveOwner({ email: signedIn.email, siteToken: tokenFor }, host);
      if (found.kind === "site") await rememberSiteProof(signedIn.email, host, found.how);
      res.status(200).json(Object.assign({ available: true, ok: found.kind === "site", how: found.how || "" }, given, { proofs: await proofs() }));
      return;
    }
    res.status(200).json(Object.assign({ available: true }, given, { proofs: await proofs() }));
    return;
  }
  res.status(404).json({ error: "Not found." });
}

async function accountOpenRuns(db, email) {
  const snap = await db.collection("url_reviews").where("email", "==", email).limit(200).get();
  const records = snap.docs.map((doc) => Object.assign({ id: doc.id }, doc.data()));
  const file = reviewOffers.accountFile(records, email, Date.now(), { freeAccount: await hasFreeRuns(email) });
  return { records, open: new Set(file.runs.filter((run) => run.open).map((run) => run.id)) };
}

async function savedComparisons(db, email) {
  try {
    const snap = await db.collection("url_review_comparisons").where("email", "==", email).limit(reviewMulti.LISTED_MAX * 2).get();
    return reviewMulti.listOf(snap.docs.map((doc) => Object.assign({ id: doc.id }, doc.data())), email);
  } catch (error) {
    console.error("Saved comparisons did not load:", error);
    return [];
  }
}

// A many-URL comparison: saved from the account page or the review page, opened, deleted, and printed to PDF.
async function reviewComparison(req, res, pathName, db, email) {
  const body = req.body || {};
  const { records, open } = await accountOpenRuns(db, email);
  if (pathName.endsWith("/account/comparison/save")) {
    const picked = reviewMulti.pickProblem(records, email, body.ids);
    if (picked.error) {
      res.status(400).json(picked);
      return;
    }
    const saved = reviewMulti.savedRecord(email, picked, body.from);
    const ref = await db.collection("url_review_comparisons").add(saved);
    await mailComparison(compareMail.savedNotice(ref.id, saved, records, { email, open }));
    res.status(200).json({ ok: true, id: ref.id });
    return;
  }
  const id = reviewMulti.docId(body.id);
  const snap = id ? await db.collection("url_review_comparisons").doc(id).get() : null;
  const doc = snap && snap.exists ? snap.data() || {} : null;
  if (!doc || String(doc.email || "").toLowerCase() !== String(email).toLowerCase()) {
    res.status(404).json({ error: "That comparison is not saved under this account.", code: "comparisonNotSaved" });
    return;
  }
  if (pathName.endsWith("/account/comparison/delete")) {
    await snap.ref.delete();
    res.status(200).json({ ok: true });
    return;
  }
  const made = reviewMulti.payloadOf(id, doc, records, (row) => open.has(row.id));
  if (pathName.endsWith("/account/comparison/open")) {
    res.status(200).json(made);
    return;
  }
  if (pathName.endsWith("/account/comparison/pdf")) {
    const problem = reviewMulti.pdfProblem(made, body.html);
    if (problem) {
      res.status(made.paid ? 400 : 402).json({ error: problem, paymentRequired: !made.paid });
      return;
    }
    const logos = await Promise.all(made.columns.map((col) => (col.icon ? urlReview.iconData(col.icon) : "")));
    const pdf = await printHtml(reviewMulti.withLogos(body.html, logos), PDF_STORED_MAX);
    const filename = reviewMulti.pdfName(made);
    const url = pdf && pdf.length > PDF_INLINE_MAX ? await storePdf(pdf, filename).catch((error) => {
      console.error("Comparison PDF was not stored:", error && error.message);
      return "";
    }) : "";
    if (!pdf || (pdf.length > PDF_INLINE_MAX && !url)) {
      res.status(503).json({ error: "The PDF did not print. Try again in a moment, or use Print." });
      return;
    }
    res.status(200).json(url ? { ok: true, url, filename } : { ok: true, pdf, filename });
    return;
  }
  res.status(404).json({ error: "Not found." });
}

function reviewHeaders(req, res) {
  res.set("Access-Control-Allow-Origin", reviewOrigin(req));
  res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");
  res.set("Access-Control-Allow-Credentials", "true");
  res.set("Cache-Control", "no-store");
}

exports.reviewUrl = functions.runWith({ timeoutSeconds: 180, memory: "512MB", maxInstances: 20, secrets: SECRETS.reviewUrl }).https.onRequest(async (req, res) => {
  reviewHeaders(req, res);
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }
  const pathName = String(req.path || "/");
  if (req.method === "POST" && (pathName.endsWith("/paypal-webhook/live") || pathName.endsWith("/paypal-webhook/sandbox"))) {
    await handlePayPalWebhook(req, res, pathName.endsWith("/sandbox") ? "sandbox" : "live");
    return;
  }
  if (pathName.indexOf("/auth/") !== -1) {
    try {
      await reviewSignIn(req, res, pathName);
    } catch (error) {
      console.error("Review sign-in failed:", error);
      if (!res.headersSent) res.status(500).json({ error: "Sign-in failed. Try again in a moment." });
    }
    return;
  }
  if (pathName.indexOf("/account/") !== -1) {
    try {
      await reviewAccount(req, res, pathName);
    } catch (error) {
      console.error("Review account failed:", error);
      const failed = pathName.endsWith("/account/delete") ? "The account was not fully deleted. Try again in a moment."
        : pathName.endsWith("/account/delete-runs") ? "The reviews were not all deleted. Try again in a moment."
        : pathName.endsWith("/account/export") ? "Your data did not download. Try again in a moment."
          : pathName.indexOf("/account/comparison/") !== -1 ? "The comparison did not load. Try again in a moment."
            : "Your runs did not load. Try again in a moment.";
      if (!res.headersSent) res.status(500).json({ error: failed });
    }
    return;
  }
  const deskRoutes = [
    ["/desk/failures/data", "failures-data"],
    ["/desk/data", "data"],
    ["/desk/pass", "pass"],
    ["/desk/free", "free"],
    ["/desk/rerun", "rerun"],
    ["/desk/unlist", "unlist"],
    ["/desk/notice", "notice"],
    ["/desk/proof", "proof"]
  ];
  const routed = deskRoutes.find(([part]) => pathName.indexOf(part) !== -1);
  const deskName = routed
    ? routed[1]
    : pathName.endsWith("/desk/failures")
      ? "failures-page"
      : (pathName === "/desk" || pathName.endsWith("/desk"))
        ? "page"
        : "";
  if (deskName) {
    res.set("X-Robots-Tag", "noindex");
    if (deskName === "page" && req.method === "GET") {
      res.set("Content-Type", "text/html; charset=utf-8");
      res.status(200).send(reviewDesk.PAGE);
      return;
    }
    if (deskName === "failures-page" && req.method === "GET") {
      res.set("Content-Type", "text/html; charset=utf-8");
      res.status(200).send(reviewDesk.FAILURES_PAGE);
      return;
    }
    const presented = String(req.get("authorization") || "");
    const bearer = presented.toLowerCase().startsWith("bearer ") ? presented.slice(7).trim() : "";
    let operator = null;
    if (bearer) {
      try { operator = await reviewDesk.verifyOperator(bearer); } catch (error) { operator = null; }
    }
    if (!operator) {
      res.status(bearer ? 403 : 401).json({ error: bearer ? "This account cannot open the desk." : "Sign in with the operator account." });
      return;
    }
    if (deskName === "data" && req.method === "GET") {
      const [reviewSnap, alertSnap, freeSnap, noteSnap, rerunSnap, unlistedSnap, noticeSnap, proofSnap] = await Promise.all([
        getFirestore().collection("url_reviews").limit(400).get(),
        getFirestore().collection("url_review_alerts").limit(80).get(),
        getFirestore().collection("url_review_free_runs").limit(200).get(),
        getFirestore().collection("url_review_notes").limit(1000).get(),
        getFirestore().collection("url_review_reruns").orderBy("at", "desc").limit(30).get(),
        getFirestore().collection("url_review_unlisted").get(),
        getFirestore().collection("url_review_owner_notices").where("status", "==", "pending").limit(100).get(),
        getFirestore().collection(ownerProofs.COLLECTION).limit(200).get()
      ]);
      const ownerProofList = proofSnap.docs.map((doc) => ownerProofs.publicRow(doc.id, doc.data() || {}))
        .sort((a, b) => String(b.at).localeCompare(String(a.at)));
      const ownerNotices = noticeSnap.docs.map((doc) => Object.assign({ domain: doc.id }, doc.data()))
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
      const stamp = (value) => value && value.toDate ? value.toDate().toISOString() : value;
      const records = reviewSnap.docs.map((doc) => {
        const data = doc.data() || {};
        return Object.assign({ id: doc.id }, data, { createdAt: stamp(data.createdAt) });
      });
      const alerts = alertSnap.docs.map((doc) => {
        const data = doc.data() || {};
        return Object.assign({ id: doc.id }, data, { at: stamp(data.at) });
      });
      const freeRuns = freeSnap.docs.map((doc) => {
        const data = doc.data() || {};
        return { email: doc.id, note: data.note || "", at: stamp(data.at) };
      });
      const notes = noteSnap.docs.map((doc) => Object.assign({ id: doc.id }, doc.data()));
      const reruns = reviewDesk.rerunRows(rerunSnap.docs.map((doc) => Object.assign({ id: doc.id }, doc.data())));
      res.status(200).json(Object.assign(reviewDesk.snapshot(records, alerts, [], notes, unlistedSnap.docs.map((doc) => doc.id)), {
        freeRuns,
        reruns,
        ownerNotices,
        ownerProofs: ownerProofList
      }));
      return;
    }
    if (deskName === "proof" && req.method === "POST") {
      const body = req.body || {};
      const ref = (id) => getFirestore().collection(ownerProofs.COLLECTION).doc(id);
      if (body.on === false) {
        const id = String(body.id || "").replace(/[^a-z0-9-]/g, "").slice(0, 60);
        if (!id) {
          res.status(400).json({ error: "Which proof?" });
          return;
        }
        await ref(id).delete();
        res.status(200).json({ ok: true, id, on: false });
        return;
      }
      const row = ownerProofs.operatorRecord({ email: body.email, host: body.host, by: operator });
      if (!row.email || !row.host) {
        res.status(400).json({ error: "Enter the account email and the site's host." });
        return;
      }
      const id = ownerProofs.docId("operator", row.email, row.host);
      await ref(id).set(row);
      res.status(200).json({ ok: true, proof: ownerProofs.publicRow(id, row) });
      return;
    }
    if (deskName === "notice" && req.method === "POST") {
      const out = await decideOwnerNotice(req.body && req.body.domain, req.body && req.body.send === true, req.body && req.body.email, operator);
      if (out.error) res.status(409).json({ error: out.error });
      else res.status(200).json({ ok: true, status: out.status });
      return;
    }
    if (deskName === "failures-data" && req.method === "GET") {
      const db = getFirestore();
      const id = String(req.query.id || "").replace(/[^A-Za-z0-9_.:-]/g, "").slice(0, 60);
      if (id) {
        const snap = await db.collection("url_review_failures").doc(id).get();
        if (!snap.exists) {
          res.status(404).json({ error: "That failure is not saved." });
          return;
        }
        const data = Object.assign({ id }, snap.data());
        const rerunId = data.rerun && data.rerun.id ? String(data.rerun.id) : "";
        const rerun = rerunId ? await db.collection("url_review_reruns").doc(rerunId).get() : null;
        res.status(200).json(reviewFailures.failureDetail(data, rerun && rerun.exists ? Object.assign({ id: rerunId }, rerun.data()) : null));
        return;
      }
      const since = new Date(Date.now() - reviewFailures.KEEP_DAYS * 86400000).toISOString();
      const [failSnap, bugSnap] = await Promise.all([
        db.collection("url_review_failures").where("at", ">=", since).orderBy("at", "desc").select(...reviewFailures.SUMMARY_FIELDS).limit(500).get(),
        db.collection("url_review_failure_bugs").get()
      ]);
      res.status(200).json({
        failures: failSnap.docs.map((doc) => reviewFailures.failureRow(Object.assign({ id: doc.id }, doc.data()))),
        bugs: bugSnap.docs.map((doc) => Object.assign({ key: doc.id }, doc.data())).filter((bug) => bug.issue).sort((a, b) => b.issue - a.issue)
          .map((bug) => ({ key: bug.key, issue: bug.issue, url: bug.url || "", title: bug.title || "", cause: bug.cause || "", runs: bug.runs || 0, hosts: (bug.hosts || []).slice(0, 12), lastAt: bug.lastAt || "", closedAt: bug.closedAt || "" })),
        fixes: reviewFailures.FIXES
      });
      return;
    }
    if (deskName === "rerun" && req.method === "POST") {
      const id = String((req.body && req.body.id) || "").replace(/[^A-Za-z0-9]/g, "").slice(0, 40);
      const out = await releaseHeldRerun(id, req.body && req.body.send === true, operator);
      if (!out) {
        res.status(409).json({ error: "That re-run is not waiting for a decision." });
        return;
      }
      res.status(200).json(Object.assign({ ok: true }, out));
      return;
    }
    if (deskName === "unlist" && req.method === "POST") {
      const host = reviewPublish.bare(req.body && req.body.host);
      if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host) || host.length > 200) {
        res.status(400).json({ error: "That is not a host name." });
        return;
      }
      await getFirestore().collection("url_review_unlisted").doc(host).set({ at: new Date().toISOString(), by: operator, from: "desk" });
      res.status(200).json({ ok: true, host });
      return;
    }
    if (deskName === "free" && req.method === "POST") {
      const key = freeRunKey(req.body && req.body.email);
      if (!key) {
        res.status(400).json({ error: "That address is missing." });
        return;
      }
      const ref = getFirestore().collection("url_review_free_runs").doc(key);
      if (req.body && req.body.on === false) {
        await ref.delete();
      } else {
        await ref.set({
          note: String((req.body && req.body.note) || "").trim().slice(0, 120),
          at: FieldValue.serverTimestamp(),
          by: operator
        });
      }
      res.status(200).json({ ok: true, email: key, on: !(req.body && req.body.on === false) });
      return;
    }
    if (deskName === "pass" && req.method === "POST") {
      const email = String((req.body && req.body.email) || "").trim().toLowerCase();
      const offers = require("./url-review-offers");
      const chosen = offers.planById((req.body && req.body.plan) || "freelancer");
      if (!email || email.indexOf("@") === -1) {
        res.status(400).json({ error: "That address is missing." });
        return;
      }
      const until = new Date(Date.now() + chosen.days * 24 * 60 * 60 * 1000).toISOString();
      const record = {
        status: "monthly-pass",
        email,
        plan: chosen.id,
        priceUsd: chosen.usd,
        paid: false,
        localPass: true,
        paidUntil: until,
        createdAt: new Date().toISOString(),
        expireAt: urlReview.paymentExpireAt()
      };
      await getFirestore().collection("url_reviews").add(record);
      await rememberReview("monthly", record);
      res.status(200).json({ ok: true, paidUntil: until, charged: false });
      return;
    }
    res.status(405).json({ error: "Use the desk sign-in." });
    return;
  }
  if (req.method === "GET" && pathName.indexOf("/publishable") !== -1) {
    const key = process.env.PUBLISH_KEY || "";
    const given = String(req.get("x-publish-key") || "");
    const crypto = require("crypto");
    if (!key || given.length !== key.length || !crypto.timingSafeEqual(Buffer.from(given), Buffer.from(key))) {
      res.status(403).json({ error: "Not allowed." });
      return;
    }
    const since = /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(String(req.query.since || "")) ? String(req.query.since) : new Date(Date.now() - 864e5).toISOString();
    try {
      const [reviewSnap, unlistedSnap, rivalSnap] = await Promise.all([
        getFirestore().collection("url_reviews").where("createdAt", ">", since).orderBy("createdAt").limit(500).get(),
        getFirestore().collection("url_review_unlisted").get(),
        getFirestore().collection("url_review_rivals").where("createdAt", ">", since).orderBy("createdAt").limit(50).get()
      ]);
      const unlisted = unlistedSnap.docs.map((doc) => doc.id);
      const records = reviewSnap.docs.map((doc) => doc.data());
      const picked = reviewPublish.selectPublishable(records, unlisted);
      const until = records.length ? records[records.length - 1].createdAt : since;
      const comparisons = reviewPublish.publicComparisons(rivalSnap.docs.map((doc) => doc.data()), unlisted)
        .filter((row) => !rivals.shady(row.host))
        .map((row) => Object.assign(row, { rivals: row.rivals.filter((rival) => !rivals.shady(rival.host)) }))
        .filter((row) => row.rivals.length);
      res.status(200).json({ since, until, read: records.length, held: picked.held, unlisted, reports: picked.reports, comparisons });
    } catch (error) {
      console.error("Publishable reviews failed:", error);
      res.status(503).json({ error: "The reviews are not available right now." });
    }
    return;
  }
  if (req.method === "GET" && pathName.indexOf("/paths") !== -1) {
    try {
      const data = await urlReview.sitePaths(req.query.host);
      res.set("Cache-Control", "public, max-age=3600");
      res.status(200).json({ host: data.host, paths: data.paths });
    } catch (error) {
      if (error && error.code === "BAD_HOST") {
        res.status(400).json({ error: error.message, paths: [] });
        return;
      }
      console.error("Review paths failed:", error);
      res.status(200).json({ paths: [] });
    }
    return;
  }
  if (req.method === "GET" && pathName.indexOf("/stats") !== -1) {
    try {
      const data = await reviewTotals();
      res.set("Cache-Control", "public, max-age=60");
      res.status(200).json({ pages: Number(data.pages) || 0, reviews: Number(data.reviews) || 0 });
    } catch (error) {
      console.error("Review totals failed:", error);
      res.status(503).json({ error: "The totals are not available right now." });
    }
    return;
  }
  if (req.method === "GET" && pathName.indexOf("/news") !== -1) {
    try {
      const news = await newsWire.loadNews({
        country: req.query.country,
        lang: req.query.lang,
        city: req.query.city
      });
      res.status(200).json(news);
    } catch (error) {
      res.status(200).json({ country: "", lang: "en", items: [] });
    }
    return;
  }
  if (pathName.indexOf("/notes/stop") !== -1) {
    res.set("X-Robots-Tag", "noindex");
    res.set("Content-Type", "text/html; charset=utf-8");
    const token = String(req.query.t || "").replace(/[^a-f0-9]/g, "").slice(0, 32);
    const linkSnap = token.length === 32 ? await getFirestore().collection("url_review_stop_links").doc(token).get() : null;
    const link = linkSnap && linkSnap.exists ? linkSnap.data() : null;
    if (!link || !link.email) {
      res.status(404).send(customerMail.stopPage("en", "gone"));
      return;
    }
    if (req.method !== "POST") {
      res.status(200).send(customerMail.stopPage(link.lang, "ask"));
      return;
    }
    await getFirestore().collection("url_review_notes").add({
      status: "follow-stop",
      email: link.email,
      via: "link",
      createdAt: new Date().toISOString()
    });
    await rememberReview("follow-stop", { status: "follow-stop", email: link.email });
    res.status(200).send(customerMail.stopPage(link.lang, "done", link.email));
    return;
  }
  if (pathName.indexOf("/owner") !== -1) {
    res.set("X-Robots-Tag", "noindex");
    res.set("Content-Type", "text/html; charset=utf-8");
    const db = getFirestore();
    const token = String(req.query.t || "").replace(/[^a-f0-9]/g, "").slice(0, 32);
    const action = ["claim", "unlist", "stop"].indexOf(String(req.query.do || "")) === -1 ? "" : String(req.query.do);
    const ref = token.length === 32 ? db.collection("url_review_owner_links").doc(token) : null;
    const linkSnap = ref ? await ref.get() : null;
    const link = linkSnap && linkSnap.exists ? linkSnap.data() : null;
    if (!link || !action) {
      res.status(404).send(ownerMail.ownerPage("en", "gone"));
      return;
    }
    if (req.method !== "POST") {
      res.status(200).send(ownerMail.ownerPage(link.lang, action, link));
      return;
    }
    const at = new Date().toISOString();
    if (action === "unlist") {
      await db.collection("url_review_unlisted").doc(link.host).set({ at, via: "owner-notice", domain: link.domain });
      await db.collection("url_review_owner_notices").doc(link.domain).set({ unlistedAt: at }, { merge: true });
      res.status(200).send(ownerMail.ownerPage(link.lang, "unlisted", link));
      return;
    }
    if (action === "stop") {
      await Promise.all([link.email, "@" + link.domain].map((key) => db.collection("url_review_owner_stops").doc(key).set({ at, via: "link", domain: link.domain })));
      res.status(200).send(ownerMail.ownerPage(link.lang, "stopped", link));
      return;
    }
    const email = String((req.body && req.body.email) || "").trim().toLowerCase().slice(0, 200);
    if (!urlReview.emailSyntax(email) || !urlReview.mailboxMatchesHost(email, link.host)) {
      res.status(400).send(ownerMail.ownerPage(link.lang, "claim", Object.assign({}, link, { wrong: true })));
      return;
    }
    if ((Number(link.claims) || 0) >= 3) {
      res.status(429).send(ownerMail.ownerPage(link.lang, "claim-limit", link));
      return;
    }
    const reviewSnap = await db.collection("url_reviews").doc(String(link.reviewId || "-")).get();
    const review = reviewSnap.exists ? reviewSnap.data() : null;
    if (!review || !review.report) {
      res.status(410).send(ownerMail.ownerPage(link.lang, "gone"));
      return;
    }
    // A copy under a new id, so a paid unlock by the asker does not open it and the owner's own unlock is theirs.
    const id = crypto.randomBytes(9).toString("hex");
    const report = Object.assign({}, review.report, { id });
    delete report.history;
    const copy = {
      id,
      status: "owner-claim",
      email,
      reasonCode: "own",
      frameworks: review.frameworks || [],
      claimedFrom: link.reviewId,
      lang: link.lang,
      createdAt: at,
      retainUntil: keepUntil().toISOString(),
      expireAt: keepUntil(),
      report
    };
    await db.collection("url_reviews").doc(id).set(copy);
    await ref.update({ claims: FieldValue.increment(1), claimedAt: at });
    const pdf = await reportPdfFor(copy);
    const mail = customerMail.reportMail(copy, { lang: link.lang, attached: !!pdf, why: ownerMail.claimWhy(link.lang, link.host) });
    await sendReportMail(id, () => sendAskerMail(email, mail, "", "url-review-owner-claim", pdf ? [pdf] : []), !!pdf);
    res.status(200).send(ownerMail.ownerPage(link.lang, "claimed", Object.assign({}, link, { email })));
    return;
  }
  if (req.method === "POST" && pathName.indexOf("/opened") !== -1) {
    const originHeader = String(req.get("origin") || "");
    if (!REVIEW_ORIGINS.has(originHeader)) {
      res.status(403).json({ error: "This page cannot note an open." });
      return;
    }
    try {
      await noteReviewOpen(req);
    } catch (error) {
      console.error("URL review open note failed:", error);
    }
    res.status(204).send("");
    return;
  }
  if (req.method === "POST" && pathName.endsWith("/review/ask")) {
    const body = req.body || {};
    const id = String(body.id || "").replace(/[^a-f0-9]/g, "").slice(0, 32);
    const snap = id ? await getFirestore().collection("url_reviews").doc(id).get() : null;
    const row = snap && snap.exists ? snap.data() || {} : null;
    const free = !!row && (row.free === true || await hasFreeRuns(row.email));
    const access = await reviewAuth.askAccess(reviewAuth.firestoreStore(getFirestore()), body, row, free);
    if (!access.ok) {
      res.status(access.status).json({ error: access.error, code: access.code || "", signIn: !!access.signIn });
      return;
    }
    res.status(200).json({ ok: true, phrase: !!process.env.GEMINI_API_KEY });
    return;
  }
  if (req.method === "POST" && pathName.endsWith("/review/ask/phrase")) {
    const body = req.body || {};
    const id = String(body.id || "").replace(/[^a-f0-9]/g, "").slice(0, 32);
    const store = reviewAuth.firestoreStore(getFirestore());
    const snap = id ? await getFirestore().collection("url_reviews").doc(id).get() : null;
    const row = snap && snap.exists ? snap.data() || {} : null;
    const free = !!row && (row.free === true || await hasFreeRuns(row.email));
    const access = await reviewAuth.askAccess(store, body, row, free);
    if (!access.ok) {
      res.status(access.status).json({ error: access.error, code: access.code || "", signIn: !!access.signIn });
      return;
    }
    const result = await reviewPhrase.phrase({ key: process.env.GEMINI_API_KEY, model: process.env.GEMINI_MODEL, store, id, input: body });
    res.status(result.ok ? 200 : result.status).json(result.ok ? { text: result.text } : { error: result.error, code: result.code });
    return;
  }
  if (req.method === "POST" && pathName.indexOf("/stop") !== -1) {
    const stop = await reviewAuth.stopRun(reviewAuth.firestoreStore(getFirestore()), req.body || {});
    if (!stop.ok) {
      res.status(stop.status).json({ error: stop.error, signIn: !!stop.signIn });
      return;
    }
    res.status(200).json({ ok: true });
    return;
  }
  if (req.method === "POST" && pathName.indexOf("/place") !== -1) {
    const runId = String((req.body && req.body.runId) || "").replace(/[^a-f0-9]/g, "").slice(0, 32);
    if (!runId) {
      res.status(400).json({ error: "Missing run id." });
      return;
    }
    await getFirestore().collection("url_review_places").doc(runId).set(Object.assign(requestPlace(req), {
      at: new Date().toISOString(),
      expireAt: new Date(Date.now() + 864e5)
    }));
    res.status(204).send("");
    return;
  }
  if (req.method === "POST" && pathName.indexOf("/capture") !== -1) {
    const reportId = String((req.body && req.body.reportId) || "").replace(/[^a-f0-9]/g, "").slice(0, 32);
    const kind = ["print", "printscreen", "copy", "case-print"].indexOf(String((req.body && req.body.kind) || "")) === -1 ? "" : String(req.body.kind);
    const deviceId = String((req.body && req.body.deviceId) || "").replace(/[^a-f0-9]/g, "").slice(0, 16);
    if (!reportId || !kind) {
      res.status(400).json({ error: "The capture note was incomplete." });
      return;
    }
    await getFirestore().collection("url_review_captures").add({
      reportId,
      kind,
      deviceId,
      at: new Date().toISOString(),
      expireAt: keepUntil()
    });
    await rememberReview("capture", { id: reportId, reportId, kind, status: "capture", deviceId });
    res.status(200).json({ ok: true });
    return;
  }
  // How this browser's next run is billed, read once on load and on each sign-in change; it prices nothing.
  if (req.method === "POST" && pathName.indexOf("/standing") !== -1) {
    try {
      const body = req.body || {};
      const signedIn = body.session ? await reviewAuth.checkSession(reviewAuth.firestoreStore(getFirestore()), Object.assign({}, body, { touch: false })) : { ok: false };
      const free = signedIn.ok ? await hasFreeRuns(signedIn.email) : false;
      const deviceId = String(body.deviceId || "").replace(/[^a-f0-9]/g, "").slice(0, 32);
      const ip = req.ip || "";
      const rows = free ? [] : await reviewRowsFor(deviceId, ip);
      const standing = urlReview.standingFor(rows, { deviceId, ip });
      const passes = signedIn.ok && !free ? await passRowsFor(signedIn.email) : [];
      res.status(200).json({
        billing: standing.billing,
        free,
        percent: !free && standing.billing === "run" ? reviewOffers.returnPercent(reviewOffers.returnsBefore(rows)) : 0,
        compareUsd: urlReview.COMPARE_CENTS / 100,
        pass: reviewOffers.passView(reviewOffers.passFor(passes, signedIn.email, Date.now())),
        lastPlan: signedIn.ok ? reviewOffers.lastPassPlan(passes, signedIn.email) : "",
        plans: reviewOffers.passPlans()
      });
    } catch (error) {
      console.error("Standing lookup failed:", error);
      res.status(502).json({ error: "How this run is billed could not be read." });
    }
    return;
  }
  if (req.method === "GET" && pathName.indexOf("/checkout/quote") !== -1) {
    try {
      const passQuote = await quotePass(req.query);
      if (passQuote) {
        res.status(200).json(passQuote);
        return;
      }
      let priced = req.query.purpose === "fixlist"
        ? urlReview.priceForFixList()
        : req.query.purpose === "credentials"
        ? urlReview.priceForCredentials()
        : req.query.purpose === "alerts"
          ? urlReview.priceForAlerts(req.query.count)
          : req.query.layers
            ? urlReview.priceForLayers(String(req.query.layers || ""))
            : req.query.pages
          ? urlReview.priceForRun({
            frameworks: String(req.query.frameworks || ""),
            tools: String(req.query.tools || ""),
            pages: req.query.pages,
            depth: req.query.depth,
            billing: String(req.query.billing || ""),
            compareWith: reviewCompare.cleanId(req.query.compareWith),
            competitors: req.query.competitors
          })
          : urlReview.priceFor(String(req.query.frameworks || ""), String(req.query.tools || ""));
      const quotePurpose = req.query.purpose === "report" ? "report" : (req.query.pages && !req.query.layers ? "new-run" : "");
      let deal = null;
      if (quotePurpose) {
        const quoteReport = String(req.query.reportId || "").replace(/[^a-f0-9]/g, "").slice(0, 32);
        let owner = {};
        if (quotePurpose === "report" && quoteReport) {
          const ownerSnap = await getFirestore().collection("url_reviews").doc(quoteReport).get();
          owner = ownerSnap.exists ? ownerSnap.data() : {};
          priced = urlReview.priceForReport(priced.frameworks, priced.tools, urlReview.creditFor(owner));
        }
        const quoteDevice = String(req.query.deviceId || "").replace(/[^a-f0-9]/g, "").slice(0, 32);
        deal = await returnPrice(priced, {
          purpose: quotePurpose,
          reportId: quoteReport,
          email: owner.email,
          before: owner.createdAt,
          coupon: req.query.coupon,
          deviceId: quoteDevice,
          ip: req.ip || ""
        });
      }
      const quote = await urlReview.copQuote(deal ? deal.usd : priced.usd);
      res.status(200).json(Object.assign({
        usd: deal ? deal.usd : priced.usd,
        cop: quote.pesos,
        rate: quote.rate,
        count: priced.count,
        frameworks: priced.frameworks,
        tools: priced.tools || [],
        discount: priced.discount || [],
        pages: priced.pages,
        depth: priced.depth,
        billing: priced.billing,
        frameworkUsd: priced.frameworkUsd,
        scopeUsd: priced.scopeUsd,
        pageUsd: priced.pageUsd,
        depthUsd: priced.depthUsd,
        competitors: priced.competitors,
        eachUsd: priced.eachUsd,
        perFramework: priced.each,
        creditUsd: priced.creditUsd || 0
      }, dealFields(deal)));
    } catch (error) {
      res.status(error.status || 502).json({ error: error.message || "The peso price could not be loaded." });
    }
    return;
  }
  if (req.method === "POST" && pathName.indexOf("/checkout") !== -1) {
    const purpose = ["report", "fixlist", "cases", "credentials", "alerts", "pass"].indexOf(req.body && req.body.purpose) === -1 ? "new-run" : req.body.purpose;
    const reportId = String((req.body && req.body.reportId) || "").replace(/[^a-f0-9]/g, "").slice(0, 32);
    const deviceId = String((req.body && req.body.deviceId) || "").replace(/[^a-f0-9]/g, "").slice(0, 16);
    const choice = urlReview.paymentChoice((req.body && req.body.provider) || "paypal");
    if (!choice) {
      res.status(400).json({ error: "PayPal is the payment method for this review. No charge was made." });
      return;
    }
    const testRun = urlReview.testKeyMatches(req.body && req.body.testKey, process.env.QA_TEST_KEY);
    const keys = {
      secret: process.env.STRIPE_SECRET_KEY || "",
      wompiKey: process.env.WOMPI_PRIVATE_KEY || "",
      mercadoPagoToken: process.env.MERCADOPAGO_ACCESS_TOKEN || "",
      paypalClientId: (testRun ? process.env.PAYPAL_SANDBOX_CLIENT_ID : process.env.PAYPAL_CLIENT_ID) || "",
      paypalSecret: (testRun ? process.env.PAYPAL_SANDBOX_CLIENT_SECRET : process.env.PAYPAL_CLIENT_SECRET) || "",
      paypalMode: testRun ? "sandbox" : (process.env.PAYPAL_MODE || "")
    };
    try {
      if (pathName.indexOf("/confirm") !== -1) {
        const result = await urlReview.inspectPayment(Object.assign({
          provider: choice,
          sessionId: String((req.body && req.body.sessionId) || "")
        }, keys));
        const done = await fulfillPayment(result, { choice, testRun, deviceId });
        res.status(done.code).json(done.body);
        return;
      }
      const reference = crypto.randomBytes(8).toString("hex");
      let priced = null;
      let reportData = {};
      let creditCents = 0;
      if (purpose === "fixlist" && !reportId) {
        res.status(400).json({ error: "A fix list belongs to one report. Open the report first. No charge was made." });
        return;
      }
      if (purpose === "report" || purpose === "fixlist") {
        const reportSnap = await getFirestore().collection("url_reviews").doc(reportId).get();
        reportData = reportSnap.exists ? reportSnap.data() : {};
        const access = await reviewAuth.reportAccess(reviewAuth.firestoreStore(getFirestore()), req.body || {}, reportData, false);
        if (!access.ok && access.status !== 402) {
          res.status(access.status).json({ error: access.locked ? "Only the account that ran this report can unlock it. Sign in with that account. No charge was made." : access.error, signIn: !!access.signIn });
          return;
        }
      }
      // A pass, and the options over one, belong to the signed-in address, so they are bought signed in.
      let passOwner = "";
      let passPlan = null;
      if (purpose === "pass" || (purpose === "new-run" && req.body && req.body.pass)) {
        const signedIn = await reviewAuth.checkSession(reviewAuth.firestoreStore(getFirestore()), Object.assign({}, req.body || {}, { touch: false }));
        if (!signedIn.ok) {
          res.status(signedIn.status || 401).json({ error: "Sign in first. A pass belongs to the address you sign in with. No charge was made.", signIn: true });
          return;
        }
        passOwner = signedIn.email;
      }
      if (purpose === "pass") {
        priced = urlReview.priceForPass(reviewOffers.knownPlan(String(req.body.plan || "")) ? String(req.body.plan) : "");
      } else if (passOwner) {
        const run = reviewOffers.passRun(await passRowsFor(passOwner), passOwner, {
          frameworks: req.body.frameworks || [],
          tools: req.body.tools || [],
          pages: req.body.pages,
          depth: req.body.depth
        }, Date.now());
        if (!run || !run.due) {
          res.status(400).json({ error: !run ? "No open pass with a run left is on this account. No charge was made." : "This run asks for nothing over your pass. Start it from the review page. No charge was made." });
          return;
        }
        passPlan = run.plan;
        priced = run.extras;
      }
      if (purpose === "fixlist") {
        priced = urlReview.priceForFixList();
      } else if (purpose === "cases") {
        priced = urlReview.priceForLayers((req.body && req.body.layers) || []);
      } else if (purpose === "credentials") {
        priced = urlReview.priceForCredentials();
      } else if (purpose === "alerts") {
        priced = urlReview.priceForAlerts(req.body && req.body.alertCount);
      } else if (purpose === "report") {
        creditCents = urlReview.creditFor(reportData);
        priced = urlReview.priceForReport((reportData && reportData.frameworks) || [], urlReview.toolsForCharge((reportData && reportData.report && reportData.report.tools) || [], req.body && req.body.tools), creditCents);
      }
      const compareWith = purpose === "new-run" && !passPlan && req.body ? reviewCompare.cleanId(req.body.compareWith) : "";
      if (!priced) {
        priced = urlReview.priceForRun({
          frameworks: (req.body && req.body.frameworks) || [],
          tools: req.body && req.body.tools,
          pages: req.body && req.body.pages,
          depth: req.body && req.body.depth,
          billing: req.body && req.body.billing,
          compareWith,
          competitors: req.body && req.body.competitors
        });
      }
      let deal = null;
      if (purpose === "report" || (purpose === "new-run" && !passPlan)) {
        deal = await returnPrice(priced, {
          purpose,
          reportId,
          email: reportData.email,
          before: reportData.createdAt,
          coupon: req.body && req.body.coupon,
          deviceId,
          ip: req.ip || ""
        });
      }
      const listUsd = priced.usd;
      if (deal && deal.percent) priced = Object.assign({}, priced, { usd: deal.usd });
      const base = reviewOrigin(req) + "/" + urlReview.payPage(req.body && req.body.lang) + "?purpose=" + purpose + "&provider=" + choice
        + (purpose === "pass" ? "&plan=" + priced.plan : passPlan ? "&pass=" + passPlan.id : "");
      const successUrl = choice === "stripe"
        ? base + "&result=success&session_id={CHECKOUT_SESSION_ID}"
        : base + "&result=success&reference=" + reference;
      const cancelUrl = base + "&result=cancel" + (choice === "stripe" ? "" : "&reference=" + reference);
      const pendingUrl = base + "&result=pending" + (choice === "stripe" ? "" : "&reference=" + reference);
      const session = await urlReview.startCheckout(Object.assign({
        provider: choice,
        purpose,
        reportId,
        deviceId,
        reference,
        frameworks: priced.frameworks || [],
        tools: priced.tools || [],
        layers: priced.layers || [],
        pages: priced.pages,
        depth: priced.depth,
        billing: priced.billing,
        compareWith,
        competitors: priced.competitors,
        alertCount: priced.alertCount,
        plan: priced.plan,
        passPlan,
        priceUsd: priced.usd,
        listUsd,
        creditCents,
        successUrl,
        cancelUrl,
        pendingUrl
      }, keys));
      const buyer = await reviewAuth.checkSession(reviewAuth.firestoreStore(getFirestore()), Object.assign({}, req.body || {}, { touch: false })).catch(() => null);
      await getFirestore().collection("url_reviews").doc(reference).set(Object.assign({
        status: "checkout-open",
        email: (buyer && buyer.ok && buyer.email) || String(reportData.email || ""),
        provider: urlReview.paymentProvider(choice),
        method: choice,
        externalId: session.id,
        reference,
        purpose,
        reportId,
        deviceId,
        frameworks: priced.frameworks || [],
        tools: priced.tools || [],
        layers: priced.layers || [],
        alertCount: priced.alertCount || null,
        pages: priced.pages || null,
        depth: priced.depth || null,
        billing: priced.billing || "",
        compareWith,
        competitors: priced.competitors || null,
        lang: String((req.body && req.body.lang) || "").slice(0, 2),
        ...(passOwner ? { email: passOwner, plan: priced.plan || "", passExtra: !!passPlan } : {}),
        priceUsd: priced.usd,
        creditUsd: creditCents / 100,
        amount: session.amount,
        currency: session.currency,
        paid: false,
        test: testRun,
        createdAt: new Date().toISOString(),
        expireAt: new Date(Date.now() + urlReview.RETAIN_MS)
      }, dealFields(deal)));
      await rememberReview("checkout", {
        id: reference,
        status: "checkout-open",
        test: testRun,
        purpose,
        reportId,
        priceUsd: priced.usd,
        frameworks: priced.frameworks || [],
        paid: false
      });
      res.status(200).json({ url: session.url, id: session.id, provider: session.provider, currency: session.currency, amount: session.amount });
    } catch (error) {
      res.status(error.status || 502).json({
        error: error.message || "Payment could not be started.",
        paymentRequired: true,
        priceUsd: urlReview.PRICE_USD
      });
    }
    return;
  }
  if (req.method === "POST" && pathName.indexOf("/pay") !== -1) {
    res.status(402).json({
      paymentRequired: true,
      priceUsd: urlReview.PRICE_USD,
      error: "Reopening a report asks for payment. A card payment is not connected on this page."
    });
    return;
  }
  // A report's natural competitors: looked up once for the account that ran it, compared in full once
  // the report is paid; anyone else holding the link gets the names already found, under the frost.
  if (req.method === "POST" && pathName.endsWith("/review/rivals")) {
    const body = req.body || {};
    const id = String(body.id || "").replace(/[^a-f0-9]/g, "").slice(0, 32);
    const snap = id ? await getFirestore().collection("url_reviews").doc(id).get() : null;
    const data = snap && snap.exists ? snap.data() || {} : null;
    if (!data || !data.report || !data.report.insights) {
      res.status(404).json({ error: "That report was not found." });
      return;
    }
    try {
      const free = data.free === true || await hasFreeRuns(data.email);
      const access = await reviewAuth.reportAccess(reviewAuth.firestoreStore(getFirestore()), { session: body.session, deviceKey: body.deviceKey }, data, free);
      if (access.status === 404) {
        res.status(404).json({ error: access.error });
        return;
      }
      const field = rivals.fieldOf(body, data.report.observed && data.report.observed.lang);
      if (!access.locked && !rivals.fieldRoom(data.report, field)) {
        res.status(429).json({ error: "This report has searched " + rivals.FIELDS_MAX + " kinds of competition already. Pick one of them or the site's own field." });
        return;
      }
      const found = access.locked ? rivals.storedFor(data.report, field) || { list: [] } : await rivalsOf(snap.ref, data, field);
      const unlisted = await unlistedHosts();
      const list = (found.list || []).filter((row) => !unlisted.some((u) => row.host === u || row.host.endsWith("." + u)));
      const records = await Promise.all(list.map((row) => latestPublicReview(row.host, unlisted)));
      res.status(200).json({ field: field ? field.key : "", rivals: rivals.payload(Object.assign({ id }, data.report), Object.assign({}, found, { list }), records, !!access.ok) });
    } catch (error) {
      console.error("Natural competitors failed for " + id + ":", error);
      res.status(503).json({ error: "The natural competitors are not available right now." });
    }
    return;
  }
  const opening = req.method === "GET" ? { id: req.query.id, coupon: req.query.coupon }
    : (req.method === "POST" && pathName.endsWith("/review/open") ? (req.body || {}) : null);
  if (opening) {
    const id = String(opening.id || "").replace(/[^a-f0-9]/g, "").slice(0, 32);
    if (!id) {
      res.status(400).json({ error: "Missing report id." });
      return;
    }
    const snap = await getFirestore().collection("url_reviews").doc(id).get();
    if (!snap.exists) {
      res.status(404).json({ error: "That report was not found." });
      return;
    }
    const data = snap.data() || {};
    const free = data.free === true || await hasFreeRuns(data.email);
    // A GET carries no session, so a bare link always lands on the preview.
    const proof = req.method === "GET" ? {} : { session: opening.session, deviceKey: opening.deviceKey };
    const access = await reviewAuth.reportAccess(reviewAuth.firestoreStore(getFirestore()), proof, data, free);
    if (access.status === 404) {
      res.status(404).json({ error: access.error });
      return;
    }
    if (access.locked) {
      if (access.status === 403) {
        try {
          await noteSharedOpen(snap.ref, Object.assign({}, data, { id }));
        } catch (error) {
          console.error("Shared report open note failed:", error);
        }
      }
      res.status(access.status).json({
        error: access.error,
        signIn: true,
        locked: true,
        id,
        host: data.report.host,
        status: data.status || "",
        frameworks: data.frameworks || [],
        preview: urlReview.previewReport(data.report)
      });
      return;
    }
    if (!access.ok) {
      let priced = { usd: urlReview.PRICE_PER_FRAMEWORK, frameworks: [] };
      try { priced = urlReview.priceForReport(data.frameworks || [], urlReview.toolsForCharge((data.report && data.report.tools) || []), urlReview.creditFor(data)); } catch (error) { priced = { usd: urlReview.PRICE_PER_FRAMEWORK, frameworks: [], count: 1 }; }
      const deal = await returnPrice(priced, { purpose: "report", reportId: id, email: data.email, before: data.createdAt, coupon: opening.coupon });
      const addons = data.addons || [];
      // A bought fix list opens the findings to the owner; the cases stay in the frosted preview.
      const fixList = addons.indexOf("fixlist") !== -1 && data.report ? { insights: data.report.insights || null } : {};
      res.status(402).json(Object.assign({
        paymentRequired: true,
        priceUsd: deal.usd,
        creditUsd: priced.creditUsd || 0,
        frameworks: priced.frameworks,
        tools: priced.tools || [],
        id: id,
        host: data.report && data.report.host,
        status: data.status || "",
        addons,
        preview: data.report ? urlReview.previewReport(data.report) : null
      }, fixList, dealFields(deal)));
      return;
    }
    const comparisons = data.report && !data.report.compare ? await comparisonsFrom(id, data.email) : [];
    const versus = req.method === "POST" ? await versusFrom(Object.assign({ id }, data), opening, proof) : null;
    res.status(200).json(Object.assign({ report: comparisons.length ? Object.assign({}, data.report, { comparisons }) : data.report, frameworks: data.frameworks || [], paid: true, free, addons: data.addons || [], addonLayers: data.addonLayers || [] }, versus ? { versus } : {}));
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ error: "Use POST." });
    return;
  }
  await runReview(req, res, async () => requestPlace(req));
});

// The account page opens a base review with ?vs= another saved review: the pair, from the stored reports.
async function versusFrom(base, opening, proof) {
  const vs = reviewCompare.cleanId(opening.vs);
  if (!vs || vs === base.id) return null;
  try {
    const snap = await getFirestore().collection("url_reviews").doc(vs).get();
    if (!snap.exists) return null;
    const other = Object.assign({ id: vs }, snap.data() || {});
    const free = other.free === true || await hasFreeRuns(other.email);
    const access = await reviewAuth.reportAccess(reviewAuth.firestoreStore(getFirestore()), proof, other, free);
    const made = reviewCompare.savedComparison([base, other], base.email, [base.id, vs], (row) => row === base || access.ok);
    return (made.list && made.list[0] && made.list[0].compare) || null;
  } catch (error) {
    console.error("Saved comparison failed for " + base.id + " vs " + vs + ":", error);
    return null;
  }
}

async function comparisonsFrom(id, email) {
  try {
    const snap = await getFirestore().collection("url_reviews")
      .where("compareWith", "==", id)
      .select("email", "createdAt", "compareWith", "report.id", "report.host", "report.compare.ownId", "report.compare.ownHost", "report.compare.rivalHost", "report.compare.overall", "report.compare.dominance")
      .limit(40)
      .get();
    return reviewCompare.comparisonsOf(snap.docs.map((doc) => Object.assign({ id: doc.id }, doc.data())), id, email);
  } catch (error) {
    console.error("Comparisons of a report failed:", error);
    return [];
  }
}

function requestPlace(req) {
  return {
    country: req.get("x-appengine-country") || "",
    region: req.get("x-appengine-region") || "",
    city: req.get("x-appengine-city") || ""
  };
}

async function storedPlace(runId) {
  if (!runId) return {};
  try {
    const snap = await getFirestore().collection("url_review_places").doc(runId).get();
    const data = snap.exists ? snap.data() || {} : {};
    return { country: data.country || "", region: data.region || "", city: data.city || "" };
  } catch (error) {
    console.error("URL review place read failed:", error);
    return {};
  }
}

// spentBy on a run-credit row marks it taken by a run; a failed run clears it with the credit's return.
async function lockCredit(creditId, runId) {
  const db = getFirestore();
  const ref = db.collection("url_reviews").doc(creditId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.get("spentBy")) return false;
    tx.update(ref, { spentBy: String(runId || "run"), spentAt: new Date().toISOString() });
    return true;
  });
}

async function unlockCredit(creditId) {
  try {
    await getFirestore().collection("url_reviews").doc(creditId).update({ spentBy: FieldValue.delete(), spentAt: FieldValue.delete() });
  } catch (error) {
    console.error("Credit unlock failed:", error);
  }
}

async function runReview(req, res, placeOf) {
  const signedIn = await reviewAuth.checkSession(reviewAuth.firestoreStore(getFirestore()), req.body || {});
  if (!signedIn.ok) {
    res.status(signedIn.status).json({ error: signedIn.error, signIn: true });
    return;
  }
  req.body.email = signedIn.email;
  const hintedDevice = String((req.body && req.body.deviceId) || "").replace(/[^a-f0-9]/g, "").slice(0, 32);
  const free = await hasFreeRuns(req.body && req.body.email);
  const intake = await urlReview.screenIntake(req.body || {}, req.headers, { trusted: free });
  if (!intake.ok) {
    res.status(intake.status || 400).json({ error: intake.error, fields: intake.fields || [] });
    return;
  }
  let base = null;
  if (intake.value.compareWith) {
    const baseSnap = await getFirestore().collection("url_reviews").doc(intake.value.compareWith).get();
    base = baseSnap.exists ? baseSnap.data() : null;
    const refused = reviewCompare.baseProblem(base, signedIn.email, intake.value.url);
    if (refused) {
      res.status(400).json({ error: refused, compare: true });
      return;
    }
  }
  const deviceId = String(intake.value.deviceId || hintedDevice).replace(/[^a-f0-9]/g, "").slice(0, 32);
  const ip = req.ip || "";
  const priorRows = free ? [] : await reviewRowsFor(deviceId, ip);
  const testRun = urlReview.testKeyMatches(req.body && req.body.testKey, process.env.QA_TEST_KEY);
  let decision = free
    ? { ok: true }
    : urlReview.judgeAttempts(priorRows, { deviceId, ip }, Object.assign({}, intake.value, { test: testRun }));
  // Competitors run side by side, so two runs can pick the same credit from the same rows: the first to
  // lock it spends it, and the other judges again without it.
  const takenCredits = [];
  let lockedCredit = "";
  while (!free && decision.ok && decision.consumeId && !decision.pass) {
    if (await lockCredit(decision.consumeId, req.body && req.body.runId)) {
      lockedCredit = decision.consumeId;
      break;
    }
    takenCredits.push({ status: "run-credit-used", creditId: decision.consumeId, deviceId, ip });
    decision = urlReview.judgeAttempts(priorRows.concat(takenCredits), { deviceId, ip }, Object.assign({}, intake.value, { test: testRun }));
  }
  // A credit bought for exactly this run is spent first; otherwise an open pass with a run left carries it.
  if (!free && !decision.consumeId && decision.code !== "stopped" && decision.code !== "invalid") {
    const onPass = await passDecision(signedIn.email, intake.value);
    if (onPass) decision = onPass;
  }
  if (!decision.ok && decision.code === "payment" && !decision.pass) {
    const deal = await returnPrice({ usd: decision.priceUsd, count: decision.count, billing: decision.billing }, {
      purpose: "new-run",
      rows: priorRows,
      coupon: req.body && req.body.coupon
    });
    Object.assign(decision, { priceUsd: deal.usd }, dealFields(deal));
  }
  if (!decision.ok) {
    const denied = {
      createdAt: new Date().toISOString(),
      expireAt: new Date(Date.now() + urlReview.RETAIN_MS),
      status: decision.code === "payment" ? "payment-due" : "blocked",
      deviceId,
      ip,
      signInProvider: signedIn.provider,
      name: intake.value.name,
      email: intake.value.email,
      reason: intake.value.reason,
      requestedUrl: intake.value.url,
      clientUrl: intake.value.clientUrl,
      log: [{ at: new Date().toISOString(), text: decision.message }]
    };
    await getFirestore().collection("url_reviews").add(denied);
    await rememberReview(denied.status === "payment-due" ? "payment-due" : "blocked", denied);
    await mailReviewedSites(ip, denied);
    res.status(decision.code === "payment" ? 402 : 429).json({
      error: decision.message,
      paymentRequired: decision.code === "payment",
      purpose: decision.code === "payment" ? "new-run" : "",
      priceUsd: decision.priceUsd || 0,
      frameworks: decision.frameworks || [],
      tools: decision.tools || [],
      pass: decision.pass || "",
      runsLeft: decision.runsLeft,
      pages: decision.pages,
      depth: decision.depth,
      billing: decision.billing || "",
      listUsd: decision.listUsd,
      percent: decision.percent || 0,
      discountSource: decision.discountSource || "",
      coupon: decision.coupon || "",
      frameworkUsd: decision.frameworkUsd,
      scopeUsd: decision.scopeUsd,
      pageUsd: decision.pageUsd,
      depthUsd: decision.depthUsd
    });
    return;
  }
  const claim = await reviewAuth.claimRun(reviewAuth.firestoreStore(getFirestore()), {
    runId: req.body && req.body.runId,
    email: signedIn.email,
    deviceKey: req.body && req.body.deviceKey
  });
  if (!claim.ok) {
    if (decision.pass) await giveBackPassRun(decision.pass.id, decision.consumeId);
    if (lockedCredit) await unlockCredit(lockedCredit);
    res.status(claim.status).json({ error: claim.error });
    return;
  }
  let usedCredit = null;
  if (decision.consumeId) {
    usedCredit = await getFirestore().collection("url_reviews").add({
      status: "run-credit-used",
      creditId: decision.consumeId,
      deviceId,
      email: String(signedIn.email || "").trim().toLowerCase(),
      runId: claim.runId || "",
      ...(decision.pass ? { passId: decision.pass.id } : {}),
      createdAt: new Date().toISOString(),
      expireAt: urlReview.paymentExpireAt()
    });
    await rememberReview("credit", { status: "run-credit-used", deviceId, creditId: decision.consumeId });
  }
  const runId = claim.runId;
  let stopped = false;
  const stopTimer = runId ? setInterval(async () => {
    try {
      const snap = await getFirestore().collection("url_review_stops").doc(runId).get();
      if (snap.exists && snap.get("stopped") === true) stopped = true;
    } catch (error) {
      console.error("URL review stop check failed:", error);
    }
  }, 800) : null;
  res.on("close", () => {
    if (!res.writableEnded) stopped = true;
  });
  res.status(200);
  res.set("Content-Type", "application/x-ndjson; charset=utf-8");
  const runStarted = Date.now();
  const runLines = [];
  const writeLine = (payload) => {
    if (payload.type === "log" && runLines.length < 5000) runLines.push({ t: Date.now() - runStarted, text: payload.text });
    if (!res.writableEnded) res.write(JSON.stringify(payload) + "\n");
  };
  const saveRunLog = async (kind, error) => {
    try {
      const record = reviewFailures.failureRecord(Object.assign({}, intake.value, { kind, runId, error, lines: runLines, startedAt: runStarted, endedAt: Date.now() }));
      const col = getFirestore().collection("url_review_failures");
      await (runId ? col.doc(runId) : col.doc()).set(record);
    } catch (saveError) {
      console.error("URL review log save failed:", saveError);
    }
  };
  try {
    await rememberReview("started", {
      runId,
      name: intake.value.name,
      email: intake.value.email,
      requestedUrl: intake.value.url,
      status: "running",
      frameworks: intake.value.frameworks,
      pages: intake.value.pages,
      depth: intake.value.depth,
      reason: intake.value.reason
    });
    if (decision.pass) writeLine({ type: "log", text: "This run uses your " + decision.pass.name + " pass: " + decision.pass.left + (decision.pass.left === 1 ? " run" : " runs") + " left after it." });
    const asked = (() => { try { return urlReview.registryDomain(new URL(intake.value.url).hostname); } catch (error) { return ""; } })();
    const ranksPromise = base ? reviewMarket.trancoRanks([urlReview.registryDomain(base.report.host), asked]).catch(() => []) : null;
    const report = await urlReview.reviewTarget(intake.value.url, {
      log: (text) => writeLine({ type: "log", text }),
      stopped: () => stopped,
      asker: { reasonCode: intake.value.reasonCode, email: intake.value.email, proofs: await ownerProofRows(intake.value.email), siteToken: siteTokenFor(intake.value.email) },
      maxPages: intake.value.pages,
      maxDepth: intake.value.depth,
      pageLang: intake.value.pageLang,
      section: intake.value.section,
      passive: !!intake.value.compareWith,
      browse: browseForReview,
      pagespeed: process.env.PAGESPEED_KEY ? (url) => urlReview.pageSpeed(url, process.env.PAGESPEED_KEY) : undefined,
      crux: process.env.CRUX_KEY || process.env.PAGESPEED_KEY ? (url) => urlReview.cruxHistory(url, process.env.CRUX_KEY || process.env.PAGESPEED_KEY) : undefined,
      webrisk: process.env.WEBRISK_KEY ? (url) => urlReview.webRisk(url, process.env.WEBRISK_KEY) : undefined
    });
    const record = urlReview.intakeRecord(intake.value, report, Object.assign({
      ip,
      deviceId,
      creditId: decision.consumeId || "",
      userAgent: req.get("user-agent"),
      acceptLanguage: req.get("accept-language")
    }, await placeOf(runId)));
    record.signInProvider = signedIn.provider;
    if (testRun) record.test = true;
    if (free) Object.assign(record, { paid: true, free: true, priceUsd: 0 });
    if (decision.pass) {
      Object.assign(record, { paid: true, priceUsd: decision.pass.extrasUsd, passId: decision.pass.id, passPlan: decision.pass.plan });
      if (reviewOffers.passAddons(decision.pass.plan).length) record.addons = reviewOffers.passAddons(decision.pass.plan);
    }
    if (report.ownerProof && report.ownerProof.checked) {
      try {
        await rememberSiteProof(intake.value.email, report.ownerProof.host, report.ownerProof.how);
      } catch (error) {
        console.error("Site verification save failed:", error);
      }
    }
    writeLine({ type: "log", text: "Looking for your earlier reviews of " + report.host + "." });
    const history = await previousRun(intake.value.email, report);
    if (history) {
      report.history = history;
      writeLine({ type: "log", text: "Compared with your review of " + report.host + " from " + String(history.previousAt).slice(0, 10) + ": " + history.fixedCount + " fixed, " + history.freshCount + " new." });
    } else writeLine({ type: "log", text: "No earlier review of " + report.host + " under this email." });
    if (base) {
      writeLine({ type: "log", text: "Reading the Tranco ranks and your score history for both sites." });
      let [ownRank, rivalRank] = await ranksPromise;
      if (urlReview.registryDomain(report.host) !== asked) rivalRank = await reviewMarket.trancoRank(urlReview.registryDomain(report.host));
      const trail = await scoreTrail(intake.value.email, base.report.host, report);
      report.compare = reviewCompare.compareSites(Object.assign({ id: intake.value.compareWith }, base.report), report, { ranks: { own: ownRank, rival: rivalRank }, trail });
      if (report.compare) {
        const rankLine = (host, side) => host + (side.rank ? " is #" + side.rank.toLocaleString("en-US") + " on Tranco" : " is outside the Tranco top million") + (side.score == null ? "" : ", presence " + side.score + "/100");
        writeLine({ type: "log", text: "Compared with your review of " + base.report.host + ": " + report.compare.rivalOnlyCount + " open problems only " + report.host + " has, " + report.compare.ownOnlyCount + " only " + base.report.host + " has, " + report.compare.shared + " both have." });
        writeLine({ type: "log", text: "Market presence: " + rankLine(base.report.host, report.compare.market.own) + "; " + rankLine(report.host, report.compare.market.rival) + "." });
      }
    }
    writeLine({ type: "log", text: "Saving the report." });
    await getFirestore().collection("url_reviews").doc(report.id).set(record);
    await countReviewed(report);
    await rememberReview(record.status === "stopped" ? "stopped" : "report", record);
    if (record.status === "stopped") await saveRunLog("stopped");
    await mailReviewedSites(ip, record);
    if (record.report && record.report.compare) await mailComparison(compareMail.runNotice(record));
    writeLine({ type: "log", text: "Report saved. Emailing a copy to " + intake.value.email + "." });
    writeLine({ type: "done", report, frameworks: record.frameworks, paid: record.paid === true, free: record.free === true, priceUsd: record.priceUsd });
    try {
      await mailReportToAsker(record);
    } catch (error) {
      console.error("Report mail to the asker failed:", error);
    }
    try {
      await queueOwnerNotice(record);
    } catch (error) {
      console.error("Owner notice queue failed:", error);
    }
    res.end();
  } catch (error) {
    console.error("URL review failed:", error);
    const failed = {
      runId,
      name: intake.value.name,
      email: intake.value.email,
      requestedUrl: intake.value.url,
      clientUrl: intake.value.clientUrl,
      status: "failed",
      reason: error.message || "The review failed.",
      creditId: decision.consumeId || ""
    };
    await rememberReview("failed", failed);
    if (decision.pass) await giveBackPassRun(decision.pass.id, decision.consumeId);
    else if (usedCredit) {
      try {
        // A paid run that fails gives its credit back, so the same review can run again at no charge.
        await usedCredit.update({ status: "run-credit-returned", returnedAt: new Date().toISOString(), runId: runId || "" });
        if (lockedCredit) await unlockCredit(lockedCredit);
        await rememberReview("credit-returned", Object.assign({ deviceId, test: testRun }, failed));
      } catch (returnError) {
        console.error("Credit return failed:", returnError);
      }
    }
    await saveRunLog("failed", error);
    await mailReviewedSites(ip, failed);
    writeLine({ type: "error", error: error.message || "The review failed." });
    res.end();
  } finally {
    if (stopTimer) clearInterval(stopTimer);
    if (runId) getFirestore().collection("url_review_stops").doc(runId).delete().catch(() => {});
    if (runId) getFirestore().collection("url_review_places").doc(runId).delete().catch(() => {});
  }
}

// 1st gen holds a response until the handler returns, so the run stream is served from 2nd gen.
exports.reviewRun = require("firebase-functions/v2/https").onRequest({
  memory: "512MiB",
  timeoutSeconds: 180,
  concurrency: 1,
  maxInstances: 10,
  secrets: SECRETS.reviewRun
}, async (req, res) => {
  reviewHeaders(req, res);
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }
  if (req.method !== "POST" || !String(req.path || "/").endsWith("/review")) {
    res.status(405).json({ error: "Use POST /review." });
    return;
  }
  await runReview(req, res, storedPlace);
});

async function reviewTotals() {
  const ref = getFirestore().collection("url_review_stats").doc("totals");
  const snap = await ref.get();
  if (snap.exists) return snap.data();
  const done = getFirestore().collection("url_reviews").where("report.limits.pagesRead", ">", 0);
  const sums = (await done.aggregate({
    pages: AggregateField.sum("report.limits.pagesRead"),
    reviews: AggregateField.count()
  }).get()).data();
  const seeded = { pages: Number(sums.pages) || 0, reviews: Number(sums.reviews) || 0 };
  try {
    await ref.create(Object.assign({ seededAt: FieldValue.serverTimestamp() }, seeded));
  } catch (error) {
    if (error.code !== 6) throw error;
    return (await ref.get()).data();
  }
  return seeded;
}

async function countReviewed(report) {
  const pages = Number(report && report.limits && report.limits.pagesRead) || 0;
  if (!pages) return;
  try {
    const ref = getFirestore().collection("url_review_stats").doc("totals");
    if (!(await ref.get()).exists) {
      await reviewTotals();
      return;
    }
    await ref.set({
      pages: FieldValue.increment(pages),
      reviews: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
  } catch (error) {
    console.error("Review totals update failed:", error);
  }
}

async function previousRun(email, report) {
  if (!email || !report || !report.host || !report.insights) return null;
  try {
    const snap = await getFirestore().collection("url_reviews")
      .where("email", "==", email)
      .select("createdAt", "status", "report.id", "report.host", "report.fetchedAt", "report.insights.score", "report.insights.findings")
      .limit(60)
      .get();
    const rows = snap.docs.map((doc) => doc.data())
      .filter((row) => row.report && row.report.host === report.host && row.report.id !== report.id && row.report.insights && row.status !== "stopped")
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    return rows.length ? urlReview.compareRuns(rows[0].report, report) : null;
  } catch (error) {
    console.error("URL review history failed:", error);
    return null;
  }
}

// The overall score of every finished review of either host under this email, oldest first, with this run last.
async function scoreTrail(email, ownHost, report) {
  const trail = { own: [], rival: [] };
  try {
    const snap = await getFirestore().collection("url_reviews")
      .where("email", "==", email)
      .select("createdAt", "status", "report.id", "report.host", "report.fetchedAt", "report.insights.score.overall")
      .limit(120)
      .get();
    snap.docs.map((doc) => doc.data())
      .filter((row) => row.report && row.report.id !== report.id && row.status !== "stopped" && row.report.insights && row.report.insights.score)
      .sort((a, b) => String(a.report.fetchedAt || a.createdAt).localeCompare(String(b.report.fetchedAt || b.createdAt)))
      .forEach((row) => {
        const side = row.report.host === ownHost ? trail.own : row.report.host === report.host ? trail.rival : null;
        if (side) side.push({ at: row.report.fetchedAt || row.createdAt, overall: row.report.insights.score.overall });
      });
  } catch (error) {
    console.error("URL review score trail failed:", error);
  }
  if (report.insights && report.insights.score) trail.rival.push({ at: report.fetchedAt, overall: report.insights.score.overall });
  return trail;
}

exports.reviewBrowser = require("firebase-functions/v2/https").onRequest({
  region: "europe-west1",
  memory: "4GiB",
  cpu: 4,
  concurrency: 1,
  maxInstances: 6,
  timeoutSeconds: 120,
  secrets: SECRETS.reviewBrowser,
  // Renders untrusted pages, so it runs as an account whose only grant is secretAccessor on BROWSER_KEY.
  serviceAccount: "review-browser@carlosm-interactive-cv.iam.gserviceaccount.com"
}, async (req, res) => {
  const key = process.env.BROWSER_KEY || "";
  const given = String(req.get("x-review-key") || "");
  const crypto = require("crypto");
  if (req.method !== "POST" || !key || given.length !== key.length || !crypto.timingSafeEqual(Buffer.from(given), Buffer.from(key))) {
    res.status(403).json({ ok: false, error: "Not allowed." });
    return;
  }
  const job = req.body || {};
  const stream = job.stream === true && job.kind !== "pdf";
  const line = (payload) => { if (!res.writableEnded) res.write(JSON.stringify(payload) + "\n"); };
  if (stream) {
    res.status(200);
    res.set("Content-Type", "application/x-ndjson; charset=utf-8");
  }
  try {
    const browserJob = require("./url-review-browser");
    const result = job.kind === "pdf"
      ? await browserJob.printPdf(job.html)
      : await browserJob.browse(job, stream ? (text) => line({ type: "log", text }) : null, stream ? (start) => line({ type: "start", start }) : null);
    if (stream) {
      line({ type: "done", result });
      res.end();
    } else res.status(200).json(result);
  } catch (error) {
    console.error("Browser pass failed:", error);
    const failed = { ok: false, error: String((error && error.message) || "browser error").slice(0, 120) };
    if (stream) {
      line({ type: "done", result: failed });
      res.end();
    } else res.status(200).json(failed);
  }
});

// Admin Statistics (js/admin-jarvis.js): server-only numbers, external sources, and owner actions. See functions/jarvis.js.
const jarvis = require("./jarvis");
const jarvisCore = require("./jarvis-core");
const jarvisSum = (field) => AggregateField.sum(field);
const jarvisSources = require("./jarvis-sources");
const jarvisPush = require("./jarvis-push");
const jarvisReview = require("./jarvis-review");
const jarvisNotify = require("./jarvis-notify");
const jarvisMailPush = require("./jarvis-mail-push");
const jarvisWebPush = require("./jarvis-webpush");

// A push failure is logged and never stops the owner email it mirrors.
async function pushOwner(msg) {
  if (!msg) return null;
  try {
    const db = getFirestore();
    return await jarvisPush.send(getMessaging(), db, await jarvisPush.targets(db, msg.kind), msg);
  } catch (error) {
    console.error("Jarvis push failed:", error && error.message);
    return null;
  }
}
const jarvisSocial = require("./jarvis-social");
const jarvisMarketing = require("./jarvis-marketing");

async function socialProposals() {
  const res = await fetch(customerMail.SITE + "/assets/social/proposals.json?t=" + Date.now(), { cache: "no-store", signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error("The proposals list answered " + res.status + ".");
  return res.json();
}

async function jarvisSocialDecide(id, decision, now) {
  const proposal = ((await socialProposals()).proposals || []).find((p) => p && p.id === String(id || ""));
  if (!proposal) throw new Error("That proposal is no longer in the list.");
  const ref = getFirestore().collection("socialHub").doc("live");
  const today = new Date(now - 5 * 3600 * 1000).toISOString().slice(0, 10);
  await getFirestore().runTransaction(async (tx) => {
    const next = jarvisSocial.decide(jarvisSocial.state((await tx.get(ref)).data()), proposal, decision, today);
    tx.set(ref, { json: JSON.stringify(next), updatedAt: FieldValue.serverTimestamp() });
  });
  return { id: proposal.id, decision };
}

// Hourly: each social post Jarvis newly proposes pushes with Post and Skip, at most 3 an hour (#1670).
async function jarvisSocialRun() {
  const db = getFirestore();
  const ref = db.collection("jarvis_watch").doc("social");
  const [state, book, live] = await Promise.all([ref.get(), socialProposals(), db.collection("socialHub").doc("live").get()]);
  const pending = jarvisSocial.pending(book.proposals, jarvisSocial.state(live.data()));
  const fresh = jarvisMailPush.socialDue(pending, state.exists ? state.data().seen : null, 3);
  for (const p of fresh) await pushOwner(jarvisMailPush.socialMessage(p));
  const seen = Array.from(new Set(((state.exists && state.data().seen) || []).concat(state.exists ? fresh.map((p) => p.id) : pending.map((p) => p.id)))).slice(-300);
  await ref.set({ seen, at: new Date().toISOString() });
  return fresh.length + " social pushed";
}

// A notification button (#1670): ref names the thing, act what to do with it. Returns the line the notification shows after.
async function jarvisNotifyAct(body, by) {
  const db = getFirestore();
  const now = Date.now();
  const { type, id, act } = jarvisMailPush.parseAct(body.ref, body.act);
  if (type === "message" || type === "rating") {
    const text = String(body.text || "").trim().slice(0, 5000);
    if (text.length < 10) throw new Error("A reply needs at least 10 characters.");
    const ref = db.collection(type === "message" ? "messages" : "ratings").doc(id);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error("That " + type + " is gone.");
      if (snap.get("response")) throw new Error("It already has a reply.");
      tx.update(ref, { response: text, respondedAt: FieldValue.serverTimestamp(), isPublicResponse: false });
    });
    return { message: "Reply sent." };
  }
  if (type === "owner-reply") {
    const ref = db.collection("url_review_owner_replies").doc(id.replace(/[^a-f0-9]/g, "").slice(0, 32) || "-");
    const snap = await ref.get();
    if (!snap.exists) throw new Error("That reply is gone.");
    const row = snap.data();
    const out = await decideOwnerReply(ref, row, act, act === "resend" ? jarvisMailPush.proposedAddress(row) : "");
    if (out.conflict) throw new Error("This reply was already decided.");
    if (!out.saved) throw new Error(out.problem);
    return { message: out.problem || { resend: "Sent to " + out.row.decidedEmail + ".", stop: "Stopped.", unlist: "Unlisted.", done: "Marked done." }[act] };
  }
  if (type === "rerun-held") {
    if (act === "send-all") {
      const out = await jarvisClickAction({ action: "rerun-held" }, by);
      return { message: out.done + " sent" + (out.failed ? ", " + out.failed + " failed" : "") + (out.left ? ", " + out.left + " left" : "") + "." };
    }
    let dropped = 0;
    for (const h of await jarvisHeld()) if (await releaseHeldRerun(h.id, false, by)) dropped += 1;
    return { message: dropped + " dropped." };
  }
  if (type === "ops") {
    const known = new Set(ops.JOBS.filter((row) => row.host !== "github").map((row) => row.job));
    const jobs = id.split(",").filter((job) => known.has(job));
    if (!jobs.length) throw new Error("None of those jobs can be started from here.");
    for (const job of jobs) await jarvisClickAction({ action: "run-job", job }, by);
    return { message: "Started " + jobs.join(", ") + "." };
  }
  if (type === "proposal") {
    await jarvisProposals.mark(db, { key: id, status: act }, by, now);
    return { message: act === "done" ? "Marked done." : "Dismissed." };
  }
  if (type === "notice") {
    const out = await decideOwnerNotice(id, act === "send", "", by);
    if (out.error) throw new Error(out.error);
    return { message: out.status === "sent" ? "Sent to " + out.email + "." : "Skipped." };
  }
  await jarvisSocialDecide(id, act, now);
  return { message: act === "approved" ? "Added to the hub queue." : "Skipped." };
}

// The latest run of each posting workflow, for the Social hub panel.
async function socialRuns() {
  const token = await githubApp.token();
  if (!token) return [];
  return Promise.all(jarvisSocial.WORKFLOWS.map(async (w) => {
    const run = ((await githubGet("/repos/" + BUG_REPO + "/actions/workflows/" + w.file + "/runs?per_page=1", token).catch(() => ({}))).workflow_runs || [])[0];
    return { name: w.name, file: w.file, status: run ? run.status : "", conclusion: run ? run.conclusion || "" : "", event: run ? run.event : "", at: run ? run.created_at : "", url: run ? run.html_url : "" };
  }));
}
const jarvisShare = require("./jarvis-share");
const SHARE_BUCKET = "carlosm-interactive-cv.firebasestorage.app";
const SHARE_WORKFLOW = "social-inbox.yml";

// The uploaded file, checked against the inbox path and the media types the workflow can render.
async function shareMedia(path) {
  const clean = jarvisShare.inboxPath(path);
  if (!clean) throw new Error("Upload the media to social-inbox/ first.");
  const file = getStorage().bucket(SHARE_BUCKET).file(clean);
  const [exists] = await file.exists();
  if (!exists) throw new Error("The upload is not in storage yet; try again.");
  const [meta] = await file.getMetadata();
  const kind = jarvisShare.mediaKind(meta.contentType);
  if (!kind) throw new Error("Share a JPG, PNG or WebP photo, or an MP4, MOV or WebM video.");
  return { file, meta, kind, path: clean };
}

async function shareDraft(body) {
  const media = await shareMedia(body.path);
  const caption = String(body.caption || "").trim().slice(0, 3000);
  if (!caption) throw new Error("Write a caption first; Jarvis drafts the posts from it.");
  let text = "";
  try { text = await jarvis.gemini(fetch, process.env, jarvisShare.draftPrompt(caption, media.kind === "video"), 2400); } catch (error) { text = ""; }
  const draft = jarvisShare.cleanDraft(text, caption, media.kind === "video");
  const ref = getFirestore().collection("social_inbox").doc();
  await ref.set({ path: media.path, kind: media.kind, contentType: media.meta.contentType, size: Number(media.meta.size) || 0, caption, draft,
    gemini: !!text, status: "draft", createdAt: FieldValue.serverTimestamp() });
  return { id: ref.id, kind: media.kind, draft, note: text ? "" : "Gemini did not answer, so every post starts from your caption." };
}

async function shareQueue(body) {
  const token = await githubApp.token();
  if (!token) throw new Error("No GitHub token is set (GITHUB_APP_ID in functions/.env with GITHUB_APP_PRIVATE_KEY in Secret Manager), so Jarvis cannot start the post workflow.");
  const ref = getFirestore().collection("social_inbox").doc(String(body.id || "x"));
  const snap = await ref.get();
  if (!snap.exists) throw new Error("That draft is gone.");
  const doc = snap.data();
  if (doc.status !== "draft") throw new Error("That post is already " + doc.status + ".");
  const media = await shareMedia(doc.path);
  const video = media.kind === "video";
  const draft = jarvisShare.cleanDraft(Object.assign({}, doc.draft, body.draft && typeof body.draft === "object" ? body.draft : {}), doc.caption, video);
  const tokenId = (media.meta.metadata || {}).firebaseStorageDownloadTokens || crypto.randomUUID();
  await media.file.setMetadata({ metadata: { firebaseStorageDownloadTokens: tokenId } });
  const url = "https://firebasestorage.googleapis.com/v0/b/" + SHARE_BUCKET + "/o/" + encodeURIComponent(media.path) + "?alt=media&token=" + tokenId;
  await github("/repos/" + BUG_REPO + "/actions/workflows/" + SHARE_WORKFLOW + "/dispatches",
    { ref: "main", inputs: { id: ref.id, media_url: url, media_type: media.kind, entry: JSON.stringify(draft) } }, token);
  await ref.update({ draft, status: "queued", queuedAt: FieldValue.serverTimestamp() });
  return { id: ref.id, note: "Queued. The hub page goes live first, then Buffer and the Facebook Page post it in about 30 minutes." };
}

async function shareList() {
  const token = await githubApp.token();
  const docs = (await getFirestore().collection("social_inbox").orderBy("createdAt", "desc").limit(10).get()).docs;
  const runs = token ? ((await githubGet("/repos/" + BUG_REPO + "/actions/workflows/" + SHARE_WORKFLOW + "/runs?per_page=20", token).catch(() => ({}))).workflow_runs || []) : [];
  return docs.map((d) => {
    const x = d.data();
    const run = runs.find((r) => String(r.display_title || "").includes(d.id));
    const at = x.createdAt && x.createdAt.toDate ? x.createdAt.toDate().toISOString() : "";
    const status = x.status === "queued" && run ? (run.status !== "completed" ? "posting" : run.conclusion === "success" ? "posted" : "failed") : x.status;
    return { id: d.id, kind: x.kind, caption: x.caption, title: (x.draft || {}).title || "", status, at, url: run ? run.html_url : "", draft: x.status === "draft" ? x.draft : undefined };
  });
}

async function shareDrop(body) {
  const ref = getFirestore().collection("social_inbox").doc(String(body.id || "x"));
  const snap = await ref.get();
  if (!snap.exists) return { dropped: false };
  if (snap.data().status !== "draft") throw new Error("Only a draft can be dropped; this one is already queued.");
  const path = jarvisShare.inboxPath(snap.data().path);
  if (path) await getStorage().bucket(SHARE_BUCKET).file(path).delete({ ignoreNotFound: true });
  await ref.delete();
  return { dropped: true };
}

const jarvisProposals = require("./jarvis-proposals");
const jarvisActions = require("./jarvis-actions");
const jarvisDigest = require("./jarvis-digest");

// A URL shared to the Jarvis app: the owner's own review, run like a sweep review and pushed to the phone that asked.
exports.jarvisReviewRun = functions.runWith({ timeoutSeconds: 540, memory: "1GB", secrets: SECRETS.jarvisReviewRun }).firestore.document("jarvis_reviews/{id}").onCreate(async (snap) => {
  const row = snap.data() || {};
  const db = getFirestore();
  const tokens = row.token ? [row.token] : await jarvisPush.targets(db, "alerts");
  const startedAt = Date.now();
  await snap.ref.update({ status: "running", startedAt: new Date(startedAt).toISOString() });
  try {
    const value = jarvisReview.intake(row);
    const report = await urlReview.reviewTarget(value.url, {
      mentions: false,
      log: () => {},
      stopped: () => Date.now() - startedAt > jarvisReview.LIMIT_MS,
      asker: { reasonCode: value.reasonCode, email: value.email, proofs: await ownerProofRows(value.email), siteToken: siteTokenFor(value.email) },
      browse: browseForReview,
      pagespeed: process.env.PAGESPEED_KEY ? (page) => urlReview.pageSpeed(page, process.env.PAGESPEED_KEY) : undefined,
      crux: process.env.CRUX_KEY || process.env.PAGESPEED_KEY ? (page) => urlReview.cruxHistory(page, process.env.CRUX_KEY || process.env.PAGESPEED_KEY) : undefined,
      webrisk: process.env.WEBRISK_KEY ? (page) => urlReview.webRisk(page, process.env.WEBRISK_KEY) : undefined
    });
    const record = Object.assign(urlReview.intakeRecord(value, report, {}), { source: "jarvis", paid: true, free: true, priceUsd: 0 });
    await db.collection("url_reviews").doc(record.id).set(record);
    await countReviewed(record.report);
    const linkUrl = new URL(customerMail.pageUrl(value.lang, { report: record.id }));
    linkUrl.searchParams.set("utm_source", "jarvis");
    linkUrl.searchParams.set("utm_medium", "push");
    const link = linkUrl.toString();
    const push = await jarvisPush.send(getMessaging(), db, tokens, jarvisReview.doneMessage(report, link));
    const score = report.insights && report.insights.score ? report.insights.score.overall : null;
    await snap.ref.update({ status: "done", reportId: record.id, score: score == null ? null : score, link, push, doneAt: new Date().toISOString() });
  } catch (error) {
    const reason = String((error && error.message) || error).slice(0, 200);
    console.error("Jarvis review of " + row.url + " failed:", error);
    const push = await jarvisPush.send(getMessaging(), db, tokens, jarvisReview.failedMessage(row.url, reason)).catch(() => null);
    await snap.ref.update({ status: "failed", error: reason, push, doneAt: new Date().toISOString() });
  }
});

async function jarvisUsers() {
  const users = [];
  let page;
  do {
    const batch = await getAuth().listUsers(1000, page);
    batch.users.forEach((u) => users.push({ created: u.metadata.creationTime, lastSignIn: u.metadata.lastSignInTime }));
    page = batch.pageToken;
  } while (page && users.length < 20000);
  return users;
}

async function jarvisSource(name, days) {
  const settings = await jarvis.readSettings(getFirestore());
  const keys = paypalKeys("live");
  let paypal = null;
  try {
    const creds = urlReview.paypalCredentials(keys);
    paypal = { host: creds.host, token: () => urlReview.paypalAccessToken(creds) };
  } catch (error) { paypal = null; }
  return jarvisCached(name, days, () => jarvisSources.run(name, {
    fetch, env: process.env, db: getFirestore(), now: Date.now(), days, settings, thresholds: jarvisCore.thresholds(settings.thresholds),
    paypal, tls: jarvis.tlsDaysLeft, listUsers: jarvisUsers
  }));
}
const JARVIS_REPORTS = { site: (period) => sendPeriodReport(period), review: (period) => sendReviewPeriodReport(period) };

async function jarvisCached(op, days, load) {
  const ref = getFirestore().collection("jarvis_cache").doc(op + "-" + days);
  const snap = await ref.get().catch(() => null);
  const saved = snap && snap.exists ? snap.data() : null;
  if (saved && Date.now() - Date.parse(saved.at) < (jarvis.TTL[op] || jarvisSources.TTL[op] || 60000)) return Object.assign(JSON.parse(saved.json), { cachedAt: saved.at });
  const fresh = await load();
  const at = new Date().toISOString();
  const json = JSON.stringify(fresh);
  if (json.length < 900000) await ref.set({ at, json }).catch(() => null);
  return Object.assign(fresh, { cachedAt: at });
}

// The external numbers the daily briefing and the watch need, through the same cache as the page.
async function jarvisExternal(ops, days) {
  const env = process.env;
  const now = Date.now();
  const load = {
    health: () => jarvisCached("health", days, () => jarvis.health(getFirestore(), { days, now })),
    jobs: () => jarvisCached("jobs", 0, async () => ({ ok: true, jobs: await jarvis.jobs(fetch) })),
    github: () => jarvisCached("github", 0, async () => jarvis.github(fetch, await githubApp.token(), { now })),
    uptime: () => jarvisCached("uptime", 0, () => jarvis.uptime(fetch, { now })),
    speed: () => jarvisCached("speed", 0, () => jarvis.speed(urlReview, env)),
    ga4: () => jarvisCached("ga4", days, () => jarvis.ga4(fetch, { days })),
    cloudflare: () => jarvisCached("cloudflare", days, () => jarvis.cloudflare(fetch, env, { days, now })),
    ...Object.keys(jarvisSources.SOURCES).reduce((m, name) => { m[name] = () => jarvisSource(name, days); return m; }, {})
  };
  const out = {};
  await Promise.all(ops.map(async (op) => {
    try { out[op] = Object.assign({ ok: true }, await load[op]()); } catch (error) { out[op] = { ok: false, error: String(error.message || error).slice(0, 200) }; }
  }));
  return out;
}

async function jarvisDaily({ force }) {
  const db = getFirestore();
  const settings = await jarvis.readSettings(db);
  const phones = await jarvisPush.targets(db, "briefing");
  if (!settings.mail.daily && !force && !(await jarvisPush.anyTargets(db, "briefing"))) return "off in settings";
  const now = Date.now();
  const [{ products }, external, goalRows] = await Promise.all([
    jarvis.dailyProducts(db, { now }),
    jarvisExternal(["health", "jobs", "github", "uptime", "speed", "ga4", "money", "email", "social", "safety", "platform", "search", "outreach"], 1),
    jarvis.goals(db, settings, { now, sum: jarvisSum })
  ]);
  const items = jarvisCore.briefing({ products, external, thresholds: settings.thresholds, goals: goalRows });
  let aiText = "";
  const [ranked] = await Promise.all([
    jarvisRanked({ state: { products, external, thresholds: settings.thresholds, goals: goalRows }, items, days: 1, useGemini: settings.mail.gemini }).catch(() => null),
    settings.mail.gemini ? jarvis.brief(fetch, process.env, { range: "last 24 hours", products: jarvis.compact(products), briefing: items.map((row) => row.level + ": " + row.text), goals: goalRows }).then((out) => { aiText = out.text; }).catch(() => null) : null
  ]);
  const dateLabel = new Date(now).toLocaleDateString("en-US", { timeZone: "America/Bogota", weekday: "short", month: "short", day: "numeric" });
  const mail = jarvis.dailyMail({ products, items, goalRows, aiText, dateLabel });
  const proposalLines = jarvisProposals.mailLines(ranked && ranked.proposals);
  if (proposalLines.length) mail.body = ("Proposals, by impact:\n" + proposalLines.join("\n") + "\n\n" + mail.body).slice(0, 12000);
  const actionLines = jarvisActions.briefLines(await jarvisActions.recent(db, 200), now);
  if (actionLines.length) mail.body = (actionLines.join("\n") + "\n\n" + mail.body).slice(0, 12000);
  const sent = settings.mail.daily || force ? await sendOwnerEmail({ subject: mail.subject, intro: mail.intro, rows: mail.rows, body: mail.body, eyebrow: "Jarvis", respondUrl: jarvis.ADMIN_URL, buttonLabel: "Open Jarvis" }) : false;
  const push = await jarvisPush.send(getMessaging(), db, phones, jarvisPush.briefingMessage({ items, aiText, dateLabel, top: ranked && ranked.proposals && ranked.proposals[0] })).catch((error) => ({ error: String(error.message || error).slice(0, 200) }));
  return { sent: sent !== false, push, items: items.length, goals: goalRows.length, gemini: !!aiText, proposals: proposalLines.length };
}

// Rule proposals (or the page's own, as candidates) ranked by Gemini unless useGemini is off; Done and Dismissed ones stay out.
async function jarvisRanked({ state, items, days, candidates, snapshot, useGemini }) {
  const list = candidates || jarvisCore.proposalRules(state, items);
  const snap = snapshot || jarvis.askSnapshot(Object.assign({}, state, { briefing: items || [] }), days);
  return jarvisProposals.rank({
    candidates: list, snapshot: snap, savedRows: await jarvisProposals.saved(getFirestore()), now: Date.now(),
    gemini: useGemini ? (prompt, maxTokens) => jarvis.gemini(fetch, process.env, prompt, maxTokens) : null
  });
}

const JARVIS_OPS = ["health", "jobs", "github", "uptime", "speed", "ga4", "money", "email", "social", "safety", "platform", "search", "outreach"];

// Sunday 19:00 Bogotá: four weeks side by side, this week's proposals and Gemini's strategy for the next one.
async function jarvisWeekly({ force }) {
  const db = getFirestore();
  const settings = await jarvis.readSettings(db);
  if (!settings.mail.weekly && !force) return "off in settings";
  const now = Date.now();
  const weeks = jarvisProposals.weekWindows(now);
  const [{ products }, external, goalRows, money, email, social, search] = await Promise.all([
    jarvis.dailyProducts(db, { now, days: 7 }),
    jarvisExternal(JARVIS_OPS, 7),
    jarvis.goals(db, settings, { now, sum: jarvisSum }),
    jarvisSource("money", 28).catch(() => null),
    jarvisSource("email", 28).catch(() => null),
    jarvisSource("social", 28).catch(() => null),
    jarvisSources.searchConsole({ fetch, env: process.env, now, days: 28 }).catch(() => null)
  ]);
  const hist = await jarvisProposals.history({
    db, weeks, now, point: jarvisProposals.pointValues(external), sources: { money, email, social, search },
    count: (goal, start, end) => jarvis.goalValue(db, goal, start, end, jarvisSum),
    ga4: async () => jarvisProposals.ga4Weeks(fetch, await jarvis.googleToken(fetch, "https://www.googleapis.com/auth/analytics.readonly"), weeks)
  });
  const state = { products, external, thresholds: settings.thresholds, goals: goalRows };
  const items = jarvisCore.briefing(state);
  const ranked = await jarvisRanked({ state, items, days: 7, useGemini: settings.mail.gemini }).catch(() => null);
  const proposals = (ranked && ranked.proposals) || [];
  let aiText = "";
  if (settings.mail.gemini) {
    try { aiText = await jarvis.gemini(fetch, process.env, jarvisProposals.strategyPrompt(hist, proposals), 1400); } catch (error) { aiText = ""; }
  }
  const mail = jarvisProposals.weeklyMail({ hist, proposals, aiText });
  const sent = await sendOwnerEmail({ subject: mail.subject, intro: mail.intro, rows: mail.rows, body: mail.body, eyebrow: "Jarvis", respondUrl: jarvis.ADMIN_URL, buttonLabel: "Open Jarvis" });
  return { sent: sent !== false, weeks: hist.weeks, proposals: proposals.length, gemini: !!aiText };
}

// Everything the stats page computes, in one answer for the Android app, which reads no Firestore itself.
async function jarvisSnapshot(days) {
  const db = getFirestore();
  const settings = await jarvis.readSettings(db);
  const now = Date.now();
  const [{ window, products, outreachVisits }, external, goalRows] = await Promise.all([
    jarvis.dailyProducts(db, { now, days }),
    jarvisExternal(["health", "jobs", "github", "uptime", "speed", "ga4", "cloudflare", "money", "email", "social", "safety", "platform", "search", "outreach", "marketing", "marketing-sync"], days),
    jarvis.goals(db, settings, { now, sum: jarvisSum })
  ]);
  const state = { products, external, thresholds: settings.thresholds, goals: goalRows };
  const briefing = jarvisCore.briefing(state).map((b) => Object.assign({ detail: jarvisCore.briefDetail(b, state) }, b));
  const proposals = jarvisCore.openProposals(jarvisCore.proposalRules({ products, external, thresholds: settings.thresholds, goals: goalRows }, briefing), await jarvisProposals.saved(db)).slice(0, 5);
  return { window, products, external, outreachVisits, goals: goalRows, briefing, proposals, readiness: jarvisCore.readiness(external), connections: jarvisCore.connections(external), settings, thresholds: jarvisCore.thresholds(settings.thresholds) };
}

// The cached snapshot keeps every line; snoozed and dismissed ones move to briefHidden on each read.
async function jarvisBriefOpen(snap) {
  const marks = await jarvisProposals.savedBrief(getFirestore());
  const { open, hidden } = jarvisCore.openBrief(snap.briefing, marks);
  const until = marks.reduce((m, r) => { m[r.key] = { status: r.status, until: r.until }; return m; }, {});
  return Object.assign({}, snap, { briefing: open, briefHidden: hidden.map((b) => Object.assign({}, b, until[b.key])) });
}

async function jarvisHeld() {
  const snap = await getFirestore().collection("url_review_reruns").where("status", "==", "held").limit(100).get();
  return snap.docs.map((doc) => ({ id: doc.id, data: doc.data() }));
}

// Pending owner notices whose last send failed, still under the tries and with the site on Live Reports.
async function jarvisFailedNotices() {
  const [pending, index] = await Promise.all([
    getFirestore().collection("url_review_owner_notices").where("status", "==", "pending").limit(300).get(),
    liveReportIndex()
  ]);
  return pending.docs.filter((doc) => { const d = doc.data(); return d.lastError && !d.unlistedAt && (d.tries || 0) < jarvisActions.NOTICE_TRIES && ownerNotice.liveCard(index, d.host); })
    .map((doc) => ({ id: doc.id, ref: doc.ref, data: doc.data() }));
}

// How many owner notices may still go out today (Bogotá day, the same budget as sendOwnerNotices).
async function jarvisNoticeBudget(now) {
  const start = jarvisCore.zoneParts(new Date(now)).day + "T05:00:00.000Z";
  const sent = (await getFirestore().collection("url_review_owner_notice_log").where("sentAt", ">=", start).count().get()).data().count;
  return Math.max(0, ops.budget("ownerNoticesPerDay", process.env) - sent);
}

function jarvisActionOps(settings, now) {
  const th = jarvisCore.thresholds((settings || {}).thresholds);
  return {
    held: jarvisHeld,
    release: (id, by) => releaseHeldRerun(id, true, by),
    noticesLive: process.env.OWNER_NOTICES_LIVE === "1",
    failedNotices: jarvisFailedNotices,
    noticeBudget: () => jarvisNoticeBudget(now),
    resend: (ref, by) => sendQueuedNotice(ref, by),
    hubStale: async () => {
      const snap = await getFirestore().collection("socialHubStats").doc("latest").get().catch(() => null);
      const at = snap && snap.exists ? Date.parse(snap.data().updatedAt || "") : NaN;
      return !Number.isFinite(at) || now - at > th.hubStaleDays * 864e5;
    },
    publishHub: () => jarvis.runJob(fetch, "refreshSocialHubStats")
  };
}

async function jarvisAutoActions() {
  const db = getFirestore();
  const settings = await jarvis.readSettings(db);
  const now = Date.now();
  const result = await jarvisActions.autoRun({ db, now, settings, ops: jarvisActionOps(settings, now) });
  const msg = jarvisActions.pushMessage(result);
  if (msg) await jarvisPush.send(getMessaging(), db, await jarvisPush.targets(db, "alerts"), msg).catch((error) => console.error("Jarvis action push failed:", error));
  return jarvisActions.summary(result);
}

// A clicked action: not held to Jarvis's own caps or the clean rule, but notices keep the hours, tries and budget.
async function jarvisClickAction(body, by) {
  const db = getFirestore();
  const now = Date.now();
  const action = String(body.action || "");
  const proposal = String(body.proposal || "").slice(0, 140);
  const settings = await jarvis.readSettings(db);
  const act = jarvisActionOps(settings, now);
  const note = (entry) => jarvisActions.log(db, Object.assign({ mode: "click", by, proposal }, entry), Date.now());
  if (action === "run-job" || action === "publish-hub") {
    const job = action === "publish-hub" ? "refreshSocialHubStats" : String(body.job || "");
    try {
      const ran = await jarvis.runJob(fetch, job);
      await note({ action, status: "done", target: ran.ran, detail: "Started." });
      return { action, done: 1, ran: ran.ran };
    } catch (error) {
      await note({ action, status: "failed", target: job, detail: error.message || String(error) });
      throw error;
    }
  }
  if (action === "rerun-ci") {
    const workflow = String(body.workflow || "").slice(0, 120);
    try {
      const out = await jarvis.rerunCi(fetch, await githubApp.token(), workflow);
      await note({ action, status: "done", target: workflow, detail: out.already ? "Already " + out.already + "." : "Re-running run " + out.run + "." });
      return { action, done: out.already ? 0 : 1, ran: workflow, url: out.url, already: out.already || null };
    } catch (error) {
      await note({ action, status: "failed", target: workflow, detail: error.message || String(error) });
      throw error;
    }
  }
  if (action === "rerun-held") {
    const held = await act.held();
    let done = 0, failed = 0;
    for (const h of held.slice(0, 20)) {
      try {
        const res = await act.release(h.id, by);
        if (!res) continue;
        done += 1;
        await note({ action, status: "done", target: h.data.host || h.id, detail: "Sent to the asker" + (res.mailed === false ? ", but the mail failed" : "") + "." });
      } catch (error) {
        failed += 1;
        await note({ action, status: "failed", target: h.data.host || h.id, detail: error.message || String(error) });
      }
    }
    return { action, done, failed, left: Math.max(0, held.length - 20) };
  }
  if (action === "resend-notices") {
    if (!act.noticesLive) throw new Error("Owner notices are off (OWNER_NOTICES_LIVE is not 1).");
    if (!jarvisActions.noticeHours(now)) throw new Error("Owner notices go out Monday to Saturday, 08:00-19:00 Bogotá.");
    const [list, budget] = await Promise.all([act.failedNotices(), act.noticeBudget()]);
    let done = 0, failed = 0;
    for (const n of list.slice(0, budget)) {
      const res = await act.resend(n.ref, by);
      if (res.outcome === "skipped") continue;
      if (res.outcome === "sent") done += 1; else failed += 1;
      await note({ action, status: res.outcome === "sent" ? "done" : "failed", target: n.data.domain || n.id, detail: res.outcome === "sent" ? "Sent to " + res.email + "." : res.reason });
    }
    return { action, done, failed, left: Math.max(0, list.length - budget) };
  }
  throw new Error("Unknown action.");
}

async function jarvisActionsView(now) {
  const db = getFirestore();
  const settings = await jarvis.readSettings(db);
  const [rows, today, held, notices] = await Promise.all([
    jarvisActions.recent(db, 60), jarvisActions.todayRows(db, now), jarvisHeld().catch(() => []),
    process.env.OWNER_NOTICES_LIVE === "1" ? jarvisFailedNotices().catch(() => []) : []
  ]);
  return {
    actions: rows, settings: settings.actions,
    used: Object.keys(jarvisActions.CAPS).reduce((m, k) => { m[k] = jarvisActions.usedToday(today, k); return m; }, {}),
    pending: { held: held.length, clean: held.filter((h) => jarvisActions.cleanRerun(h.data).ok).length, notices: notices.length },
    noticeHours: jarvisActions.noticeHours(now), noticesLive: process.env.OWNER_NOTICES_LIVE === "1"
  };
}

const JARVIS_LOGGED = { "run-job": (b) => b.job, unlist: (b) => b.host, "send-report": (b) => (b.kind || "review") + " " + (b.period || "daily"), "daily-now": () => "daily briefing", "weekly-now": () => "weekly strategy", "digest-now": () => "evening digest", "email-briefing": () => "briefing", review: (b) => b.url, "notify-act": (b) => String(b.act || "") + " " + String(b.ref || "").slice(0, 100), "rating-decide": (b) => String(b.decision || "") + " " + (Array.isArray(b.ids) ? b.ids.length + " ratings" : String(b.ids || "")), "brief-mark": (b) => String(b.status || "") + " " + String(b.key || "").slice(0, 100), "marketing-campaign": (b) => String(b.action || "") + " " + String(b.name || b.id || "").slice(0, 80), "marketing-block": (b) => String(b.value || "").slice(0, 100), "marketing-queue": (b) => String(b.hosts || "").split(/[\n;]+/).filter(Boolean).length + " hosts", "marketing-command": (b) => String(b.action || "") + " " + String(b.email || b.week || b.value || b.name || b.job || b.id || "").slice(0, 100) };

async function jarvisWatchRun() {
  const db = getFirestore();
  const settings = await jarvis.readSettings(db);
  const phones = await jarvisPush.targets(db, "alerts");
  if (!settings.mail.watch && !(await jarvisPush.anyTargets(db, "alerts"))) return "off in settings";
  const now = Date.now();
  const external = await jarvisExternal(["health", "jobs", "uptime", "money", "safety", "platform"], 1);
  const items = jarvisCore.openBrief(jarvis.watchItems(external, settings.thresholds), await jarvisProposals.savedBrief(db), new Date(now)).open;
  const { day, ref, sent, fresh } = await jarvis.unsentToday(db, items, { now });
  if (!fresh.length) return "nothing new";
  const push = await jarvisPush.send(getMessaging(), db, phones, jarvisPush.alertMessage(fresh)).catch((error) => ({ sent: 0, error: String(error.message || error).slice(0, 200) }));
  if (settings.mail.watch) await sendOwnerEmail({
    subject: "Jarvis alert: " + fresh[0].text.slice(0, 90) + (fresh.length > 1 ? " (+" + (fresh.length - 1) + " more)" : ""),
    intro: "Jarvis crossed an alert threshold you set. Each issue is mailed once a day.",
    rows: fresh.map((row) => ({ label: row.product, value: row.text })),
    body: "Change the limits or turn the watch off in Admin > Statistics > Settings.",
    eyebrow: "Jarvis", respondUrl: jarvis.ADMIN_URL.replace("/overview/", "/systems/"), buttonLabel: "Open Systems"
  });
  const at = new Date(now).toISOString();
  fresh.forEach((row) => { sent[row.key] = at; });
  await ref.set({ day, sent });
  return fresh.length + " new alert" + (fresh.length > 1 ? "s" : "") + ", pushed to " + push.sent + " phone" + (push.sent === 1 ? "" : "s");
}

exports.jarvisDailyBriefing = scheduled(functions.runWith({ timeoutSeconds: 300, memory: "512MB", secrets: SECRETS.jarvisMail }), "jarvisDailyBriefing", async () => {
  const out = await jarvisDaily({ force: false });
  return typeof out === "string" ? out : (out.sent ? "sent" : "not sent") + ", " + out.items + " lines";
});

// The evening digest (#1672): the last 24 hours of pushes, what still waits for a decision, and what ran.
async function jarvisEvening({ force }) {
  const db = getFirestore();
  const settings = await jarvis.readSettings(db);
  if (!settings.mail.digest && !force) return "off in settings";
  const since = new Date(Date.now() - 24 * 3600000).toISOString();
  const [pushes, actions, held, replies, notices, marks] = await Promise.all([
    db.collection("jarvis_pushes").where("at", ">=", since).limit(500).get(),
    db.collection("jarvis_actions").where("at", ">=", since).limit(500).get(),
    jarvisHeld(),
    db.collection("url_review_owner_replies").where("status", "==", "waiting").limit(50).get(),
    db.collection("url_review_owner_notices").where("status", "==", "pending").limit(300).get(),
    jarvisProposals.saved(db)
  ]);
  const mail = jarvisDigest.digestMail({
    pushes: pushes.docs.map((doc) => doc.data()),
    actions: actions.docs.map((doc) => doc.data()),
    waiting: {
      reruns: held.map((h) => ({ host: h.data.host || h.id })),
      ownerReplies: replies.docs.map((doc) => ({ domain: doc.get("domain") || doc.get("from") })),
      notices: notices.docs.map((doc) => ({ domain: doc.id }))
    },
    marked: new Set(marks.map((row) => row.key))
  });
  if (!mail) return "empty day, nothing sent";
  const sent = await sendOwnerEmail({ subject: mail.subject, intro: mail.intro, rows: mail.rows, body: mail.body, eyebrow: "Jarvis", respondUrl: jarvis.ADMIN_URL, buttonLabel: "Open Jarvis" });
  if (!sent) throw new Error("The evening digest email was not sent.");
  return mail.subject;
}

exports.jarvisEveningDigest = scheduled(functions.runWith({ timeoutSeconds: 120, memory: "256MB", secrets: SECRETS.mail }), "jarvisEveningDigest", () => jarvisEvening({ force: false }));
exports.jarvisWeeklyStrategy = scheduled(functions.runWith({ timeoutSeconds: 300, memory: "512MB", secrets: SECRETS.jarvisMail }), "jarvisWeeklyStrategy", async () => {
  const out = await jarvisWeekly({ force: false });
  return typeof out === "string" ? out : (out.sent ? "sent" : "not sent") + ", " + out.proposals + " proposals";
});
// Outreach notices waiting for Send or Drop: one push for whatever arrived since the last, at most hourly.
async function jarvisNoticesRun() {
  const db = getFirestore();
  const phones = await jarvisPush.targets(db, "outreach");
  if (!(await jarvisPush.anyTargets(db, "outreach"))) return "no phones or browsers for outreach";
  const ref = db.collection("jarvis_watch").doc("notices");
  const [state, snap] = await Promise.all([ref.get(), db.collection("url_review_owner_notices").where("status", "==", "pending").get()]);
  const pending = snap.docs.map((d) => Object.assign({ domain: d.id }, d.data()));
  const now = Date.now();
  const fresh = jarvisNotify.noticesDue(pending, state.exists ? state.data().lastAt : "", now);
  if (!fresh.length) return pending.length + " pending, none new";
  // One notification per notice with Send and Skip (#1670); past 6, the rest share one.
  let sent = 0;
  for (const n of fresh.slice(0, 6)) sent += (await jarvisPush.send(getMessaging(), db, phones, jarvisMailPush.noticeMessage(n))).sent;
  if (fresh.length > 6) sent += (await jarvisPush.send(getMessaging(), db, phones, jarvisNotify.noticesMessage(fresh.slice(6), pending.length))).sent;
  await ref.set({ lastAt: new Date(now).toISOString(), pending: pending.length });
  return fresh.length + " new notices, " + sent + " pushes";
}

// Every hour: the safe actions first (jarvis-actions.js), then the alert watch and the outreach notices push.
exports.jarvisWatch = scheduled(functions.runWith({ timeoutSeconds: 300, memory: "512MB", secrets: SECRETS.jarvisWatch }), "jarvisWatch", async () => {
  let acts;
  try { acts = await jarvisAutoActions(); } catch (error) { console.error("Jarvis actions failed:", error); acts = "actions failed: " + String(error.message || error).slice(0, 120); }
  const watch = await jarvisWatchRun();
  const notices = await jarvisNoticesRun().catch((error) => "notices failed: " + String(error.message || error).slice(0, 120));
  const social = await jarvisSocialRun().catch((error) => "social failed: " + String(error.message || error).slice(0, 120));
  return watch + "; " + acts + "; " + notices + "; " + social;
});

exports.jarvis = functions.runWith({ timeoutSeconds: 180, memory: "512MB", maxInstances: 3, secrets: SECRETS.jarvis }).https.onRequest(async (req, res) => {
  res.set("Access-Control-Allow-Origin", reviewOrigin(req));
  res.set("Vary", "Origin");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.set("Cache-Control", "no-store");
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST") { res.status(405).json({ error: "POST only." }); return; }
  if ((req.body || {}).op === "app-release") {
    try { res.json(await jarvisPush.releasePush(fetch, getFirestore(), getMessaging(), { token: await githubApp.token(), now: Date.now() })); }
    catch (error) { res.status(502).json({ error: error.message }); }
    return;
  }
  // A browser notification's button (#1671): the service worker holds no sign-in, so the push signed each button.
  if ((req.body || {}).op === "notify-act" && (req.body || {}).sig) {
    const b = req.body;
    const db = getFirestore();
    const target = String(b.act || "") + " " + String(b.ref || "").slice(0, 100);
    try {
      const k = await jarvisWebPush.keys(db, require("web-push"));
      if (b.text || !jarvisWebPush.verify(k.signKey, b, Date.now())) { res.status(403).json({ ok: false, error: "This button expired. Open Jarvis to do it." }); return; }
      const out = await jarvisNotifyAct({ ref: b.ref, act: b.act }, "browser push");
      await jarvisActions.log(db, { action: "notify-act", mode: "click", status: "done", target, by: "browser push" }, Date.now()).catch(() => null);
      res.json(Object.assign({ ok: true, op: "notify-act" }, out));
    } catch (error) {
      await jarvisActions.log(db, { action: "notify-act", mode: "click", status: "failed", target, detail: String((error && error.message) || error), by: "browser push" }, Date.now()).catch(() => null);
      res.json({ ok: false, op: "notify-act", error: String((error && error.message) || error).slice(0, 300) });
    }
    return;
  }
  const presented = String(req.get("authorization") || "");
  const bearer = presented.toLowerCase().startsWith("bearer ") ? presented.slice(7).trim() : "";
  let operator = null;
  if (bearer) {
    try { operator = await reviewDesk.verifyOperator(bearer); } catch (error) { operator = null; }
  }
  if (!operator) { res.status(bearer ? 403 : 401).json({ error: "Sign in with the owner account." }); return; }
  const body = req.body || {};
  const op = String(body.op || "");
  const days = jarvis.rangeDays(body.days);
  const now = Date.now();
  const env = process.env;
  const appAskSnapshot = async () => jarvis.askSnapshot(await jarvisCached("snapshot", days, () => jarvisSnapshot(days)), days);
  try {
    let out;
    if (op === "health") out = await jarvisCached(op, days, () => jarvis.health(getFirestore(), { days, now }));
    else if (op === "jobs") out = await jarvisCached(op, 0, async () => ({ ok: true, jobs: await jarvis.jobs(fetch) }));
    else if (op === "github") out = await jarvisCached(op, 0, async () => jarvis.github(fetch, await githubApp.token(), { now }));
    else if (op === "ga4") out = await jarvisCached(op, days, () => jarvis.ga4(fetch, { days }));
    else if (op === "cloudflare") out = await jarvisCached(op, days, () => jarvis.cloudflare(fetch, env, { days, now }));
    else if (op === "speed") out = await jarvisCached(op, 0, () => jarvis.speed(urlReview, env));
    else if (op === "uptime") out = await jarvisCached(op, 0, () => jarvis.uptime(fetch, { now }));
    else if (op === "brief") out = await jarvis.brief(fetch, env, body.snapshot || await appAskSnapshot());
    else if (op === "ask") out = await jarvis.ask(fetch, env, body.question, body.snapshot || await appAskSnapshot(), { lang: body.lang, spoken: body.spoken === true });
    else if (op === "speak") out = await jarvis.speak(fetch, body.text, body.lang, { voice: body.voice, rate: body.rate });
    else if (op === "run-job") out = await jarvis.runJob(fetch, body.job);
    else if (op === "settings") out = await jarvis.readSettings(getFirestore());
    else if (op === "settings-save") {
      out = await jarvis.saveSettings(getFirestore(), body.settings, operator);
      const cache = getFirestore().collection("jarvis_cache");
      await Promise.all([1, 7, 30, 90, 365].map((d) => cache.doc("search-" + d).delete().catch(() => null)));
    }
    else if (op === "goals") out = { goals: await jarvis.goals(getFirestore(), await jarvis.readSettings(getFirestore()), { now, sum: jarvisSum }) };
    else if (op === "daily-now") out = await jarvisDaily({ force: true });
    else if (op === "weekly-now") out = await jarvisWeekly({ force: true });
    else if (op === "digest-now") out = { result: await jarvisEvening({ force: true }) };
    else if (op === "proposals") {
      if (Array.isArray(body.candidates)) out = await jarvisRanked({ candidates: jarvisProposals.cleanCandidates(body.candidates), snapshot: body.snapshot || {}, useGemini: body.gemini !== false });
      else {
        const snap = await jarvisCached("snapshot", days, () => jarvisSnapshot(days));
        out = await jarvisRanked({ candidates: jarvisCore.proposalRules({ products: snap.products, external: snap.external, thresholds: snap.thresholds, goals: snap.goals }, snap.briefing), snapshot: jarvis.askSnapshot(snap, days), useGemini: body.gemini !== false });
      }
    }
    else if (op === "proposal-mark") out = await jarvisProposals.mark(getFirestore(), body, operator, now);
    else if (op === "action-run") out = await jarvisClickAction(body, operator);
    else if (op === "notify-act") out = await jarvisNotifyAct(body, operator);
    else if (op === "actions") out = await jarvisActionsView(now);
    else if (op === "register-device") out = await jarvisPush.register(getFirestore(), body, operator, now);
    else if (op === "unregister-device") out = await jarvisPush.unregister(getFirestore(), body.endpoint || body.token);
    else if (op === "devices") out = { devices: (await jarvisPush.list(getFirestore())).map((d) => ({ id: d.id, type: d.type || "android", name: d.name, kinds: d.kinds, updatedAt: d.updatedAt })) };
    else if (op === "test-push" && body.endpoint) {
      const db = getFirestore();
      const device = (await jarvisPush.list(db)).find((d) => d.id === jarvisPush.idOf(body.endpoint) && d.subscription);
      if (!device) throw new Error("This browser is not registered.");
      out = await jarvisPush.send(getMessaging(), db, [], { kind: "test", title: "Jarvis test", body: "Push notifications reach this browser.", tab: "overview", tag: "jarvis-test" }, [device]);
    }
    else if (op === "test-push") {
      const tokens = body.token ? [String(body.token)] : await jarvisPush.targets(getFirestore(), "test");
      out = await jarvisPush.send(getMessaging(), getFirestore(), tokens, { kind: "test", title: "Jarvis test", body: "Push notifications reach this phone.", tab: "overview", tag: "jarvis-test" });
    }
    else if (op === "web-push-key") out = { publicKey: (await jarvisWebPush.keys(getFirestore(), require("web-push"))).publicKey };
    else if (op === "review") out = await jarvisReview.enqueue(getFirestore(), body, operator, now);
    else if (op === "snapshot") out = await jarvisBriefOpen(await jarvisCached(op, days, () => jarvisSnapshot(days)));
    else if (op === "brief-mark") out = await jarvisProposals.markBrief(getFirestore(), body, operator, now);
    else if (op === "brief-marks") out = { marks: await jarvisProposals.savedBrief(getFirestore()) };
    else if (op === "brief-items") out = await jarvis.briefItems(getFirestore(), { list: body.list, days, now });
    else if (op === "rating-decide") out = await jarvis.decideRatings(getFirestore(), body);
    else if (op === "notices") {
      const snap = await getFirestore().collection("url_review_owner_notices").where("status", "==", "pending").limit(100).get();
      const rows = snap.docs.map((d) => Object.assign({ domain: d.id }, d.data()));
      out = { notices: jarvisNotify.noticeRows(rows, (row) => customerMail.pageUrl(row.lang, { report: row.reviewId })), auto: process.env.OWNER_NOTICES_LIVE === "1" };
    } else if (op === "social-proposals") {
      const [book, doc] = await Promise.all([socialProposals(), getFirestore().collection("socialHub").doc("live").get()]);
      out = { proposals: jarvisSocial.pending(book.proposals, jarvisSocial.state(doc.data())), built: book.built || "" };
    } else if (op === "social-decide") {
      out = await jarvisSocialDecide(body.id, body.decision, now);
    } else if (op === "social-runs") out = { runs: await socialRuns() };
    else if (op === "social-post-now") {
      const token = await githubApp.token();
      if (!token) throw new Error("No GitHub token is set (GITHUB_APP_ID in functions/.env with GITHUB_APP_PRIVATE_KEY in Secret Manager), so Jarvis cannot start the workflows.");
      const started = [];
      for (const w of jarvisSocial.WORKFLOWS) {
        const path = "/repos/" + BUG_REPO + "/actions/workflows/" + w.file;
        const busy = ((await githubGet(path + "/runs?per_page=5", token)).workflow_runs || []).find((run) => run.status !== "completed");
        if (busy) { started.push({ name: w.name, state: "already running", url: busy.html_url }); continue; }
        await github(path + "/dispatches", Object.assign({ ref: "main" }, w.inputs ? { inputs: w.inputs } : {}), token);
        started.push({ name: w.name, state: "started", url: "https://github.com/" + BUG_REPO + "/actions/workflows/" + w.file });
      }
      out = { started, note: started.map((s) => s.name + " " + s.state).join(", ") + "." };
    } else if (op === "share-draft") out = await shareDraft(body);
    else if (op === "share-queue") out = await shareQueue(body);
    else if (op === "share-list") out = { items: await shareList() };
    else if (op === "share-drop") out = await shareDrop(body);
    else if (op === "notice-decide") {
      const decided = await decideOwnerNotice(body.domain, body.send === true, body.email, operator);
      if (decided.error) throw new Error(decided.error);
      out = decided;
    }
    else if (op === "marketing-campaign" || op === "marketing-block" || op === "marketing-queue" || op === "marketing-command") {
      const db = getFirestore();
      const ctx = { fetch, env, now };
      out = op === "marketing-campaign" ? await jarvisMarketing.campaignAct(ctx, body) : op === "marketing-block" ? await jarvisMarketing.block(ctx, body)
        : op === "marketing-command" ? await jarvisMarketing.command(ctx, db, body) : await jarvisMarketing.queueProspects(db, body, now);
      await Promise.all([1, 7, 30, 90, 365].flatMap((d) => ["marketing-" + d, "outreach-" + d, "marketing-sync-" + d]).map((id) => db.collection("jarvis_cache").doc(id).delete().catch(() => null)));
    }
    else if (jarvisSources.SOURCES[op]) out = await jarvisSource(op, days);
    else if (op === "send-report") {
      const kind = body.kind === "site" ? "site" : "review";
      const period = ["daily", "weekly", "monthly", "quarter"].includes(body.period) ? body.period : "daily";
      const sent = await JARVIS_REPORTS[kind](period);
      out = { kind, period, sent: !!sent, note: sent ? "Sent." : "Already sent for this window, or nothing to send." };
    } else if (op === "unlist") {
      const host = reviewPublish.bare(String(body.host || "").toLowerCase().trim());
      if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host)) throw new Error("That is not a host.");
      await getFirestore().collection("url_review_unlisted").doc(host).set({ at: new Date().toISOString(), by: operator, from: "jarvis" });
      out = { unlisted: host };
    } else if (op === "email-briefing") {
      const mail = jarvis.briefingMail(body.snapshot || await appAskSnapshot(), body.text);
      const sent = await sendOwnerEmail({ subject: mail.subject, intro: "Your Jarvis briefing from Admin > Statistics.", rows: mail.rows, body: mail.body, eyebrow: "Jarvis" });
      out = { sent: sent !== false };
    } else { res.status(400).json({ error: "Unknown op." }); return; }
    if (JARVIS_LOGGED[op]) await jarvisActions.log(getFirestore(), { action: op, mode: "click", status: "done", target: JARVIS_LOGGED[op](body), by: operator }, Date.now()).catch(() => null);
    res.status(200).json(Object.assign({ ok: true, op }, out));
  } catch (error) {
    if (JARVIS_LOGGED[op]) await jarvisActions.log(getFirestore(), { action: op, mode: "click", status: "failed", target: JARVIS_LOGGED[op](body), detail: String((error && error.message) || error), by: operator }, Date.now()).catch(() => null);
    res.status(200).json({ ok: false, op, error: String((error && error.message) || error).slice(0, 300) });
  }
});
