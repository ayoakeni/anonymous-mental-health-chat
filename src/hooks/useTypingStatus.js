import { useState, useEffect, useRef, useCallback } from "react";
import { debounce } from "lodash";
import { db, auth } from "../utils/firebase";
import { doc, setDoc, serverTimestamp, collection, query, where, onSnapshot, limit,} from "firebase/firestore";

export const useTypingStatus = (displayName, chatId) => {
  const [typingUsers, setTypingUsers] = useState([]);
  const typingTimeoutRef = useRef(null);
  const debouncedUpdateTypingRef = useRef(null);

  // Create a *stable* debounced function (only when deps change)
  useEffect(() => {
    debouncedUpdateTypingRef.current = debounce((isTyping) => {
      if (!auth.currentUser?.uid || !chatId) return;

      const typingRef = doc(db, "typingStatus", `${chatId}_${auth.currentUser.uid}`);
      setDoc(
        typingRef,
        {
          typing: isTyping,
          name: displayName,
          chatId,
          timestamp: serverTimestamp(),
        },
        { merge: true }
      ).catch((err) => console.error("Failed to update typing status:", err));
    }, 800);

    // Cleanup on deps change or unmount
    return () => {
      debouncedUpdateTypingRef.current?.cancel();
    };
  }, [chatId, displayName]);

  // Expose a stable caller
  const updateTyping = useCallback((isTyping) => {
    debouncedUpdateTypingRef.current?.(isTyping);
  }, []);

  // Subscribe to Firestore typing status
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

      // Dedupe render
      if (JSON.stringify(users) !== JSON.stringify(typingUsers)) {
        setTypingUsers(users);
      }
    });

    return () => {
      unsub();
      debouncedUpdateTypingRef.current?.cancel();
    };
  }, [chatId]);

  // Public handler
  const handleTyping = useCallback(
    (value) => {
      if (!chatId) return;

      const isTyping = value.trim() !== "";
      updateTyping(isTyping);

      // Clear existing timeout
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }

      // Auto-stop after 3s of inactivity
      if (isTyping) {
        typingTimeoutRef.current = setTimeout(() => {
          updateTyping(false);
        }, 3000);
      }
    },
    [chatId, updateTyping]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      debouncedUpdateTypingRef.current?.cancel();
    };
  }, []);

  return { typingUsers, handleTyping };
};