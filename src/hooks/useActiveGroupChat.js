import { useEffect, useRef, useState, useCallback } from "react";
import { db, auth, storage, serverTimestamp } from "../utils/firebase";
import {
  doc, collection, query, orderBy, onSnapshot, limit, getDocs, startAfter,
  updateDoc, setDoc, deleteDoc, runTransaction, arrayUnion, arrayRemove
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { getTimestampMillis } from "../components/timestampUtils";

export function useActiveGroupChat(
  activeGroupId,
  therapistId,
  displayName,
  playNotification,
  showError
) {
  const [messages, setMessages] = useState([]);
  const [events, setEvents] = useState([]);
  const [participants, setParticipants] = useState([]);
  const [inChat, setInChat] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const prevMsgs = useRef([]);

  const unsubMsgs = useRef(() => {});
  const unsubEvents = useRef(() => {});
  const unsubPart = useRef(() => {});

  // ---------- JOIN ----------
  const join = useCallback(async (groupId = activeGroupId) => {
    if (!therapistId) return;
    const groupRef = doc(db, "groupChats", groupId);
    try {
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(groupRef);
        if (!snap.exists()) throw new Error("Group not found");
        tx.update(groupRef, { participants: arrayUnion(therapistId), unreadCount: 0 });
        tx.set(doc(db, "therapists", therapistId), { lastSeenGroupChat: serverTimestamp() }, { merge: true });
      });
      setInChat(true);
    } catch (e) {
      showError("Failed to join group chat.");
    }
  }, [activeGroupId, therapistId, showError]);

  // ---------- LEAVE ----------
  const leave = useCallback(async () => {
    if (!activeGroupId || !therapistId) return;
    const groupRef = doc(db, "groupChats", activeGroupId);
    try {
      await runTransaction(db, async (tx) => {
        tx.update(groupRef, { participants: arrayRemove(therapistId) });
        tx.set(doc(collection(groupRef, "events")), {
          type: "leave",
          user: displayName,
          timestamp: serverTimestamp(),
        });
        tx.set(doc(db, "therapists", therapistId), { lastSeenGroupChat: serverTimestamp() }, { merge: true });
      });
      setInChat(false);
      setMessages([]);
      setEvents([]);
      setParticipants([]);
    } catch (e) {
      showError("Failed to leave group chat.");
    }
  }, [activeGroupId, therapistId, displayName, showError]);

  // ---------- SEND MESSAGE ----------
  const sendMessage = async (text, file = null) => {
    if ((!text || !text.trim()) && !file) return;
    if (!activeGroupId) return;

    let fileUrl = "";
    if (file) {
      if (file.size > 5 * 1024 * 1024) return showError("File too large (>5 MB)");
      const storageRef = ref(storage, `groupChats/${activeGroupId}/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      fileUrl = await getDownloadURL(storageRef);
    }

    await runTransaction(db, async (tx) => {
      const msgRef = doc(collection(db, `groupChats/${activeGroupId}/messages`));
      tx.set(msgRef, {
        text: text || "",
        fileUrl,
        userId: therapistId,
        displayName,
        role: "therapist",
        timestamp: serverTimestamp(),
        pinned: false,
        reactions: {},
      });
      tx.update(doc(db, "groupChats", activeGroupId), {
        lastMessage: { text: text || "Attachment", displayName, timestamp: serverTimestamp() },
      });
    });
  };

  // ---------- REACTION ----------
  const toggleReaction = async (msgId, emoji) => {
    const msgRef = doc(db, `groupChats/${activeGroupId}/messages`, msgId);
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
      const msgRef = doc(db, `groupChats/${activeGroupId}/messages`, msgId);
      tx.delete(msgRef);
      tx.set(doc(collection(db, `groupChats/${activeGroupId}/events`)), {
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
    if (!activeGroupId || !hasMore || loading) return;
    setLoading(true);
    try {
      const last = messages[messages.length - 1];
      const q = query(
        collection(db, `groupChats/${activeGroupId}/messages`),
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
  }, [activeGroupId, messages, hasMore, loading, showError]);

  // ---------- LISTENERS ----------
  useEffect(() => {
    unsubMsgs.current();
    unsubEvents.current();
    unsubPart.current();

    if (!activeGroupId) {
      setMessages([]);
      setEvents([]);
      setParticipants([]);
      setInChat(false);
      return;
    }

    const groupRef = doc(db, "groupChats", activeGroupId);

    // participants
    unsubPart.current = onSnapshot(groupRef, snap => {
      if (snap.exists()) {
        const data = snap.data();
        setParticipants(data.participants || []);
        setInChat(data.participants?.includes(therapistId));
      }
    });

    // messages
    const msgQ = query(
      collection(groupRef, "messages"),
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
    }, () => showError("Failed to load group messages."));

    // events
    const evQ = query(collection(groupRef, "events"), orderBy("timestamp"));
    unsubEvents.current = onSnapshot(evQ, snap => {
      setEvents(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => {
      unsubMsgs.current();
      unsubEvents.current();
      unsubPart.current();
    };
  }, [activeGroupId, therapistId, playNotification, showError]);

  return {
    messages,
    events,
    participants,
    inChat,
    hasMore,
    loading,
    join,
    leave,
    sendMessage,
    toggleReaction,
    deleteMessage,
    loadMore,
  };
}