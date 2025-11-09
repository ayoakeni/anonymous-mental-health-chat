import { useEffect, useState, useMemo } from "react";
import { collection, query, where, onSnapshot, limit,
} from "firebase/firestore";
import { db } from "../utils/firebase";

const moodConfig = {
  happy: { emoji: "😊", label: "Happy" },
  sad: { emoji: "😢", label: "Sad" },
  anxious: { emoji: "😣", label: "Anxious" },
  neutral: { emoji: "😐", label: "Neutral" },
  excited: { emoji: "'😄", label: "Excited" },
};

export function useUserMoods(userIds = []) {
  const [moods, setMoods] = useState({});

  // Stable array – only changes when the set of IDs changes
  const stableIds = useMemo(() => {
    return userIds.length ? [...userIds].sort() : [];
  }, [userIds]);

  useEffect(() => {
    if (!stableIds.length) {
      setMoods({});
      return;
    }

    const q = query(
      collection(db, "moods"),
      where("userId", "in", stableIds),
      limit(50)
    );

    const unsub = onSnapshot(q, (snap) => {
      const latest = {};

      snap.docs.forEach((doc) => {
        const d = doc.data();
        const uid = d.userId;
        const ts = d.timestamp?.seconds || 0;
        const cfg = moodConfig[d.mood];
        if (cfg && (!latest[uid] || ts > (latest[uid].ts || 0))) {
          latest[uid] = { emoji: cfg.emoji, label: cfg.label, ts };
        }
      });

      // Only setState when the object actually changed
      if (JSON.stringify(latest) !== JSON.stringify(moods)) {
        setMoods(latest);
      }
    });

    return unsub;
    // eslint-disable-next-line
  }, [stableIds]);

  return moods;
}