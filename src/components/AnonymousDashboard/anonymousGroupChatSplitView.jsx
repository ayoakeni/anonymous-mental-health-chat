import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { db, storage, ref, uploadBytes, getDownloadURL } from "../../utils/firebase";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  doc,
  arrayUnion,
  arrayRemove,
  runTransaction,
  limit,
  deleteField,
  getDoc,
  getDocs,
  startAfter,
} from "firebase/firestore";
import { useTypingStatus } from "../../hooks/useTypingStatus";
import ChatMessage from "../therapistDashboard/ChatMessage";
import ResizableSplitView from "../../components/resizableSplitView";
import { useIsInsideChat } from "../../hooks/useIsInsideChatMobile";
import EmojiPicker from "emoji-picker-react";
import TherapistProfile from "../TherapistProfile";
import { getAIResponse, mapMessagesForAI} from "../../utils/AiChatIntegration";

/* -------------------------------------------------------------
   Simple media-query hook (no external deps)
   ------------------------------------------------------------- */
const useMediaQuery = (query) => {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const m = window.matchMedia(query);
    setMatches(m.matches);

    const handler = (e) => setMatches(e.matches);
    m.addEventListener("change", handler);
    return () => m.removeEventListener("change", handler);
  }, [query]);

  return matches;
};

function AnonymousGroupChatSplitView({
  groupChats,
  activeGroupId,
  setActiveGroupId,
  isLoadingChats,
  formatTimestamp,
  getTimestampMillis,
  displayName,
  userId,
  showError,
  playNotification,
}) {
  const [messages, setMessages] = useState([]);
  const [groupEvents, setGroupEvents] = useState([]);
  const [participants, setParticipants] = useState([]);
  const [participantNames, setParticipantNames] = useState({});
  const [isParticipantsOpen, setIsParticipantsOpen] = useState(false);
  const [showParticipantsList, setShowParticipantsList] = useState(false);
  const [showTherapistsList, setShowTherapistsList] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [newMessage, setNewMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [therapistsOnline, setTherapistsOnline] = useState([]);
  const [selectedTherapist, setSelectedTherapist] = useState(null);
  const [aiTyping, setAiTyping] = useState(false);
  const [pendingMessages, setPendingMessages] = useState([]);
  const [isLoadingChat, setIsLoadingChat] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const messagesEndRef = useRef(null);
  const chatBoxRef = useRef(null);
  const modalRef = useRef(null);
  const navigate = useNavigate();
  const { typingUsers, handleTyping } = useTypingStatus(displayName, activeGroupId ? activeGroupId : null);
  const isMobile = useMediaQuery("(max-width: 768px)");
  const isInsideChat = useIsInsideChat();
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);

  // Memoize active group to avoid repeated find calls
  const activeGroup = useMemo(() => 
    groupChats.find((g) => g.id === activeGroupId), 
    [groupChats, activeGroupId]
  );

  // Menu ellipsis
  useEffect(() => {
    const closeMenu = (e) => {
      // Only close if click is outside the entire menu container
      if (!e.target.closest(".leave-participant") && !e.target.closest(".chat-options-menu")) {
        setIsParticipantsOpen(false);
      }
    };
    if (isParticipantsOpen) {
      document.addEventListener("click", closeMenu);
    }
    return () => {
      document.removeEventListener("click", closeMenu);
    };
  }, [isParticipantsOpen]);

  // Auto scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, groupEvents, pendingMessages]);

  // Scroll to pinned message by ID 
  const scrollToMessage = useCallback((msgId) => {
    const el = document.getElementById(`msg-${msgId}`);
    if (!el) return;

    // Remove any existing highlight
    document.querySelectorAll(".message-highlight").forEach(e => {
      e.classList.remove("message-highlight");
    });

    // Highlight class
    el.classList.add("message-highlight");
    // Scroll into view
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => {
      el.classList.remove("message-highlight");
    }, 1600);
  }, []);

  // Load more messages (pagination)
  const loadMoreMessages = useCallback(async () => {
    if (!activeGroupId || !hasMoreMessages || isLoadingChat) return;
    setIsLoadingChat(true);
    try {
      const groupRef = doc(db, "groupChats", activeGroupId);
      const lastVisibleMsg = messages[messages.length - 1];
      const nextQuery = query(
        collection(groupRef, "messages"),
        orderBy("timestamp", "desc"),
        startAfter(lastVisibleMsg?.timestamp),
        limit(50)
      );
      const snapshot = await getDocs(nextQuery);
      const newMessages = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setMessages((prev) => [...newMessages, ...prev]);
      setHasMoreMessages(snapshot.docs.length === 50);
    } catch (err) {
      console.error("Error loading more messages:", err);
      showError("Failed to load more messages. Please try again.");
    } finally {
      setIsLoadingChat(false);
    }
  }, [activeGroupId, hasMoreMessages, isLoadingChat, messages, setMessages, setHasMoreMessages, showError]);

  // Reset invalid activeGroupId
  useEffect(() => {
    if (activeGroupId && !groupChats.find(g => g.id === activeGroupId)) {
      console.warn(`Active group ${activeGroupId} not found in groupChats, resetting`);
      setActiveGroupId(null);
      navigate("/anonymous-dashboard/group-chat");
    }
  }, [activeGroupId, groupChats, navigate, setActiveGroupId]);
  
  // Handle scroll to load more messages
  useEffect(() => {
    const chatBox = chatBoxRef.current;
    if (!chatBox) return;

    const handleScroll = () => {
      if (chatBox.scrollTop === 0 && hasMoreMessages && !isLoadingChat) {
        loadMoreMessages();
      }
    };
    chatBox.addEventListener("scroll", handleScroll);
    return () => chatBox.removeEventListener("scroll", handleScroll);
  }, [hasMoreMessages, isLoadingChat, activeGroupId, loadMoreMessages]);
  
  // Fetch online therapists with default name
  useEffect(() => {
    const q = query(collection(db, "therapists"), limit(50));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const onlineList = snapshot.docs.map((doc) => ({
          uid: doc.id,
          ...doc.data(),
          name: doc.data().name || `Therapist_${doc.id.slice(0, 3)}`,
        }));
        setTherapistsOnline(onlineList);
      },
      (err) => {
        console.error("Error fetching therapists online:", err);
        showError("Failed to fetch online therapists. Please try again.");
      }
    );
    return () => unsubscribe();
  }, [showError]);

  // Handle clicks outside the modal to close it
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (modalRef.current && !modalRef.current.contains(event.target)) {
        setSelectedTherapist(null);
      }
    };
    if (selectedTherapist) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [selectedTherapist]);

  // Fetch group chat data
  useEffect(() => {
    if (!activeGroupId) return;
    const groupRef = doc(db, "groupChats", activeGroupId);
    const messagesQuery = query(collection(groupRef, "messages"), orderBy("timestamp", "desc"), limit(50));
    const eventsQuery = query(collection(groupRef, "events"), orderBy("timestamp"), limit(50));

    const unsubMessages = onSnapshot(
      messagesQuery,
      (snapshot) => {
        const msgs = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        setMessages(msgs);
        // Clear pending messages that match real messages
        setPendingMessages((prev) =>
          prev.filter((pending) => !msgs.some((msg) => msg.text === pending.text && msg.role === pending.role))
        );
        setIsLoadingChat(false);
        setHasMoreMessages(snapshot.docs.length === 50);
        if (msgs.length > 0) playNotification();
      },
      (err) => {
        console.error("Error fetching messages:", err);
        showError("Failed to load messages. Please try again.");
        setIsLoadingChat(false);
      }
    );

    const unsubEvents = onSnapshot(
      eventsQuery,
      (snapshot) => {
        const evts = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        setGroupEvents(evts);
      },
      (err) => {
        console.error("Error fetching group events:", err);
        showError("Failed to load group events. Please try again.");
      }
    );

    const unsubParticipants = onSnapshot(
      groupRef,
      (snap) => {
        if (snap.exists()) {
          setParticipants(snap.data().participants || []);
        }
      },
      (err) => {
        console.error("Error fetching participants:", err);
        showError("Failed to load participants. Please try again.");
      }
    );

    return () => {
      unsubMessages();
      unsubEvents();
      unsubParticipants();
      setPendingMessages([]);
    };
  }, [activeGroupId, showError, playNotification]);

  // Fetch participant names
  useEffect(() => {
    if (participants.length === 0) {
      setParticipantNames({});
      return;
    }

    const names = {};
    const unsubscribes = participants.map((uid) => {
      const therapistRef = doc(db, "therapists", uid);
      const anonRef = doc(db, "anonymousUsers", uid);

      return onSnapshot(
        therapistRef,
        (therapistSnap) => {
          if (therapistSnap.exists()) {
            names[uid] = therapistSnap.data().name || `Therapist_${uid.slice(0, 3)}`;
            setParticipantNames({ ...names });
          } else {
            onSnapshot(
              anonRef,
              (anonSnap) => {
                names[uid] = anonSnap.exists()
                  ? anonSnap.data().anonymousName || `Anonymous user_${uid.slice(0, 3)}`
                  : `Deleted user_${uid.slice(0, 3)}`;
                setParticipantNames({ ...names });
              },
              (err) => {
                console.error(`Error fetching anonymous name for ${uid}:`, err);
                names[uid] = `Anonymous_${uid.slice(0, 3)}`;
                setParticipantNames({ ...names });
              }
            );
          }
        },
        (err) => {
          console.error(`Error fetching therapist name for ${uid}:`, err);
          names[uid] = `Anonymous_${uid.slice(0, 3)}`;
          setParticipantNames({ ...names });
        }
      );
    });

    return () => unsubscribes.forEach((unsub) => unsub());
  }, [participants]);

  const incrementUnreadCounts = (participants, unreadCount, senderId) => {
    const updated = { ...unreadCount };
    participants.forEach(uid => {
      if (uid !== senderId && uid !== "ai") {
        updated[uid] = (updated[uid] || 0) + 1;
      }
    });
    return updated;
  };

  useEffect(() => {
    if (!activeGroupId || !userId) return;

    const groupRef = doc(db, "groupChats", activeGroupId);

    const markAsRead = async () => {
      try {
        await runTransaction(db, async (tx) => {
          const snap = await tx.get(groupRef);
          if (!snap.exists()) return;

          const data = snap.data();
          if (data.participants?.includes(userId)) {
            // Only reset this user's unread count
            tx.update(groupRef, {
              [`unreadCount.${userId}`]: 0
            });
          }
        });
      } catch (err) {
        console.error("Failed to mark group chat as read:", err);
      }
    };

    markAsRead();

    // Periodically mark as read while tab is open
    const interval = setInterval(markAsRead, 30_000);

    return () => clearInterval(interval);
  }, [activeGroupId, userId]);

  // Join group chat
  const joinGroupChat = async (groupId) => {
    if (!userId) return;
    try {
      const groupRef = doc(db, "groupChats", groupId);
      await runTransaction(db, async (transaction) => {
        transaction.update(groupRef, { participants: arrayUnion(userId), [`unreadCount.${userId}`]: 0});
        transaction.set(doc(collection(groupRef, "events")), {
          type: "join",
          user: "System",
          text: `${displayName} has joined the group.`,
          role: "system",
          timestamp: serverTimestamp(),
        });
      });
      setActiveGroupId(groupId);
      navigate(`/anonymous-dashboard/group-chat/${groupId}`);
    } catch (err) {
      console.error("Error joining group chat:", err);
      showError("Failed to join group chat. Please try again.");
      navigate("/anonymous-dashboard/group-chat");
    }
  };

  // Leave group chat
  const leaveGroupChat = async () => {
    if (!userId || !activeGroupId) return;
    try {
      const groupRef = doc(db, "groupChats", activeGroupId);
      await runTransaction(db, async (transaction) => {
        transaction.update(groupRef, {
          participants: arrayRemove(userId),
          [`unreadCount.${userId}`]: deleteField()
        });
        transaction.set(doc(collection(groupRef, "events")), {
          type: "leave",
          user: "System",
          text: `${displayName} has left the group.`,
          role: "system",
          timestamp: serverTimestamp(),
        });
      });
      setActiveGroupId(null);
      showError("You've left the group. You can rejoin anytime.");
      navigate("/anonymous-dashboard/group-chat");
    } catch (err) {
      console.error("Error leaving group chat:", err);
      showError("Failed to leave group chat. Please try again.");
    }
  };

  // Send message
  const sendMessage = async (file = null) => {
    if (!newMessage.trim() && !file) return;
    if (!userId || !activeGroupId) return;
    setIsSending(true);

    let fileUrl = null;
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
      const isAiTrigger = newMessage.toLowerCase().includes("@ai");
      const cleanUserText = newMessage.replace(/@ai/gi, "").trim();

      const groupRef = doc(db, "groupChats", activeGroupId);
      const messagesRef = collection(db, `groupChats/${activeGroupId}/messages`);

      // === USER MESSAGE TRANSACTION ===
      await runTransaction(db, async (tx) => {
        // READ FIRST
        const groupSnap = await tx.get(groupRef);
        if (!groupSnap.exists()) throw new Error("Group does not exist");
        const participants = groupSnap.data()?.participants || [];
        const unreadCount = groupSnap.data()?.unreadCount || {};

        // THEN ALL WRITES
        const userMsgRef = doc(messagesRef);
        tx.set(userMsgRef, {
          text: cleanUserText || "",
          fileUrl,
          userId,
          displayName,
          role: "user",
          timestamp: serverTimestamp(),
          reactions: {},
          pinned: false,
        });

        tx.update(groupRef, {
          lastMessage: {
            text: cleanUserText || "Attachment",
            displayName,
            timestamp: serverTimestamp(),
          },
          unreadCount: incrementUnreadCounts(participants, unreadCount, userId),
        });
      });

      // Optimistic UI update
      setPendingMessages((prev) => [
        ...prev,
        {
          id: `pending-user-${Date.now()}`,
          text: cleanUserText,
          fileUrl,
          userId,
          displayName,
          role: "user",
          timestamp: { toMillis: () => Date.now() },
          reactions: {},
          pinned: false,
        },
      ]);

      setNewMessage("");
      setShowEmojiPicker(false);

      // === AI RESPONSE (if triggered) ===
      if (isAiTrigger) {
        setAiTyping(true);
        try {
          const aiInput = mapMessagesForAI(messages);
          const aiResponse = await getAIResponse(cleanUserText || "Continue", aiInput);
          const aiFullText = `${displayName}: ${cleanUserText}\n\n${aiResponse}`;

          await runTransaction(db, async (tx) => {
            // READ FIRST
            const groupSnap = await tx.get(groupRef);
            if (!groupSnap.exists()) throw new Error("Group does not exist");
            const participants = groupSnap.data()?.participants || [];
            const unreadCount = groupSnap.data()?.unreadCount || {};

            // THEN WRITES
            const aiMsgRef = doc(messagesRef);
            tx.set(aiMsgRef, {
              text: aiFullText,
              role: "ai",
              displayName: "Support Assistant",
              userId: "ai",
              timestamp: serverTimestamp(),
              fileUrl: null,
              reactions: {},
              pinned: false,
            });

            tx.update(groupRef, {
              lastMessage: {
                text: aiFullText,
                displayName: "Support Assistant",
                timestamp: serverTimestamp(),
              },
              unreadCount: incrementUnreadCounts(participants, unreadCount, userId),
            });
          });

          setPendingMessages((prev) => [
            ...prev,
            {
              id: `pending-ai-${Date.now()}`,
              text: aiFullText,
              role: "ai",
              displayName: "Support Assistant",
              userId: "ai",
              timestamp: { toMillis: () => Date.now() },
              fileUrl: null,
              reactions: {},
              pinned: false,
            },
          ]);
        } catch (aiErr) {
          console.error("AI error:", aiErr);
          const errText = "Sorry, I couldn’t respond right now. Please try again later.";

          await runTransaction(db, async (tx) => {
            // READ FIRST
            const groupSnap = await tx.get(groupRef);
            if (!groupSnap.exists()) throw new Error("Group does not exist");
            const participants = groupSnap.data()?.participants || [];
            const unreadCount = groupSnap.data()?.unreadCount || {};

            // THEN WRITES
            const errRef = doc(messagesRef);
            tx.set(errRef, {
              text: errText,
              role: "system",
              displayName: "System",
              userId: "system",
              timestamp: serverTimestamp(),
              fileUrl: null,
              reactions: {},
              pinned: false,
            });

            tx.update(groupRef, {
              lastMessage: {
                text: errText,
                displayName: "System",
                timestamp: serverTimestamp(),
              },
              unreadCount: incrementUnreadCounts(participants, unreadCount, userId),
            });
          });

          setPendingMessages((prev) => [
            ...prev,
            {
              id: `pending-error-${Date.now()}`,
              text: errText,
              role: "system",
              displayName: "System",
              userId: "system",
              timestamp: { toMillis: () => Date.now() },
              fileUrl: null,
              reactions: {},
              pinned: false,
            },
          ]);
        } finally {
          setAiTyping(false);
        }
      }
    } catch (e) {
      console.error("Error sending message:", e);
      showError("Failed to send message.");
    } finally {
      setIsSending(false);
    }
  };

  // Toggle reaction
  const toggleReaction = async (msgId, reactionType) => {
    if (!userId || !activeGroupId) return;
    const msgRef = doc(db, `groupChats/${activeGroupId}/messages`, msgId);
    try {
      await runTransaction(db, async (transaction) => {
        const msgSnap = await transaction.get(msgRef);
        if (!msgSnap.exists()) return;
        const reactions = msgSnap.data().reactions || {};
        const currentReactions = reactions[reactionType] || [];
        const updatedReactions = currentReactions.includes(userId)
          ? currentReactions.filter((id) => id !== userId)
          : [...currentReactions, userId];
        const updated = { ...reactions, [reactionType]: updatedReactions };
        transaction.update(msgRef, { reactions: updated });
      });
    } catch (err) {
      console.error("Error toggling reaction:", err);
      showError("Failed to update reaction. Please try again.");
    }
  };

  // ---------- PIN MESSAGE ----------
  const pinMessage = async (msgId, currentPinned = false) => {
    if (!activeGroupId) return;

    const groupRef = doc(db, "groupChats", activeGroupId);
    const messagesCollection = collection(db, `groupChats/${activeGroupId}/messages`);
    const msgRef = doc(messagesCollection, msgId);

    try {
      await runTransaction(db, async (tx) => {
        // Read the target message
        const msgSnap = await tx.get(msgRef);
        if (!msgSnap.exists()) {
          throw new Error("Message does not exist");
        }

        // If we're pinning (not unpinning), we need to unpin all others
        let docsToUnpin = [];
        if (!currentPinned) {
          // Read ALL messages in the collection using transaction-safe reads
          const allMessagesSnap = await tx.get(query(messagesCollection));
          allMessagesSnap.docs.forEach((doc) => {
            if (doc.id !== msgId && doc.data().pinned) {
              docsToUnpin.push(doc.ref);
            }
          });
        }

        // Unpin other messages
        docsToUnpin.forEach((ref) => {
          tx.update(ref, { pinned: false, pinnedBy: null });
        });

        // Toggle the target message
        tx.update(msgRef, {
          pinned: !currentPinned,
          pinnedBy: !currentPinned ? displayName : null,
        });

        // Add system event
        const eventRef = doc(collection(groupRef, "events"));
        tx.set(eventRef, {
          type: "pin",
          user: displayName,
          text: !currentPinned
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

  // Handle emoji click
  const onEmojiClick = (emojiData) => {
    setNewMessage(newMessage + emojiData.emoji);
    setShowEmojiPicker(false);
  };

  // Handle therapist click to view profile
  const handleTherapistClick = async (msg) => {
    if (msg.role !== "therapist") return;
    try {
      const snap = await getDoc(doc(db, "therapists", msg.userId));
      if (snap.exists()) {
        setSelectedTherapist({ ...snap.data(), uid: msg.userId });
      }
    } catch (err) {
      console.error("Error fetching therapist profile:", err);
      showError("Failed to fetch therapist profile. Please try again.");
    }
  };

  // Combine messages and events
  const combinedGroupChat = [...messages, ...groupEvents, ...pendingMessages].sort((a, b) => {
    return getTimestampMillis(a.timestamp) - getTimestampMillis(b.timestamp);
  });

  // LEFT PANEL: Chat List
  const leftPanel = (
    <div className="chat-box-card">
      <h3>Group Chats</h3>
      <div className="chat-list-container">
        {isLoadingChats ? (
          <p>Loading group chats...</p>
        ) : groupChats.length === 0 ? (
          <p>No group chats available</p>
        ) : (
          groupChats.map((group) => {
            const lastTs = group.lastMessage?.timestamp;
            const { dateStr, timeStr } = formatTimestamp(lastTs);
            return (
              <div
                key={group.id}
                className={`chat-card ${activeGroupId === group.id ? "selected" : ""}`}
                onClick={() => {
                  joinGroupChat(group.id);
                }}
              >
                <div className="chat-card-inner">
                  <div className="chat-avater-content">
                    <span className="therapist-avatar">{group.name?.[0] || "G"}</span>
                    <div className="chat-card-content">
                      <strong className="chat-card-title">{group.name || "Unnamed Group"}</strong>
                      <small className="chat-card-preview">
                        {group.lastMessage
                          ? `${group.lastMessage.displayName || "Anonymous"}: ${group.lastMessage.text}`
                          : "No messages yet"}
                      </small>
                    </div>
                  </div>
                  <div className="chat-card-meta">
                    {lastTs ? (
                      <div className="message-timestamp">
                        <span className="meta-date">{dateStr || "N/A"}</span>
                        <span className="meta-time">{timeStr || "N/A"}</span>
                      </div>
                    ) : null}
                    {(() => {
                      const personalUnread = group.unreadCount?.[userId] || 0;
                      return personalUnread > 0 && <span className="unread-badge">{personalUnread}</span>;
                    })()}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );

  // RIGHT PANEL: Active Chat
  const rightPanel = (
    <div className="chat-box-container">
      {activeGroupId ? (
        <div className="group-chat-box">
          {/* Therapist Profile Modal */}
          {selectedTherapist && (
            <div className="modal-backdrop">
              <div className="modal" ref={modalRef}>
                <TherapistProfile
                  therapist={selectedTherapist}
                  isOnline={selectedTherapist.online}
                  onBack={() => setSelectedTherapist(null)}
                  onStartChat={undefined}
                  onBookAppointment={undefined}
                />
              </div>
            </div>
          )}
          <div className="chat-header">
            <div className="detailLeave">
              <div className="chat-avater">
                {isMobile && activeGroup && (
                  <i 
                    className="fa-solid fa-arrow-left mobile-back-btn"
                    onClick={() => {
                      setActiveGroupId(null);
                      navigate("/anonymous-dashboard/group-chat");
                    }}
                    aria-label="Back to chat list"
                  ></i>
                )}
                <span className="text-avatar">{activeGroup?.name?.[0] || "G"}</span>
                <div className="card-content">
                  <strong className="group-title">{activeGroup?.name || "Unnamed Group"}</strong>
                  <small className="participant-preview">
                    {participants.length > 0 ? (
                      participants.map((uid, index) => (
                        <span key={uid} className="participant-name">
                          {participantNames[uid] || "Loading"}
                          {index < participants.length - 1 && <b>,</b>}
                        </span>
                      ))
                    ) : (
                      <div className="participant">No participants</div>
                    )}           
                  </small>
                </div>
              </div>

              <div className="leave-participant">
                {/* MENU TRIGGER */}
                <button
                  className="menu-trigger"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsParticipantsOpen(prev => !prev);
                  }}
                  aria-label="Chat options"
                  aria-expanded={isParticipantsOpen}
                >
                  <i className="fa-solid fa-ellipsis-vertical"></i>
                </button>

                {/* DROPDOWN MENU */}
                {isParticipantsOpen && (
                  <div 
                    className="chat-options-menu" 
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* Participants - Collapsible */}
                    <div className="menu-section">
                      <div
                        className="menu-item collapsible-header"
                        onClick={() => setShowParticipantsList(prev => !prev)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => e.key === "Enter" && setShowParticipantsList(prev => !prev)}
                      >
                        <i className="fas fa-users"></i>
                        <span>Participants ({participants.length})</span>
                        <i className={`fas fa-chevron-${showParticipantsList ? "up" : "down"} chevron-icon`}></i>
                      </div>

                      {showParticipantsList && (
                        <div className="participant-dropdown-inline">
                          {participants.length > 0 ? (
                            participants.map((uid) => (
                              <div key={uid} className="participant-item">
                                {participantNames[uid] || "Anonymous User"}
                              </div>
                            ))
                          ) : (
                            <div className="participant-item">No participants</div>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="menu-divider"></div>

                    {/* Online Therapists - Collapsible */}
                    <div className="menu-section">
                      <div
                        className="menu-item collapsible-header"
                        onClick={() => setShowTherapistsList(prev => !prev)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => e.key === "Enter" && setShowTherapistsList(prev => !prev)}
                      >
                        <i className="fas fa-user-md"></i>
                        <span>Therapists Online ({therapistsOnline.filter(t => t.online).length})</span>
                        <i className={`fas fa-chevron-${showTherapistsList ? "up" : "down"} chevron-icon`}></i>
                      </div>

                      {showTherapistsList && (
                        <div className="therapist-list">
                          {therapistsOnline.length === 0 ? (
                            <div className="therapist-item offline">No therapists online</div>
                          ) : (
                            therapistsOnline.map((therapist) => (
                              <div
                                key={therapist.uid}
                                className={`therapist-item ${therapist.online ? "online" : ""} ${
                                  selectedTherapist?.uid === therapist.uid ? "active" : ""
                                }`}
                                data-fullname={therapist.name}
                                onClick={() => {
                                  handleTherapistClick({ userId: therapist.uid, role: "therapist" });
                                  // setIsParticipantsOpen(false);
                                }}
                              >
                                {therapist.profileImage ? (
                                  <img src={therapist.profileImage} alt={therapist.name} className={`avatar ${therapist.online ? "online" : ""}`}/>
                                ) : (
                                  <div className={`avatarPlaceholder ${therapist.online ? "online" : ""}`}>
                                    {therapist.name?.[0]?.toUpperCase() || 'T'}
                                  </div>
                                )}
                                <span className="therapist-name">
                                  {therapist.name || `Therapist ${therapist.uid.slice(0, 4)}`}
                                </span>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>

                    <div className="menu-divider"></div>

                    {/* Leave Button */}
                    <div className="menu-item leave-button" onClick={() => setShowLeaveConfirm(true)}>
                      <i className="fas fa-sign-out-alt"></i>
                      <span>Leave Group</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
            {/* Confirmation Modal */}
            {showLeaveConfirm && (
              <div className="modal-backdrop-leave" onClick={() => setShowLeaveConfirm(false)}>
                <div className="confirm-modal-leave" onClick={(e) => e.stopPropagation()}>
                  <div className="confirm-modal-content">
                    <h3>Leave this group?</h3>
                    <ul className="confirm-list">
                      <li>You will no longer see new messages</li>
                      <li>You will be removed from the participant list</li>
                      <li>You can rejoin anytime from the group list</li>
                    </ul>
                    <p className="confirm-question">
                      Are you sure you want to leave this group?
                    </p>
                  </div>

                  <div className="button-group">
                    <button className="btn-cancel" onClick={() => setShowLeaveConfirm(false)}>
                      Cancel
                    </button>
                    <button
                      className="btn-confirm-leave"
                      onClick={() => {
                        leaveGroupChat();
                        setShowLeaveConfirm(false);
                      }}
                    >
                      Leave Group
                    </button>
                  </div>
                </div>
              </div>
            )}
            {/* Pinned Message */}
            {combinedGroupChat.some((msg) => msg.pinned) && (
              <div className="pinned-message"
                onClick={() => {
                  const pinnedMsg = combinedGroupChat.find(m => m.pinned);
                  if (pinnedMsg) scrollToMessage(pinnedMsg.id);
                }}
                style={{ cursor: "pointer" }}
                title="Click to jump to pinned message"
              >
                <span className="pin-text-icon">
                  <i className="fas fa-thumbtack pinned-icon"></i>
                  <span className="pinned-text">
                    <strong>{combinedGroupChat.find(m => m.pinned)?.pinnedBy}:</strong>{" "}
                    <span>{combinedGroupChat.find((msg) => msg.pinned)?.text || ""}</span>
                  </span>
                </span>
              </div>
            )}
          </div>
          <div className={selectedTherapist ? "chat-box blurred" : "chat-box"} role="log" aria-live="polite" ref={chatBoxRef}>
            {isLoadingChat ? (
              <div className="loading-messages">
                <div className="spinner"></div>
                <p>Loading messages...</p>
              </div>
            ) : combinedGroupChat.length === 0 ? (
              <p className="no-message">No messages in this group yet.</p>
            ) : (
              combinedGroupChat.map((msg) => {
                const isTherapist = therapistsOnline.some(t => t.uid === userId && t.online);
                return (
                  <div className="message" key={`${msg.id}-${msg.type || "message"}`} id={`msg-${msg.id}`}>
                    <ChatMessage
                      msg={msg}
                      toggleReaction={msg.id.startsWith("pending-") ? () => {} : toggleReaction}
                      therapistInfo={{ role: isTherapist ? "therapist" : "user" }}
                      handleTherapistClick={handleTherapistClick}
                      pinMessage={isTherapist ? pinMessage : undefined}
                      scrollToMessage={scrollToMessage}
                      isTherapist={isTherapist}
                    />
                  </div>
                );
              })
            )}
            {/* Typing Indicator */}
            {(typingUsers.length > 0 || aiTyping) && (
              <p className="typing-indicator">
                {aiTyping && <span className="ai-typing">Support Assistant</span>}
                {aiTyping && typingUsers.length > 0 && " and "}
                {typingUsers
                  .map(u => typeof u === "string" ? u : u?.name || "")
                  .filter(Boolean)
                  .join(", ")}
                {(typingUsers.length > 0 || aiTyping) && " "}
                {typingUsers.length + (aiTyping ? 1 : 0) === 1 ? "is" : "are"} typing
                <div className="typing-dots">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              </p>
            )}
            <div ref={messagesEndRef} />
          </div>
          <div className="chat-input-box">
            <div className="chat-input">
              <button
                className="emoji-btn"
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                aria-label="Open emoji picker"
              >
                <i className="fa-regular fa-face-smile"></i>
              </button>
              <input
                className="inputInsert"
                type="text"
                value={newMessage}
                onChange={(e) => {
                  setNewMessage(e.target.value);
                  handleTyping(e.target.value);
                }}
                placeholder="Type a message..."
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                aria-label="Message input"
                disabled={isSending}
              />
              <input
                type="file"
                id="group-file-upload"
                style={{ display: "none" }}
                onChange={(e) => sendMessage(e.target.files[0])}
                aria-label="Upload file"
              />
              <button
                className="attach-btn"
                onClick={() => document.getElementById("group-file-upload").click()}
                aria-label="Attach file"
              >
                <i className="fa-solid fa-paperclip"></i>
              </button>
              <button className="send-btn" onClick={() => sendMessage()} disabled={isSending} aria-label="Send message">
                {isSending ? <span className="spinner small"></span> : <i className="fa-solid fa-paper-plane"></i>}
              </button>
            </div>
            {showEmojiPicker && <EmojiPicker onEmojiClick={onEmojiClick} />}
          </div>  
        </div>
      ) : (
        <div className="empty-chat">
          <p>Select a group chat to view messages</p>
        </div>
      )}
    </div>
  );

  /* ------------------- RENDER LOGIC ------------------- */
  if (isMobile) {
    const showChat = activeGroupId;

    return (
      <div className={`mobile-chat-wrapper ${isInsideChat ? "no-bottom-padding" : ""}`.trim()}>
        <div className={`mobile-panel ${showChat ? 'hidden' : ''}`.trim()}>
          {leftPanel}
        </div>
        <div className={`mobile-panel ${!showChat ? 'hidden' : ''}`.trim()}>
          {rightPanel}
        </div>
      </div>
    );
  }

  return (
    <ResizableSplitView
      leftPanel={leftPanel}
      rightPanel={rightPanel}
      initialRatio={0.3}
      minLeft={370}
      maxLeft={550}
      minRight={200}
      maxRight={400}
    />
  );
}

export default AnonymousGroupChatSplitView;