import { useEffect, useState } from "react";
import { db, auth } from "../utils/firebase";
import { collection, query, onSnapshot, limit } from "firebase/firestore";

export function usePrivateChats(showError) {
  const [chats, setChats] = useState([]);
  const [loading, setLoading] = useState(true);
  const uid = auth.currentUser?.uid;

  useEffect(() => {
    if (!uid) {
      setLoading(false);
      return;
    }

    // Get ALL private chats (up to 50)
    const q = query(collection(db, "privateChats"), limit(50));

    const unsub = onSnapshot(
      q,
      (snap) => {
        const allChats = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

        // Filter locally: show if therapist is in OR has joined before
        const filtered = allChats.filter((chat) => {
          const isParticipant = chat.participants?.includes(uid);
          const hasJoinedBefore = chat.therapistJoinedOnce === true;
          return isParticipant || hasJoinedBefore;
        });

        setChats(filtered);
        setLoading(false);
      },
      (err) => {
        showError("Failed to load private chats.");
        setLoading(false);
      }
    );

    return unsub;
  }, [uid, showError]);

  return { privateChats: chats, isLoadingPrivateChats: loading };
}