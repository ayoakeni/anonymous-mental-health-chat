import { useEffect, useState } from "react";
import { collection, query, where, onSnapshot, limit } from "firebase/firestore";
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

  useEffect(() => {
    if (!userIds.length) {
      setMoods({});
      return;
    }

    const q = query(
      collection(db, "moods"),
      where("userId", "in", userIds),
      limit(50)
    );

    const unsub = onSnapshot(q, (snap) => {
      const latest = {};

      snap.docs.forEach((doc) => {
        const data = doc.data();
        const uid = data.userId;
        const ts = data.timestamp?.seconds || 0;
        const config = moodConfig[data.mood];

        if (config && (!latest[uid] || ts > (latest[uid].ts || 0))) {
          latest[uid] = {
            emoji: config.emoji,
            label: config.label,
            ts,
          };
        }
      });

      setMoods(latest);
    });

    return unsub;
  }, [userIds.join(",")]);

  return moods;
}