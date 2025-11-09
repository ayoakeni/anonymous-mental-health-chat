import { useState, useEffect, useRef, useCallback } from "react";
import { debounce } from "lodash";
import { db, auth } from "../utils/firebase";
import { doc, setDoc, serverTimestamp, collection, query, where, onSnapshot, limit,} from "firebase/firestore";

export const useTypingStatus = (displayName, chatId) => {
  const [typingUsers, setTypingUsers] = useState([]);
  const typingTimeoutRef = useRef(null);

  // Stable debounced function – recreated only when chatId or name change
  const debouncedUpdateTyping = useCallback(
    debounce(async (isTyping) => {
      if (!auth.currentUser?.uid || !chatId) return;

      const typingRef = doc(db, "typingStatus", `${chatId}_${auth.currentUser.uid}`);
      await setDoc(
        typingRef,
        {
          typing: isTyping,
          name: displayName,
          chatId,
          timestamp: serverTimestamp(),
        },
        { merge: true }
      );
    }, 800),
    [chatId, displayName]
  );

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

    const unsub = onSnapshot(q, (snap) => {
      const users = snap.docs.map((d) => d.data().name).filter(Boolean);

      // Avoid unnecessary re-renders
      if (JSON.stringify(users) !== JSON.stringify(typingUsers)) {
        setTypingUsers(users);
      }
    });

    return () => {
      unsub();
      debouncedUpdateTyping.cancel();
    };
  }, [chatId, debouncedUpdateTyping, typingUsers]);

  const handleTyping = (value) => {
    if (!chatId) return;
    const isTyping = value.trim() !== "";
    debouncedUpdateTyping(isTyping);

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    if (isTyping) {
      typingTimeoutRef.current = setTimeout(() => debouncedUpdateTyping(false), 3000);
    }
  };

  return { typingUsers, handleTyping };
};