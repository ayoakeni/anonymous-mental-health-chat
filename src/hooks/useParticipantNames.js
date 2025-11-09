import { useEffect, useState, useRef } from "react";
import { db } from "../utils/firebase";
import {
  getDocs,
  collection,
  query,
  where,
  limit,
} from "firebase/firestore";

/**
 * Returns a map { uid: displayName } for every uid in `participantUids`.
 *
 * - Batches reads (max 10 uids per request – Firestore `in` limit)
 * - Caches results for the lifetime of the component
 * - Handles both `therapists` and `anonymousUsers` collections
 */
export function useParticipantNames(participantUids = []) {
  const [names, setNames] = useState({});
  const cacheRef = useRef(new Map()); // uid → name (persists across re-renders)

  useEffect(() => {
    if (!participantUids.length) {
      setNames({});
      return;
    }

    // Remove any uids that are no longer in the list
    const uidSet = new Set(participantUids);
    for (const uid of cacheRef.current.keys()) {
      if (!uidSet.has(uid)) cacheRef.current.delete(uid);
    }

    // Split into chunks of 10 (Firestore `in` limit)
    const chunks = [];
    for (let i = 0; i < participantUids.length; i += 10) {
      chunks.push(participantUids.slice(i, i + 10));
    }

    const fetchChunk = async (uids) => {
      // 1. Try therapists first
      const therapistQuery = query(
        collection(db, "therapists"),
        where("__name__", "in", uids),
        limit(10)
      );
      const therapistSnap = await getDocs(therapistQuery);

      const found = new Map();
      therapistSnap.forEach((d) => {
        found.set(d.id, d.data().name ?? `Therapist_${d.id.slice(0, 4)}`);
      });

      // 2. For the ones we didn’t find → try anonymousUsers
      const missing = uids.filter((uid) => !found.has(uid));
      if (missing.length) {
        const anonQuery = query(
          collection(db, "anonymousUsers"),
          where("__name__", "in", missing),
          limit(10)
        );
        const anonSnap = await getDocs(anonQuery);
        anonSnap.forEach((d) => {
          found.set(
            d.id,
            d.data().anonymousName ?? `Anon_${d.id.slice(0, 4)}`
          );
        });
      }

      // 3. Fill in defaults for any still-missing uids
      uids.forEach((uid) => {
        if (!found.has(uid)) {
          found.set(uid, `Anon_${uid.slice(0, 4)}`);
        }
      });

      return found;
    };

    // Run all chunks in parallel
    Promise.all(chunks.map(fetchChunk)).then((results) => {
      const merged = new Map();
      results.forEach((map) => {
        map.forEach((name, uid) => merged.set(uid, name));
      });

      // Update cache
      merged.forEach((name, uid) => cacheRef.current.set(uid, name));

      // Convert cache to plain object for React state
      const plain = Object.fromEntries(cacheRef.current);
      setNames(plain);
    });
  }, [participantUids]);

  return names;
}