// src/hooks/useAllPrivateChats.js
import { useEffect, useState } from "react";
import { db } from "../utils/firebase";
import { collection, query, onSnapshot } from "firebase/firestore";

export function useAllPrivateChats(showError) {
  const [allPrivateChats, setAllPrivateChats] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, "privateChats"));

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const chats = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));

        setAllPrivateChats(chats);
        setLoading(false);
      },
      (err) => {
        console.error("Failed to load all private chats:", err);
        showError("Failed to load chats.");
        setLoading(false);
      }
    );

    return unsub;
  }, [showError]);

  return { allPrivateChats, loading };
}