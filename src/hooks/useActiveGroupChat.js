import { useEffect, useRef, useState, useCallback } from "react";
import { db, storage, serverTimestamp } from "../utils/firebase";
import {
  doc, collection, query, orderBy, onSnapshot, limit, getDocs, deleteField, startAfter,
  runTransaction, arrayUnion, arrayRemove
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { useNavigate } from "react-router-dom";
export function useActiveGroupChat(
  activeGroupId,
  therapistId,
  displayName,
  playNotification,
  showError,
) {
  const [messages, setMessages] = useState([]);
  const [isSending, setIsSending] = useState(false);
  const [events, setEvents] = useState([]);
  const [participants, setParticipants] = useState([]);
  const [inChat, setInChat] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const prevMsgs = useRef([]);

  const unsubMsgs = useRef(() => {});
  const unsubEvents = useRef(() => {});
  const unsubPart = useRef(() => {});
  const navigate = useNavigate();

  // Mark as read when opening chat
  useEffect(() => {
    if (!activeGroupId || !therapistId) return;

    const groupRef = doc(db, "groupChats", activeGroupId);

    const markAsRead = async () => {
      try {
        await runTransaction(db, async (tx) => {
          const snap = await tx.get(groupRef);
          if (!snap.exists()) return;

          const data = snap.data();
          if (data.participants?.includes(therapistId)) {
            tx.update(groupRef, {
              [`unreadCount.${therapistId}`]: 0
            });
          }
        });
      } catch (err) {
        console.error("Failed to mark group as read:", err);
      }
    };

    markAsRead();
    const interval = setInterval(markAsRead, 30_000);

    return () => clearInterval(interval);
  }, [activeGroupId, therapistId]);
  
  // ---------- JOIN ----------
  const join = useCallback(async (groupId = activeGroupId) => {
    if (!therapistId) return;
    const groupRef = doc(db, "groupChats", groupId);
    try {
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(groupRef);
        if (!snap.exists()) throw new Error("Group not found");
        tx.update(groupRef, { participants: arrayUnion(therapistId), [`unreadCount.${therapistId}`]: 0 });
        tx.set(doc(collection(groupRef, "events")), {
          type: "join",
          user: "System",
          text: `${displayName} has joined the group.`,
          role: "system",
          timestamp: serverTimestamp(),
        });
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
        tx.update(groupRef, {
          participants: arrayRemove(therapistId),
          [`unreadCount.${therapistId}`]: deleteField()
        });
        tx.set(doc(collection(groupRef, "events")), {
          type: "leave",
          user: "System",
          text: `${displayName} has left the group.`,
          role: "system",
          timestamp: serverTimestamp(),
        });
        tx.set(doc(db, "therapists", therapistId), { lastSeenGroupChat: serverTimestamp() }, { merge: true });
      });
      setMessages([]);
      setEvents([]);
      showError("You've left the group. You can rejoin anytime.");
      navigate("/therapist-dashboard/group-chat");
      setInChat(false);
      setParticipants([]);
    } catch (e) {
      showError("Failed to leave group chat.");
    }
  }, [activeGroupId, therapistId, displayName, navigate, showError]);

  // ---------- SEND MESSAGE ----------
  const sendMessage = async (text, file = null) => {
    if ((!text || !text.trim()) && !file) return;
    if (!activeGroupId) return;
    setIsSending(true);

    let fileUrl = "";
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        showError("File too large (>5 MB)");
        setIsSending(false);
        return;
      }
      const storageRef = ref(storage, `groupChats/${activeGroupId}/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      fileUrl = await getDownloadURL(storageRef);
    }

    try {
      await runTransaction(db, async (tx) => {
        const groupRef = doc(db, "groupChats", activeGroupId);

        // ALL READS FIRST
        const groupSnap = await tx.get(groupRef);
        if (!groupSnap.exists()) {
          throw new Error("Group chat does not exist");
        }

        const currentParticipants = groupSnap.data()?.participants || [];
        const currentUnread = groupSnap.data()?.unreadCount || {};

        // ALL WRITES AFTER READS
        const msgRef = doc(collection(db, `groupChats/${activeGroupId}/messages`));
        tx.set(msgRef, {
          text: text || "",
          fileUrl,
          userId: therapistId,
          displayName: displayName,
          role: "therapist",
          timestamp: serverTimestamp(),
          pinned: false,
          reactions: {},
        });

        // Increment unread counts for everyone except sender
        const updatedUnread = { ...currentUnread };
        currentParticipants.forEach(uid => {
          if (uid !== therapistId) {
            updatedUnread[uid] = (updatedUnread[uid] || 0) + 1;
          }
        });

        tx.update(groupRef, {
          lastMessage: {
            text: text || "Attachment",
            displayName: displayName,
            timestamp: serverTimestamp()
          },
          unreadCount: updatedUnread
        });
      });
    } catch (e) {
      console.error("Send message error:", e);
      showError("Failed to send message.");
    } finally {
      setIsSending(false);
    }
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

  // ---------- PIN MESSAGE ----------
  const pinMessage = async (msgId, currentPinned = false) => {
    if (!activeGroupId) return;

    const groupRef = doc(db, "groupChats", activeGroupId);
    const msgRef = doc(db, `groupChats/${activeGroupId}/messages`, msgId);

    try {
      await runTransaction(db, async (tx) => {
        // Read the group document and the target message
        const [groupSnap, msgSnap] = await Promise.all([
          tx.get(groupRef),
          tx.get(msgRef),
        ]);

        if (!groupSnap.exists()) {
          throw new Error("Group does not exist");
        }
        if (!msgSnap.exists()) {
          throw new Error("Message does not exist");
        }

        const currentPinnedId = groupSnap.data().pinnedMessageId || null;

        // If we're pinning a new message, unpin the old one if different
        if (!currentPinned && currentPinnedId && currentPinnedId !== msgId) {
          const oldMsgRef = doc(db, `groupChats/${activeGroupId}/messages`, currentPinnedId);
          tx.update(oldMsgRef, { pinned: false, pinnedBy: null });
        }

        // Toggle the target message
        const newPinned = !currentPinned;
        tx.update(msgRef, {
          pinned: newPinned,
          pinnedBy: newPinned ? displayName : null,
        });

        // Update the group document with the new pinned ID (or null if unpinning)
        tx.update(groupRef, {
          pinnedMessageId: newPinned ? msgId : null,
        });

        // Add system event
        const eventRef = doc(collection(groupRef, "events"));
        tx.set(eventRef, {
          type: "pin",
          user: "System",
          text: newPinned
            ? `${displayName} pinned a message`
            : `${displayName} unpinned a message`,
          role: "system",
          timestamp: serverTimestamp(),
        });
      });
    } catch (e) {
      console.error("Failed to pin/unpin message:", e);
      showError("Failed to pin/unpin message.");
    }
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
    hasMore,
    loading,
    participants,
    inChat,
    join,
    leave,
    sendMessage,
    isSendingGroup: isSending,
    toggleReaction,
    deleteMessage,
    pinMessage,
    loadMore,
  };
}