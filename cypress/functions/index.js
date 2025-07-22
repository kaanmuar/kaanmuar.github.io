const functions = require("firebase-functions");
const admin = require("firebase-admin");
const sgMail = require("@sendgrid/mail");

// Initialize Firebase Admin SDK
admin.initializeApp();

// Get your SendGrid API key and destination email from environment variables
const SENDGRID_API_KEY = functions.config().sendgrid.key;
const DESTINATION_EMAIL = functions.config().notifications.email;

// Set the API key for the SendGrid mail client
sgMail.setApiKey(SENDGRID_API_KEY);

/**
 * Cloud Function to send an email notification for a new message.
 * Triggered when a new document is created in the 'messages' collection.
 */
exports.sendNewMessageNotification = functions.firestore
    .document("messages/{messageId}")
    .onCreate((snap, context) => {
      const newMessage = snap.data();

      // MODIFIED: Wrapped long lines to meet the 80-character limit
      const emailHtml = `
            <div style="font-family: sans-serif; padding: 20px;">
                <h2>New Message Received via Interactive CV</h2>
                <hr>
                <p><strong>From:</strong> ${newMessage.name}</p>
                <p><strong>Email:</strong> ${newMessage.email}</p>
                <p><strong>Topic:</strong> ${newMessage.topic}</p>
                <h3>Message:</h3>
                <p style="padding: 15px; background-color: #f4f4f4;
                    border-radius: 5px;">
                    ${newMessage.message}
                </p>
                ${newMessage.fileURL ?
                    `<p><strong>Attachment:</strong>
              <a href="${newMessage.fileURL}">View Attachment</a></p>` : ""}
            </div>
        `;

      const msg = {
        to: DESTINATION_EMAIL,
        from: DESTINATION_EMAIL,
        subject: `New CV Message from ${newMessage.name}`,
        html: emailHtml,
      };

      console.log("Sending new message notification email...");
      return sgMail.send(msg)
          .then(() => console.log("Email sent successfully!"))
          .catch((error) => console.error("Error sending email:", error));
    });

/**
 * Cloud Function to send an email notification for a new rating.
 * Triggered when a new document is created in the 'ratings' collection.
 */
exports.sendNewRatingNotification = functions.firestore
    .document("ratings/{ratingId}")
    .onCreate((snap, context) => {
      const newRating = snap.data();

      // MODIFIED: Wrapped long lines to meet the 80-character limit
      const stars = "★".repeat(newRating.rating) +
                    "☆".repeat(5 - newRating.rating);

      const emailHtml = `
            <div style="font-family: sans-serif; padding: 20px;">
                <h2>New CV Rating Received!</h2>
                <hr>
                <p>A new rating has been submitted and is pending your review
                    in the admin panel.</p>
                <p><strong>From:</strong> ${newRating.name}</p>
                <p><strong>Email:</strong> ${newRating.email}</p>
                <p><strong>Rating:</strong> ${stars} (${newRating.rating}/5)</p>
                <h3>Comment:</h3>
                <p style="padding: 15px; background-color: #f4f4f4;
                    border-radius: 5px;">
                    ${newRating.comment || "No comment provided."}
                </p>
            </div>
        `;

      const msg = {
        to: DESTINATION_EMAIL,
        from: DESTINATION_EMAIL,
        subject: `New CV Rating Received: ${newRating.rating} ★`,
        html: emailHtml,
      };

      console.log("Sending new rating notification email...");
      return sgMail.send(msg)
          .then(() => console.log("Email sent successfully!"))
          .catch((error) => console.error("Error sending email:", error));
    });
