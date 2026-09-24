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

async function sendOwnerEmail(subject, text) {
  const from = prepareMail();
  if (!from) return;
  await sgMail.send({
    to: OWNER_EMAIL,
    from: from,
    subject: clip(subject, 140),
    text: clip(text, 4000)
  });
}

exports.notifyOwnerOnMessage = withMail.firestore
  .document("messages/{messageId}")
  .onCreate(async (snap) => {
    const data = snap.data() || {};
    const topic = TOPIC_LABELS[data.topic] || data.topic || "—";
    const text = [
      "A new message was submitted on your CV.",
      "",
      "From: " + clip(data.name, 120) + " <" + clip(data.email, 120) + ">",
      "Topic: " + clip(topic, 80),
      data.fileURL ? "Attachment: yes" : "Attachment: no",
      "",
      clip(data.message, 2000)
    ].join("\n");
    try {
      await sendOwnerEmail("New CV message — " + clip(topic, 60), text);
    } catch (error) {
      console.error("Owner message notification failed:", error);
    }
    return null;
  });

exports.notifyOwnerOnRating = withMail.firestore
  .document("ratings/{ratingId}")
  .onCreate(async (snap) => {
    const data = snap.data() || {};
    const score = Math.min(5, Math.max(0, Number(data.rating) || 0));
    const text = [
      "New feedback was submitted on your CV.",
      "",
      "From: " + clip(data.name, 120) + " <" + clip(data.email, 120) + ">",
      "Rating: " + score + "/5",
      "",
      clip(data.comment, 2000) || "(no comment)"
    ].join("\n");
    try {
      await sendOwnerEmail("New CV feedback — " + score + "/5", text);
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
    const text = [
      "Someone opened your CV.",
      "Language: " + clip(visit.lang || "en", 12),
      visit.referrerHost ? "Referrer: " + clip(visit.referrerHost, 80) : "Referrer: direct",
      grouped ? grouped + " more visits in the last 15 minutes were included in this note." : ""
    ].filter(Boolean).join("\n");
    try {
      await sendOwnerEmail("Your CV was opened", text);
    } catch (error) {
      console.error("Owner visit notification failed:", error);
    }
    return null;
  });
