import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { db, storage, serverTimestamp } from "../utils/firebase";
import {
  doc,
  collection,
  query,
  orderBy,
  onSnapshot,
  getDocs,
  deleteField,
  startAfter,
  runTransaction,
  arrayUnion,
  arrayRemove,
  limitToLast,
  endBefore,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

export function useActiveGroupChat(
  activeGroupId,
  therapistId,
  displayName,
  playNotification,
  showError
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

  // JOIN
  const join = useCallback(
    async (groupId = activeGroupId) => {
      if (!therapistId) return;
      const groupRef = doc(db, "groupChats", groupId);
      try {
        await runTransaction(db, async (tx) => {
          const snap = await tx.get(groupRef);
          if (!snap.exists()) throw new Error("Group not found");
          tx.update(groupRef, {
            participants: arrayUnion(therapistId),
            [`unreadCount.${therapistId}`]: 0,
          });
          tx.set(doc(collection(groupRef, "events")), {
            type: "join",
            user: "System",
            text: `${displayName} has joined the group.`,
            role: "system",
            timestamp: serverTimestamp(),
          });
          tx.set(
            doc(db, "therapists", therapistId),
            { lastSeenGroupChat: serverTimestamp() },
            { merge: true }
          );
        });
        setInChat(true);
        document.querySelector(".inputInsert")?.focus();
      } catch (e) {
        showError("Failed to join group chat.");
        navigate("/therapist-dashboard/group-chat");
      }
    },
    [activeGroupId, therapistId, displayName, showError, navigate]
  );

  // LEAVE
  const leave = useCallback(async () => {
    if (!activeGroupId || !therapistId) return;
    const groupRef = doc(db, "groupChats", activeGroupId);
    try {
      await runTransaction(db, async (tx) => {
        tx.update(groupRef, {
          participants: arrayRemove(therapistId),
          [`unreadCount.${therapistId}`]: deleteField(),
        });
        tx.set(doc(collection(groupRef, "events")), {
          type: "leave",
          user: "System",
          text: `${displayName} has left the group.`,
          role: "system",
          timestamp: serverTimestamp(),
        });
        tx.set(
          doc(db, "therapists", therapistId),
          { lastSeenGroupChat: serverTimestamp() },
          { merge: true }
        );
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

  // SEND MESSAGE - with optimistic update
  const sendMessage = useCallback(
    async (text, file = null, replyTo = null) => {
      if ((!text?.trim() && !file) || !activeGroupId || !therapistId) return;

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
          const storageRef = ref(
            storage,
            `groupChats/${activeGroupId}/${Date.now()}_${file.name}`
          );
          await uploadBytes(storageRef, file);
          fileUrl = await getDownloadURL(storageRef);
        }

        await runTransaction(db, async (tx) => {
          const groupRef = doc(db, "groupChats", activeGroupId);
          const groupSnap = await tx.get(groupRef);
          if (!groupSnap.exists()) {
            throw new Error("Group chat does not exist");
          }

          const currentParticipants = groupSnap.data()?.participants || [];
          const currentUnread = groupSnap.data()?.unreadCount || {};

          const msgRef = doc(
            collection(db, `groupChats/${activeGroupId}/messages`)
          );
          tx.set(msgRef, {
            text: text || "",
            fileUrl,
            userId: therapistId,
            displayName: displayName,
            role: "therapist",
            timestamp: serverTimestamp(),
            pinned: false,
            reactions: {},
            replyTo: replyTo
              ? {
                  id: replyTo.id,
                  displayName: replyTo.displayName,
                  text: replyTo.text,
                  fileUrl: replyTo.fileUrl || null,
                }
              : null,
          });

          const updatedUnread = { ...currentUnread };
          currentParticipants.forEach((uid) => {
            if (uid !== therapistId) {
              updatedUnread[uid] = (updatedUnread[uid] || 0) + 1;
            }
          });

          tx.update(groupRef, {
            lastMessage: {
              text: text || "Attachment",
              displayName: displayName,
              timestamp: serverTimestamp(),
            },
            unreadCount: updatedUnread,
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
    },
    [activeGroupId, therapistId, displayName, showError]
  );

  const retrySend = useCallback((failedMsg) => {
    if (!failedMsg?.text && !failedMsg?.fileUrl) return;

    // Remove the failed message from the list
    setMessages(prev => prev.filter(m => m.id !== failedMsg.id));

    // Immediately re-try sending (optimistic again)
    sendMessage(
      failedMsg.text || "",
      null,
      failedMsg.replyTo || null
    ).catch(err => {
      console.error("Retry failed:", err);
      showError("Retry failed – please try typing again");
    });

  }, [sendMessage, showError]);

  // TOGGLE REACTION - optimistic
  const toggleReaction = useCallback(
    async (msgId, emoji) => {
      if (!activeGroupId || !therapistId) return;

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

          // Remove the other supported reaction if exists
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

      const msgRef = doc(db, `groupChats/${activeGroupId}/messages`, msgId);

      try {
        await runTransaction(db, async (tx) => {
          const snap = await tx.get(msgRef);
          if (!snap.exists()) return;

          let reactions = snap.data().reactions || {};
          const hasThis = reactions[emoji]?.includes(therapistId) || false;

          if (hasThis) {
            reactions[emoji] = reactions[emoji].filter(
              (id) => id !== therapistId
            );
          } else {
            reactions[emoji] = [...(reactions[emoji] || []), therapistId];
          }

          const otherType = emoji === "heart" ? "thumbsUp" : "heart";
          if (reactions[otherType]?.includes(therapistId)) {
            reactions[otherType] = reactions[otherType].filter(
              (id) => id !== therapistId
            );
          }

          Object.keys(reactions).forEach((key) => {
            if (reactions[key].length === 0) delete reactions[key];
          });

          const finalReactions =
            Object.keys(reactions).length === 0 ? deleteField() : reactions;

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
              // This was an add → remove it in rollback
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
    },
    [activeGroupId, therapistId, showError]
  );

  // DELETE MESSAGE - optimistic
  const deleteMessage = useCallback(
    async (msgId) => {
      if (!activeGroupId || !therapistId) return;

      // Optimistic update
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
          const msgRef = doc(db, `groupChats/${activeGroupId}/messages`, msgId);
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

        // Rollback
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
    [activeGroupId, therapistId, displayName, showError]
  );

  // PIN / UNPIN MESSAGE - optimistic
  const pinMessage = useCallback(
    async (msgId, currentPinned) => {
      if (!activeGroupId) return;

      const newPinned = !currentPinned;

      // Optimistic update
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id === msgId) {
            return {
              ...m,
              pinned: newPinned,
              pinnedBy: newPinned ? displayName : null,
            };
          }
          // If pinning new message → unpin old one
          if (newPinned && m.pinned && m.id !== msgId) {
            return { ...m, pinned: false, pinnedBy: null };
          }
          return m;
        })
      );

      const groupRef = doc(db, "groupChats", activeGroupId);
      const msgRef = doc(db, `groupChats/${activeGroupId}/messages`, msgId);

      try {
        await runTransaction(db, async (tx) => {
          const [groupSnap, msgSnap] = await Promise.all([
            tx.get(groupRef),
            tx.get(msgRef),
          ]);

          if (!groupSnap.exists() || !msgSnap.exists()) {
            throw new Error("Not found");
          }

          const currentPinnedId = groupSnap.data().pinnedMessageId || null;

          if (newPinned && currentPinnedId && currentPinnedId !== msgId) {
            const oldMsgRef = doc(
              db,
              `groupChats/${activeGroupId}/messages`,
              currentPinnedId
            );
            tx.update(oldMsgRef, { pinned: false, pinnedBy: null });
          }

          tx.update(msgRef, {
            pinned: newPinned,
            pinnedBy: newPinned ? displayName : null,
          });

          tx.update(groupRef, {
            pinnedMessageId: newPinned ? msgId : null,
          });

          // Only create event when actually pinning (newPinned === true)
          if (newPinned) {
            const eventRef = doc(collection(groupRef, "events"));
            tx.set(eventRef, {
              type: "pin",
              user: "System",
              text: `${displayName} pinned a message`,
              role: "system",
              timestamp: serverTimestamp(),
            });
          }
          // ← No event created when unpinning
        });
      } catch (e) {
        console.error("Failed to pin/unpin message:", e);
        showError("Failed to pin/unpin message.");

        // Rollback
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
    [activeGroupId, displayName, showError]
  );

  // LOAD MORE (older messages)
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
      setIsLoadingOlder(false);
    }
  }, [activeGroupId, hasMore, isLoadingOlder, showError]);

  // LISTENERS
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

    unsubPart.current = onSnapshot(groupRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setParticipants(data.participants || []);
        setInChat(data.participants?.includes(therapistId));
      }
    });

    const loadInitialMessages = async () => {
      setIsInitialLoading(true);
      const q = query(
        collection(groupRef, "messages"),
        orderBy("timestamp", "asc"),
        limitToLast(30)
      );
      try {
        const snap = await getDocs(q);
        const msgs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setMessages(msgs);
        setHasMore(snap.docs.length === 30);
        if (msgs.length > 0) {
          latestTimestamp.current = msgs[msgs.length - 1].timestamp;
          earliestTimestamp.current = msgs[0].timestamp;

          const newQ = query(
            collection(groupRef, "messages"),
            orderBy("timestamp", "asc"),
            startAfter(latestTimestamp.current)
          );
          unsubNewMsgs.current = onSnapshot(newQ, (newSnap) => {
            if (newSnap.empty) return;

            const incoming = newSnap.docs.map((d) => ({
              id: d.id,
              ...d.data(),
              isPending: false,
            }));

            setMessages((prev) => {
              let updated = [...prev];

              // Remove all my pending messages (they should be replaced soon)
              updated = updated.filter(
                (m) => !(m.isPending && m.userId === therapistId)
              );

              // Add new real messages
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
        showError("Failed to load initial messages.");
      } finally {
        setIsInitialLoading(false);
      }
    };

    loadInitialMessages();

    const evQ = query(collection(groupRef, "events"), orderBy("timestamp"));
    unsubEvents.current = onSnapshot(evQ, (snap) => {
      setEvents(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
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
    retrySend,
  };
}