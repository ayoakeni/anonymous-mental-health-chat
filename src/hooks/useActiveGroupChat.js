import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { db, storage, serverTimestamp } from "../utils/firebase";
import {
  doc, collection, query, orderBy, onSnapshot, limit, getDocs, deleteField, startAfter,
  runTransaction, arrayUnion, arrayRemove, where, limitToLast, endBefore
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

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
  const [isInitialLoading, setIsInitialLoading] = useState(false);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);

  const unsubNewMsgs = useRef(() => {});
  const unsubEvents = useRef(() => {});
  const unsubPart = useRef(() => {});
  const navigate = useNavigate();
  const latestTimestamp = useRef(null);
  const earliestTimestamp = useRef(null);

  // Mark as read
  const markAsRead = useCallback(async () => {
    if (!activeGroupId || !therapistId) return;
    const groupRef = doc(db, "groupChats", activeGroupId);
    try {
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(groupRef);
        if (!snap.exists()) return;
        const data = snap.data();
        if (data.participants?.includes(therapistId)) {
          tx.update(groupRef, { [`unreadCount.${therapistId}`]: 0 });
        }
      });
    } catch (err) {
      console.error("Failed to mark group as read:", err);
    }
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
          // type: "join",
          // user: "System",
          // text: `${displayName} has joined the group.`,
          // role: "system",
          // timestamp: serverTimestamp(),
        });
        tx.set(doc(db, "therapists", therapistId), { lastSeenGroupChat: serverTimestamp() }, { merge: true });
      });
      setInChat(true);
      document.querySelector(".inputInsert")?.focus();
    } catch (e) {
      showError("Failed to join group chat.");
      navigate("/therapist-dashboard/group-chat");
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
  const sendMessage = async (text, file = null, replyTo = null) => {
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

        const groupSnap = await tx.get(groupRef);
        if (!groupSnap.exists()) {
          throw new Error("Group chat does not exist");
        }

        const currentParticipants = groupSnap.data()?.participants || [];
        const currentUnread = groupSnap.data()?.unreadCount || {};

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
          replyTo: replyTo ? {
            id: replyTo.id,
            displayName: replyTo.displayName,
            text: replyTo.text,
            fileUrl: replyTo.fileUrl || null,
          } : null,
        });

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
    if (!activeGroupId || !therapistId) return;

    const msgRef = doc(db, `groupChats/${activeGroupId}/messages`, msgId);

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
      setMessages(prev => prev.map(msg => {
        if (msg.id !== msgId) return msg;
        const reactions = { ...msg.reactions || {} };
        const currentUserId = therapistId;
        const reactionTypes = ["heart", "thumbsUp"];
        const otherType = reactionTypes.find(t => t !== emoji);

        const hasThis = reactions[emoji]?.includes(currentUserId) || false;
        const hasOther = otherType && (reactions[otherType]?.includes(currentUserId) || false);

        if (hasThis) {
          reactions[emoji] = reactions[emoji].filter(id => id !== currentUserId);
        } else {
          reactions[emoji] = [...(reactions[emoji] || []), currentUserId];
        }

        if (hasOther && otherType) {
          reactions[otherType] = reactions[otherType].filter(id => id !== currentUserId);
        }

        // Clean up empty
        Object.keys(reactions).forEach(key => {
          if (reactions[key].length === 0) delete reactions[key];
        });
        return { ...msg, reactions };
      }));
    } catch (err) {
      console.error("Error toggling reaction:", err);
      showError("Failed to update reaction.");
    }
  };

  // ---------- DELETE ----------
  const deleteMessage = async (msgId) => {
    if (!activeGroupId || !therapistId) return;

    try {
      await runTransaction(db, async (tx) => {
        const msgRef = doc(db, `groupChats/${activeGroupId}/messages`, msgId);

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

      setMessages(prev =>
        prev.map(msg =>
          msg.id === msgId
            ? { ...msg, deleted: true, messageDeleted: "This message was deleted" }
            : msg
        )
      );

      showError("Message deleted", "success");
    } catch (e) {
      console.error("Failed to delete message:", e);
      showError("Failed to delete message. try again later.");
    }
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

  // ---------- LOAD MORE (older messages) ----------
  const loadMore = useCallback(async () => {
    if (!activeGroupId || !hasMore || isLoadingOlder) return;
    setIsLoadingOlder(true);
    try {
      const q = query(
        collection(db, `groupChats/${activeGroupId}/messages`),
        orderBy("timestamp", "asc"),
        endBefore(earliestTimestamp.current),
        limitToLast(30)
      );
      const snap = await getDocs(q);
      const newMsgs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setMessages(prev => {
        const existingIds = new Set(prev.map(m => m.id));
        const filteredNew = newMsgs.filter(m => !existingIds.has(m.id));
        return [...filteredNew, ...prev];
      });
      setHasMore(snap.docs.length === 30);
      if (snap.docs.length > 0) {
        earliestTimestamp.current = newMsgs[0].timestamp;
      }
    } catch (e) {
      showError("Failed to load more messages.");
    } finally {
      setIsLoadingOlder(false);
    }
  }, [activeGroupId, hasMore, isLoadingOlder, showError]);

  // ---------- LISTENERS ----------
  useEffect(() => {
    unsubNewMsgs.current();
    unsubEvents.current();
    unsubPart.current();
    latestTimestamp.current = null;
    earliestTimestamp.current = null;

    if (!activeGroupId) {
      setMessages([]);
      setEvents([]);
      setParticipants([]);
      setInChat(false);
      return;
    }

    const groupRef = doc(db, "groupChats", activeGroupId);

    unsubPart.current = onSnapshot(groupRef, snap => {
      if (snap.exists()) {
        const data = snap.data();
        setParticipants(data.participants || []);
        setInChat(data.participants?.includes(therapistId));
      }
    });

    // Initial load
    const loadInitialMessages = async () => {
      setIsInitialLoading(true);
      const q = query(
        collection(groupRef, "messages"),
        orderBy("timestamp", "asc"),
        limitToLast(30)
      );
      try {
        const snap = await getDocs(q);
        const msgs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setMessages(msgs);
        setHasMore(snap.docs.length === 30);
        if (msgs.length > 0) {
          latestTimestamp.current = msgs[msgs.length - 1].timestamp;
          earliestTimestamp.current = msgs[0].timestamp;

          // Real-time new messages listener
          const newQ = query(
            collection(groupRef, "messages"),
            orderBy("timestamp", "asc"),
            startAfter(latestTimestamp.current)
          );
          unsubNewMsgs.current = onSnapshot(newQ, newSnap => {
            const newMsgs = newSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            setMessages(prev => {
              const existingIds = new Set(prev.map(m => m.id));
              const filteredNew = newMsgs.filter(m => !existingIds.has(m.id));
              return [...prev, ...filteredNew];
            });
            if (newMsgs.length > 0) {
              playNotification();
              latestTimestamp.current = newMsgs[newMsgs.length - 1].timestamp;
            }
          });
        }
      } catch (e) {
        showError("Failed to load initial messages.");
      } finally {
        setIsInitialLoading(false);
      }
    };

    loadInitialMessages();

    const evQ = query(collection(groupRef, "events"), orderBy("timestamp"));
    unsubEvents.current = onSnapshot(evQ, snap => {
      setEvents(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => {
      unsubNewMsgs.current();
      unsubEvents.current();
      unsubPart.current();
    };
  }, [activeGroupId, therapistId, playNotification, showError]);

  return {
    messages,
    events,
    hasMore,
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
    markAsRead,
    isInitialLoading,
    isLoadingOlder,
  };
}