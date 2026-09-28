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
        await admin.firestore().collection("mail").add(newMail);
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
        await admin.firestore().collection("mail").add(newMail);
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

async function sendOwnerEmail({ subject, intro, rows, body, respondUrl }) {
  const from = prepareMail();
  if (!from) return;
  const safeRows = (rows || []).filter((row) => row && row.value);
  const text = [
    intro,
    "",
    ...safeRows.map((row) => row.label + ": " + row.value),
    body ? "\n" + body : "",
    respondUrl ? "\nRespond: " + respondUrl : ""
  ].join("\n").slice(0, 4000);
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
    ? "<a href=\"" + escapeHtml(respondUrl) + "\" style=\"display:inline-block;margin-top:22px;background:#0e7490;color:#ffffff;text-decoration:none;font-family:Arial,sans-serif;font-size:14px;font-weight:bold;padding:12px 20px;border-radius:8px;\">Respond</a>"
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
    to: OWNER_EMAIL,
    from: from,
    subject: clip(subject, 140),
    text: text,
    html: html
  });
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
  .onCreate(async (snap) => {
    const visit = snap.data() || {};
    if (visit.source !== "cv") return null;
    const stateRef = admin.firestore().doc("notification_state/cv_access");
    const windowMs = 15 * 60 * 1000;
    let shouldSend = false;
    let grouped = 0;
    await admin.firestore().runTransaction(async (tx) => {
      const state = await tx.get(stateRef);
      const previous = state.exists ? state.data() : {};
      const last = previous.lastSentAt && previous.lastSentAt.toMillis ? previous.lastSentAt.toMillis() : 0;
      if (Date.now() - last < windowMs) {
        tx.set(stateRef, { pending: (previous.pending || 0) + 1 }, { merge: true });
        return;
      }
      grouped = previous.pending || 0;
      shouldSend = true;
      tx.set(stateRef, {
        lastSentAt: admin.firestore.FieldValue.serverTimestamp(),
        pending: 0
      }, { merge: true });
    });
    if (!shouldSend) return null;
    try {
      await sendOwnerEmail({
        subject: "Your CV was opened",
        intro: "Someone opened your CV",
        rows: [
          { label: "Language", value: clip(visit.lang || "en", 12) },
          { label: "Referrer", value: visit.referrerHost ? clip(visit.referrerHost, 80) : "Direct" },
          grouped ? { label: "Also", value: grouped + " more visits in the last 15 minutes" } : null
        ]
      });
    } catch (error) {
      console.error("Owner visit notification failed:", error);
    }
    return null;
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
