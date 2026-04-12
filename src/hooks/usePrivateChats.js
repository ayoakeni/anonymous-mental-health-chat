import { useEffect, useState, useMemo } from "react";
import { db, auth } from "../utils/firebase";
import { collection, query, where, onSnapshot } from "firebase/firestore";

export function usePrivateChats(showError) {
  const [privateChats, setPrivateChats] = useState([]);
  const [isLoadingPrivateChats, setIsLoadingPrivateChats] = useState(true);
  const [privateChatSearchQuery, setPrivateChatSearchQuery] = useState("");
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
        if (chat.activeTherapist === uid) return true;
        if (chat.activeTherapist && chat.activeTherapist !== uid) return false;
        if (chat.status === "new" && !chat.initialChoiceMade) return false;
        if (chat.status === "requesting" || chat.status === "waiting") return true;
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

  const filteredPrivateChats = useMemo(() => {
    if (!privateChatSearchQuery.trim()) return privateChats;
    const lower = privateChatSearchQuery.toLowerCase();
    return privateChats.filter((c) =>
      (c.lastMessage || "").toLowerCase().includes(lower)
    );
  }, [privateChats, privateChatSearchQuery]);

  return {
    privateChats,
    isLoadingPrivateChats,
    privateChatSearchQuery,
    setPrivateChatSearchQuery,
  };
}