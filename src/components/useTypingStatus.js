import { useState, useEffect, useRef } from "react";
import { collection, doc, onSnapshot, setDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db, auth } from "../utils/firebase";

export const useTypingStatus = (displayName) => {
  const [typingUsers, setTypingUsers] = useState([]);
  const typingTimeoutRef = useRef(null);

  // Listen for typing updates
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "typingStatus"), (snapshot) => {
      const currentlyTyping = snapshot.docs
        .filter((doc) => doc.data().typing)
        .map((doc) => doc.data().name);
      setTypingUsers(currentlyTyping);
    });

    return () => unsubscribe();
  }, []);

  // Function to call when input changes
  const handleTyping = async (value) => {
    if (!auth.currentUser?.uid) return;

    const typingDoc = doc(db, "typingStatus", auth.currentUser.uid);

    // Mark as typing
    try {
      await updateDoc(typingDoc, { typing: true, name: displayName, timestamp: serverTimestamp() });
    } catch {
      await setDoc(typingDoc, { typing: true, name: displayName, timestamp: serverTimestamp() });
    }

    // Clear previous timeout
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

    // Set timeout to mark as stopped typing
    typingTimeoutRef.current = setTimeout(async () => {
      try {
        await updateDoc(typingDoc, { typing: false });
      } catch {}
    }, 2000);
  };

  return { typingUsers, handleTyping };
};
