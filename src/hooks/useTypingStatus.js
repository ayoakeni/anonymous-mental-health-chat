import { useState, useRef, useEffect } from "react";
import { collection, doc, onSnapshot, setDoc, serverTimestamp, query, where, limit } from "firebase/firestore";
import { db, auth } from "../utils/firebase";
import { debounce } from "lodash";

export const useTypingStatus = (displayName, chatId) => {
  const [typingUsers, setTypingUsers] = useState([]);
  const typingTimeoutRef = useRef(null);

  const debouncedUpdateTyping = debounce(async (isTyping) => {
    if (!auth.currentUser?.uid || !chatId) return;

    const typingRef = doc(db, "typingStatus", `${chatId}_${auth.currentUser.uid}`);
    const payload = {
      typing: isTyping,
      name: displayName,
      chatId,
      timestamp: serverTimestamp(),
    };

    try {
      await setDoc(typingRef, payload, { merge: true });
    } catch (err) {
      console.warn("Typing status failed:", err);
    }
  }, 800);

  useEffect(() => {
    if (!chatId) {
      setTypingUsers([]);
      return;
    }

    const q = query(
      collection(db, "typingStatus"),
      where("chatId", "==", chatId),
      where("typing", "==", true),
      limit(10)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const users = snapshot.docs
        .map(doc => doc.data().name)
        .filter(Boolean);
      setTypingUsers(users);
    });

    return () => {
      unsubscribe();
      debouncedUpdateTyping(false);
      debouncedUpdateTyping.flush();
    };
  }, [chatId, debouncedUpdateTyping]);

  const handleTyping = (value) => {
    if (!chatId) return;
    const isTyping = value.trim() !== "";
    debouncedUpdateTyping(isTyping);

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    if (isTyping) {
      typingTimeoutRef.current = setTimeout(() => {
        debouncedUpdateTyping(false);
      }, 3000);
    }
  };

  return { typingUsers, handleTyping };
};