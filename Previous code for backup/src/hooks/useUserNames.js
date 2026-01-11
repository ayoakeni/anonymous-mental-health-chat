import { useEffect, useState, useRef } from "react";
import { db } from "../utils/firebase";
import { collection, query, where, getDocs, limit } from "firebase/firestore";

/**
 * Generic hook to batch-fetch display names from any user collection.
 *
 * @param {Array} privateChats - Array of chat objects with `participants`
 * @param {string} currentUserId - Your own UID (to exclude)
 * @param {string} collectionName - "therapists" or "anonymousUsers"
 * @param {string} fallbackName - "Therapist" or "Anonymous"
 * @param {string} [nameField] - Optional: field to read (default: "name" or "anonymousName")
 *
 * @returns {Object} { chatId: displayName }
 */
export function useUserNames(
  privateChats = [],
  currentUserId,
  collectionName,
  fallbackName,
  nameField
) {
  const [names, setNames] = useState({});
  const cacheRef = useRef(new Map());

  useEffect(() => {
    if (!currentUserId || !privateChats.length) {
      setNames({});
      return;
    }

    // Map: otherUid → chatId
    const uidMap = new Map();
    privateChats.forEach((chat) => {
      const otherUid = chat.participants?.find((u) => u !== currentUserId);
      if (otherUid) uidMap.set(otherUid, chat.id);
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
        collection(db, collectionName),
        where("__name__", "in", chunk),
        limit(10)
      );
      const snap = await getDocs(q);

      const found = new Map();
      const field = nameField || (collectionName === "therapists" ? "name" : "anonymousName");

      snap.forEach((doc) => {
        const data = doc.data();
        const name = data?.[field]?.trim() || fallbackName;
        found.set(doc.id, name);
      });

      // Fill missing
      chunk.forEach((uid) => {
        if (!found.has(uid)) found.set(uid, fallbackName);
      });

      return found;
    };

    Promise.all(chunks.map(fetchChunk)).then((results) => {
      const merged = new Map();
      results.forEach((map) => map.forEach((name, uid) => merged.set(uid, name)));

      merged.forEach((name, uid) => cacheRef.current.set(uid, name));

      const result = {};
      uidMap.forEach((chatId, uid) => {
        result[chatId] = cacheRef.current.get(uid);
      });

      setNames(result);
    });
  }, [privateChats, currentUserId, collectionName, fallbackName, nameField]);

  return names;
}