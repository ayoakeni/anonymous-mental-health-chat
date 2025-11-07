import { useEffect, useState } from "react";
import { db } from "../utils/firebase";
import { doc, onSnapshot } from "firebase/firestore";

export function useAnonNames(privateChats, therapistId) {
  const [names, setNames] = useState({});

  useEffect(() => {
    const uids = privateChats
      .map(c => c.participants?.find(u => u !== therapistId))
      .filter(Boolean);
    const unsubs = uids.map(uid => {
      const ref = doc(db, "anonymousUsers", uid);
      return onSnapshot(ref, snap => {
        const chatId = privateChats.find(c => c.participants?.includes(uid))?.id;
        if (chatId) setNames(p => ({ ...p, [chatId]: snap.data()?.anonymousName?.trim() || "Anonymous" }));
      });
    });
    return () => unsubs.forEach(u => u());
  }, [privateChats, therapistId]);

  return names;
}