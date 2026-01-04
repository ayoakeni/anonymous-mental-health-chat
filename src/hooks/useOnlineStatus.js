import { useEffect } from "react";
import { auth, db } from "../utils/firebase";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { getAnonName } from "../login/anonymous_login";

export function useOnlineStatus() {
  useEffect(() => {
    if (!auth.currentUser) return;

    const userId = auth.currentUser.uid;
    const displayName = getAnonName();
    const onlineRef = doc(db, "usersOnline", userId);

    // Mark as online
    const goOnline = () => {
      setDoc(onlineRef, {
        online: true,
        lastSeen: serverTimestamp(),
        name: displayName || "Anonymous User",
      }, { merge: true });
    };

    // Mark as offline
    const goOffline = () => {
      setDoc(onlineRef, {
        online: false,
        lastSeen: serverTimestamp(),
      }, { merge: true });
    };

    // Set online immediately
    goOnline();

    // Handle page unload (close tab, refresh, navigation away)
    const handleUnload = () => goOffline();

    window.addEventListener("beforeunload", handleUnload);

    // Also handle visibility change (tab hidden)
    const handleVisibility = () => {
      if (document.hidden) {
        goOffline();
      } else {
        goOnline();
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.removeEventListener("beforeunload", handleUnload);
      document.removeEventListener("visibilitychange", handleVisibility);
      goOffline(); // cleanup
    };
  }, []);
}