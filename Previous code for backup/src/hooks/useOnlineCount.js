import { useEffect, useState } from "react";
import { db } from "../utils/firebase";
import { collection, query, where, onSnapshot } from "firebase/firestore";

export function useOnlineCount() {
  const [onlineCount, setOnlineCount] = useState(0);

  useEffect(() => {
    const q = query(
      collection(db, "anonymousUsers"),
      where("online", "==", true)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setOnlineCount(snapshot.size);
    });

    return unsubscribe;
  }, []);

  return onlineCount;
}