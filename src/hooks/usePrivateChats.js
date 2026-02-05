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
        // 🔑 HIDE chats where user hasn't chosen therapist yet
        // - status is "new" (before initial choice)
        // - aiActive is true (user chose AI assistant instead)
        if (chat.status === "new" || chat.aiActive === true) {
          // Only show to therapist if they're already assigned
          return chat.activeTherapist === uid;
        }

        // Therapist already handling it
        if (chat.activeTherapist === uid) return true;

        // Open queue (requesting / waiting) - user has chosen therapist
        if (!chat.activeTherapist) return true;

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