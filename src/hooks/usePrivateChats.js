import { useEffect, useState } from "react";
import { db, auth } from "../utils/firebase";
import { collection, query, where, onSnapshot } from "firebase/firestore";

export function usePrivateChats(showError) {
  const [privateChats, setPrivateChats] = useState([]);
  const [isLoadingPrivateChats, setIsLoadingPrivateChats] = useState(true);
  const uid = auth.currentUser?.uid;

  useEffect(() => {
    if (!uid) {
      setPrivateChats([]);
      setIsLoadingPrivateChats(false);
      return;
    }

    const q = query(
      collection(db, "privateChats"),
      where("status", "in", ["requesting", "waiting", "active"])
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const allChats = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      }));

      const filtered = allChats.filter(chat => {
        // Therapist already handling it — always show
        if (chat.activeTherapist === uid) return true;

        // Hide chats taken by someone else
        if (chat.activeTherapist && chat.activeTherapist !== uid) return false;

        // Hide brand-new chats where user hasn't made their initial choice yet
        if (chat.status === "new" && !chat.initialChoiceMade) return false;

        // Show if user chose therapist (status is requesting/waiting)
        if (chat.status === "requesting" || chat.status === "waiting") return true;

        // Show if user is chatting with AI but no therapist has joined yet
        // Therapist can still join and take over
        if (chat.aiActive === true && !chat.activeTherapist) return true;

        return false;
      });

      const sorted = filtered.sort((a, b) => {
        const aIsNewRequest = !a.participants?.includes(uid);
        const bIsNewRequest = !b.participants?.includes(uid);

        if (aIsNewRequest && !bIsNewRequest) return -1;
        if (!aIsNewRequest && bIsNewRequest) return 1;

        return (b.lastUpdated?.toMillis() || 0) - (a.lastUpdated?.toMillis() || 0);
      });

      setPrivateChats(sorted);
      setIsLoadingPrivateChats(false);
    }, (error) => {
      console.error("Error loading private chats:", error);
      showError("Failed to load chats");
      setIsLoadingPrivateChats(false);
    });

    return () => unsub();
  }, [uid, showError]);

  return { privateChats, isLoadingPrivateChats };
}