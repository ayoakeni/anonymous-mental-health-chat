import { auth, db, messaging } from "./firebase";
import { doc, setDoc } from "firebase/firestore";
import { getToken, onMessage } from "firebase/messaging";

const VAPID_KEY =
  "BN5rmWlxmCqC7Dm1DttbTyKFJZYagCrw702IltHB9kcxanzosUft8hyUrx1kGkROotc3CneKvyPhHUGbTNY3S3Q";

/* Get FCM token + save to Firestore */
export const requestForToken = async () => {
  if (!messaging) return console.log("Messaging not supported");

  try {
    const token = await getToken(messaging, { vapidKey: VAPID_KEY });
    if (token) {
      console.log("FCM token:", token);
      const user = auth.currentUser;
      if (user) {
        await setDoc(doc(db, "usersNotification", user.uid), { fcmToken: token }, { merge: true });
        console.log("Token saved to Firestore for user:", user.uid);
      }
      return token;
    }
    console.log("No token – permission denied");
  } catch (e) {
    console.error("Token error:", e);
  }
};

/* Real-time foreground listener */
export const onMessageListener = (callback) => {
  if (!messaging) return () => {};
  return onMessage(messaging, callback);
};