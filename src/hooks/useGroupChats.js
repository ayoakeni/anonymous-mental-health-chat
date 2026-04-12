import { useEffect, useState, useMemo } from "react";
import { db, auth } from "../utils/firebase";
import { collection, query, onSnapshot, limit } from "firebase/firestore";

export function useGroupChats(showError) {
  const [groupChats, setGroupChats] = useState([]);
  const [isLoadingGroupChats, setIsLoadingGroupChats] = useState(true);
  const [groupSearchQuery, setGroupSearchQuery] = useState("");

  useEffect(() => {
    const therapistId = auth.currentUser?.uid;
    if (!therapistId) {
      setGroupChats([]);
      setIsLoadingGroupChats(false);
      return;
    }

    const q = query(collection(db, "groupChats"), limit(50));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const chats = snapshot.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            ...data,
            isMember: data.participants?.includes(therapistId) || false,
          };
        });
        setGroupChats(chats);
        setIsLoadingGroupChats(false);
      },
      (err) => {
        console.error("Error fetching group chats:", err);
        showError("Failed to load group chats.");
        setIsLoadingGroupChats(false);
      }
    );

    return () => unsubscribe();
  }, [showError]);

  const filteredGroupChats = useMemo(() => {
    if (!groupSearchQuery.trim()) return groupChats;
    const lower = groupSearchQuery.toLowerCase();
    return groupChats.filter((g) =>
      (g.name || "").toLowerCase().includes(lower) ||
      (g.lastMessage?.text || "").toLowerCase().includes(lower)
    );
  }, [groupChats, groupSearchQuery]);

  return { groupChats: filteredGroupChats, isLoadingGroupChats, groupSearchQuery, setGroupSearchQuery };
}