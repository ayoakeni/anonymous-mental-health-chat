// functions/index.js
const { onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");

// Initialize Admin SDK
initializeApp();

exports.onAppointmentConfirmed = onDocumentUpdated(
  "appointments/{apptId}",
  async (event) => {
    const before = event.data.before.data();
    const after = event.data.after.data();

    // Only trigger when status changes from "pending" → "confirmed"
    if (before.status !== "pending" || after.status !== "confirmed") {
      return null;
    }

    const { clientUid, therapistName, date, time } = after;

    // Get user's FCM token
    const userDoc = await getFirestore().doc(`users/${clientUid}`).get();
    const token = userDoc.data()?.fcmToken;

    if (!token) {
      console.log("No FCM token for user:", clientUid);
      return null;
    }

    // PAYLOAD WITH SOUND + CLICK
    const payload = {
      token,
      notification: {
        title: "Appointment Confirmed!",
        body: `${therapistName} accepted your session on ${date} at ${time}`,
      },
      data: {
        url: "/client-dashboard"
      },
      webpush: {
        notification: {
          icon: "/anonymous-logo.png",
          badge: "/badge.png",
          sound: "/bell-notification.mp3",
          click_action: "https://yoursite.com/client-dashboard"
        },
        fcm_options: {
          link: "https://yoursite.com/client-dashboard"
        }
      }
    };

    try {
      await getMessaging().send(payload);
      console.log("Push sent to:", clientUid);
    } catch (error) {
      console.error("Push failed:", error);
    }

    return null;
  }
);