import { useState, useEffect, useCallback, useRef } from "react";
import { db, auth } from "../utils/firebase";
import {
  doc,
  setDoc,
  serverTimestamp,
  onSnapshot,
  updateDoc,
  deleteField,
} from "firebase/firestore";

export const useTypingStatus = (displayName, chatId) => {
  const [typingUsers, setTypingUsers] = useState([]);
  const typingTimeoutRef = useRef(null);

  // Listen to typing status
  useEffect(() => {
    if (!chatId) {
      setTypingUsers([]);
      return;
    }

    const typingRef = doc(db, "typingStatus", chatId);

    const unsub = onSnapshot(typingRef, (snap) => {
      const data = snap.data() || {};
      const now = Date.now();

      const activeUsers = Object.entries(data.users || {})
        .filter(([uid, info]) => {
          if (uid === auth.currentUser?.uid) return false;
          if (!info.typing) return false;
          // Use client-side timestamp fallback
          const lastUpdate = info.clientTimestamp || 0;
          return now - lastUpdate < 5000;
        })
        .map(([_, info]) => info.name);

      setTypingUsers(activeUsers);
    });

    return () => unsub();
  }, [chatId]);

  // Send typing status — using client timestamp
  const sendTypingStatus = useCallback((isTyping) => {
    if (!chatId || !auth.currentUser?.uid) return;

    const typingRef = doc(db, "typingStatus", chatId);
    const field = `users.${auth.currentUser.uid}`;

    const payload = {
      [field]: {
        name: displayName || "Someone",
        typing: isTyping,
        clientTimestamp: Date.now(), // ← This works 100%
      },
    };

    // Remove timestamp field when stopping
    if (!isTyping) {
      updateDoc(typingRef, { [field]: deleteField() });
    } else {
      setDoc(typingRef, payload, { merge: true });
    }
  }, [chatId, displayName]);

  const handleTyping = useCallback((value) => {
    if (!chatId) return;

    const isTyping = value.trim() !== "";

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

    sendTypingStatus(isTyping);

    if (isTyping) {
      typingTimeoutRef.current = setTimeout(() => {
        sendTypingStatus(false);
      }, 4000);
    }
  }, [chatId, sendTypingStatus]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      if (chatId && auth.currentUser?.uid) {
        const typingRef = doc(db, "typingStatus", chatId);
        updateDoc(typingRef, {
          [`users.${auth.currentUser.uid}`]: deleteField(),
        }).catch(() => {});
      }
    };
  }, [chatId]);

  return { typingUsers, handleTyping };
};