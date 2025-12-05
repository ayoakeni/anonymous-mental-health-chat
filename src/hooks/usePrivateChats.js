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
      where("participants", "array-contains", uid),
      where("lastMessage", "!=", null) 
    );

    const unsub = onSnapshot(q, handleSnapshot, handleError);

    function handleSnapshot(snapshot) {
      const chats = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      }));

      setPrivateChats(prev => {
        const map = new Map(prev.map(c => [c.id, c]));
        chats.forEach(chat => map.set(chat.id, chat));
        const updated = Array.from(map.values());

        return updated.sort((a, b) => {
          const aActive = a.activeTherapist === uid;
          const bActive = b.activeTherapist === uid;
          if (aActive && !bActive) return -1;
          if (!aActive && bActive) return 1;

          const aUnread = (a.unreadCountForTherapist || 0) > 0;
          const bUnread = (b.unreadCountForTherapist || 0) > 0;
          if (aUnread && !bUnread) return -1;
          if (!aUnread && bUnread) return 1;

          return (b.lastUpdated?.toMillis() || 0) - (a.lastUpdated?.toMillis() || 0);
        });
      });
    }

    function handleError(err) {
      console.error("Error loading private chats:", err);
      showError("Failed to load private chats.");
      setIsLoadingPrivateChats(false);
    }

    setIsLoadingPrivateChats(false);

    return () => unsub();
  }, [uid, showError]);

  return { privateChats, isLoadingPrivateChats };
}