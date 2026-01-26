import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  db,
  doc,
  storage,
  ref,
  uploadBytes,
  getDownloadURL,
} from "../../utils/firebase";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  limit,
  getDoc,
  updateDoc,
  runTransaction,
  getDocs,
  increment,
  startAfter,
  Timestamp,
} from "firebase/firestore";
import { useTypingStatus } from "../../hooks/useTypingStatus";
import { getAIResponse } from "../../utils/AiChatIntegration";
import ChatMessage from "../ChatMessage";
import { useIsInsideChat } from "../../hooks/useIsInsideChatMobile";
import TherapistProfile from "../TherapistProfile";
import EmojiPicker from "emoji-picker-react";
const AI_REPLY_DELAY = 2000;

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

function AnonymousPrivateChatView({
  privateChats,
  formatTimestamp,
  getTimestampMillis,
  displayName,
  userId,
  anonNames,
  showError,
  playNotification,
}) {
  const [activeChatId, setActiveChatId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [events, setEvents] = useState([]);
  const [pendingMessages, setPendingMessages] = useState([]);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [aiActive, setAiActive] = useState(false);
  const [aiTyping, setAiTyping] = useState(false);
  const [newMessage, setNewMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [activeTherapists, setActiveTherapists] = useState([]);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isLoadingChat, setIsLoadingChat] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [replyTo, setReplyTo] = useState(null);
  const [chatData, setChatData] = useState(null);
  const [hasUserSentMessage, setHasUserSentMessage] = useState(false);

  const messagesEndRef = useRef(null);
  const chatBoxRef = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { typingUsers, handleTyping } = useTypingStatus(displayName, activeChatId);
  const isMobile = useMediaQuery("(max-width: 768px)");
  const isInsideChat = useIsInsideChat();
  const fileInputRef = useRef(null);
  const [selectedTherapist, setSelectedTherapist] = useState(null);
  const modalRef = useRef(null);

  // Reset when changing chat
  useEffect(() => {
    setHasUserSentMessage(false);
  }, [activeChatId]);

  // Chat document listener
  useEffect(() => {
    if (!activeChatId) {
      setChatData(null);
      return;
    }

    const chatRef = doc(db, "privateChats", activeChatId);
    return onSnapshot(chatRef, (snap) => {
      if (snap.exists()) {
        setChatData(snap.data());
      } else {
        setChatData(null);
      }
    });
  }, [activeChatId]);

  const currentTherapistUid = useMemo(() => {
    if (!chatData?.participants) return null;
    return chatData.participants.find((uid) => uid !== userId) || null;
  }, [chatData, userId]);

  const therapistDisplayName = useMemo(() => {
    if (aiActive && !currentTherapistUid) return "Support Assistant";
    if (!currentTherapistUid) return "Support Assistant";
    if (anonNames?.[activeChatId]) return anonNames[activeChatId];
    const therapist = activeTherapists.find((t) => t.uid === currentTherapistUid);
    return therapist?.name || `Therapist ${currentTherapistUid.slice(0, 6)}`;
  }, [currentTherapistUid, activeTherapists, anonNames, activeChatId, aiActive]);

  const therapistStatus = useMemo(() => {
    if (aiActive && !currentTherapistUid) return <span className="ai-status">Active</span>;
    if (!currentTherapistUid) {
      return hasUserSentMessage ? "Waiting for a therapist..." : "Ready when you are";
    }
    return activeTherapists.some((t) => t.uid === currentTherapistUid) ? "online" : "offline";
  }, [currentTherapistUid, activeTherapists, hasUserSentMessage, aiActive]);

  const therapistAvatar = useMemo(() => {
    if (aiActive && !currentTherapistUid) return null;
    if (!currentTherapistUid) return null;
    const therapist = activeTherapists.find((t) => t.uid === currentTherapistUid);
    return therapist?.profileImage || null;
  }, [currentTherapistUid, activeTherapists, aiActive]);

  // Auto-disable AI + therapist join message
  useEffect(() => {
    if (!activeChatId || !currentTherapistUid || !aiActive) return;

    const chatRef = doc(db, "privateChats", activeChatId);

    updateDoc(chatRef, { aiActive: false, aiOffered: false })
      .then(() => {
        setAiActive(false);
        runTransaction(db, async (t) => {
          t.set(doc(collection(chatRef, "messages")), {
            text: `${therapistDisplayName} has joined the chat.`,
            role: "system",
            timestamp: serverTimestamp(),
          });
        });
      })
      .catch((err) => console.error("Failed to disable AI", err));
  }, [currentTherapistUid, aiActive, activeChatId, therapistDisplayName]);

  // Therapists listener (always active)
  useEffect(() => {
    const q = query(collection(db, "therapists"), limit(100));
    const unsub = onSnapshot(q, (snap) => {
      const online = snap.docs
        .map((d) => ({
          uid: d.id,
          ...d.data(),
          name: d.data().name || `Therapist_${d.id.slice(0, 8)}`,
        }))
        .filter((t) => t.online === true);
      setActiveTherapists(online);
    });
    return unsub;
  }, []);

  // Auto-welcome + initial choice in ONE message
  useEffect(() => {
    if (!activeChatId || !hasUserSentMessage || messages.length > 0 || pendingMessages.some(m => m.role === "ai")) return;

    const chatRef = doc(db, "privateChats", activeChatId);

    const sendAutoWelcomeWithChoice = async () => {
      setAiTyping(true);
      try {
        await runTransaction(db, async (t) => {
          t.set(doc(collection(chatRef, "messages")), {
            text: "Hello! Welcome to our support chat. I'm here to help. Would you like to chat with a therapist or our Support Assistant?",
            role: "ai",
            displayName: "Support Assistant",
            type: "initial-choice-ai",
            timestamp: serverTimestamp(),
          });
        });
      } catch (err) {
        console.error("Failed to send auto welcome with choice:", err);
      } finally {
        setAiTyping(false);
      }
    };

    setTimeout(() => {
      sendAutoWelcomeWithChoice();
    }, AI_REPLY_DELAY);

  }, [hasUserSentMessage, activeChatId, messages.length, pendingMessages]);

  // Select chat
  useEffect(() => {
    if (!userId) return;
    const selectId = location.state?.selectChatId;
    if (selectId) setActiveChatId(selectId);
  }, [userId, location.state?.selectChatId]);

  // Mark as read
  useEffect(() => {
    if (!activeChatId || !userId) return;
    const chatRef = doc(db, "privateChats", activeChatId);

    const markAsRead = () => {
      updateDoc(chatRef, {
        lastSeenAt: serverTimestamp(),
        unreadCountForUser: 0,
      }).catch(() => {});
    };

    markAsRead();
    const interval = setInterval(markAsRead, 30000);
    return () => clearInterval(interval);
  }, [activeChatId, userId]);

  // Messages listener
  useEffect(() => {
    if (!activeChatId) {
      setMessages([]);
      setPendingMessages([]);
      setHasMoreMessages(false);
      return;
    }

    const chatRef = doc(db, "privateChats", activeChatId);
    const q = query(
      collection(chatRef, "messages"),
      orderBy("timestamp", "desc"),
      limit(50)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const msgs = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));

        // 🔑 Mark confirmed user messages as AI-eligible
        snapshot.docs.forEach((docSnap) => {
          const data = docSnap.data();

          if (
            data.role === "user" &&
            data._aiEligible === false &&
            data.timestamp?.toMillis?.()
          ) {
            updateDoc(docSnap.ref, { _aiEligible: true }).catch(() => {});
          }
        });

        setMessages(msgs);

        setPendingMessages((prev) =>
          prev.filter((p) => !msgs.some((m) => m.id === p.id))
        );

        setHasMoreMessages(snapshot.docs.length === 50);
        if (msgs.length > 0) playNotification();
      },
      (err) => {
        console.error("Error fetching messages:", err);
        showError("Failed to load messages.");
      }
    );

    return () => {
      unsubscribe();
      setPendingMessages([]);
    };
  }, [activeChatId, playNotification, showError]);

  const loadMoreMessages = useCallback(async () => {
    if (!activeChatId || !hasMoreMessages || isLoadingChat) return;
    setIsLoadingChat(true);

    try {
      const chatRef = doc(db, "privateChats", activeChatId);
      const lastVisible = messages[messages.length - 1];

      const nextQuery = query(
        collection(chatRef, "messages"),
        orderBy("timestamp", "desc"),
        startAfter(lastVisible?.timestamp),
        limit(50)
      );

      const snapshot = await getDocs(nextQuery);
      const newMsgs = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));

      setMessages((prev) => [...newMsgs, ...prev]);
      setHasMoreMessages(snapshot.docs.length === 50);
    } catch (err) {
      console.error("Load more error:", err);
      showError("Failed to load older messages.");
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
  }, [hasMoreMessages, isLoadingChat, loadMoreMessages]);

  const scrollToMessage = useCallback((msgId) => {
    const el = document.getElementById(`msg-${msgId}`);
    if (!el) return;

    document.querySelectorAll(".message-highlight").forEach((e) => e.classList.remove("message-highlight"));
    el.classList.add("message-highlight");
    el.scrollIntoView({ behavior: "smooth", block: "center" });

    setTimeout(() => el.classList.remove("message-highlight"), 1600);
  }, []);

  // Events listener
  useEffect(() => {
    if (!activeChatId) return;
    const chatRef = doc(db, "privateChats", activeChatId);
    const q = query(collection(chatRef, "events"), orderBy("timestamp"), limit(50));

    const unsubscribe = onSnapshot(q, (snap) =>
      setEvents(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );

    return () => unsubscribe();
  }, [activeChatId]);

  // Pinned message
  const pinnedMessage = useMemo(() => {
    return [...messages, ...pendingMessages].find((m) => m.pinned === true);
  }, [messages, pendingMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, events, pendingMessages, aiTyping]);

  // AI offer after inactivity (THERAPIST ONLY)
  useEffect(() => {
    if (!activeChatId || !userId) return;
    if (!chatData) return;
    if (aiActive) return;
    if (chatData.status !== "requesting") return;
    if (chatData.aiOffered) return;
    if (currentTherapistUid) return;
    if (!hasUserSentMessage) return;

    const chatRef = doc(db, "privateChats", activeChatId);

    const allMsgs = [...messages, ...pendingMessages];
    if (allMsgs.length === 0) return;

    // Therapist messages only
    const therapistMsgs = allMsgs.filter(
      (m) => m.role === "therapist" && m.timestamp?.toMillis?.()
    );

    const lastRelevantTime =
      therapistMsgs.length > 0
        ? Math.max(...therapistMsgs.map(m => getTimestampMillis(m.timestamp)))
        : getTimestampMillis(allMsgs[allMsgs.length - 1].timestamp);

    const elapsed = Date.now() - lastRelevantTime;
    if (elapsed < 7000) return;

    const offer = {
      id: "ai-offer-message",
      type: "ai-offer",
      text:
        "Looks like you are waiting too long. Would you like to chat with our support assistant while waiting for a therapist?",
      role: "ai",
      timestamp: { toMillis: () => Date.now() },
    };

    setPendingMessages((prev) => {
      if (prev.some((m) => m.id === offer.id)) return prev;
      return [...prev, offer];
    });

    runTransaction(db, async (tx) => {
      const snap = await tx.get(chatRef);
      if (snap.exists() && !snap.data().aiOffered && !snap.data().aiActive) {
        tx.update(chatRef, { aiOffered: true });
      }
    }).catch(console.error);
  }, [
    activeChatId,
    userId,
    messages,
    pendingMessages,
    chatData,
    aiActive,
    hasUserSentMessage,
    currentTherapistUid,
    getTimestampMillis,
  ]);

  // AI auto-reply when aiActive
  useEffect(() => {
    if (!activeChatId || !aiActive || aiTyping || isSending) return;

    const allMsgs = [...messages, ...pendingMessages].sort(
      (a, b) => getTimestampMillis(a.timestamp) - getTimestampMillis(b.timestamp)
    );

    if (allMsgs.length === 0) return;

    const last = allMsgs[allMsgs.length - 1];
    if (last.role !== "user") return;
    if (!last._aiEligible) return;
    if (last._handledByAI) return;

    let cancelled = false;

    const reply = async () => {
      if (cancelled) return;

      setAiTyping(true);

      try {
        const history = allMsgs
          .filter((m) => m.role === "user" || m.role === "ai")
          .map((m) => ({
            role: m.role === "ai" ? "assistant" : "user",
            content: m.text || (m.fileUrl ? "[Attachment]" : ""),
          }));

        const lastUserText = last.text || (last.fileUrl ? "[Attachment]" : " ");
        const aiText = await getAIResponse(lastUserText, history);

        const quoted = last.fileUrl
          ? `"Attachment"\n\n`
          : `"${last.text || " "}"\n\n`;

        const chatRef = doc(db, "privateChats", activeChatId);

        await runTransaction(db, async (t) => {
          t.set(doc(collection(chatRef, "messages")), {
            text: quoted + aiText,
            role: "ai",
            displayName: "Support Assistant",
            _handledByAI: true,
            timestamp: serverTimestamp(),
          });

          t.update(chatRef, {
            lastMessage: `Support Assistant: ${aiText}`,
            lastUpdated: serverTimestamp(),
            unreadCountForUser: increment(1),
          });
        });
      } catch (err) {
        console.error("Auto AI reply failed:", err);
      } finally {
        if (!cancelled) setAiTyping(false);
      }
    };

    const timeoutId = setTimeout(reply, AI_REPLY_DELAY);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [ messages, pendingMessages, aiActive, activeChatId, aiTyping, isSending, getTimestampMillis,]);

  useEffect(() => {
    const pathChatId = location.pathname.split("/anonymous-dashboard/private-chat/")[1];

    const storedChatId = localStorage.getItem("activeChatId");

    if (pathChatId) {
      setActiveChatId(pathChatId);
    } else if (storedChatId) {
      setActiveChatId(storedChatId);
    }
  }, []);


  // Send message
  const sendMessage = async (file = null, replyTo = null) => {
    if (!newMessage.trim() && !file) return;
    if (!userId) return;

    setHasUserSentMessage(true);
    setIsSending(true);
    let fileUrl = null;
    let currentChatId = activeChatId;

    try {
      if (!currentChatId) {
        const chatRef = doc(collection(db, "privateChats"));
        currentChatId = chatRef.id;

        await runTransaction(db, async (t) => {
          t.set(chatRef, {
            participants: [userId],
            lastMessage: "",
            lastUpdated: serverTimestamp(),
            unreadCountForTherapist: 0,
            unreadCountForUser: 0,
            aiActive: false,
            aiOffered: false,
            leftBy: {},
            initialGreetingSent: false,
            status: "new",
            createdAt: serverTimestamp(),
          });
        });

        setActiveChatId(currentChatId);
        localStorage.setItem("activeChatId", currentChatId);
        navigate(`/anonymous-dashboard/private-chat/${currentChatId}`, { replace: true });
      }

      if (file) {
        const storageRef = ref(storage, `privateChats/${currentChatId}/${Date.now()}_${file.name}`);
        await uploadBytes(storageRef, file);
        fileUrl = await getDownloadURL(storageRef);
      }

      const messageText = newMessage.trim();
      const chatRef = doc(db, "privateChats", currentChatId);

      await runTransaction(db, async (t) => {
        const snap = await t.get(chatRef);
        if (!snap.exists()) throw new Error("Chat disappeared");

        const data = snap.data();
        const needsGreeting = !data.initialGreetingSent;

        const chatUpdate = {
          lastMessage: `${displayName}: ${messageText || "Attachment"}`,
          lastUpdated: serverTimestamp(),
          unreadCountForTherapist: increment(1),
          lastSeenAt: serverTimestamp(),
          status: data.status === "new" ? "waiting" : data.status,
        };

        if (needsGreeting) {
          chatUpdate.initialGreetingSent = true;
        }

        t.update(chatRef, chatUpdate);

        t.set(doc(collection(chatRef, "messages")), {
          text: messageText,
          fileUrl,
          userId,
          displayName,
          role: "user",
          timestamp: serverTimestamp(),
          _aiEligible: false,
          reactions: {},
          pinned: false,
          replyTo: replyTo
            ? {
                id: replyTo.id,
                displayName: replyTo.displayName,
                text: replyTo.text,
                fileUrl: replyTo.fileUrl || null,
              }
            : null,
        });
      });
      setNewMessage("");
      setShowEmojiPicker(false);
      setReplyTo(null);
    } catch (err) {
      console.error("Send failed:", err);
      showError("Failed to send message.");
    } finally {
      setIsSending(false);
    }
  };

  // Leave chat
  const leavePrivateChat = async () => {
    if (!activeChatId) {
      navigate("/anonymous-dashboard");
      return;
    }

    try {
      const chatRef = doc(db, "privateChats", activeChatId);
      await runTransaction(db, async (t) => {
        const snap = await t.get(chatRef);
        if (!snap.exists()) return;

        t.update(chatRef, {
          [`leftBy.${userId}`]: true,
          aiOffered: false,
          aiActive: false,
        });

        t.set(doc(collection(chatRef, "events")), {
          type: "leave",
          user: "System",
          text: `${displayName} has ended the chat.`,
          role: "system",
          timestamp: serverTimestamp(),
        });
      });

      setActiveChatId(null);
      navigate("/anonymous-dashboard");
      showError("You have ended the chat.");
    } catch (err) {
      console.error("Leave error:", err);
      showError("Failed to end chat.");
    }
  };

  // Handlers (initial choice, AI choice, reactions, emoji)
  const handleInitialChoice = async (choice) => {
    if (!activeChatId) return;
    const chatRef = doc(db, "privateChats", activeChatId);

    try {
      await runTransaction(db, async (t) => {
        const snap = await t.get(chatRef);
        if (!snap.exists()) return;

        const baseTime = Date.now();
        const choiceText = choice === "therapist" ? "Chat with Therapist" : "Chat with Support Assistant";
        t.set(doc(collection(chatRef, "messages")), {
          text: choiceText,
          userId,
          displayName,
          role: "user",
          timestamp: Timestamp.fromMillis(baseTime),
          reactions: {},
          pinned: false,
        });

        if (choice === "assistant") {
          t.update(chatRef, { aiActive: true, aiOffered: false });
          setAiActive(true);
          t.set(doc(collection(chatRef, "messages")), {
            text: "You are now chatting with our support assistant.",
            role: "system",
            timestamp: Timestamp.fromMillis(baseTime + 10)
          });

          setAiTyping(true);
          setTimeout(async () => {
            try {
              const allPrev = [...messages, ...pendingMessages]
                .filter((m) => m.role === "user" || m.role === "ai")
                .sort((a, b) => getTimestampMillis(a.timestamp) - getTimestampMillis(b.timestamp));

              const recentUser = [...messages, ...pendingMessages]
                .filter((m) => m.role === "user" && m.text !== choiceText)
                .sort((a, b) => getTimestampMillis(b.timestamp) - getTimestampMillis(a.timestamp));

              const lastText = recentUser[0]?.text || (recentUser[0]?.fileUrl ? "Attachment" : "Hello");
              const hasAttachment = !!recentUser[0]?.fileUrl;
              const quoted = hasAttachment ? `"Attachment"\n\n` : `"${lastText}"\n\n`;

              const aiResp = await getAIResponse(lastText, allPrev);
              const fullAi = quoted + aiResp;

              t.set(doc(collection(chatRef, "messages")), {
                text: fullAi,
                role: "ai",
                displayName: "Support Assistant",
                timestamp: serverTimestamp(),
              });
              t.update(chatRef, {
                lastMessage: `Support Assistant: ${aiResp}`,
                lastUpdated: serverTimestamp(),
                unreadCountForUser: increment(1),
              });
            } catch (e) {
              console.error("AI initial failed:", e);
              const errMsg = "Sorry, couldn’t respond right now.";
              t.set(doc(collection(chatRef, "messages")), { text: errMsg, role: "system", timestamp: serverTimestamp() });
              setPendingMessages((p) => [
                ...p,
                { id: `u-${Date.now()}`, text: choiceText, role: "user", userId, displayName, timestamp: { toMillis: () => Date.now() } },
                { id: `err-${Date.now()}`, text: errMsg, role: "system", timestamp: { toMillis: () => Date.now() + 50 } },
              ]);
            } finally {
              setAiTyping(false);
            }
          }, AI_REPLY_DELAY);  
        } else {
          t.update(chatRef, { aiActive: false, aiOffered: false, status: "requesting" });
          setAiActive(false);
          setHasUserSentMessage(true);
          t.set(doc(collection(chatRef, "messages")), {
            text: "We are contacting an available therapist for you.",
            role: "system",
            timestamp: Timestamp.fromMillis(baseTime + 10),
          });
        }
      });
      setAiEnabled(choice === "assistant");
    } catch (err) {
      console.error("Initial choice error:", err);
      showError("Failed to process your choice.");
    }
  };

  const handleAiChoice = async (choice) => {
    if (!activeChatId) return;
    const chatRef = doc(db, "privateChats", activeChatId);

    try {
      await runTransaction(db, async (t) => {
        const snap = await t.get(chatRef);
        if (!snap.exists()) return;

        t.set(doc(collection(chatRef, "messages")), {
          text: choice === "yes" ? "Yes" : "No",
          userId,
          displayName,
          role: "user",
          timestamp: serverTimestamp(),
        });

        if (choice === "yes") {
          t.update(chatRef, { aiActive: true, aiOffered: false });
          setAiActive(true);
          t.set(doc(collection(chatRef, "messages")), {
            text: "You are now chatting with our support assistant until a therapist joins.",
            role: "system",
            timestamp: serverTimestamp(),
          });

          setAiTyping(true);
          setTimeout(async () => {
            try {
              const allPrev = [...messages, ...pendingMessages]
                .filter((m) => m.role === "user" || m.role === "ai")
                .sort((a, b) => getTimestampMillis(a.timestamp) - getTimestampMillis(b.timestamp));

              const recent = [...messages, ...pendingMessages]
                .filter((m) => m.role === "user" && !["Yes", "No"].includes(m.text))
                .sort((a, b) => getTimestampMillis(b.timestamp) - getTimestampMillis(a.timestamp));

              const lastTxt = recent[0]?.text || (recent[0]?.fileUrl ? "Attachment" : "Hello");
              const quoted = recent[0]?.fileUrl ? `"Attachment"\n\n` : `"${lastTxt}"\n\n`;

              const resp = await getAIResponse(lastTxt, allPrev);
              const full = quoted + resp;

              t.set(doc(collection(chatRef, "messages")), {
                text: full,
                role: "ai",
                displayName: "Support Assistant",
                timestamp: serverTimestamp(),
              });
              t.update(chatRef, {
                lastMessage: `Support Assistant: ${resp}`,
                lastUpdated: serverTimestamp(),
                unreadCountForUser: increment(1),
              });
            } catch (e) {
              console.error("AI fallback failed:", e);
              const errTxt = "Sorry, couldn’t respond right now. Please wait for a therapist.";
              t.set(doc(collection(chatRef, "messages")), { text: errTxt, role: "system", timestamp: serverTimestamp() });
              setPendingMessages((p) => [
                ...p,
                { id: `u-${Date.now()}`, text: "Yes", role: "user", userId, displayName, timestamp: { toMillis: () => Date.now() } },
                { id: `err-${Date.now()}`, text: errTxt, role: "system", timestamp: { toMillis: () => Date.now() + 50 } },
              ]);
            } finally {
              setAiTyping(false);
            }
          }, AI_REPLY_DELAY);  
        } else {
          t.update(chatRef, { aiActive: false, aiOffered: false });
          setAiActive(false);
          t.set(doc(collection(chatRef, "messages")), {
            text: "Okay, please hold on while we connect you to a therapist.",
            role: "ai",
            displayName: "Support Assistant",
            timestamp: serverTimestamp(),
          });
        }
      });
      setAiEnabled(choice === "yes");
    } catch (err) {
      console.error("AI choice error:", err);
      showError("Failed to process your request.");
    }
  };

  const toggleReaction = async (msgId, reactionType) => {
    if (!userId || !activeChatId || msgId.startsWith("pending-")) return;
    const msgRef = doc(db, `privateChats/${activeChatId}/messages`, msgId);

    try {
      await runTransaction(db, async (t) => {
        const snap = await t.get(msgRef);
        if (!snap.exists()) return;

        const reactions = snap.data().reactions || {};
        const types = ["heart", "thumbsUp"];
        const other = types.find((t) => t !== reactionType);

        const hasThis = reactions[reactionType]?.includes(userId) || false;
        const hasOther = reactions[other]?.includes(userId) || false;

        let updated = { ...reactions };

        if (hasThis) {
          updated[reactionType] = (updated[reactionType] || []).filter((id) => id !== userId);
          if (hasOther) updated[other] = (updated[other] || []).filter((id) => id !== userId);
        } else {
          updated[reactionType] = [...(updated[reactionType] || []), userId];
          if (hasOther) updated[other] = (updated[other] || []).filter((id) => id !== userId);
        }

        Object.keys(updated).forEach((k) => {
          if (updated[k].length === 0) delete updated[k];
        });

        t.update(msgRef, { reactions: updated });
      });
    } catch (err) {
      console.error("Reaction failed:", err);
      showError("Failed to update reaction.");
    }
  };

  const onEmojiClick = (emojiData) => {
    setNewMessage((prev) => prev + emojiData.emoji);
    setShowEmojiPicker(false);
  };

  const handleSend = useCallback(
    (text = "", file = null) => {
      sendMessage(file, replyTo);
      setNewMessage("");
      setReplyTo(null);
    },
    [sendMessage, replyTo]
  );

  const handleReply = useCallback((message) => {
    setReplyTo(message);
    setTimeout(() => {
      document.querySelector(".inputInsert")?.focus();
    }, 100);
  }, []);

  const combinedPrivateChat = [...messages, ...events, ...pendingMessages].sort(
    (a, b) => getTimestampMillis(a.timestamp) - getTimestampMillis(b.timestamp)
  );

  // Close modal on outside click
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (modalRef.current && !modalRef.current.contains(event.target)) {
        setSelectedTherapist(null);
      }
    };
    if (selectedTherapist) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [selectedTherapist]);

  const handleTherapistClick = async (therapist) => {
    try {
      const therapistDoc = await getDoc(doc(db, "therapists", therapist.uid));
      if (therapistDoc.exists()) {
        setSelectedTherapist({
          uid: therapist.uid,
          ...therapistDoc.data(),
          online: therapist.online,
        });
      }
    } catch (error) {
      console.error("Error loading therapist:", error);
      setTherapistsError("Failed to load therapist profile.");
    }
  };

  return (
    <div className={`chat-box-container ${isInsideChat ? "no-bottom-padding" : ""}`.trim()}>
      <div className="private-chat-box">
        <div className="detailLeave">
          <div className="chat-avater">
            {isMobile && (
              <i
                className="fa-solid fa-arrow-left mobile-back-btn"
                onClick={() => navigate("/anonymous-dashboard")}
                aria-label="Back to dashboard"
              />
            )}
            {therapistAvatar ? (
              <img
                src={therapistAvatar}
                alt={therapistDisplayName}
                className="text-avatar"
                onClick={handleTherapistClick}
              />
            ) : (
              <div className="text-avatar placeholder" onClick={handleTherapistClick}>
                {therapistDisplayName?.charAt(0)?.toUpperCase() || "?"}
              </div>
            )}

            <div className="card-content">
              <strong className="group-title" onClick={handleTherapistClick}>{therapistDisplayName}</strong>
              <span className="participant-preview">
                <small
                  className={`participant-name-p ${
                    !currentTherapistUid
                      ? "waiting"
                      : therapistStatus === "online"
                      ? "text-success"
                      : "text-muted"
                  }`}
                >
                  {therapistStatus}
                </small>
              </span>
            </div>
          </div>

          <div className="leave-participant">
            <button
              className="menu-trigger"
              onClick={() => setShowLeaveConfirm(true)}
              aria-expanded={showLeaveConfirm}
            >
              <i className="fa-solid fa-ellipsis-vertical"></i>
            </button>
          </div>
        </div>

        {pinnedMessage && (
          <div
            className="pinned-message"
            onClick={() => scrollToMessage(pinnedMessage.id)}
            style={{ cursor: "pointer" }}
            title="Click to jump to pinned message"
          >
            <span className="pin-text-icon">
              <i className="fas fa-thumbtack pinned-icon"></i>
              <span className="pinned-text">
                <strong>{pinnedMessage.pinnedBy || "Someone"}:</strong>{" "}
                <span>
                  {pinnedMessage.text || (pinnedMessage.fileUrl ? "Attachment" : "[empty]")}
                </span>
              </span>
            </span>
          </div>
        )}

        {showLeaveConfirm && (
          <div className="modal-backdrop-leave" onClick={() => setShowLeaveConfirm(false)}>
            <div className="confirm-modal-leave" onClick={(e) => e.stopPropagation()}>
              <div className="confirm-modal-content">
                <h3>Ready to end this chat?</h3>
                <ul className="confirm-list">
                  <li>No new messages can be sent or received</li>
                  <li>This chat and its history will disappear from your list</li>
                  <li>It will reappear (with full history) only if you message this therapist again from their profile</li>
                </ul>
                <p className="confirm-question">Are you sure you’d like to end this chat now?</p>
                <small className="privacy-note">Your past messages remain private and secure.</small>
              </div>

              <div className="button-group">
                <button className="btn-cancel" onClick={() => setShowLeaveConfirm(false)}>
                  Cancel
                </button>
                <button
                  className="btn-confirm-leave"
                  onClick={() => {
                    leavePrivateChat();
                    setShowLeaveConfirm(false);
                  }}
                >
                  End chat
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="chat-box" role="log" aria-live="polite" ref={chatBoxRef}>
          {isLoadingChat ? (
            <div className="loading-messages">
              <div className="spinner"></div>
              <p>Loading messages...</p>
            </div>
          ) : combinedPrivateChat.length === 0 ? (
            <div className="empty-chat">
              <p>Send your first message to start the conversation</p>
            </div>
          ) : (
            combinedPrivateChat.map((msg) => (
              <div className="message" key={`${msg.id}-${msg.type || "message"}`}>
                <ChatMessage
                  msg={msg}
                  toggleReaction={msg.id?.startsWith("pending-") ? () => {} : toggleReaction}
                  currentUserId={userId}
                  isPrivateChat={true}
                  therapistInfo={{ role: "user" }}
                  handleTherapistClick={() => {}}
                  scrollToMessage={scrollToMessage}
                  isAiOffer={msg.type === "ai-offer" && !aiEnabled}
                  onAiYes={() => handleAiChoice("yes")}
                  onAiNo={() => handleAiChoice("no")}
                  isInitialChoice={msg.type === "initial-choice" || msg.type === "initial-choice-ai"}
                  onInitialChoice={handleInitialChoice}
                  aiTyping={aiTyping}
                  isSending={isSending}
                  onReply={handleReply}
                />
              </div>
            ))
          )}

          {(typingUsers.length > 0 || aiTyping) && (
            <div className="typing-indicator">
              {aiTyping && <span className="ai-typing">Support Assistant</span>}
              {aiTyping && typingUsers.length > 0 && " and "}
              {typingUsers
                .map((u) => (typeof u === "string" ? u : u?.name || ""))
                .filter(Boolean)
                .join(", ")}
              {(typingUsers.length > 0 || aiTyping) && " "}
              {typingUsers.length + (aiTyping ? 1 : 0) === 1 ? "is" : "are"} typing
              <div className="typing-dots">
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="chat-input-box">
          {replyTo && (
            <div className="reply-preview">
              <div className="reply-preview-content">
                <strong>Replying to {replyTo.displayName}:</strong>
                <div className="reply-preview-text">
                  {replyTo.text || (replyTo.fileUrl ? "Attachment" : "")}
                </div>
              </div>
              <button className="cancel-reply-btn" onClick={() => setReplyTo(null)}>
                <i className="fas fa-times"></i>
              </button>
            </div>
          )}

          <div className="chat-input">
            <button
              className="emoji-btn"
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              aria-label="Open emoji picker"
              disabled={isSending || aiTyping}
            >
              <i className="fa-regular fa-face-smile"></i>
            </button>

            <input
              className="inputInsert"
              type="text"
              value={newMessage}
              onChange={(e) => {
                setNewMessage(e.target.value);
                if (activeChatId) handleTyping(e.target.value);
              }}
              placeholder="Type a message..."
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              aria-label="Message input"
              disabled={isSending || aiTyping}
            />

            <input
              type="file"
              ref={fileInputRef}
              style={{ display: "none" }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleSend("", file);
              }}
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

            <button
              className="send-btn"
              onClick={() => handleSend()}
              disabled={isSending || aiTyping}
              aria-label="Send message"
            >
              {isSending ? <span className="spinner small"></span> : <i className="fa-solid fa-paper-plane"></i>}
            </button>
          </div>

          {showEmojiPicker && <EmojiPicker onEmojiClick={onEmojiClick} />}
        </div>
      </div>

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
    </div>
  );
}

export default AnonymousPrivateChatView;