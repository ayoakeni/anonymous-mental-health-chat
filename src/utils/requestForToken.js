import { messaging } from "../firebase";
import { getToken, onMessage } from "firebase/messaging";

const VAPID_KEY = "BN5rmWlxmCqC7Dm1DttbTyKFJZYagCrw702IltHB9kcxanzosUft8hyUrx1kGkROotc3CneKvyPhHUGbTNY3S3Q";

export const requestForToken = async () => {
  try {
    const token = await getToken(messaging, { vapidKey: VAPID_KEY });
    if (token) {
      console.log("FCM Token:", token);
      return token;
    } else {
      console.log("No token: Permission denied or not supported.");
    }
  } catch (err) {
    console.error("Error getting token:", err);
  }
};

export const onMessageListener = () =>
  new Promise((resolve) => {
    onMessage(messaging, (payload) => {
      console.log("Foreground message:", payload);
      resolve(payload);
    });
  });