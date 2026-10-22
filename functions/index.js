/**
 * This is the complete code for your functions/index.js file.
 * It handles sending emails for both message replies and rating replies
 * using your specific SendGrid Dynamic Template IDs.
 */

// Import necessary Firebase and SendGrid modules
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const sgMail = require("@sendgrid/mail");

// Initialize Firebase Admin SDK
admin.initializeApp();

// SENDGRID_API_KEY is a Secret Manager secret (firebase functions:secrets:set).
// SENDGRID_FROM is a plain env var in functions/.env.
const OWNER_EMAIL = "kaanmuar@gmail.com";
const TOPIC_LABELS = {
  opportunity: "Job Opportunity / Collaboration",
  inquiry: "Project Inquiry",
  feedback: "CV Feedback",
  other: "Other"
};


const withMail = functions.runWith({ secrets: ["SENDGRID_API_KEY"] });
const KEEP_MS = 365 * 24 * 60 * 60 * 1000;

// Rows that carry expireAt are deleted by a Firestore TTL policy once it passes.
function keepUntil() {
  return new Date(Date.now() + KEEP_MS);
}
const siteReport = require("./site-report-mail");

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
      return snap.ref.update({ status: "sent", sentAt: admin.firestore.FieldValue.serverTimestamp() });
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
        await admin.firestore().collection("mail").add(Object.assign({}, newMail, { expireAt: keepUntil() }));
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
        await admin.firestore().collection("mail").add(Object.assign({}, newMail, { expireAt: keepUntil() }));
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

function escapeHtml(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  }[ch]));
}

function adminRespondUrl(type, id) {
  const docId = String(id || "").trim();
  if (!docId || (type !== "message" && type !== "rating")) return "";
  const url = new URL("https://kaanmuar.github.io/admin.html");
  url.searchParams.set("respond", type);
  url.searchParams.set("id", docId);
  return url.toString();
}

async function sendOwnerEmail({ subject, intro, rows, body, respondUrl, buttonLabel, to }) {
  const from = prepareMail();
  if (!from) return false;
  const safeRows = (rows || []).filter((row) => row && row.value);
  const text = [
    intro,
    "",
    ...safeRows.map((row) => row.label + ": " + row.value),
    body ? "\n" + body : "",
    respondUrl ? "\nRespond: " + respondUrl : ""
  ].join("\n");
  const rowHtml = safeRows.map((row) =>
    "<tr>" +
    "<td style=\"padding:8px 16px 8px 0;color:#5c6b7a;font-size:13px;vertical-align:top;white-space:nowrap;\">" + escapeHtml(row.label) + "</td>" +
    "<td style=\"padding:8px 0;color:#1c2833;font-size:15px;\">" + escapeHtml(row.value) + "</td>" +
    "</tr>"
  ).join("");
  const bodyHtml = body
    ? "<div style=\"margin-top:16px;padding:16px;background:#f4f7f8;border-radius:8px;color:#1c2833;font-size:15px;line-height:1.5;white-space:pre-wrap;\">" + escapeHtml(body) + "</div>"
    : "";
  const buttonHtml = respondUrl
    ? "<a href=\"" + escapeHtml(respondUrl) + "\" style=\"display:inline-block;margin-top:22px;background:#0e7490;color:#ffffff;text-decoration:none;font-family:Arial,sans-serif;font-size:14px;font-weight:bold;padding:12px 20px;border-radius:8px;\">" + escapeHtml(buttonLabel || "Respond") + "</a>"
    : "";
  const html = "<!DOCTYPE html><html><body style=\"margin:0;padding:24px;background:#eef2f4;font-family:Georgia,'Times New Roman',serif;\">" +
    "<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;\">" +
    "<tr><td style=\"padding:28px;\">" +
    "<p style=\"margin:0 0 8px;font-family:Arial,sans-serif;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#0e7490;\">Carlos Muñoz CV</p>" +
    "<h1 style=\"margin:0 0 20px;font-size:22px;line-height:1.3;color:#102027;font-weight:normal;\">" + escapeHtml(intro) + "</h1>" +
    "<table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" width=\"100%\">" + rowHtml + "</table>" +
    bodyHtml +
    buttonHtml +
    "</td></tr></table></body></html>";
  await sgMail.send({
    to: to || OWNER_EMAIL,
    from: from,
    subject: clip(subject, 140),
    text: text.slice(0, 16000),
    html: html
  });
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
      await sendOwnerEmail({
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
      await sendOwnerEmail({
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

exports.noteCvVisit = functions.https.onRequest(async (req, res) => {
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
  const stamp = admin.firestore.FieldValue.serverTimestamp();
  const batch = admin.firestore().batch();
  batch.set(admin.firestore().collection("visits").doc(), Object.assign({}, record, { createdAt: stamp }));
  batch.set(admin.firestore().collection("site_events").doc(), {
    site: "cv",
    kind: "visit",
    name: "visit",
    label: record.label,
    lang: record.lang,
    referrerHost: record.referrerHost,
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
  const snap = await admin.firestore().doc("abuse/forms").get();
  if (!snap.exists) return { required: false };
  const data = snap.data() || {};
  const until = data.until && data.until.toMillis ? data.until.toMillis() : 0;
  return { required: data.captcha === true && until > Date.now() };
}

async function noteFormBurst() {
  const ref = admin.firestore().doc("abuse/forms");
  await admin.firestore().runTransaction(async (tx) => {
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
        windowStart: admin.firestore.Timestamp.fromMillis(now),
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
      until: captcha ? admin.firestore.Timestamp.fromMillis(now + FORM_HOLD_MS) : null
    });
  });
}

exports.getFormChallenge = functions.https.onCall(async () => {
  const gate = await formGate();
  if (!gate.required) return { required: false };
  const text = randomCaptchaText();
  const ref = admin.firestore().collection("form_challenges").doc();
  await ref.set({
    answer: hashAnswer(text),
    expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + CHALLENGE_MS)
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
  const ref = challengeId ? admin.firestore().collection("form_challenges").doc(challengeId) : null;
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
  const blocked = await admin.firestore().doc("blocked_senders/" + email).get();
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
    await admin.firestore().collection("messages").add({
      name,
      email,
      topic,
      message,
      fileURL,
      status: "inbox",
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    return { ok: true };
  }

  const rating = Number(payload.rating);
  const comment = cleanText(payload.comment, 4000);
  if ([1, 2, 3, 4, 5].indexOf(rating) === -1) {
    throw new functions.https.HttpsError("invalid-argument", "Check the rating.");
  }
  await admin.firestore().collection("ratings").add({
    name,
    email,
    rating,
    comment,
    status: "pending",
    isAnonymous: false,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
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
      bump(referrers, row.referrerHost ? row.referrerHost : "Direct");
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

async function loadEvents(start, end) {
  const rows = [];
  let cursor = null;
  for (;;) {
    let query = admin.firestore().collection("site_events")
      .where("createdAt", ">=", admin.firestore.Timestamp.fromDate(start))
      .where("createdAt", "<", admin.firestore.Timestamp.fromDate(end))
      .orderBy("createdAt", "asc")
      .limit(400);
    if (cursor) query = query.startAfter(cursor);
    const snap = await query.get();
    if (snap.empty) break;
    snap.forEach((doc) => rows.push(doc.data() || {}));
    cursor = snap.docs[snap.docs.length - 1];
    if (snap.size < 400 || rows.length >= 20000) break;
  }
  return rows;
}

async function countCreated(name, start, end) {
  const snap = await admin.firestore().collection(name)
    .where("createdAt", ">=", admin.firestore.Timestamp.fromDate(start))
    .where("createdAt", "<", admin.firestore.Timestamp.fromDate(end))
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
    const startStamp = admin.firestore.Timestamp.fromDate(window.start);
    const endStamp = admin.firestore.Timestamp.fromDate(window.end);
    messageRows = await loadBound("messages", "createdAt", startStamp, endStamp);
    ratingRows = await loadBound("ratings", "createdAt", startStamp, endStamp);
  } catch (countError) {
    console.error(period + " inbox load skipped:", countError);
  }
  if (period === "quarter" && !events.length && !messageRows.length && !ratingRows.length) return null;
  const ref = admin.firestore().collection("site_reports").doc(id);
  const claimed = await admin.firestore().runTransaction(async (tx) => {
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
      start: admin.firestore.Timestamp.fromDate(window.start),
      end: admin.firestore.Timestamp.fromDate(window.end),
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
      createdAt: admin.firestore.FieldValue.serverTimestamp()
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
    await ref.set({ emailedAt: admin.firestore.FieldValue.serverTimestamp(), sending: false }, { merge: true });
  } catch (error) {
    await ref.set({ sending: false }, { merge: true });
    console.error(period + " site report failed:", error);
    throw error;
  }
  return null;
}

function scheduleReport(cron, period) {
  return withMail.pubsub.schedule(cron).timeZone("America/Bogota").onRun(() => sendPeriodReport(period));
}

exports.emailDailySiteReport = scheduleReport("15 7 * * *", "daily");
exports.emailWeeklySiteReport = scheduleReport("30 7 * * 1", "weekly");
exports.emailMonthlySiteReport = scheduleReport("45 7 1 * *", "monthly");
exports.emailQuarterSiteReport = scheduleReport("*/15 * * * *", "quarter");

const reviewMail = require("./url-review-mail");

async function loadBound(name, field, startVal, endVal) {
  const rows = [];
  let cursor = null;
  for (;;) {
    let query = admin.firestore().collection(name)
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
  return admin.firestore().collection(name)
    .where("at", ">=", start.toISOString())
    .where("at", "<", end.toISOString())
    .select(...fields)
    .limit(2000)
    .get()
    .then((snap) => snap.docs.map((doc) => Object.assign({ id: doc.id }, doc.data())));
}

// A failure bug seen closed on GitHub is marked once, so only the open ones are asked about again.
async function loadFailureBugs() {
  const snap = await admin.firestore().collection("url_review_failure_bugs").get();
  const token = process.env.GITHUB_BUGS_TOKEN || "";
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

async function sendReviewPeriodReport(period) {
  const window = period === "quarter" ? quarterWindow(new Date()) : reportWindow(period, new Date());
  const earlier = period === "quarter" ? previousQuarter(window) : previousWindow(period, window);
  const id = "review-" + period + "-" + window.label.replace(/[\s:]/g, "-");
  const startStamp = admin.firestore.Timestamp.fromDate(window.start);
  const endStamp = admin.firestore.Timestamp.fromDate(window.end);
  const [opens, reviews, captures, alerts, pageEvents, failed, priorFailed, reruns] = await Promise.all([
    loadBound("url_review_opens", "createdAt", startStamp, endStamp),
    loadBound("url_reviews", "createdAt", window.start.toISOString(), window.end.toISOString()),
    loadBound("url_review_captures", "at", window.start.toISOString(), window.end.toISOString()),
    loadBound("url_review_alerts", "at", window.start.toISOString(), window.end.toISOString()),
    loadEvents(window.start, window.end).then((rows) => rows.filter((row) => row.site === "review")),
    loadSummaries("url_review_failures", reviewFailures.SUMMARY_FIELDS, window.start, window.end),
    loadSummaries("url_review_failures", ["kind", "cause"], earlier.start, window.start),
    loadSummaries("url_review_reruns", reviewFailures.RERUN_FIELDS, window.start, window.end)
  ]);
  if (period === "quarter" && !opens.length && !reviews.length && !captures.length && !alerts.length && !pageEvents.length) return null;
  const ref = admin.firestore().collection("url_review_reports").doc(id);
  const claimed = await admin.firestore().runTransaction(async (tx) => {
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
      loadBound("url_review_opens", "createdAt", admin.firestore.Timestamp.fromDate(earlier.start), startStamp),
      loadBound("url_reviews", "createdAt", earlier.start.toISOString(), window.start.toISOString())
    ]);
    const previous = reviewMail.summarizePeriod(priorOpens, priorReviews, [], []);
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
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    const title = period === "quarter" ? "15-minute" : period.charAt(0).toUpperCase() + period.slice(1);
    const pageBody = pageEvents.length ? siteReport.reportBody(pageEvents, actionTitle) : "";
    const sent = await sendOwnerEmail({
      subject: title + " URL review — " + window.label,
      intro: title + " QA-lab URL Review report for " + window.label,
      rows: reviewMail.reportRows(summary, previous, earlier.phrase).concat(quiet ? [] : failures.rows),
      body: [summary.body, quiet ? "" : failures.body, pageBody].filter(Boolean).join("\n\n")
    });
    if (!sent) throw new Error("URL review report email was not sent.");
    await ref.set({ emailedAt: admin.firestore.FieldValue.serverTimestamp(), sending: false }, { merge: true });
  } catch (error) {
    await ref.set({ sending: false }, { merge: true });
    console.error(period + " URL review report failed:", error);
    throw error;
  }
  return null;
}

function scheduleReviewReport(cron, period) {
  return withMail.pubsub.schedule(cron).timeZone("America/Bogota").onRun(() => sendReviewPeriodReport(period));
}

exports.emailDailyReviewReport = scheduleReviewReport("20 7 * * *", "daily");
exports.emailWeeklyReviewReport = scheduleReviewReport("35 7 * * 1", "weekly");
exports.emailMonthlyReviewReport = scheduleReviewReport("50 7 1 * *", "monthly");
exports.emailQuarterReviewReport = scheduleReviewReport("*/15 * * * *", "quarter");

async function probeFailure(url) {
  let host = "";
  try { host = new URL(url).hostname; } catch (error) { host = ""; }
  const probe = { at: new Date().toISOString() };
  probe.dns = await require("dns").promises.lookup(host, { all: true, verbatim: true })
    .then((rows) => ({ addresses: rows.slice(0, 6).map((row) => row.address) }), (error) => ({ error: String(error.code || error.message || "lookup failed").slice(0, 60) }));
  if (probe.dns.error) return probe;
  probe.plain = await urlReview.probeRead(url);
  const plain = probe.plain;
  const refused = !plain.error && !plain.httpRedirect && ((plain.status >= 400 && plain.status < 500) || !!plain.challenge);
  if (!refused) return probe;
  const started = Date.now();
  const browsed = await browseForReview({ url: plain.url, paths: [], html: true, probe: true }, null)
    .catch((error) => ({ ok: false, error: String((error && error.message) || "").slice(0, 120) }));
  const view = browsed && browsed.ok && browsed.start ? browsed.start : null;
  probe.browser = view ? {
    ok: true,
    untagged: !!browsed.untagged,
    status: view.status || 0,
    docStatus: view.docStatus || 0,
    finalUrl: String(view.finalUrl || "").slice(0, 300),
    challenge: view.html ? urlReview.challengeOf(view.finalUrl || plain.url, view.headers || {}, view.html) : "",
    words: view.renderedWords || 0,
    ms: Date.now() - started
  } : { ok: false, error: browsed ? browsed.error || "no answer" : "no browser key", ms: Date.now() - started };
  return probe;
}

async function diagnoseReviewFailures() {
  const db = admin.firestore();
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
        checks: admin.firestore.FieldValue.increment(1)
      })));
    }
  };
  await Promise.all([worker(), worker()]);
  console.log("URL review failures: " + missing.length + " taken from alerts, " + pending.length + " diagnosed (" + recheck.length + " checked again) across " + byUrl.size + " addresses.");
  return null;
}

exports.diagnoseReviewFailures = functions.runWith({ timeoutSeconds: 540, memory: "512MB" })
  .pubsub.schedule("0 6 * * *").timeZone("America/Bogota").onRun(() => diagnoseReviewFailures());

async function rerunFailure(group) {
  const db = admin.firestore();
  const ref = db.collection("url_review_reruns").doc();
  const startedAt = Date.now();
  const lines = [];
  const log = (text) => { if (lines.length < 5000) lines.push({ t: Date.now() - startedAt, text }); };
  const options = group.options || {};
  let record = null;
  let error = null;
  try {
    log("Re-run of a failed review of " + group.url + ". " + group.trigger.label);
    const report = await urlReview.reviewTarget(group.url, {
      log,
      stopped: () => Date.now() - startedAt > 240000,
      maxPages: options.pages || undefined,
      maxDepth: options.depth || undefined,
      browse: browseForReview,
      pagespeed: process.env.PAGESPEED_KEY ? (url) => urlReview.pageSpeed(url, process.env.PAGESPEED_KEY) : undefined,
      webrisk: process.env.WEBRISK_KEY ? (url) => urlReview.webRisk(url, process.env.WEBRISK_KEY) : undefined
    });
    record = urlReview.intakeRecord(Object.assign({}, group.intake, {
      url: group.url,
      name: group.name,
      email: group.email,
      frameworks: options.frameworks || [],
      pages: options.pages,
      depth: options.depth
    }), report, { deviceId: (group.intake || {}).deviceId });
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
  const db = admin.firestore();
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
  await sendOwnerEmail({ to: REVIEW_ALERT_TO, subject: mail.subject, intro: mail.intro, rows: mail.rows, body: mail.body, respondUrl: REVIEW_FN_URL + "/desk", buttonLabel: "Open the review desk" });
  return null;
}

exports.rerunReviewFailures = require("firebase-functions/v2/scheduler").onSchedule({
  schedule: "30 6 * * *",
  timeZone: "America/Bogota",
  timeoutSeconds: 1800,
  memory: "1GiB",
  secrets: ["SENDGRID_API_KEY"]
}, () => rerunReviewFailures());

const BUG_REPO = "kaanmuar/kaanmuar.github.io";
const BUG_TICKET = 320;
const BOARD = { project: "PVT_kwHOALfwis4BmsxO", status: "PVTSSF_lAHOALfwis4BmsxOzhlUt04", backlog: "3f4ac4fe" };

async function github(path, body, token) {
  const res = await fetch("https://api.github.com" + path, {
    method: "POST",
    headers: { Authorization: "Bearer " + token, Accept: "application/vnd.github+json", "Content-Type": "application/json", "User-Agent": "qa-lab-url-review", "X-GitHub-Api-Version": "2022-11-28" },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || (data.errors && data.errors.length)) throw new Error("GitHub " + path + " answered " + res.status + ": " + JSON.stringify(data.errors || data.message || "").slice(0, 300));
  return data;
}

async function openFailureBug(bug, token) {
  const issue = await github("/repos/" + BUG_REPO + "/issues", { title: bug.title, body: bug.body, labels: ["bug", "area:be"] }, token);
  const board = github("/graphql", { query: "mutation($p:ID!,$c:ID!){addProjectV2ItemById(input:{projectId:$p,contentId:$c}){item{id}}}", variables: { p: BOARD.project, c: issue.node_id } }, token)
    .then((added) => github("/graphql", {
      query: "mutation($p:ID!,$i:ID!,$f:ID!,$o:String!){updateProjectV2ItemFieldValue(input:{projectId:$p,itemId:$i,fieldId:$f,value:{singleSelectOptionId:$o}}){projectV2Item{id}}}",
      variables: { p: BOARD.project, i: added.data.addProjectV2ItemById.item.id, f: BOARD.status, o: BOARD.backlog }
    }, token));
  const parent = github("/repos/" + BUG_REPO + "/issues/" + BUG_TICKET + "/sub_issues", { sub_issue_id: issue.id }, token);
  (await Promise.allSettled([board, parent])).filter((step) => step.status === "rejected")
    .forEach((step) => console.error("Failure bug #" + issue.number + " was opened, but not filed on the board or under #" + BUG_TICKET + ":", step.reason));
  return issue;
}

async function fileReviewFailureBugs() {
  const token = process.env.GITHUB_BUGS_TOKEN || "";
  if (!token) {
    console.log("URL review failure bugs: GITHUB_BUGS_TOKEN is not set, so no bug was opened.");
    return null;
  }
  const db = admin.firestore();
  const since = new Date(Date.now() - reviewFailures.RERUN_DAYS * 86400000).toISOString();
  const read = (name) => db.collection(name).where("at", ">=", since).get().then((snap) => snap.docs.map((doc) => Object.assign({ id: doc.id }, doc.data())));
  const filed = db.collection("url_review_failure_bugs");
  const [failed, reruns, known] = await Promise.all([read("url_review_failures"), read("url_review_reruns"), filed.select().get()]);
  const bugs = reviewFailures.bugPlan(failed, reruns, known.docs.map((doc) => doc.id));
  const opened = [];
  for (const bug of bugs) {
    const ref = filed.doc(bug.key);
    try {
      await ref.create({ cause: bug.cause, fix: bug.fix, title: bug.title, runs: bug.runs, hosts: bug.hosts.slice(0, 40), firstAt: bug.firstAt, lastAt: bug.lastAt, openedAt: new Date().toISOString(), issue: null });
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
  console.log("URL review failure bugs: " + opened.length + " of " + bugs.length + " new cause classes opened" + (opened.length ? " (" + opened.join(", ") + ")" : "") + ".");
  return null;
}

exports.fileReviewFailureBugs = functions.runWith({ timeoutSeconds: 120, memory: "512MB" })
  .pubsub.schedule("5 7 * * *").timeZone("America/Bogota").onRun(() => fileReviewFailureBugs());

// GitHub can skip scheduled runs, so this checks from outside GitHub that today's Live Reports batch
// (auto-YYYY-MM-DD, dated in UTC) is on main or underway, and dispatches the workflow when it is neither.
const LIVE_REPORTS_WORKFLOW = "auto-live-reports.yml";

async function githubGet(path, token) {
  const res = await fetch("https://api.github.com" + path, {
    headers: { Authorization: "Bearer " + token, Accept: "application/vnd.github+json", "User-Agent": "qa-lab-url-review", "X-GitHub-Api-Version": "2022-11-28" }
  });
  if (!res.ok) throw new Error("GitHub " + path + " answered " + res.status);
  return res.json();
}

async function ensureLiveReportsBatch() {
  const token = process.env.GITHUB_BUGS_TOKEN || "";
  if (!token) {
    console.log("Live Reports watchdog: GITHUB_BUGS_TOKEN is not set, so the batch was not checked.");
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
  console.log("Live Reports watchdog: no batch auto-" + today + " on main and no run underway (today's runs: " + finished + "), so the workflow was dispatched.");
  await sendOwnerEmail({
    to: REVIEW_ALERT_TO,
    subject: "Live Reports: today's batch was missing, the backup started it",
    intro: "GitHub did not publish the auto-" + today + " Live Reports batch on schedule, so the Firebase watchdog dispatched the workflow.",
    rows: [{ label: "Today's runs before the backup", value: finished }],
    respondUrl: "https://github.com/" + BUG_REPO + "/actions/workflows/" + LIVE_REPORTS_WORKFLOW,
    buttonLabel: "Open the workflow runs"
  });
  return null;
}

exports.ensureLiveReportsBatch = withMail.pubsub.schedule("45 4 * * *").timeZone("America/Bogota").onRun(() => ensureLiveReportsBatch());

exports.exportFirestoreWeekly = withMail.pubsub.schedule("0 8 * * 0").timeZone("America/Bogota").onRun(async () => {
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
  await admin.firestore().collection("url_review_opens").add(Object.assign({}, record, {
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    expireAt: keepUntil()
  }));
}

async function mailReviewedSites(ip, source) {
  const urls = reviewMail.reviewUrls(source);
  if (!urls.length) return;
  let record = null;
  const address = clip(ip, 80);
  if (address) {
    const snap = await admin.firestore().collection("url_review_opens").where("ip", "==", address).limit(8).get();
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
  await sendOwnerEmail({
    subject: "QA-lab URL Review was opened",
    intro: "Someone opened the QA-lab URL Review",
    rows: reviewMail.openRows(merged, 0)
  });
}

const urlReview = require("./url-review-core");
const newsWire = require("./news-wire");
const reviewDesk = require("./url-review-desk");
const reviewFailures = require("./url-review-failures");
const reviewPublish = require("./url-review-publish");
const REVIEW_ALERT_TO = "qa@carlosandmunoz.com";
const customerMail = require("./url-review-customer-mail");
const reviewOffers = require("./url-review-offers");
const REVIEW_FN_URL = process.env.REVIEW_FN_URL || "https://us-central1-carlosm-interactive-cv.cloudfunctions.net/reviewUrl";

async function stopLinkFor(email, lang) {
  const token = crypto.randomBytes(16).toString("hex");
  await admin.firestore().collection("url_review_stop_links").doc(token).set({
    email: String(email || "").trim().toLowerCase(),
    lang: customerMail.langOf(lang),
    createdAt: new Date().toISOString(),
    expireAt: keepUntil()
  });
  return REVIEW_FN_URL + "/notes/stop?t=" + token;
}

async function sendAskerMail(email, mail, stopUrl, category, attachments) {
  const from = prepareMail();
  if (!from) return false;
  await sgMail.send(Object.assign({
    to: email,
    from: from,
    replyTo: REVIEW_ALERT_TO,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
    categories: [category],
    trackingSettings: { clickTracking: { enable: false, enableText: false }, openTracking: { enable: false } },
    headers: {
      "List-Unsubscribe": "<" + stopUrl + ">",
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click"
    }
  }, attachments && attachments.length ? { attachments } : {}));
  return true;
}

async function reportPdfFor(record) {
  const key = process.env.BROWSER_KEY;
  if (!key) return null;
  try {
    const page = customerMail.reportPdf(record);
    const res = await fetch(BROWSER_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "x-review-key": key },
      body: JSON.stringify({ kind: "pdf", html: page.html }),
      signal: AbortSignal.timeout(60000)
    });
    const body = res.ok ? await res.json() : null;
    if (!body || !body.ok || !body.pdf || body.pdf.length > 7000000) return null;
    return { content: body.pdf, filename: page.filename, type: "application/pdf", disposition: "attachment" };
  } catch (error) {
    console.error("Report PDF failed:", error && error.message);
    return null;
  }
}

async function mailReportToAsker(record) {
  if (!record || !record.email || !record.report) return;
  if (record.status !== "complete" && record.status !== "stopped") return;
  const [stopUrl, pdf] = await Promise.all([stopLinkFor(record.email, record.lang), reportPdfFor(record)]);
  const mail = customerMail.reportMail(record, { stopUrl, attached: !!pdf });
  await sendAskerMail(record.email, mail, stopUrl, "url-review-report", pdf ? [pdf] : []);
}

async function sendReviewNotes() {
  if (process.env.REVIEW_NOTES_LIVE !== "1") return null;
  const db = admin.firestore();
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
exports.sendReviewNotes = withMail.pubsub.schedule("0 10 * * 1-6").timeZone("America/Bogota").onRun(() => sendReviewNotes());

async function rememberReview(kind, source) {
  const note = reviewDesk.alertFrom(kind, source || {});
  try {
    await admin.firestore().collection("url_review_alerts").add({
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
    await sendOwnerEmail({
      to: REVIEW_ALERT_TO,
      subject: note.subject,
      intro: note.title,
      rows: note.rows,
      body: note.detail
    });
  } catch (error) {
    console.error("Review alert mail failed:", error);
  }
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
    const snap = await admin.firestore().collection("url_review_free_runs").doc(key).get();
    return snap.exists;
  } catch (error) {
    console.error("Free-run lookup failed:", error);
    return false;
  }
}

async function reviewRowsFor(deviceId, ip) {
  const col = admin.firestore().collection("url_reviews");
  const [byDevice, byIp] = await Promise.all([
    deviceId ? col.where("deviceId", "==", deviceId).limit(20).get() : Promise.resolve({ docs: [] }),
    ip ? col.where("ip", "==", ip).limit(20).get() : Promise.resolve({ docs: [] })
  ]);
  const map = new Map();
  byDevice.docs.concat(byIp.docs).forEach((doc) => map.set(doc.id, Object.assign({ id: doc.id }, doc.data())));
  return Array.from(map.values()).map((row) => Object.assign({}, row, {
    createdAt: row.createdAt && row.createdAt.toDate ? row.createdAt.toDate().toISOString() : row.createdAt
  }));
}

async function couponFor(code, purpose, reportId) {
  const key = reviewOffers.cleanCode(code);
  if (!key) return null;
  try {
    const snap = await admin.firestore().collection("url_review_coupons").doc(key).get();
    const coupon = snap.exists ? Object.assign({ code: key }, snap.data()) : null;
    return reviewOffers.couponOpen(coupon, purpose, reportId) ? coupon : null;
  } catch (error) {
    console.error("Coupon lookup failed:", error);
    return null;
  }
}

async function runsForEmail(email) {
  if (!email) return [];
  const snap = await admin.firestore().collection("url_reviews").where("email", "==", email).select("status", "createdAt").limit(60).get();
  return snap.docs.map((doc) => doc.data());
}

async function returnPrice(priced, opts) {
  const cents = Math.round(Number(priced.usd) * 100);
  if (priced.billing === "scope") return reviewOffers.discountFor(cents, priced.count, {});
  const coupon = await couponFor(opts.coupon, opts.purpose, opts.reportId);
  const rows = opts.rows || (opts.purpose === "report" ? await runsForEmail(opts.email) : await reviewRowsFor(opts.deviceId, opts.ip));
  return reviewOffers.discountFor(cents, priced.count, { returns: reviewOffers.returnsBefore(rows, opts.before), coupon });
}

function dealFields(deal) {
  return deal && deal.percent
    ? { listUsd: deal.listUsd, percent: deal.percent, discountSource: deal.source, coupon: deal.code }
    : {};
}

async function mintReturnCoupon(note) {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const code = "BACK-" + Array.from({ length: 8 }, () => alphabet[crypto.randomInt(alphabet.length)]).join("");
  await admin.firestore().collection("url_review_coupons").doc(code).set({
    percent: Math.max(10, Number(note.percent) || 10),
    purposes: ["report", "new-run"],
    reportId: note.reportId || "",
    email: note.email,
    maxUses: 1,
    uses: 0,
    source: "return-note",
    validUntil: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    createdAt: new Date().toISOString()
  });
  return code;
}

async function redeemCoupon(code, record) {
  const key = reviewOffers.cleanCode(code);
  if (!key) return;
  const db = admin.firestore();
  try {
    await db.runTransaction(async (tx) => {
      const ref = db.collection("url_review_coupons").doc(key);
      const snap = await tx.get(ref);
      if (!snap.exists) return;
      tx.update(ref, { uses: Number((snap.data() || {}).uses || 0) + 1, lastUsedAt: new Date().toISOString() });
      tx.set(db.collection("url_review_redemptions").doc(), Object.assign({ code: key, at: new Date().toISOString(), expireAt: urlReview.paymentExpireAt() }, record));
    });
  } catch (error) {
    console.error("Coupon redemption failed:", error);
  }
}

const BROWSER_URL = process.env.BROWSER_URL || "https://europe-west1-carlosm-interactive-cv.cloudfunctions.net/reviewBrowser";

async function browseForReview(job, log) {
  const key = process.env.BROWSER_KEY;
  if (!key) return null;
  const res = await fetch(BROWSER_URL, {
    method: "POST",
    headers: { "content-type": "application/json", "x-review-key": key },
    body: JSON.stringify(Object.assign({}, job, { stream: true })),
    signal: AbortSignal.timeout(100000)
  });
  if (!res.ok) return { ok: false, error: res.status === 429 ? "the browser was busy" : "status " + res.status };
  if (!/ndjson/i.test(res.headers.get("content-type") || "")) return res.json();
  return readBrowserStream(res.body, log);
}

async function readBrowserStream(body, log) {
  const decoder = new TextDecoder();
  let buf = "";
  let result = null;
  const take = (part) => {
    if (!part.trim()) return;
    let msg;
    try { msg = JSON.parse(part); } catch (error) { return; }
    if (msg.type === "log" && typeof log === "function") log(String(msg.text || "").slice(0, 400));
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
const reviewOAuth = require("./url-review-oauth");
// Each OAuth provider registers exactly this address as its redirect URI.
const REVIEW_OAUTH_PAGE = "https://carlosandmunoz.com/qa-review.html";

// TTL deletes an account 12 months after its last sign-in; a manual delete counts too.
exports.dropReviewAuthUser = functions.firestore
  .document("url_review_accounts/{email}")
  .onDelete(async (snap, context) => {
    const email = (snap.data() || {}).email || context.params.email;
    const dropped = await reviewAuth.dropAuthUsers(admin.auth(), email);
    if (dropped) console.log("Dropped " + dropped + " Firebase Auth user(s) for a deleted review account.");
    return null;
  });

async function mailSignIn(started, lang) {
  const from = prepareMail();
  if (!from) return false;
  const mail = customerMail.signInMail(lang, started);
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
  if (!(await mailSignIn(started, input.lang))) {
    res.status(503).json({ error: "Sign-in email is not available right now. Try again later." });
    return;
  }
  res.status(200).json({ ok: true, id: started.id, sentTo: reviewAuth.maskEmail(started.email) });
}

async function reviewSignIn(req, res, pathName) {
  const store = reviewAuth.firestoreStore(admin.firestore());
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
    await sendSignIn(res, store, { email, deviceKey: body.deviceKey, ip: req.ip, lang: body.lang });
    return;
  }
  if (pathName.endsWith("/auth/email/finish")) {
    answer(await reviewAuth.finishEmail(store, body));
    return;
  }
  if (pathName.endsWith("/auth/provider")) {
    let decoded = null;
    try {
      decoded = await admin.auth().verifyIdToken(String(body.idToken || ""));
    } catch (error) {
      res.status(401).json({ error: "That sign-in was not accepted. Try again." });
      return;
    }
    const result = await reviewAuth.providerSignIn(store, decoded, { deviceKey: body.deviceKey, profile: body.profile, googleAccessToken: body.googleAccessToken, enabled });
    if (result.verifyEmail) {
      await sendSignIn(res, store, { email: result.email, provider: result.provider, uid: result.uid, deviceKey: body.deviceKey, ip: req.ip, lang: body.lang });
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
      await sendSignIn(res, store, { email: result.email, provider: result.provider, uid: result.uid, deviceKey: body.deviceKey, ip: req.ip, lang: body.lang });
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
  const db = admin.firestore();
  const signedIn = await reviewAuth.checkSession(reviewAuth.firestoreStore(db), Object.assign({}, req.body || {}, { touch: false }));
  if (!signedIn.ok) {
    res.status(signedIn.status).json({ error: signedIn.error, signIn: true });
    return;
  }
  if (pathName.endsWith("/account/runs")) {
    const snap = await db.collection("url_reviews").where("email", "==", signedIn.email).limit(200).get();
    res.status(200).json(reviewOffers.accountFile(snap.docs.map((doc) => Object.assign({ id: doc.id }, doc.data())), signedIn.email));
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
  res.status(404).json({ error: "Not found." });
}

exports.reviewUrl = functions.runWith({ timeoutSeconds: 180, memory: "512MB", secrets: ["SENDGRID_API_KEY"] }).https.onRequest(async (req, res) => {
  const origin = reviewOrigin(req);
  res.set("Access-Control-Allow-Origin", origin);
  res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");
  res.set("Access-Control-Allow-Credentials", "true");
  res.set("Cache-Control", "no-store");
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }
  const pathName = String(req.path || "/");
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
      if (!res.headersSent) res.status(500).json({ error: "Your runs did not load. Try again in a moment." });
    }
    return;
  }
  const deskRoutes = [
    ["/desk/failures/data", "failures-data"],
    ["/desk/data", "data"],
    ["/desk/pass", "pass"],
    ["/desk/free", "free"],
    ["/desk/rerun", "rerun"]
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
      res.status(bearer ? 403 : 401).json({ error: bearer ? "This Google account cannot open the desk." : "Sign in with the operator Google account." });
      return;
    }
    if (deskName === "data" && req.method === "GET") {
      const [reviewSnap, alertSnap, freeSnap, noteSnap, rerunSnap] = await Promise.all([
        admin.firestore().collection("url_reviews").limit(400).get(),
        admin.firestore().collection("url_review_alerts").limit(80).get(),
        admin.firestore().collection("url_review_free_runs").limit(200).get(),
        admin.firestore().collection("url_review_notes").limit(1000).get(),
        admin.firestore().collection("url_review_reruns").orderBy("at", "desc").limit(30).get()
      ]);
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
      res.status(200).json(Object.assign(reviewDesk.snapshot(records, alerts, [], notes), { freeRuns, reruns }));
      return;
    }
    if (deskName === "failures-data" && req.method === "GET") {
      const db = admin.firestore();
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
      const send = req.body && req.body.send === true;
      const db = admin.firestore();
      const ref = db.collection("url_review_reruns").doc(id || "-");
      const decidedAt = new Date().toISOString();
      let doc = null;
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const data = snap.exists ? snap.data() : null;
        if (!data || data.status !== "held" || !data.record) return;
        doc = data;
        tx.update(ref, { status: send ? "sent" : "dropped", decidedAt, by: operator });
      });
      if (!doc) {
        res.status(409).json({ error: "That re-run is not waiting for a decision." });
        return;
      }
      if (!send) {
        res.status(200).json({ ok: true, status: "dropped" });
        return;
      }
      const record = reviewFailures.sentRecord(doc, decidedAt);
      await db.collection("url_reviews").doc(record.id).set(record);
      await countReviewed(record.report);
      let mailed = true;
      try {
        await mailReportToAsker(record);
      } catch (error) {
        mailed = false;
        console.error("Re-run mail to the asker failed:", error);
        await ref.update({ mailError: String((error && error.message) || "mail failed").slice(0, 200) });
      }
      res.status(200).json({ ok: true, status: "sent", reportId: record.id, mailed });
      return;
    }
    if (deskName === "free" && req.method === "POST") {
      const key = freeRunKey(req.body && req.body.email);
      if (!key) {
        res.status(400).json({ error: "That address is missing." });
        return;
      }
      const ref = admin.firestore().collection("url_review_free_runs").doc(key);
      if (req.body && req.body.on === false) {
        await ref.delete();
      } else {
        await ref.set({
          note: String((req.body && req.body.note) || "").trim().slice(0, 120),
          at: admin.firestore.FieldValue.serverTimestamp(),
          by: operator
        });
      }
      res.status(200).json({ ok: true, email: key, on: !(req.body && req.body.on === false) });
      return;
    }
    if (deskName === "pass" && req.method === "POST") {
      const email = String((req.body && req.body.email) || "").trim().toLowerCase();
      const offers = require("./url-review-offers");
      const chosen = offers.planById((req.body && req.body.plan) || "glance");
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
      await admin.firestore().collection("url_reviews").add(record);
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
      const [reviewSnap, unlistedSnap] = await Promise.all([
        admin.firestore().collection("url_reviews").where("createdAt", ">", since).orderBy("createdAt").limit(500).get(),
        admin.firestore().collection("url_review_unlisted").get()
      ]);
      const unlisted = unlistedSnap.docs.map((doc) => doc.id);
      const records = reviewSnap.docs.map((doc) => doc.data());
      const picked = reviewPublish.selectPublishable(records, unlisted);
      const until = records.length ? records[records.length - 1].createdAt : since;
      res.status(200).json({ since, until, read: records.length, held: picked.held, unlisted, reports: picked.reports });
    } catch (error) {
      console.error("Publishable reviews failed:", error);
      res.status(503).json({ error: "The reviews are not available right now." });
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
    const linkSnap = token.length === 32 ? await admin.firestore().collection("url_review_stop_links").doc(token).get() : null;
    const link = linkSnap && linkSnap.exists ? linkSnap.data() : null;
    if (!link || !link.email) {
      res.status(404).send(customerMail.stopPage("en", "gone"));
      return;
    }
    if (req.method !== "POST") {
      res.status(200).send(customerMail.stopPage(link.lang, "ask"));
      return;
    }
    await admin.firestore().collection("url_review_notes").add({
      status: "follow-stop",
      email: link.email,
      via: "link",
      createdAt: new Date().toISOString()
    });
    await rememberReview("follow-stop", { status: "follow-stop", email: link.email });
    res.status(200).send(customerMail.stopPage(link.lang, "done", link.email));
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
  if (req.method === "POST" && pathName.indexOf("/stop") !== -1) {
    const runId = String((req.body && req.body.runId) || "").replace(/[^a-f0-9]/g, "").slice(0, 32);
    if (runId) {
      await admin.firestore().collection("url_review_stops").doc(runId).set({ at: new Date().toISOString(), expireAt: keepUntil() });
    }
    res.status(200).json({ ok: true });
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
    await admin.firestore().collection("url_review_captures").add({
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
  if (req.method === "GET" && pathName.indexOf("/checkout/quote") !== -1) {
    try {
      const priced = req.query.purpose === "credentials"
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
            billing: String(req.query.billing || "")
          })
          : urlReview.priceFor(String(req.query.frameworks || ""), String(req.query.tools || ""));
      const quotePurpose = req.query.purpose === "report" ? "report" : (req.query.pages && !req.query.layers ? "new-run" : "");
      let deal = null;
      if (quotePurpose) {
        const quoteReport = String(req.query.reportId || "").replace(/[^a-f0-9]/g, "").slice(0, 32);
        let owner = {};
        if (quotePurpose === "report" && quoteReport) {
          const ownerSnap = await admin.firestore().collection("url_reviews").doc(quoteReport).get();
          owner = ownerSnap.exists ? ownerSnap.data() : {};
        }
        deal = await returnPrice(priced, {
          purpose: quotePurpose,
          reportId: quoteReport,
          email: owner.email,
          before: owner.createdAt,
          coupon: req.query.coupon,
          deviceId: String(req.query.deviceId || "").replace(/[^a-f0-9]/g, "").slice(0, 32),
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
        perFramework: priced.each
      }, dealFields(deal)));
    } catch (error) {
      res.status(error.status || 502).json({ error: error.message || "The peso price could not be loaded." });
    }
    return;
  }
  if (req.method === "POST" && pathName.indexOf("/checkout") !== -1) {
    const purpose = ["report", "cases", "credentials", "alerts"].indexOf(req.body && req.body.purpose) === -1 ? "new-run" : req.body.purpose;
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
        if (!result.paid) {
          res.status(402).json({
            paid: false,
            pending: !!result.pending,
            error: result.pending ? "The payment is still pending. Nothing was unlocked." : "The payment is not confirmed. No charge was recorded here."
          });
          return;
        }
        const existing = await admin.firestore().collection("url_reviews").where("sessionId", "==", result.sessionId).limit(1).get();
        if (!existing.empty) {
          const prior = existing.docs[0].data() || {};
          res.status(200).json({ paid: true, purpose: prior.purpose === "report" ? "report" : "new-run" });
          return;
        }
        let paidPurpose = result.purpose === "report" ? "report" : "new-run";
        let paidReport = String(result.reportId || "").replace(/[^a-f0-9]/g, "").slice(0, 32);
        let payer = String(result.deviceId || deviceId).replace(/[^a-f0-9]/g, "").slice(0, 32);
        let paidFrameworks = result.frameworks || [];
        let paidTools = result.tools || [];
        let paidPrice = result.amount || 0;
        if (choice !== "stripe") {
          if (!result.reference) {
            res.status(402).json({ paid: false, error: "This payment does not match an open checkout." });
            return;
          }
          const openSnap = await admin.firestore().collection("url_reviews").doc(result.reference).get();
          const open = openSnap.exists ? openSnap.data() : null;
          const sameLink = !result.linkId || (open && open.externalId === result.linkId);
          if (!open || open.status !== "checkout-open" || open.provider !== result.provider || open.amount !== result.amount || !sameLink || (open.test === true) !== testRun) {
            res.status(402).json({ paid: false, error: "This payment does not match an open checkout." });
            return;
          }
          paidPurpose = open.purpose === "report" ? "report" : "new-run";
          paidReport = String(open.reportId || "").replace(/[^a-f0-9]/g, "").slice(0, 32);
          payer = String(open.deviceId || deviceId).replace(/[^a-f0-9]/g, "").slice(0, 32);
          paidFrameworks = open.frameworks || [];
          paidTools = open.tools || [];
          paidPrice = open.priceUsd || result.amount;
          if (open.coupon) await redeemCoupon(open.coupon, { reference: result.reference, purpose: paidPurpose, reportId: paidReport, priceUsd: paidPrice, listUsd: open.listUsd || null, percent: open.percent || 0, test: testRun });
          result.pages = open.pages;
          result.depth = open.depth;
          result.billing = open.billing;
        }
        if (paidPurpose === "report" && paidReport) {
          await admin.firestore().collection("url_reviews").doc(paidReport).set({
            paid: true,
            sessionId: result.sessionId,
            provider: result.provider,
            test: testRun
          }, { merge: true });
          await rememberReview("paid", {
            id: paidReport,
            status: "paid-report",
            paid: true,
            test: testRun,
            priceUsd: paidPrice,
            provider: result.provider,
            purpose: paidPurpose,
            frameworks: paidFrameworks
          });
        } else {
          const credit = {
            status: "run-credit",
            paid: true,
            test: testRun,
            provider: result.provider,
            method: choice,
            deviceId: payer,
            sessionId: result.sessionId,
            purpose: paidPurpose,
            frameworks: paidFrameworks,
            tools: paidTools,
            pages: result.pages || urlReview.INCLUDED_PAGES,
            depth: result.depth || urlReview.INCLUDED_DEPTH,
            billing: result.billing || "run",
            createdAt: new Date().toISOString(),
            priceUsd: paidPrice,
            amount: result.amount,
            currency: result.currency,
            expireAt: urlReview.paymentExpireAt()
          };
          await admin.firestore().collection("url_reviews").add(credit);
          await rememberReview("run-paid", credit);
        }
        res.status(200).json({ paid: true, purpose: paidPurpose });
        return;
      }
      const reference = crypto.randomBytes(8).toString("hex");
      let priced = null;
      let reportData = {};
      if (purpose === "cases") {
        priced = urlReview.priceForLayers((req.body && req.body.layers) || []);
      } else if (purpose === "credentials") {
        priced = urlReview.priceForCredentials();
      } else if (purpose === "alerts") {
        priced = urlReview.priceForAlerts(req.body && req.body.alertCount);
      } else if (purpose === "report") {
        const reportSnap = await admin.firestore().collection("url_reviews").doc(reportId).get();
        reportData = reportSnap.exists ? reportSnap.data() : {};
        priced = urlReview.priceFor((reportData && reportData.frameworks) || [], urlReview.toolsForCharge((reportData && reportData.report && reportData.report.tools) || [], req.body && req.body.tools));
      } else {
        priced = urlReview.priceForRun({
          frameworks: (req.body && req.body.frameworks) || [],
          tools: req.body && req.body.tools,
          pages: req.body && req.body.pages,
          depth: req.body && req.body.depth,
          billing: req.body && req.body.billing
        });
      }
      let deal = null;
      if (purpose === "report" || purpose === "new-run") {
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
      const base = origin + "/qa-review-pay.html?purpose=" + purpose + "&provider=" + choice;
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
        alertCount: priced.alertCount,
        priceUsd: priced.usd,
        listUsd,
        successUrl,
        cancelUrl,
        pendingUrl
      }, keys));
      await admin.firestore().collection("url_reviews").doc(reference).set(Object.assign({
        status: "checkout-open",
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
        pages: priced.pages || null,
        depth: priced.depth || null,
        billing: priced.billing || "",
        priceUsd: priced.usd,
        amount: session.amount,
        currency: session.currency,
        paid: false,
        test: testRun,
        createdAt: new Date().toISOString()
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
  if (req.method === "GET") {
    const id = String(req.query.id || "").replace(/[^a-f0-9]/g, "").slice(0, 32);
    if (!id) {
      res.status(400).json({ error: "Missing report id." });
      return;
    }
    const snap = await admin.firestore().collection("url_reviews").doc(id).get();
    if (!snap.exists) {
      res.status(404).json({ error: "That report was not found." });
      return;
    }
    const data = snap.data() || {};
    const free = data.free === true || await hasFreeRuns(data.email);
    if (!data.paid && !free) {
      let priced = { usd: urlReview.PRICE_PER_FRAMEWORK, frameworks: [] };
      try { priced = urlReview.priceFor(data.frameworks || []); } catch (error) { priced = { usd: urlReview.PRICE_PER_FRAMEWORK, frameworks: [], count: 1 }; }
      const deal = await returnPrice(priced, { purpose: "report", reportId: id, email: data.email, before: data.createdAt, coupon: req.query.coupon });
      res.status(402).json(Object.assign({
        paymentRequired: true,
        priceUsd: deal.usd,
        frameworks: priced.frameworks,
        id: id,
        host: data.report && data.report.host,
        status: data.status || "",
        preview: data.report ? urlReview.previewReport(data.report) : null
      }, dealFields(deal)));
      return;
    }
    res.status(200).json({ report: data.report || null, frameworks: data.frameworks || [], paid: true, free });
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ error: "Use POST." });
    return;
  }
  const signedIn = await reviewAuth.checkSession(reviewAuth.firestoreStore(admin.firestore()), req.body || {});
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
  const deviceId = String(intake.value.deviceId || hintedDevice).replace(/[^a-f0-9]/g, "").slice(0, 32);
  const ip = req.ip || "";
  const priorRows = free ? [] : await reviewRowsFor(deviceId, ip);
  const decision = free
    ? { ok: true }
    : urlReview.judgeAttempts(priorRows, { deviceId, ip }, intake.value);
  if (!decision.ok && decision.code === "payment") {
    const deal = await returnPrice({ usd: decision.priceUsd, count: decision.count, billing: decision.billing }, {
      purpose: "new-run",
      rows: priorRows,
      coupon: req.body && req.body.coupon
    });
    Object.assign(decision, { priceUsd: deal.usd }, dealFields(deal));
  }
  if (decision.ok && decision.consumeId) {
    await admin.firestore().collection("url_reviews").add({
      status: "run-credit-used",
      creditId: decision.consumeId,
      deviceId,
      createdAt: new Date().toISOString(),
      expireAt: urlReview.paymentExpireAt()
    });
    await rememberReview("credit", { status: "run-credit-used", deviceId, creditId: decision.consumeId });
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
    await admin.firestore().collection("url_reviews").add(denied);
    await rememberReview(denied.status === "payment-due" ? "payment-due" : "blocked", denied);
    await mailReviewedSites(ip, denied);
    res.status(decision.code === "payment" ? 402 : 429).json({
      error: decision.message,
      paymentRequired: decision.code === "payment",
      purpose: decision.code === "payment" ? "new-run" : "",
      priceUsd: decision.priceUsd || 0,
      frameworks: decision.frameworks || [],
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
  const runId = String((req.body && req.body.runId) || "").replace(/[^a-f0-9]/g, "").slice(0, 32);
  let stopped = false;
  const stopTimer = runId ? setInterval(async () => {
    try {
      const snap = await admin.firestore().collection("url_review_stops").doc(runId).get();
      if (snap.exists) stopped = true;
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
      const col = admin.firestore().collection("url_review_failures");
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
    const report = await urlReview.reviewTarget(intake.value.url, {
      log: (text) => writeLine({ type: "log", text }),
      stopped: () => stopped,
      maxPages: intake.value.pages,
      maxDepth: intake.value.depth,
      browse: browseForReview,
      pagespeed: process.env.PAGESPEED_KEY ? (url) => urlReview.pageSpeed(url, process.env.PAGESPEED_KEY) : undefined,
      webrisk: process.env.WEBRISK_KEY ? (url) => urlReview.webRisk(url, process.env.WEBRISK_KEY) : undefined
    });
    const record = urlReview.intakeRecord(intake.value, report, {
      ip,
      deviceId,
      userAgent: req.get("user-agent"),
      acceptLanguage: req.get("accept-language"),
      country: req.get("x-appengine-country") || "",
      region: req.get("x-appengine-region") || "",
      city: req.get("x-appengine-city") || ""
    });
    record.signInProvider = signedIn.provider;
    if (urlReview.testKeyMatches(req.body && req.body.testKey, process.env.QA_TEST_KEY)) record.test = true;
    if (free) Object.assign(record, { paid: true, free: true, priceUsd: 0 });
    writeLine({ type: "log", text: "Looking for your earlier reviews of " + report.host + "." });
    const history = await previousRun(intake.value.email, report);
    if (history) {
      report.history = history;
      writeLine({ type: "log", text: "Compared with your review of " + report.host + " from " + String(history.previousAt).slice(0, 10) + ": " + history.fixedCount + " fixed, " + history.freshCount + " new." });
    } else writeLine({ type: "log", text: "No earlier review of " + report.host + " under this email." });
    writeLine({ type: "log", text: "Saving the report." });
    await admin.firestore().collection("url_reviews").doc(report.id).set(record);
    await countReviewed(report);
    await rememberReview(record.status === "stopped" ? "stopped" : "report", record);
    if (record.status === "stopped") await saveRunLog("stopped");
    await mailReviewedSites(ip, record);
    writeLine({ type: "log", text: "Report saved. Emailing a copy to " + intake.value.email + "." });
    writeLine({ type: "done", report, frameworks: record.frameworks, paid: record.paid === true, free: record.free === true, priceUsd: record.priceUsd });
    try {
      await mailReportToAsker(record);
    } catch (error) {
      console.error("Report mail to the asker failed:", error);
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
      reason: error.message || "The review failed."
    };
    await rememberReview("failed", failed);
    await saveRunLog("failed", error);
    await mailReviewedSites(ip, failed);
    writeLine({ type: "error", error: error.message || "The review failed." });
    res.end();
  } finally {
    if (stopTimer) clearInterval(stopTimer);
    if (runId) admin.firestore().collection("url_review_stops").doc(runId).delete().catch(() => {});
  }
});

async function reviewTotals() {
  const ref = admin.firestore().collection("url_review_stats").doc("totals");
  const snap = await ref.get();
  if (snap.exists) return snap.data();
  const { AggregateField } = admin.firestore;
  const done = admin.firestore().collection("url_reviews").where("report.limits.pagesRead", ">", 0);
  const sums = (await done.aggregate({
    pages: AggregateField.sum("report.limits.pagesRead"),
    reviews: AggregateField.count()
  }).get()).data();
  const seeded = { pages: Number(sums.pages) || 0, reviews: Number(sums.reviews) || 0 };
  try {
    await ref.create(Object.assign({ seededAt: admin.firestore.FieldValue.serverTimestamp() }, seeded));
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
    const ref = admin.firestore().collection("url_review_stats").doc("totals");
    if (!(await ref.get()).exists) {
      await reviewTotals();
      return;
    }
    await ref.set({
      pages: admin.firestore.FieldValue.increment(pages),
      reviews: admin.firestore.FieldValue.increment(1),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  } catch (error) {
    console.error("Review totals update failed:", error);
  }
}

async function previousRun(email, report) {
  if (!email || !report || !report.host || !report.insights) return null;
  try {
    const snap = await admin.firestore().collection("url_reviews")
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

exports.reviewBrowser = require("firebase-functions/v2/https").onRequest({
  region: "europe-west1",
  memory: "4GiB",
  cpu: 4,
  concurrency: 1,
  maxInstances: 3,
  timeoutSeconds: 120
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
      : await browserJob.browse(job, stream ? (text) => line({ type: "log", text }) : null);
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
