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
      where("lastMessage", "!=", null)
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const allChats = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      }));

      const filtered = allChats.filter(chat => {
        // 1. I am the active therapist → always see it
        if (chat.activeTherapist === uid) return true;

        // 2. Chat is open and waiting → visible in queue
        if (
          chat.status === "waiting" &&
          !chat.activeTherapist &&
          chat.lastMessage
        ) {
          return true;
        }

        // 3. Everything else is hidden
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