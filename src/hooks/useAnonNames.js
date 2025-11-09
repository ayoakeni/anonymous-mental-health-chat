import { useEffect, useState, useRef } from "react";
import { db } from "../utils/firebase";
import { doc, getDoc } from "firebase/firestore";

export function useAnonNames(privateChats, therapistId) {
  const [names, setNames] = useState({});
  const cache = useRef(new Map());

  useEffect(() => {
    const uids = privateChats
      .map(chat => chat.participants?.find(u => u !== therapistId))
      .filter(Boolean);

    const fetchNames = async () => {
      const promises = uids.map(async (uid) => {
        if (cache.current.has(uid)) {
          return { uid, name: cache.current.get(uid) };
        }

        try {
          const snap = await getDoc(doc(db, "anonymousUsers", uid));
          const name = snap.exists() ? (snap.data()?.anonymousName?.trim() || "Anonymous") : "Unknown";
          cache.current.set(uid, name);
          return { uid, name };
        } catch (err) {
          console.warn("Failed to fetch anon name for", uid, err);
          return { uid, name: "Unknown" };
        }
      });

      const results = await Promise.all(promises);
      const newNames = {};
      results.forEach(({ uid, name }) => {
        const chatId = privateChats.find(c => c.participants?.includes(uid))?.id;
        if (chatId) newNames[chatId] = name;
      });
      setNames(prev => ({ ...prev, ...newNames }));
    };

    if (uids.length > 0) fetchNames();
  }, [privateChats, therapistId]);

  return names;
}