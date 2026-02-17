import { useEffect, useRef, useState, useCallback } from "react";
import { db, storage, serverTimestamp } from "../utils/firebase";
import {
  doc, collection, query, orderBy, onSnapshot, limit, getDocs, increment, startAfter, endBefore, limitToLast,
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
  const [isInitialLoading, setIsInitialLoading] = useState(false);
  const prevMsgs = useRef([]);

  const unsubMsgs = useRef(() => {});
  const unsubEvents = useRef(() => {});
  const latestTimestamp = useRef(null);
  const earliestTimestamp = useRef(null);

  useEffect(() => {
    if (!activeChatId) return;

    const chatRef = doc(db, "privateChats", activeChatId);
    return onSnapshot(chatRef, snap => {
      const data = snap.data();
      if (
        data?.activeTherapist &&
        data.activeTherapist !== therapistId
      ) {
        showError("Chat was taken by another therapist");
        navigate("/therapist-dashboard/private-chat");
      }
    });
  }, [activeChatId, therapistId]);

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

        if (
          data.activeTherapist &&
          data.activeTherapist !== therapistId
        ) {
          throw new Error("Chat already taken by another therapist");
        }

        tx.update(chatRef, {
          activeTherapist: therapistId,
          participants: arrayUnion(therapistId),
          status: "active",
          unreadCountForTherapist: 0,
          aiActive: false,
          aiOffered: true,
        });

        tx.set(doc(collection(chatRef, "events")), {
          type: "join",
          role: "system",
          text: `${displayName} joined the chat`,
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

        tx.update(chatRef, {
          activeTherapist: null,
          status: "closed",
          aiActive: false,
          aiOffered: false,
          participants: arrayRemove(therapistId),
        });

        tx.set(doc(collection(chatRef, "events")), {
          type: "leave",
          user: "System",
          text: `${displayName} has ended the session.`,
          role: "system",
          timestamp: serverTimestamp(),
        });
      });

      setMessages([]);
      setEvents([]);
      setInChat(false);
      showError("You've ended the session.", false);
      navigate("/therapist-dashboard/private-chat");
    } catch (e) {
      console.error("Failed to end session:", e);
      showError("Failed to end session.");
    }
  }, [activeChatId, therapistId, displayName, navigate, showError]);

  // ---------- SEND WITH OPTIMISTIC UPDATE ----------
  const sendMessage = async (text, file = null, replyTo = null) => {
    if (!text.trim() && !file) return;
    if (!activeChatId) return;

    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const optimisticMsg = {
      id: tempId,
      text: text || "",
      fileUrl: file ? "uploading..." : "",
      userId: therapistId,
      displayName: displayName || "You",
      role: "therapist",
      timestamp: { seconds: Math.floor(Date.now() / 1000) - 2, nanoseconds: 0 },
      pinned: false,
      reactions: {},
      replyTo: replyTo
        ? {
            id: replyTo.id,
            displayName: replyTo.displayName,
            text: replyTo.text || "",
            fileUrl: replyTo.fileUrl || null,
          }
        : null,
      isPending: true,
      failed: false,
    };

    setMessages((prev) => {
      const newList = [...prev, optimisticMsg];
      return newList.sort((a, b) => 
        (a.timestamp?.seconds || 0) - (b.timestamp?.seconds || 0)
      );
    });
    setIsSending(true);

    let fileUrl = "";
    try {
      if (file) {
        if (file.size > 5 * 1024 * 1024) {
          throw new Error("File too large (>5 MB)");
        }
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
      console.error("Send message error:", e);
      showError("Failed to send message.");

      setMessages((prev) =>
        prev.map((m) =>
          m.id === tempId ? { ...m, isPending: false, failed: true } : m
        )
      );
    } finally {
      setIsSending(false);
    }
  };

  // RETRY SEND
  const retrySend = useCallback((failedMsg) => {
    if (!failedMsg?.text && !failedMsg?.fileUrl) return;

    setMessages(prev => prev.filter(m => m.id !== failedMsg.id));

    sendMessage(
      failedMsg.text || "",
      null,
      failedMsg.replyTo || null
    ).catch(err => {
      console.error("Retry failed:", err);
      showError("Retry failed – please try typing again");
    });
  }, [sendMessage, showError]);

  // ---------- REACTION ----------
  const toggleReaction = async (msgId, emoji) => {
    if (!activeChatId || !therapistId) return;

    // Optimistic update
    setMessages((prev) =>
      prev.map((msg) => {
        if (msg.id !== msgId) return msg;
        const reactions = { ...(msg.reactions || {}) };
        const hasThis = reactions[emoji]?.includes(therapistId) || false;

        if (hasThis) {
          reactions[emoji] = reactions[emoji].filter(
            (id) => id !== therapistId
          );
          if (reactions[emoji]?.length === 0) delete reactions[emoji];
        } else {
          reactions[emoji] = [...(reactions[emoji] || []), therapistId];
        }

        const otherType = emoji === "heart" ? "thumbsUp" : "heart";
        if (reactions[otherType]?.includes(therapistId)) {
          reactions[otherType] = reactions[otherType].filter(
            (id) => id !== therapistId
          );
          if (reactions[otherType]?.length === 0) delete reactions[otherType];
        }

        return { ...msg, reactions };
      })
    );

    const msgRef = doc(db, `privateChats/${activeChatId}/messages`, msgId);

    try {
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(msgRef);
        if (!snap.exists()) return;

        const reactions = snap.data().reactions || {};
        const currentUserId = therapistId;

        const reactionTypes = ["heart", "thumbsUp"];
        const otherType = reactionTypes.find(t => t !== emoji);

        const hasThis = reactions[emoji]?.includes(currentUserId) || false;
        const hasOther = otherType && (reactions[otherType]?.includes(currentUserId) || false);

        const updatedReactions = { ...reactions };

        if (hasThis) {
          updatedReactions[emoji] = (reactions[emoji] || []).filter(id => id !== currentUserId);
        } else {
          updatedReactions[emoji] = [...(reactions[emoji] || []), currentUserId];
        }

        if (hasOther && otherType) {
          updatedReactions[otherType] = (reactions[otherType] || []).filter(id => id !== currentUserId);
        }

        Object.keys(updatedReactions).forEach(key => {
          if (updatedReactions[key]?.length === 0) {
            delete updatedReactions[key];
          }
        });

        const finalReactions = Object.keys(updatedReactions).length === 0 ? deleteField() : updatedReactions;

        tx.update(msgRef, { reactions: finalReactions });
      });
    } catch (err) {
      console.error("Error toggling reaction:", err);
      showError("Failed to update reaction.");

      // Rollback
      setMessages((prev) =>
        prev.map((msg) => {
          if (msg.id !== msgId) return msg;
          const reactions = { ...(msg.reactions || {}) };
          const hasThis = reactions[emoji]?.includes(therapistId);

          if (hasThis) {
            reactions[emoji] = reactions[emoji].filter(
              (id) => id !== therapistId
            );
            if (!reactions[emoji]?.length) delete reactions[emoji];
          } else {
            if (reactions[emoji]) {
              reactions[emoji] = reactions[emoji].filter(
                (id) => id !== therapistId
              );
              if (!reactions[emoji].length) delete reactions[emoji];
            }
          }

          return { ...msg, reactions };
        })
      );
    }
  };

  // DELETE MESSAGE - optimistic
  const deleteMessage = useCallback(
    async (msgId) => {
      if (!activeChatId || !therapistId) return;

      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === msgId
            ? {
                ...msg,
                isPendingDelete: true,
              }
            : msg
        )
      );

      try {
        await runTransaction(db, async (tx) => {
          const msgRef = doc(db, `privateChats/${activeChatId}/messages`, msgId);
          const msgSnap = await tx.get(msgRef);
          if (!msgSnap.exists()) {
            throw new Error("Message does not exist");
          }
          if (msgSnap.data().userId !== therapistId) {
            throw new Error("You can only delete your own messages");
          }

          tx.update(msgRef, {
            messageDeleted: "This message was deleted",
            deleted: true,
            deletedAt: serverTimestamp(),
            deletedBy: displayName,
          });
        });

        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === msgId
              ? {
                  ...msg,
                  deleted: true,
                  messageDeleted: "This message was deleted",
                  isPendingDelete: false,
                }
              : msg
          )
        );
      } catch (e) {
        console.error("Failed to delete message:", e);
        showError("Failed to delete message. Try again later.");

        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === msgId
              ? {
                  ...msg,
                  isPendingDelete: false,
                }
              : msg
          )
        );
      }
    },
    [activeChatId, therapistId, displayName, showError]
  );

  // PIN / UNPIN MESSAGE - optimistic
  const pinMessage = useCallback(
    async (msgId, currentPinned) => {
      if (!activeChatId) return;

      const newPinned = !currentPinned;

      setMessages((prev) =>
        prev.map((m) => {
          if (m.id === msgId) {
            return {
              ...m,
              pinned: newPinned,
              pinnedBy: newPinned ? displayName : null,
            };
          }
          if (newPinned && m.pinned && m.id !== msgId) {
            return { ...m, pinned: false, pinnedBy: null };
          }
          return m;
        })
      );

      const privateRef = doc(db, "privateChats", activeChatId);
      const msgRef = doc(db, `privateChats/${activeChatId}/messages`, msgId);

      try {
        await runTransaction(db, async (tx) => {
          const [privateSnap, msgSnap] = await Promise.all([
            tx.get(privateRef),
            tx.get(msgRef),
          ]);

          if (!privateSnap.exists() || !msgSnap.exists()) {
            throw new Error("Not found");
          }

          const currentPinnedId = privateSnap.data().pinnedMessageId || null;

          if (newPinned && currentPinnedId && currentPinnedId !== msgId) {
            const oldMsgRef = doc(
              db,
              `privateChats/${activeChatId}/messages`,
              currentPinnedId
            );
            tx.update(oldMsgRef, { pinned: false, pinnedBy: null });
          }

          tx.update(msgRef, {
            pinned: newPinned,
            pinnedBy: newPinned ? displayName : null,
          });

          tx.update(privateRef, {
            pinnedMessageId: newPinned ? msgId : null,
          });

          if (newPinned) {
            const eventRef = doc(collection(privateRef, "events"));
            tx.set(eventRef, {
              type: "pin",
              user: "System",
              text: `${displayName} pinned a message`,
              role: "system",
              timestamp: serverTimestamp(),
            });
          }
        });
      } catch (e) {
        console.error("Failed to pin/unpin message:", e);
        showError("Failed to pin/unpin message.");

        setMessages((prev) =>
          prev.map((m) => {
            if (m.id === msgId) {
              return {
                ...m,
                pinned: currentPinned,
                pinnedBy: currentPinned ? displayName : null,
              };
            }
            return m;
          })
        );
      }
    },
    [activeChatId, displayName, showError]
  );

  // ---------- LOAD MORE (older messages) ----------
  const loadMore = useCallback(async () => {
    if (!activeChatId || !hasMore || loading) return;
    setLoading(true);
    try {
      const q = query(
        collection(db, `privateChats/${activeChatId}/messages`),
        orderBy("timestamp", "asc"),
        endBefore(earliestTimestamp.current),
        limitToLast(30)
      );
      const snap = await getDocs(q);
      const newMsgs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setMessages((prev) => {
        const existingIds = new Set(prev.map((m) => m.id));
        const filteredNew = newMsgs.filter((m) => !existingIds.has(m.id));
        return [...filteredNew, ...prev];
      });
      setHasMore(snap.docs.length === 30);
      if (snap.docs.length > 0) {
        earliestTimestamp.current = newMsgs[0].timestamp;
      }
    } catch (e) {
      showError("Failed to load more messages.");
    } finally {
      setLoading(false);
    }
  }, [activeChatId, hasMore, loading, showError]);

  // ---------- VALIDATE ON ROUTE CHANGE ----------
  useEffect(() => {
    if (!activeChatId) {
      setMessages([]);
      setEvents([]);
      setChatError(null);
      setInChat(false);
      setValidating(false);
      latestTimestamp.current = null;
      earliestTimestamp.current = null;
      return;
    }

    join(activeChatId);
  }, [activeChatId, join]);

  // ---------- LISTENERS ----------
  useEffect(() => {
    unsubMsgs.current();
    unsubEvents.current();

    if (!activeChatId) return;

    const chatRef = doc(db, "privateChats", activeChatId);

    const loadInitialMessages = async () => {
      setIsInitialLoading(true);
      const msgQ = query(
        collection(chatRef, "messages"),
        orderBy("timestamp", "asc"),
        limitToLast(30)
      );
      try {
        const snap = await getDocs(msgQ);
        const msgs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setMessages(msgs);
        setHasMore(snap.docs.length === 30);
        if (msgs.length > 0) {
          latestTimestamp.current = msgs[msgs.length - 1].timestamp;
          earliestTimestamp.current = msgs[0].timestamp;

          const newQ = query(
            collection(chatRef, "messages"),
            orderBy("timestamp", "asc"),
            startAfter(latestTimestamp.current)
          );
          unsubMsgs.current = onSnapshot(newQ, (newSnap) => {
            if (newSnap.empty) return;

            const incoming = newSnap.docs.map((d) => ({
              id: d.id,
              ...d.data(),
              isPending: false,
            }));

            setMessages((prev) => {
              let updated = [...prev];

              updated = updated.filter(
                (m) => !(m.isPending && m.userId === therapistId)
              );

              incoming.forEach((realMsg) => {
                if (!updated.some((m) => m.id === realMsg.id)) {
                  updated.push(realMsg);
                }
              });

              return updated;
            });

            if (incoming.length > 0) {
              playNotification();
              latestTimestamp.current = incoming[incoming.length - 1].timestamp;
            }
          });
        }
      } catch (e) {
        setChatError("Failed to load messages");
      } finally {
        setIsInitialLoading(false);
      }
    };

    loadInitialMessages();

    const evQ = query(collection(chatRef, "events"), orderBy("timestamp"));
    unsubEvents.current = onSnapshot(evQ, snap => {
      setEvents(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => {
      unsubMsgs.current();
      unsubEvents.current();
    };
  }, [activeChatId, playNotification, therapistId]);

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
    isInitialLoading,
    retrySend,
  };
}