import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { db, doc, storage, ref, uploadBytes, getDownloadURL } from "../../utils/firebase";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  arrayUnion,
  deleteField,
  runTransaction,
  limit,
  getDoc,
  getDocs,
  increment,
  startAfter,
} from "firebase/firestore";
import { useTypingStatus } from "../../hooks/useTypingStatus";
import { getAIResponse } from "../../utils/AiChatIntegration";
import { mapMessagesForAI } from "../../utils/AiChatIntegration";
import ChatMessage from "../therapistDashboard/ChatMessage";
import ResizableSplitView from "../../components/resizableSplitView";
import { useIsInsideChat } from "../../hooks/useIsInsideChatMobile";
import LeaveChatButton from "../LeaveChatButton";
import EmojiPicker from "emoji-picker-react";

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

function AnonymousPrivateChatSplitView({
  privateChats,
  activeChatId,
  setActiveChatId,
  formatTimestamp,
  getTimestampMillis,
  displayName,
  userId,
  anonNames,
  showError,
  playNotification,
}) {
  const [messages, setMessages] = useState([]);
  const [events, setEvents] = useState([]);
  const [pendingMessages, setPendingMessages] = useState([]);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [aiTyping, setAiTyping] = useState(false);
  const [newMessage, setNewMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [activeTherapists, setActiveTherapists] = useState([]);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isLoadingChat, setIsLoadingChat] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);

  const messagesEndRef = useRef(null);
  const chatBoxRef = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { typingUsers, handleTyping } = useTypingStatus(displayName, activeChatId);
  const isMobile = useMediaQuery("(max-width: 768px)");
  const isInsideChat = useIsInsideChat();
  const [menuOpen, setMenuOpen] = useState(false);
  const fileInputRef = useRef(null);

const therapistDisplayName = useMemo(() => {
  if (!activeChatId) return "Waiting for a therapist…";
  if (anonNames[activeChatId]) return anonNames[activeChatId];

  const chat = privateChats.find(c => c.id === activeChatId);
  const therapistUid = chat?.participants?.find(uid => uid !== userId);
  if (!therapistUid) return "Waiting for a therapist…";

  // Live name will update via onSnapshot elsewhere if needed
  return "Loading name…";
}, [activeChatId, anonNames, privateChats, userId]);

  useEffect(() => {
    const selectId = location.state?.selectChatId;
    if (selectId && activeChatId !== selectId) {
      setActiveChatId(selectId);
    }
  }, [location.state?.selectChatId, activeChatId]);

  useEffect(() => {
    const closeMenu = (e) => {
      if (!e.target.closest(".leave-participant") && !e.target.closest(".chat-options-menu")) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) {
      document.addEventListener("click", closeMenu);
    }
    return () => document.removeEventListener("click", closeMenu);
  }, [menuOpen]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, events, pendingMessages]);

  const loadMoreMessages = useCallback(async () => {
    if (!activeChatId || !hasMoreMessages || isLoadingChat) return;
    setIsLoadingChat(true);
    try {
      const chatRef = doc(db, "privateChats", activeChatId);
      const lastVisibleMsg = messages[messages.length - 1];
      const nextQuery = query(
        collection(chatRef, "messages"),
        orderBy("timestamp", "desc"),
        startAfter(lastVisibleMsg?.timestamp),
        limit(50)
      );
      const snapshot = await getDocs(nextQuery);
      const newMessages = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setMessages(prev => [...newMessages, ...prev]);
      setHasMoreMessages(snapshot.docs.length === 50);
    } catch (err) {
      console.error("Error loading more messages:", err);
      showError("Failed to load more messages. Please try again.");
    } finally {
      setIsLoadingChat(false);
    }
  }, [activeChatId, hasMoreMessages, isLoadingChat, messages, showError]);

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
  }, [hasMoreMessages, isLoadingChat, activeChatId, loadMoreMessages]);

  // useEffect(() => {
  //   if (activeChatId) {
  //     navigate(`/anonymous-dashboard/private-chat/${activeChatId}`, { replace: true });
  //   }
  // }, [activeChatId, navigate]);

  useEffect(() => {
    if (!activeChatId) return;
    const q = query(collection(db, "therapists"), limit(50));
    const unsub = onSnapshot(
      q,
      snap => {
        const online = snap.docs
          .map(d => ({
            uid: d.id,
            ...d.data(),
            name: d.data().name || `Therapist_${d.id.slice(0, 8)}`,
          }))
          .filter(t => t.online);
        setActiveTherapists(online);
      },
      err => {
        console.error("Error fetching therapists online:", err);
        showError("Failed to fetch therapist status. Please try again.");
      }
    );
    return () => unsub();
  }, [activeChatId, showError]);

  useEffect(() => {
    if (!activeChatId) return;
    const chatRef = doc(db, "privateChats", activeChatId);
    const q = query(collection(chatRef, "messages"), orderBy("timestamp", "desc"), limit(50));
    const unsubscribe = onSnapshot(
      q,
      snapshot => {
        const msgs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        setMessages(msgs);
        setPendingMessages(prev =>
          prev.filter(p => !msgs.some(m => m.text === p.text && m.role === p.role))
        );
        setIsLoadingChat(false);
        setHasMoreMessages(snapshot.docs.length === 50);
        if (msgs.length > 0) playNotification();
      },
      err => {
        console.error("Error fetching messages:", err);
        showError("Failed to load messages. Please try again.");
        setIsLoadingChat(false);
      }
    );
    return () => {
      unsubscribe();
      setPendingMessages([]);
    };
  }, [activeChatId, playNotification, showError]);

  useEffect(() => {
    if (!activeChatId) return;
    const chatRef = doc(db, "privateChats", activeChatId);
    const q = query(collection(chatRef, "events"), orderBy("timestamp"), limit(50));
    const unsubscribe = onSnapshot(
      q,
      snapshot => {
        const evts = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        setEvents(evts);
      },
      err => {
        console.error("Error fetching events:", err);
        showError("Failed to load events. Please try again.");
      }
    );
    return () => unsubscribe();
  }, [activeChatId, showError]);


  // AI Offer Logic — shows only AFTER user sends a message and waits 7+ seconds
  useEffect(() => {
    if (!activeChatId || !userId) return;

    let timeoutId = null;

    const chatRef = doc(db, "privateChats", activeChatId);

    const unsubscribe = onSnapshot(chatRef, (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();

      // If AI already offered or active → don't show offer
      if (data.aiOffered || data.aiActive) return;

      // Clear any previous timer
      if (timeoutId) clearTimeout(timeoutId);

      // Combine real messages + pending (optimistic) messages
      const allMessages = [...messages, ...pendingMessages];

      // Has the user sent any message yet?
      const hasUserMessage = allMessages.some(m => m.role === "user");
      if (!hasUserMessage) return;

      // Find the most recent therapist reply
      const therapistReplies = allMessages
        .filter(m => m.role === "therapist")
        .sort((a, b) => getTimestampMillis(b.timestamp) - getTimestampMillis(a.timestamp));

      const lastTherapistTime = therapistReplies.length > 0
        ? getTimestampMillis(therapistReplies[0].timestamp)
        : 0;

      const now = Date.now();
      const noReplyYet = lastTherapistTime === 0;
      const waitedLongEnough = now - lastTherapistTime > 7000;

      // Only start the 7-second timer if no reply yet or waited too long
      if (noReplyYet || waitedLongEnough) {
        timeoutId = setTimeout(async () => {
          try {
            // Double-check everything is still valid after 7 seconds
            const freshSnap = await getDoc(chatRef);
            if (!freshSnap.exists()) return;
            const freshData = freshSnap.data();
            if (freshData.aiOffered || freshData.aiActive) return;

            const latestMessages = [...messages, ...pendingMessages];
            const stillNoTherapistReply = latestMessages
              .filter(m => m.role === "therapist")
              .every(m => Date.now() - getTimestampMillis(m.timestamp) > 7000);

            const neverGotReply = latestMessages.filter(m => m.role === "therapist").length === 0;

            if (neverGotReply || stillNoTherapistReply) {
              const now = Date.now();
              const offerMessage = {
                id: "ai-offer-message",
                type: "ai-offer",
                text: "It looks like you're waiting for a reply. Would you like to chat with our Support Assistant in the meantime?",
                role: "system",
                timestamp: { toMillis: () => now },
              };

              // Add to pending messages (optimistic UI)
              setPendingMessages(prev => {
                if (prev.some(m => m.id === "ai-offer-message")) return prev;
                return [...prev, offerMessage];
              });

              // Mark as offered in Firestore
              await runTransaction(db, async (transaction) => {
                const currentSnap = await transaction.get(chatRef);
                if (currentSnap.exists() && !currentSnap.data().aiOffered && !currentSnap.data().aiActive) {
                  transaction.update(chatRef, { aiOffered: true });
                }
              });
            }
          } catch (err) {
            console.error("Failed to show AI offer:", err);
          }
        }, 7000);
      }
    });

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      unsubscribe();
    };
  }, [activeChatId, userId, messages, pendingMessages]);

  const joinPrivateChat = async (chatId) => {
    if (!userId) return;
    try {
      const chatRef = doc(db, "privateChats", chatId);
      await runTransaction(db, async (transaction) => {
        const chatSnap = await transaction.get(chatRef);
        if (!chatSnap.exists()) {
          transaction.set(chatRef, {
            participants: [userId],
            lastMessage: "",
            lastUpdated: serverTimestamp(),
            unreadCountForTherapist: 0,
            aiActive: false,
            aiOffered: false,
            leftBy: {},
          });
        } else {
          const data = chatSnap.data();
          const wasLeft = data.leftBy?.[userId];

          if (wasLeft) {
            transaction.update(chatRef, {
              [`leftBy.${userId}`]: deleteField(),
              aiOffered: false,
              aiActive: false,
            });
          }
          if (!data.participants.includes(userId)) {
            transaction.update(chatRef, { participants: arrayUnion(userId) });
          }
        }
      });
      setActiveChatId(chatId);
      navigate(`/anonymous-dashboard/private-chat/${chatId}`);
    } catch (err) {
      console.error("Error joining private chat:", err);
      showError("Failed to join private chat.");
    }
  };

  const leavePrivateChat = async () => {
    if (!activeChatId || !userId) return;
    try {
      const chatRef = doc(db, "privateChats", activeChatId);
      await runTransaction(db, async (transaction) => {
        const chatSnap = await transaction.get(chatRef);
        if (!chatSnap.exists()) throw new Error("Chat does not exist");

        transaction.update(chatRef, {
          [`leftBy.${userId}`]: true,
          aiOffered: false,
          aiActive: false, // Disable AI on leave
        });
        transaction.set(doc(collection(chatRef, "events")), {
          type: "leave",
          user: displayName,
          text: `${displayName} has left the chat.`,
          role: "system",
          timestamp: serverTimestamp(),
        });
      });

      await new Promise(r => setTimeout(r, 600));
      setActiveChatId(null);
      navigate("/anonymous-dashboard/private-chat");
    } catch (err) {
      console.error("Error leaving private chat:", err);
      showError("Failed to leave chat.");
    }
  };

  const sendMessage = async (file = null) => {
    if (!newMessage.trim() && !file) return;
    if (!userId || !activeChatId) return;

    setIsSending(true);
    let fileUrl = null;

    try {
      if (file) {
        const storageRef = ref(storage, `privateChats/${activeChatId}/${Date.now()}_${file.name}`);
        await uploadBytes(storageRef, file);
        fileUrl = await getDownloadURL(storageRef);
      }

      const messageText = newMessage.trim();
      const chatRef = doc(db, "privateChats", activeChatId);

      let hasTherapist = false;
      let aiActive = false;

      await runTransaction(db, async (transaction) => {
        const chatSnap = await transaction.get(chatRef);

        if (!chatSnap.exists()) {
          const targetTherapistId = location.state?.therapistId;
          transaction.set(chatRef, {
            participants: [userId],
            requestedTherapist: targetTherapistId || null,
            pendingTherapist: targetTherapistId || null,
            createdAt: serverTimestamp(),
            lastMessage: displayName + ": " + messageText || "Attachment",
            lastUpdated: serverTimestamp(),
            unreadCountForTherapist: targetTherapistId ? 1 : 0,
            unreadCountForUser: 0,
            status: "waiting",
            aiOffered: false,
            aiActive: false,
            leftBy: {},
          });
        } else {
          const data = chatSnap.data();
          hasTherapist = (data.participants || []).some(p => p !== userId && p !== data.activeTherapist);
          aiActive = data.aiActive === true;

          transaction.update(chatRef, {
            lastMessage: displayName + ": " + messageText || "Attachment",
            lastUpdated: serverTimestamp(),
            unreadCountForTherapist: increment(1),
          });
        }

        transaction.set(doc(collection(chatRef, "messages")), {
          text: messageText,
          fileUrl,
          userId,
          displayName,
          role: "user",
          timestamp: serverTimestamp(),
          reactions: {},
        });
      });

      // Optimistic UI
      setPendingMessages(prev => [...prev, {
        id: `pending-${Date.now()}`,
        text: messageText,
        fileUrl,
        userId,
        displayName,
        role: "user",
        timestamp: { toMillis: () => Date.now() },
        reactions: {},
      }]);

      setNewMessage("");
      setShowEmojiPicker(false);

      // AI response if enabled
      if (aiActive && !hasTherapist) {
        setAiTyping(true);
        try {
          const aiInputMessages = mapMessagesForAI(messages);
          const aiResponse = await getAIResponse(newMessage || " ", aiInputMessages);
          const aiFullText = `"${newMessage || "Attachment"}"\n\n${aiResponse}`;

          await runTransaction(db, async (tx) => {
            tx.set(doc(collection(chatRef, "messages")), {
              text: aiFullText,
              role: "ai",
              displayName: "Support Assistant",
              timestamp: serverTimestamp(),
            });
            tx.update(chatRef, {
              lastMessage: `Support Assistant: ${aiResponse}`,
              lastUpdated: serverTimestamp(),
            });
          });

          setPendingMessages(prev => [...prev, {
            id: `pending-ai-${Date.now()}`,
            text: aiFullText,
            role: "ai",
            displayName: "Support Assistant",
            timestamp: { toMillis: () => Date.now() },
          }]);
        } catch (err) {
          // ... error handling
        } finally {
          setAiTyping(false);
        }
      }
    } catch (err) {
      console.error("Error sending message:", err);
      showError("Failed to send message.");
    } finally {
      setIsSending(false);
    }
  };

  const handleAiChoice = async (choice) => {
    const chatRef = doc(db, "privateChats", activeChatId);
    try {
      await runTransaction(db, async (transaction) => {
        const chatSnap = await transaction.get(chatRef);
        if (!chatSnap.exists()) throw new Error("Chat document does not exist");
        transaction.set(doc(collection(chatRef, "messages")), {
          text: choice === "yes" ? "Yes" : "No",
          userId,
          displayName,
          role: "user",
          timestamp: serverTimestamp(),
          read: false,
        });
        if (choice === "yes") {
          transaction.update(chatRef, { aiActive: true, aiOffered: false });
          transaction.set(doc(collection(chatRef, "messages")), {
            text: "You are now chatting with our support assistant until a therapist joins.",
            role: "system",
            timestamp: serverTimestamp(),
          });
          try {
            setAiTyping(true);
            const aiInputMessages = mapMessagesForAI(messages);
            const aiResponse = await getAIResponse("Start conversation", aiInputMessages);
            const aiFullText = aiResponse;
            transaction.set(doc(collection(chatRef, "messages")), {
              text: aiFullText,
              role: "ai",
              displayName: "Support Assistant",
              timestamp: serverTimestamp(),
              fileUrl: null,
              reactions: {},
            });
            transaction.update(chatRef, {
              lastMessage: aiFullText,
              lastUpdated: serverTimestamp(),
            });

            setPendingMessages((prev) => [
              ...prev,
              {
                id: `pending-user-${Date.now()}`,
                text: choice === "yes" ? "Yes" : "No",
                userId,
                displayName,
                role: "user",
                timestamp: { toMillis: () => Date.now() },
                read: false,
              },
              {
                id: `pending-system-${Date.now()}`,
                text: "You are now chatting with our support assistant until a therapist joins.",
                role: "system",
                timestamp: { toMillis: () => Date.now() },
              },
              {
                id: `pending-ai-${Date.now()}`,
                text: aiFullText,
                role: "ai",
                displayName: "Support Assistant",
                timestamp: { toMillis: () => Date.now() },
                fileUrl: null,
                reactions: {},
              },
            ]);
          } catch (err) {
            console.error("AI response error:", err);
            const errText = "Sorry, I couldn’t respond right now. Please wait for a therapist.";
            transaction.set(doc(collection(chatRef, "messages")), {
              text: errText,
              role: "system",
              timestamp: serverTimestamp(),
            });
            transaction.update(chatRef, {
              lastMessage: errText,
              lastUpdated: serverTimestamp(),
            });

            setPendingMessages((prev) => [
              ...prev,
              {
                id: `pending-user-${Date.now()}`,
                text: choice === "yes" ? "Yes" : "No",
                userId,
                displayName,
                role: "user",
                timestamp: { toMillis: () => Date.now() },
                read: false,
              },
              {
                id: `pending-system-${Date.now()}`,
                text: errText,
                role: "system",
                timestamp: { toMillis: () => Date.now() },
              },
            ]);
          }
        } else {
          transaction.update(chatRef, { aiActive: false, aiOffered: false });
          transaction.set(doc(collection(chatRef, "messages")), {
            text: "Okay, please hold on while we connect you to a therapist.",
            role: "system",
            timestamp: serverTimestamp(),
          });

          setPendingMessages((prev) => [
            ...prev,
            {
              id: `pending-user-${Date.now()}`,
              text: "No",
              userId,
              displayName,
              role: "user",
              timestamp: { toMillis: () => Date.now() },
              read: false,
            },
            {
              id: `pending-system-${Date.now()}`,
              text: "Okay, please hold on while we connect you to a therapist.",
              role: "system",
              timestamp: { toMillis: () => Date.now() },
            },
          ]);
        }
      });
      setAiEnabled(choice === "yes");
    } catch (err) {
      console.error("Error handling AI choice:", err);
      showError("Failed to process AI choice. Please try again.");
    } finally {
      setAiTyping(false);
    }
  };

  const toggleReaction = async (msgId, reactionType) => {
    if (!userId || !activeChatId) return;
    const msgRef = doc(db, `privateChats/${activeChatId}/messages`, msgId);
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

  const onEmojiClick = (emojiData) => {
    setNewMessage(newMessage + emojiData.emoji);
    setShowEmojiPicker(false);
  };

  const combinedPrivateChat = [...messages, ...events, ...pendingMessages]
  .sort((a, b) => getTimestampMillis(a.timestamp) - getTimestampMillis(b.timestamp));

  const leftPanel = (
    <div className="chat-box-card">
      <h3>Private Chats</h3>
      <div className="chat-list-container">
        {privateChats.length === 0 ? (
          <p>No active private chats. Start one from a therapist profile!</p>
        ) : (
          privateChats.map(chat => {
            const lastTs = chat.lastUpdated;
            const { dateStr, timeStr } = formatTimestamp(lastTs);
            const therapistDisplayName = anonNames[chat.id] || "Loading...";
            const isLeft = chat.leftBy?.[userId];

            return (
              <div
                key={chat.id}
                className={`chat-card ${activeChatId === chat.id ? "selected" : ""}`}
                onClick={() => {
                  if (isLeft) joinPrivateChat(chat.id);
                  else {
                    setActiveChatId(chat.id);
                    navigate(`/anonymous-dashboard/private-chat/${chat.id}`);
                  }
                }}
              >
                <div className="chat-card-inner">
                  <div className="chat-avater-content">
                    {activeTherapists.find(t => t.name === therapistDisplayName)?.profileImage ? (
                      <img
                        src={activeTherapists.find(t => t.name === therapistDisplayName).profileImage}
                        alt={therapistDisplayName}
                        className="therapist-avatar"
                      />
                    ) : (
                      <span className="therapist-avatar">
                        {therapistDisplayName[0]?.toUpperCase() || "T"}
                      </span>
                    )}
                    <div className="chat-card-content">
                      <strong className="chat-card-title">
                        {therapistDisplayName}
                        {isLeft && <span className="left-indicator"> (You Left)</span>}
                      </strong>
                      <small className="chat-card-preview">
                        {chat.lastMessage || "No messages yet"}
                      </small>
                    </div>
                  </div>
                  <div className="chat-card-meta">
                    {lastTs && (
                      <div className="message-timestamp">
                        <span className="meta-date">{dateStr}</span>
                        <span className="meta-time">{timeStr}</span>
                      </div>
                    )}
                    {chat.unreadCountForUser > 0 && (
                      <span className="unread-badge">{chat.unreadCountForUser}</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );

  const rightPanel = (
    <div className="chat-box-container">
      {(activeChatId || location.state?.selectChatId) ? (
        <div className="private-chat-box">
          <div className="detailLeave">
            <div className="chat-avater">
              {isMobile && (activeChatId || location.state?.selectChatId) && (
                <i
                  className="fa-solid fa-arrow-left mobile-back-btn"
                  onClick={() => { setActiveChatId(null); 
                    navigate("/anonymous-dashboard/private-chat"); 
                  }}
                  aria-label="Back to chat list"
                ></i>
              )}
              {therapistDisplayName === "Waiting for a therapist…" ? (
                <div className="text-avatar placeholder">?</div>
              ) : activeTherapists.find(t => t.name === therapistDisplayName)?.profileImage ? (
                <img
                  src={activeTherapists.find(t => t.name === therapistDisplayName).profileImage}
                  alt={therapistDisplayName}
                  className="text-avatar"
                />
              ) : (
                <div className="text-avatar">
                  {therapistDisplayName[0]?.toUpperCase() || "T"}
                </div>
              )}

              <div className="card-content">
                <strong className="group-title">
                  {therapistDisplayName}
                </strong>

                <small className="participant-preview">
                  {activeTherapists.length > 0 ? (
                    activeTherapists.map((t, index) => (
                      <span key={t.uid} className="participant-name">
                        {t.name || "Loading..."}
                        {index < activeTherapists.length - 1 && <b>,</b>}
                      </span>
                    ))
                  ) : (
                    <span className="participant-name text-muted">No therapist online</span>
                  )}
                </small>
              </div>
            </div>
            <div className="leave-participant">
              <button
                className="menu-trigger"
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen(prev => !prev);
                }}
                aria-expanded={menuOpen}
              >
                <i className="fa-solid fa-ellipsis-vertical"></i>
              </button>

              {menuOpen && (
                <div className="chat-options-menu">
                  <LeaveChatButton type="private" onLeave={leavePrivateChat} />
                </div>
              )}
            </div>
          </div>

          <div className="chat-box" role="log" aria-live="polite" ref={chatBoxRef}>
            {isLoadingChat ? (
              <div className="loading-messages">
                <div className="spinner"></div>
                <p>Loading messages...</p>
              </div>
            ) : combinedPrivateChat.length === 0 ? (
              <p className="no-message">No messages in this chat yet.</p>
            ) : (
              combinedPrivateChat.map(msg => (
                <div className="message" key={`${msg.id}-${msg.type || "message"}`}>
                  <ChatMessage
                    msg={msg}
                    toggleReaction={msg.id.startsWith("pending-") ? () => {} : toggleReaction}
                    therapistInfo={{ role: "user" }}
                    handleTherapistClick={() => {}}
                    isAiOffer={msg.type === "ai-offer" && !aiEnabled}
                    onAiYes={() => handleAiChoice("yes")}
                    onAiNo={() => handleAiChoice("no")}
                    aiTyping={aiTyping}
                    isSending={isSending}
                  />
                </div>
              ))
            )}
            {(typingUsers.length > 0 || aiTyping) && (
              <p className="typing-indicator">
                {aiTyping && <span className="ai-typing">Support Assistant</span>}
                {aiTyping && typingUsers.length > 0 && " and "}
                {typingUsers
                  .map(u => typeof u === "string" ? u : u?.name || "")
                  .filter(Boolean)
                  .join(", ")}
                {(typingUsers.length > 0 || aiTyping) && " "}
                {typingUsers.length + (aiTyping ? 1 : 0) === 1 ? "is" : "are"} typing...
              </p>
            )}
            <div ref={messagesEndRef} />
          </div>
          <div className="chat-input">
            <button
              className="emoji-btn"
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              aria-label="Open emoji picker"
              disabled={isSending || aiTyping}
            >
              <i className="fa-regular fa-face-smile"></i>
            </button>
            {showEmojiPicker && <EmojiPicker onEmojiClick={onEmojiClick} />}

            <input
              type="file"
              ref={fileInputRef}
              style={{ display: "none" }}
              onChange={e => sendMessage(e.target.files[0])}
              aria-label="Upload file"
            />
            <button
              className="attach-btn"
              onClick={() => fileInputRef.current?.click()}
              aria-label="Attach file"
              disabled={isSending || aiTyping}
            >
              <i className="fa-solid fa-paperclip"></i>
            </button>

            <input
              className="inputInsert"
              type="text"
              value={newMessage}
              onChange={e => {
                setNewMessage(e.target.value);
                handleTyping(e.target.value);
              }}
              placeholder="Type a message..."
              onKeyDown={e => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              aria-label="Message input"
              disabled={isSending || aiTyping}
            />

            <button
              className="send-btn"
              onClick={() => sendMessage()}
              disabled={isSending || aiTyping}
              aria-label="Send message"
            >
              {isSending ? "Sending..." : <i className="fa-solid fa-paper-plane"></i>}
            </button>
          </div>
        </div>
      ) : (
        <div className="empty-chat">
          <p>Select a private chat to view messages</p>
        </div>
      )}
    </div>
  );

  if (isMobile) {
    const showChat = activeChatId || location.state?.selectChatId;

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

export default AnonymousPrivateChatSplitView;