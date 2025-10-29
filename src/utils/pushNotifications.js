import { messaging } from "./firebase";
import { getToken, onMessage } from "firebase/messaging";

const VAPID_KEY = "BN5rmWlxmCqC7Dm1DttbTyKFJZYagCrw702IltHB9kcxanzosUft8hyUrx1kGkROotc3CneKvyPhHUGbTNY3S3Q"; // Get from Firebase Console → Cloud Messaging → Web Push Certificates

export const requestForToken = async () => {
  if (!messaging) {
    console.log("Messaging not supported in this environment.");
    return;
  }

  try {
    const token = await getToken(messaging, { vapidKey: VAPID_KEY });
    if (token) {
      console.log("FCM Token:", token);
      // Optionally send to backend
    } else {
      console.log("No registration token available.");
    }
  } catch (err) {
    console.log("Error retrieving token:", err);
  }
};

export const onMessageListener = () =>
  new Promise((resolve) => {
    if (!messaging) return resolve(null);
    onMessage(messaging, (payload) => {
      resolve(payload);
    });
  });