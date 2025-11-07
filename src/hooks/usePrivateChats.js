import { useEffect, useState } from "react";
import { db, auth } from "../utils/firebase";
import { collection, query, where, onSnapshot, limit } from "firebase/firestore";

export function usePrivateChats(showError) {
  const [chats, setChats] = useState([]);
  const [loading, setLoading] = useState(true);
  const uid = auth.currentUser?.uid;

  useEffect(() => {
    if (!uid) { setLoading(false); return; }
    const q = query(collection(db, "privateChats"), where("participants", "array-contains", uid), limit(50));
    const unsub = onSnapshot(q, snap => {
      setChats(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, err => {
      showError("Failed to load private chats.");
      setLoading(false);
    });
    return unsub;
  }, [uid, showError]);

  return { privateChats: chats, isLoadingPrivateChats: loading };
}