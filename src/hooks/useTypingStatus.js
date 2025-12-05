import { useState, useEffect, useRef, useCallback } from "react";
import { debounce } from "lodash";
import { db, auth } from "../utils/firebase";
import {
  doc,
  setDoc,
  serverTimestamp,
  collection,
  query,
  where,
  onSnapshot,
  limit,
  updateDoc,
} from "firebase/firestore";

export const useTypingStatus = (displayName, chatId) => {
  const [typingUsers, setTypingUsers] = useState([]);
  const typingTimeoutRef = useRef(null);
  const lastSeenTimerRef = useRef(null);
  const debouncedUpdateTypingRef = useRef(null);

  // Debounced typing status update to Firestore
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

    return () => {
      debouncedUpdateTypingRef.current?.cancel();
    };
  }, [chatId, displayName]);

  const updateTyping = useCallback((isTyping) => {
    debouncedUpdateTypingRef.current?.(isTyping);
  }, []);

  // Update lastSeenAt while user is typing (every 3 seconds)
  const updateLastSeen = useCallback(() => {
    if (!chatId) return;
    updateDoc(doc(db, "privateChats", chatId), {
      lastSeenAt: serverTimestamp(),
    }).catch(() => {});
  }, [chatId]);

  // Listen to who is typing in this chat
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
      const users = snap.docs
        .map((d) => d.data().name)
        .filter(Boolean);

      setTypingUsers((prev) =>
        JSON.stringify(prev) === JSON.stringify(users) ? prev : users
      );
    });

    return () => unsub();
  }, [chatId]);

  // Main handler — call this from input onChange
  const handleTyping = useCallback(
    (value) => {
      if (!chatId) return;

      const isTyping = value.trim() !== "";

      // Update typing status
      updateTyping(isTyping);

      // Clear previous timeouts
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      if (lastSeenTimerRef.current) clearTimeout(lastSeenTimerRef.current);

      if (isTyping) {
        // Stop showing "typing" after 3 seconds of no input
        typingTimeoutRef.current = setTimeout(() => {
          updateTyping(false);
        }, 3000);

        // Update lastSeenAt every 3 seconds while typing
        updateLastSeen();
        lastSeenTimerRef.current = setTimeout(() => {
          if (value.trim() !== "") updateLastSeen();
        }, 3000);
      }
    },
    [chatId, updateTyping, updateLastSeen]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      if (lastSeenTimerRef.current) clearTimeout(lastSeenTimerRef.current);
      debouncedUpdateTypingRef.current?.cancel();
    };
  }, []);

  return { typingUsers, handleTyping };
};