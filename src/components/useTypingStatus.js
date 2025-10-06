import { useState, useEffect, useRef } from "react";
import { collection, doc, onSnapshot, setDoc, updateDoc, serverTimestamp, query, limit } from "firebase/firestore";
import { db, auth } from "../utils/firebase";
import { debounce } from "lodash";

const logFirestoreOperation = (operation, count, details) => {
  console.log(`Firestore ${operation}: ${count} documents`, details);
};

export const useTypingStatus = (displayName) => {
  const [typingUsers, setTypingUsers] = useState([]);
  const typingTimeoutRef = useRef(null);
  const debouncedUpdateTyping = debounce(async (typing) => {
    if (!auth.currentUser?.uid) return;
    const typingDoc = doc(db, "typingStatus", auth.currentUser.uid);
    try {
      await updateDoc(typingDoc, { typing, name: displayName, timestamp: serverTimestamp() });
      logFirestoreOperation("write", 1, { collection: "typingStatus", doc: auth.currentUser.uid });
    } catch (err) {
      if (err.code === "not-found") {
        await setDoc(typingDoc, { typing, name: displayName, timestamp: serverTimestamp() });
        logFirestoreOperation("write", 1, { collection: "typingStatus", doc: auth.currentUser.uid });
      } else {
        console.error("Error updating typing status:", err);
        if (err.code === "resource-exhausted") {
          alert("Firestore quota exceeded. Please try again later.");
        }
      }
    }
  }, 1000);

  // Listen for typing updates
  useEffect(() => {
    const q = query(collection(db, "typingStatus"), limit(50));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const currentlyTyping = snapshot.docs
        .filter((doc) => doc.data().typing)
        .map((doc) => doc.data().name);
      logFirestoreOperation("read", snapshot.docs.length, { collection: "typingStatus" });
      setTypingUsers(currentlyTyping);
    }, (err) => {
      console.error("Error fetching typing status:", err);
      if (err.code === "resource-exhausted") {
        alert("Firestore quota exceeded. Please try again later.");
      }
    });
    return () => unsubscribe();
  }, []);

  // Function to call when input changes
  const handleTyping = (value) => {
    if (!auth.currentUser?.uid) return;
    debouncedUpdateTyping(value.trim() !== "");
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    if (value.trim()) {
      typingTimeoutRef.current = setTimeout(() => {
        debouncedUpdateTyping(false);
      }, 2000);
    }
  };

  return { typingUsers, handleTyping };
};