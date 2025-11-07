import { useEffect, useState } from "react";
import { db } from "../utils/firebase";
import { collection, query, onSnapshot, limit } from "firebase/firestore";

export function useGroupChats(showError) {
  const [chats, setChats] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, "groupChats"), limit(50));
    const unsub = onSnapshot(q, snap => {
      setChats(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, err => {
      showError("Failed to load group chats.");
      setLoading(false);
    });
    return unsub;
  }, [showError]);

  return { groupChats: chats, isLoadingGroupChats: loading };
}