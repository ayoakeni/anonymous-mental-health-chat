import { useEffect, useState, useRef } from "react";
import { db } from "../utils/firebase";
import { collection, query, where, getDocs, limit } from "firebase/firestore";

/**
 * Returns { chatId: therapistName } for all private chats.
 * Batches reads (max 10 uids per request).
 */
export function useTherapistNamesForAnon(privateChats = [], userId) {
  const [names, setNames] = useState({});
  const cacheRef = useRef(new Map()); // uid → name

  useEffect(() => {
    // Extract therapist UIDs (the one that's not the current user)
    const uidMap = new Map(); // therapistUid → chatId
    privateChats.forEach((chat) => {
      const therapistUid = chat.participants?.find((u) => u !== userId);
      if (therapistUid) uidMap.set(therapistUid, chat.id);
    });

    const uids = Array.from(uidMap.keys());
    if (!uids.length) {
      setNames({});
      return;
    }

    // Clean stale cache
    for (const uid of cacheRef.current.keys()) {
      if (!uidMap.has(uid)) cacheRef.current.delete(uid);
    }

    // Chunk into 10s
    const chunks = [];
    for (let i = 0; i < uids.length; i += 10) {
      chunks.push(uids.slice(i, i + 10));
    }

    const fetchChunk = async (chunk) => {
      const q = query(
        collection(db, "therapists"),
        where("__name__", "in", chunk),
        limit(10)
      );
      const snap = await getDocs(q);

      const found = new Map();
      snap.forEach((doc) => {
        const name = doc.data()?.name?.trim() || "Therapist";
        found.set(doc.id, name);
      });

      // Fill missing
      chunk.forEach((uid) => {
        if (!found.has(uid)) found.set(uid, "Therapist");
      });

      return found;
    };

    Promise.all(chunks.map(fetchChunk)).then((results) => {
      const merged = new Map();
      results.forEach((map) => map.forEach((name, uid) => merged.set(uid, name)));

      // Update cache
      merged.forEach((name, uid) => cacheRef.current.set(uid, name));

      // Build { chatId: name }
      const result = {};
      uidMap.forEach((chatId, uid) => {
        result[chatId] = cacheRef.current.get(uid);
      });

      setNames(result);
    });
  }, [privateChats, userId]);

  return names;
}