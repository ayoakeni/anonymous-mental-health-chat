import { useEffect, useState } from "react";
import { db, auth } from "../utils/firebase";
import { collection, query, onSnapshot, limit } from "firebase/firestore";

export function useGroupChats(showError) {
  const [groupChats, setGroupChats] = useState([]);
  const [isLoadingGroupChats, setIsLoadingGroupChats] = useState(true);

  useEffect(() => {
    const therapistId = auth.currentUser?.uid;
    if (!therapistId) {
      setGroupChats([]);
      setIsLoadingGroupChats(false);
      return;
    }

    const q = query(collection(db, "groupChats"), limit(50));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const chats = snapshot.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            ...data,
            // Add flag: is this therapist currently a member?
            isMember: data.participants?.includes(therapistId) || false,
          };
        });
        setGroupChats(chats);
        setIsLoadingGroupChats(false);
      },
      (err) => {
        console.error("Error fetching group chats:", err);
        showError("Failed to load group chats.");
        setIsLoadingGroupChats(false);
      }
    );

    return () => unsubscribe();
  }, [showError]);

  return { groupChats, isLoadingGroupChats };
}