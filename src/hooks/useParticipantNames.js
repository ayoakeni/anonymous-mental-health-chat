import { useEffect, useState } from "react";
import { db } from "../utils/firebase";
import { doc, onSnapshot } from "firebase/firestore";

export function useParticipantNames(participantUids) {
  const [names, setNames] = useState({});

  useEffect(() => {
    if (!participantUids.length) return;
    const unsubs = participantUids.map(uid => {
      const tRef = doc(db, "therapists", uid);
      const aRef = doc(db, "anonymousUsers", uid);
      const unsubT = onSnapshot(tRef, snap => {
        if (snap.exists()) setNames(p => ({ ...p, [uid]: snap.data().name }));
        else {
          const unsubA = onSnapshot(aRef, snap2 => {
            setNames(p => ({ ...p, [uid]: snap2.exists() ? snap2.data().anonymousName : "Anon" }));
          });
          return unsubA;
        }
      });
      return unsubT;
    });
    return () => unsubs.forEach(u => u());
  }, [participantUids]);

  return names;
}