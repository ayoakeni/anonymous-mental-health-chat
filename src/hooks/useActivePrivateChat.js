import { useEffect, useRef, useState, useCallback } from "react";
import { db, auth, storage, serverTimestamp } from "../utils/firebase";
import {
  doc, collection, query, orderBy, onSnapshot, limit, getDocs, startAfter,
  updateDoc, setDoc, deleteDoc, getDoc, runTransaction, arrayUnion, arrayRemove
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { getTimestampMillis } from "../components/timestampUtils";

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
    if (!therapistId) return;
    setValidating(true);
    setChatError(null);
    const chatRef = doc(db, "privateChats", chatId);
    try {
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(chatRef);
        if (!snap.exists()) throw new Error("Chat not found");
        const data = snap.data();
        const needs = data.needsTherapist === true;
        const alreadyIn = data.participants?.includes(therapistId);

        if (!alreadyIn && !needs) {
          // wait a moment – user might just have sent first msg
          await new Promise(r => setTimeout(r, 2000));
          const fresh = await tx.get(chatRef);
          if (!fresh.exists()) throw new Error("Chat vanished");
          const freshData = fresh.data();
          if (!freshData.participants?.includes(therapistId) && freshData.needsTherapist !== true) {
            throw new Error("No permission");
          }
        }

        tx.update(chatRef, {
          participants: alreadyIn ? data.participants : arrayUnion(therapistId),
          unreadCountForTherapist: 0,
          needsTherapist: false,
          therapistJoinedOnce: true,
        });
        tx.set(doc(collection(chatRef, "events")), {
          type: "join",
          user: displayName,
          text: `A therapist "${displayName}" has joined.`,
          role: "system",
          timestamp: serverTimestamp(),
        });
      });
      setInChat(true);
    } catch (e) {
      setChatError(e.message);
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
        tx.update(chatRef, {
          participants: arrayRemove(therapistId),
          aiOffered: true,
          aiActive: false,
          needsTherapist: false,
        });
        tx.set(doc(collection(chatRef, "events")), {
          type: "leave",
          user: displayName,
          text: `${displayName} left the chat.`,
          role: "system",
          timestamp: serverTimestamp(),
        });
      });
      setMessages([]);
      setEvents([]);
      navigate("/therapist-dashboard/private-chat");
      setInChat(false);
    } catch (e) {
      showError("Failed to leave private chat.");
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
        needsTherapist: false,
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

    // Auto-join when activeChatId changes
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

      // reset unread
      runTransaction(db, tx => {
        tx.update(chatRef, { unreadCountForTherapist: 0 });
      }).catch(() => {});
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