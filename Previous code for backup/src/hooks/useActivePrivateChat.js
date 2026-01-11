import { useEffect, useRef, useState, useCallback } from "react";
import { db, storage, serverTimestamp } from "../utils/firebase";
import {
  doc, collection, query, orderBy, onSnapshot, limit, getDocs, increment, startAfter,
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
  const [isSending, setIsSending] = useState(false);
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
            requestedTherapist: deleteField(),
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
          user: "System",
          text: `${displayName} has joined the chat.`,
          role: "system",
          timestamp: serverTimestamp(),
        });
      });

      setInChat(true);
      document.querySelector(".inputInsert")?.focus();
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
          user: "System",
          text: `${displayName} has ended the session.`,
          role: "system",
          timestamp: serverTimestamp(),
        });
      });

      // Clear local state
      setMessages([]);
      setEvents([]);
      setInChat(false);
      showError("You've ended the session.", false);
      // Navigate back to list
      navigate("/therapist-dashboard/private-chat");
    } catch (e) {
      console.error("Failed to end session:", e);
      showError("Failed to end session.");
    }
  }, [activeChatId, therapistId, displayName, navigate, showError]);

  // ---------- SEND ----------
  const sendMessage = async (text, file = null, replyTo = null) => {
    if (!text.trim() && !file) return;
    if (!activeChatId) return;
    setIsSending(true);

    let fileUrl = "";
    if (file) {
      if (file.size > 5 * 1024 * 1024) return showError("File too large");
      const sRef = ref(storage, `privateChats/${activeChatId}/${Date.now()}_${file.name}`);
      await uploadBytes(sRef, file);
      fileUrl = await getDownloadURL(sRef);
    }

    try {
      await runTransaction(db, async (tx) => {
        const msgRef = doc(collection(db, `privateChats/${activeChatId}/messages`));
        tx.set(msgRef, {
          text: text || "",
          fileUrl,
          userId: therapistId,
          displayName,
          role: "therapist",
          timestamp: serverTimestamp(),
          pinned: false,
          reactions: {},
          replyTo: replyTo ? {
            id: replyTo.id,
            displayName: replyTo.displayName,
            text: replyTo.text,
            fileUrl: replyTo.fileUrl || null,
          } : null,
        });
        tx.update(doc(db, "privateChats", activeChatId), {
          lastMessage: displayName + ": " + text || "Attachment",
          lastUpdated: serverTimestamp(),
          unreadCountForTherapist: 0,
          unreadCountForUser: increment(1),
        });
      });
    } catch (e) {
      showError("Failed to send message.");
    } finally {
      setIsSending(false);
    }
  };

  // ---------- REACTION ----------
  const toggleReaction = async (msgId, emoji) => {
    if (!activeChatId || !therapistId) return;
    const msgRef = doc(db, `privateChats/${activeChatId}/messages`, msgId);

    try {
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(msgRef);
        if (!snap.exists()) return;

        const reactions = snap.data().reactions || {};
        const currentUserId = therapistId;

        // Supported reactions — add more here if you expand later
        const reactionTypes = ["heart", "thumbsUp"];
        const otherType = reactionTypes.find(t => t !== emoji);

        // Check if user already reacted with this emoji or the other one
        const hasThis = reactions[emoji]?.includes(currentUserId) || false;
        const hasOther = otherType && (reactions[otherType]?.includes(currentUserId) || false);

        // Build updated reactions
        const updatedReactions = { ...reactions };

        if (hasThis) {
          // Remove this reaction
          updatedReactions[emoji] = (reactions[emoji] || []).filter(id => id !== currentUserId);
        } else {
          // Add this reaction
          updatedReactions[emoji] = [...(reactions[emoji] || []), currentUserId];
        }

        // Always remove the other reaction if it exists
        if (hasOther && otherType) {
          updatedReactions[otherType] = (reactions[otherType] || []).filter(id => id !== currentUserId);
        }

        // Clean up empty arrays to keep Firestore tidy
        Object.keys(updatedReactions).forEach(key => {
          if (updatedReactions[key]?.length === 0) {
            delete updatedReactions[key];
          }
        });

        // If no reactions left at all, optionally clear the field (Firestore will remove it)
        const finalReactions = Object.keys(updatedReactions).length === 0 ? deleteField() : updatedReactions;

        tx.update(msgRef, { reactions: finalReactions });
      });
    } catch (err) {
      console.error("Error toggling reaction:", err);
      showError("Failed to update reaction.");
    }
  };

  // ---------- DELETE ----------
  const deleteMessage = async (msgId) => {
    if (!activeChatId || !therapistId) return;

    try {
      await runTransaction(db, async (tx) => {
        const msgRef = doc(db, `privateChats/${activeChatId}/messages`, msgId);

        // Get the message to verify ownership
        const msgSnap = await tx.get(msgRef);
        if (!msgSnap.exists()) {
          throw new Error("Message does not exist");
        }

        const msgData = msgSnap.data();
        if (msgData.userId !== therapistId) {
          throw new Error("You can only delete your own messages");
        }

        tx.update(msgRef, {
          messageDeleted: "This message was deleted",
          deleted: true,
          deletedAt: serverTimestamp(),
          deletedBy: displayName,
        });
      });

      showError("Message deleted", "success");
    } catch (e) {
      console.error("Failed to delete message:", e);
      showError("Failed to delete message. try again later.");
    }
  };

  // ---------- PIN MESSAGE ----------
  const pinMessage = async (msgId, currentPinned = false) => {
    if (!activeChatId) return;

    const privateRef = doc(db, "privateChats", activeChatId);
    const msgRef = doc(db, `privateChats/${activeChatId}/messages`, msgId);

    try {
      await runTransaction(db, async (tx) => {
        // Read the private chat document and the target message
        const [privateSnap, msgSnap] = await Promise.all([
          tx.get(privateRef),
          tx.get(msgRef),
        ]);

        if (!privateSnap.exists()) {
          throw new Error("Private chat does not exist");
        }
        if (!msgSnap.exists()) {
          throw new Error("Message does not exist");
        }

        const currentPinnedId = privateSnap.data().pinnedMessageId || null;

        // If we're pinning a new message, unpin the old one if different
        if (!currentPinned && currentPinnedId && currentPinnedId !== msgId) {
          const oldMsgRef = doc(db, `privateChats/${activeChatId}/messages`, currentPinnedId);
          tx.update(oldMsgRef, { pinned: false, pinnedBy: null });
        }

        // Toggle the target message
        const newPinned = !currentPinned;
        tx.update(msgRef, {
          pinned: newPinned,
          pinnedBy: newPinned ? displayName : null,
        });

        // Update the private chat document with the new pinned ID (or null if unpinning)
        tx.update(privateRef, {
          pinnedMessageId: newPinned ? msgId : null,
        });

        // Add system event
        const eventRef = doc(collection(privateRef, "events"));
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
    isSendingPrivate: isSending,
    toggleReaction,
    deleteMessage,
    pinMessage,
    loadMore,
  };
}