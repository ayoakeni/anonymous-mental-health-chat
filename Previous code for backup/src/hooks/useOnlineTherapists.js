import { useEffect, useState } from "react";
import { db } from "../utils/firebase";
import { collection, query, where, onSnapshot, limit } from "firebase/firestore";

export function useOnlineTherapists(showError) {
  const [onlineTherapists, setOnlineTherapists] = useState([]);
  const [isAvailable, setIsAvailable] = useState(false);

  useEffect(() => {
    const q = query(
      collection(db, "therapists"),
      where("online", "==", true),
      limit(50)
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs
          .map((d) => {
            const data = d.data();
            return data?.name
              ? { uid: d.id, name: data.name, online: true }
              : null;
          })
          .filter(Boolean);

        setOnlineTherapists(list);
        setIsAvailable(list.length > 0);
      },
      (err) => showError("Failed to fetch online therapists.")
    );

    return unsub;
  }, [showError]);

  return { onlineTherapists, isTherapistAvailable: isAvailable };
}