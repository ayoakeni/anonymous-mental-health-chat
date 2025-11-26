import { useEffect, useRef, useState, useCallback } from "react";
import { db, storage, serverTimestamp } from "../utils/firebase";
import {
  doc, collection, query, orderBy, onSnapshot, limit, getDocs, startAfter,
  runTransaction, arrayUnion, arrayRemove, deleteField
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

export function useActivePrivateChat(
  activeChatId,
  therapistId,
  displayName,
  playNotification,
  showError,
  navigate
) {
  const [messages, setMessages] = useState([]);
  const [events, setEvents] = useState([]);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [chatError, setChatError] = useState(null);
  const [validating, setValidating] = useState(false);
  const [inChat, setInChat] = useState(false);
  const prevMsgs = useRef([]);

  const unsubMsgs = useRef(() => {});
  const unsubEvents = useRef(() => {});

  // ---------- VALIDATE & JOIN ----------
  const join = useCallback(async (chatId = activeChatId) => {
    if (!therapistId || !chatId) return;

    setValidating(true);
    setChatError(null);
    const chatRef = doc(db, "privateChats", chatId);

    try {
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(chatRef);
        if (!snap.exists()) throw new Error("Chat not found");

        const data = snap.data();

        // NEW LOGIC: Allow join if:
        // 1. I'm already in participants → resume session
        // 2. OR user has sent a message (lastMessage exists) → open pool or requested me
        const iAmAlreadyIn = data.participants?.includes(therapistId);
        const userHasMessaged = !!data.lastMessage;

        if (!iAmAlreadyIn && !userHasMessaged) {
          throw new Error("This chat has no messages yet");
        }

        // Always allow joining if user has messaged
        if (!iAmAlreadyIn) {
          tx.update(chatRef, {
            participants: arrayUnion(therapistId),
            activeTherapist: therapistId,
            status: "active",
            unreadCountForTherapist: 0,
            aiActive: false,
            aiOffered: true,
            // Clean up old fields if they exist
            pendingTherapist: deleteField(),
            requestedTherapist: deleteField(), // optional: keep for analytics only
          });
        } else {
          // Just resuming
          tx.update(chatRef, {
            activeTherapist: therapistId,
            unreadCountForTherapist: 0,
          });
        }

        tx.set(doc(collection(chatRef, "events")), {
          type: "join",
          user: displayName,
          text: `${displayName} has joined the chat.`,
          role: "system",
          timestamp: serverTimestamp(),
        });
      });

      setInChat(true);
    } catch (e) {
      console.error("Join failed:", e);
      setChatError(e.message || "Failed to join chat");
      navigate("/therapist-dashboard/private-chat");
    } finally {
      setValidating(false);
    }
  }, [activeChatId, therapistId, displayName, navigate]);

  // ---------- LEAVE ----------
  const leave = useCallback(async () => {
    if (!activeChatId || !therapistId) return;
    const chatRef = doc(db, "privateChats", activeChatId);

    try {
      await runTransaction(db, async (tx) => {
        const chatSnap = await tx.get(chatRef);
        if (!chatSnap.exists()) throw new Error("Chat not found");

        const data = chatSnap.data();

        tx.update(chatRef, {
          activeTherapist: null,
          status: "waiting",
          aiActive: false,
          aiOffered: false,
          participants: arrayRemove(therapistId),
        });

        // keep history of who ended it
        tx.set(doc(collection(chatRef, "events")), {
          type: "leave",
          user: displayName,
          text: `${displayName} has ended the session.`,
          role: "system",
          timestamp: serverTimestamp(),
        });
      });

      // Clear local state
      setMessages([]);
      setEvents([]);
      setInChat(false);

      // Navigate back to list
      navigate("/therapist-dashboard/private-chat");
    } catch (e) {
      console.error("Failed to end session:", e);
      showError("Failed to end session properly.");
    }
  }, [activeChatId, therapistId, displayName, navigate, showError]);

  // ---------- SEND ----------
  const sendMessage = async (text, file = null) => {
    if (!text.trim() && !file) return;
    if (!activeChatId) return;

    let fileUrl = "";
    if (file) {
      if (file.size > 5 * 1024 * 1024) return showError("File too large");
      const sRef = ref(storage, `privateChats/${activeChatId}/${Date.now()}_${file.name}`);
      await uploadBytes(sRef, file);
      fileUrl = await getDownloadURL(sRef);
    }

    await runTransaction(db, async (tx) => {
      const msgRef = doc(collection(db, `privateChats/${activeChatId}/messages`));
      tx.set(msgRef, {
        text: text || "",
        fileUrl,
        userId: therapistId,
        displayName,
        role: "therapist",
        timestamp: serverTimestamp(),
      });
      tx.update(doc(db, "privateChats", activeChatId), {
        lastMessage: text || "Attachment",
        lastUpdated: serverTimestamp(),
        unreadCountForTherapist: 0,
      });
    });
  };

  // ---------- REACTION ----------
  const toggleReaction = async (msgId, emoji) => {
    const msgRef = doc(db, `privateChats/${activeChatId}/messages`, msgId);
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(msgRef);
      if (!snap.exists()) return;
      const reactions = snap.data().reactions || {};
      const list = reactions[emoji] || [];
      const updated = list.includes(therapistId)
        ? list.filter(id => id !== therapistId)
        : [...list, therapistId];
      tx.update(msgRef, { [`reactions.${emoji}`]: updated });
    });
  };

  // ---------- DELETE ----------
  const deleteMessage = async (msgId) => {
    await runTransaction(db, async (tx) => {
      const msgRef = doc(db, `privateChats/${activeChatId}/messages`, msgId);
      tx.delete(msgRef);
      tx.set(doc(collection(db, `privateChats/${activeChatId}/events`)), {
        type: "delete",
        user: displayName,
        text: `Message deleted by ${displayName}`,
        role: "system",
        timestamp: serverTimestamp(),
      });
    });
  };

  // ---------- LOAD MORE ----------
  const loadMore = useCallback(async () => {
    if (!activeChatId || !hasMore || loading) return;
    setLoading(true);
    try {
      const last = messages[messages.length - 1];
      const q = query(
        collection(db, `privateChats/${activeChatId}/messages`),
        orderBy("timestamp", "desc"),
        startAfter(last?.timestamp),
        limit(50)
      );
      const snap = await getDocs(q);
      const newMsgs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setMessages(prev => [...prev, ...newMsgs]);
      setHasMore(snap.docs.length === 50);
    } catch (e) {
      showError("Failed to load more messages.");
    } finally {
      setLoading(false);
    }
  }, [activeChatId, messages, hasMore, loading, showError]);

  // ---------- VALIDATE ON ROUTE CHANGE ----------
  useEffect(() => {
    if (!activeChatId) {
      setMessages([]);
      setEvents([]);
      setChatError(null);
      setInChat(false);
      setValidating(false);
      return;
    }

    // Always try to join — new logic is safe
    join(activeChatId);
  }, [activeChatId, join]);

  // ---------- LISTENERS ----------
  useEffect(() => {
    unsubMsgs.current();
    unsubEvents.current();

    if (!activeChatId) return;

    const chatRef = doc(db, "privateChats", activeChatId);

    const msgQ = query(
      collection(chatRef, "messages"),
      orderBy("timestamp", "desc"),
      limit(50)
    );
    unsubMsgs.current = onSnapshot(msgQ, snap => {
      const msgs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const newOnes = msgs.filter(m => !prevMsgs.current.some(p => p.id === m.id));
      setMessages(msgs);
      prevMsgs.current = msgs;
      setHasMore(snap.docs.length === 50);
      if (newOnes.length) playNotification();
    }, () => setChatError("Failed to load messages"));

    const evQ = query(collection(chatRef, "events"), orderBy("timestamp"));
    unsubEvents.current = onSnapshot(evQ, snap => {
      setEvents(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => {
      unsubMsgs.current();
      unsubEvents.current();
    };
  }, [activeChatId, playNotification]);

  return {
    messages,
    events,
    hasMore,
    loading,
    chatError,
    validating,
    inChat,
    join,
    leave,
    sendMessage,
    toggleReaction,
    deleteMessage,
    loadMore,
  };
}