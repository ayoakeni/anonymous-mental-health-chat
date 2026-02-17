import React, { useEffect, useState, useRef, useCallback, useMemo } from "react";
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
  endBefore,
  limitToLast,
} from "firebase/firestore";
import { useTypingStatus } from "../../hooks/useTypingStatus";
import { getAIResponse } from "../../utils/AiChatIntegration";
import ChatMessage from "../ChatMessage";
import { useIsInsideChat } from "../../hooks/useIsInsideChatMobile";
import TherapistProfile from "../TherapistProfile";
import EmojiPicker from "emoji-picker-react";
import { shouldGroupMessage } from "../../utils/messageGrouping";
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
  const [initialChoiceMade, setInitialChoiceMade] = useState(false);
  const [aiOfferAnswered, setAiOfferAnswered] = useState(false);

  const [isInitialLoading, setIsInitialLoading] = useState(false);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [newMessagesSinceLastScroll, setNewMessagesSinceLastScroll] = useState(0);
  const [firstUnreadMessageId, setFirstUnreadMessageId] = useState(null);
  const [lastReadIndex, setLastReadIndex] = useState(-1);
  const [initialScrollDone, setInitialScrollDone] = useState(false);
  const [hasJumpedToFirstUnread, setHasJumpedToFirstUnread] = useState(false);
  const [initialPositioningDone, setInitialPositioningDone] = useState(false);

const isUserAtBottom = useRef(true);
const isInitial = useRef(true);
const prevMessageCount = useRef(0);
const prevCombinedLength = useRef(0);
const prevLastMsgId = useRef(null);
const earliestTimestamp = useRef(null);
const latestTimestamp = useRef(null);

  const messagesEndRef = useRef(null);
  const chatBoxRef = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { typingUsers, handleTyping } = useTypingStatus(displayName, activeChatId);
  const isMobile = useMediaQuery("(max-width: 768px)");
  const isInsideChat = useIsInsideChat();
  const [menuOpen, setMenuOpen] = useState(false);
  const fileInputRef = useRef(null);
  const [selectedTherapist, setSelectedTherapist] = useState(null);
  const modalRef = useRef(null);
  const processedMessagesRef = useRef(new Set());

  // Reset when changing chat
  useEffect(() => {
    setHasUserSentMessage(false);
    setInitialChoiceMade(false);
    setAiOfferAnswered(false);
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
        const data = snap.data();
        setChatData(data);
        
        // Check if initial choice was made based on chat data
        if (data.initialChoiceMade) {
          setInitialChoiceMade(true);
        }
        
        // Check if AI offer was answered
        if (data.aiOfferAnswered) {
          setAiOfferAnswered(true);
        }
      } else {
        setChatData(null);
      }
    });
  }, [activeChatId]);

  const currentTherapistUid = useMemo(() => {
    if (!chatData?.participants) return null;
    return chatData.participants.find((uid) => uid !== userId) || null;
  }, [chatData, userId]);

  const currentTherapist = useMemo(() => {
    if (!currentTherapistUid) return null;
    return activeTherapists.find(t => t.uid === currentTherapistUid) || null;
  }, [activeTherapists, currentTherapistUid]);


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
      setHasMoreMessages(true);
      setIsInitialLoading(false);
      return;
    }

    setIsInitialLoading(true);

    const chatRef = doc(db, "privateChats", activeChatId);
    const messagesRef = collection(chatRef, "messages");

    const loadInitial = async () => {
      try {
        const q = query(
          messagesRef,
          orderBy("timestamp", "asc"),
          limitToLast(40)
        );

        const snap = await getDocs(q);
        const msgs = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        setMessages(msgs);
        setPendingMessages(prev => prev.filter(p => !msgs.some(m => m.id === p.id)));

        setHasMoreMessages(snap.docs.length === 40);

        if (msgs.length > 0) {
          earliestTimestamp.current = msgs[0].timestamp;
          latestTimestamp.current = msgs[msgs.length - 1].timestamp;

          // Real-time listener for NEW messages only
          const newQ = query(
            messagesRef,
            orderBy("timestamp", "asc"),
            startAfter(latestTimestamp.current)
          );

          const unsubNew = onSnapshot(newQ, snapshot => {
            if (snapshot.empty) return;

            const newMsgs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            setMessages(prev => [...prev, ...newMsgs]);

            setPendingMessages(prev =>
              prev.filter(p => !newMsgs.some(m => m.text === p.text && m.role === p.role))
            );

            if (newMsgs.length > 0) {
              playNotification();
              latestTimestamp.current = newMsgs[newMsgs.length - 1].timestamp;
            }
          });

          return unsubNew;
        }
      } catch (err) {
        console.error("Messages fetch error:", err);
        showError("Failed to load messages");
      } finally {
        setIsInitialLoading(false);
      }
    };

    const unsub = loadInitial();

    return () => {
      if (unsub && typeof unsub.then === 'function') {
        unsub.then(u => u && u());
      }
      earliestTimestamp.current = null;
      latestTimestamp.current = null;
    };
  }, [activeChatId, playNotification, showError]);

  // Load older messages
  const loadMoreMessages = useCallback(async () => {
    if (!activeChatId || !hasMoreMessages || isLoadingOlder) return;
    setIsLoadingOlder(true);

    try {
      const chatRef = doc(db, "privateChats", activeChatId);
      const q = query(
        collection(chatRef, "messages"),
        orderBy("timestamp", "asc"),
        endBefore(earliestTimestamp.current),
        limitToLast(40)
      );

      const snap = await getDocs(q);
      const older = snap.docs.map(d => ({ id: d.id, ...d.data() }));

      if (older.length > 0) {
        setMessages(prev => {
          const existing = new Set(prev.map(m => m.id));
          const filtered = older.filter(m => !existing.has(m.id));
          return [...filtered, ...prev];
        });

        earliestTimestamp.current = older[0].timestamp;
        setHasMoreMessages(snap.docs.length === 40);
      }
    } catch (err) {
      console.error("Load older error:", err);
      showError("Could not load older messages");
    } finally {
      setIsLoadingOlder(false);
    }
  }, [activeChatId, hasMoreMessages, isLoadingOlder, showError]);

  // Scroll handler – load more near top, track bottom position
  const handleScroll = useCallback(() => {
    if (!chatBoxRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = chatBoxRef.current;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    const atBottom = distanceFromBottom < 140;

    const wasNotAtBottom = !isUserAtBottom.current;
    isUserAtBottom.current = atBottom;

    setShowScrollToBottom(!atBottom);

    if (atBottom && (wasNotAtBottom || firstUnreadMessageId)) {
      setNewMessagesSinceLastScroll(0);
      setFirstUnreadMessageId(null);
      setHasJumpedToFirstUnread(false);

      // Mark as read
      const chatRef = doc(db, "privateChats", activeChatId);
      updateDoc(chatRef, {
        unreadCountForUser: 0,
        lastSeenAt: serverTimestamp()
      }).catch(() => {});

      setLastReadIndex(combinedPrivateChat.length);
    }

    // Load older when near top
    if (scrollTop < 300 && hasMoreMessages && !isLoadingOlder) {
      loadMoreMessages();
    }
  }, [hasMoreMessages, isLoadingOlder, loadMoreMessages, firstUnreadMessageId, activeChatId]);

  // Preserve scroll position when prepending older messages
  useEffect(() => {
    if (!isLoadingOlder || !chatBoxRef.current) return;

    const container = chatBoxRef.current;
    const prevHeight = container.scrollHeight;
    const prevScroll = container.scrollTop;

    setTimeout(() => {
      const newHeight = container.scrollHeight;
      const heightDiff = newHeight - prevHeight;
      container.scrollTop = prevScroll + heightDiff;
    }, 0);
  }, [isLoadingOlder]);

  // Attach scroll listener
  useEffect(() => {
    const box = chatBoxRef.current;
    if (!box) return;

    box.addEventListener("scroll", handleScroll);
    handleScroll(); // initial check

    return () => box.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  // Combined list – now in ascending order
  const combinedPrivateChat = useMemo(() => {
    return [...messages, ...events, ...pendingMessages].sort(
      (a, b) => getTimestampMillis(a.timestamp) - getTimestampMillis(b.timestamp)
    );
  }, [messages, events, pendingMessages, getTimestampMillis]);

  // ─── New messages tracking & unread logic ───
  useEffect(() => {
    const currLen = combinedPrivateChat.length;
    if (currLen <= prevMessageCount.current) return;

    if (isLoadingOlder) {
      prevMessageCount.current = currLen;
      return;
    }

    if (isInitial.current) {
      prevMessageCount.current = currLen;
      return;
    }

    const added = currLen - prevMessageCount.current;
    const newOnes = combinedPrivateChat.slice(-added);

    const isOwnOrSystem = newOnes.every(m => 
      m.role === "system" || m.userId === userId || m.role === "ai"
    );

    if (isOwnOrSystem) {
      setLastReadIndex(prev => prev + added);
    } else if (!isUserAtBottom.current) {
      setNewMessagesSinceLastScroll(prev => prev + added);
      setFirstUnreadMessageId(prev => prev || newOnes[0]?.id);
    } else {
      setNewMessagesSinceLastScroll(0);
      setFirstUnreadMessageId(null);
      setLastReadIndex(currLen);
    }

    prevMessageCount.current = currLen;
  }, [combinedPrivateChat, userId, isUserAtBottom.current, isLoadingOlder]);

  // Initial scroll + unread jump
  useEffect(() => {
    if (initialScrollDone || isInitialLoading || combinedPrivateChat.length === 0) return;

    // You could also fetch lastSeenAt / unreadCountForUser from chat doc
    // For simplicity we approximate unread from local state here
    const unreadApprox = 0; // ← improve this later if needed

    if (unreadApprox > 0 && lastReadIndex >= 0) {
      const idx = lastReadIndex;
      const el = document.getElementById(`msg-${combinedPrivateChat[idx]?.id}`);
      if (el && chatBoxRef.current) {
        const offset = el.offsetTop - 100;
        chatBoxRef.current.scrollTo({ top: offset, behavior: "auto" });
        el.classList.add("message-highlight");
        setTimeout(() => el.classList.remove("message-highlight"), 2200);
      }
    } else {
      messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
    }

    setInitialScrollDone(true);
    isInitial.current = false;

    setTimeout(() => {
      setInitialPositioningDone(true);
      handleScroll();
    }, 120);
  }, [initialScrollDone, isInitialLoading, combinedPrivateChat, lastReadIndex, handleScroll]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    setNewMessagesSinceLastScroll(0);
    setFirstUnreadMessageId(null);
    setLastReadIndex(combinedPrivateChat.length);
  }, [combinedPrivateChat.length]);

  const scrollToNewMessages = useCallback(() => {
    if (hasJumpedToFirstUnread || !firstUnreadMessageId) {
      scrollToBottom();
      setHasJumpedToFirstUnread(false);
      return;
    }

    const el = document.getElementById(`msg-${firstUnreadMessageId}`);
    if (el && chatBoxRef.current) {
      const offset = el.getBoundingClientRect().top - chatBoxRef.current.getBoundingClientRect().top - 80;
      chatBoxRef.current.scrollBy({ top: offset, behavior: "smooth" });

      el.classList.add("message-highlight");
      setTimeout(() => el.classList.remove("message-highlight"), 1800);

      setHasJumpedToFirstUnread(true);
    } else {
      scrollToBottom();
    }
  }, [firstUnreadMessageId, hasJumpedToFirstUnread, scrollToBottom]);

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

    // Save AI offer as Firestore message instead of pending message
    const sendAiOffer = async () => {
      try {
        await runTransaction(db, async (tx) => {
          const snap = await tx.get(chatRef);
          if (!snap.exists()) return;
          
          const data = snap.data();
          // Double-check conditions inside transaction
          if (data.aiOffered || data.aiActive) return;

          // Create the AI offer message
          tx.set(doc(collection(chatRef, "messages")), {
            text: "Looks like you are waiting too long. Would you like to chat with our support assistant while waiting for a therapist?",
            role: "ai",
            displayName: "Support Assistant",
            type: "ai-offer",
            timestamp: serverTimestamp(),
            reactions: {},
            pinned: false,
          });

          // Mark that AI offer has been sent
          tx.update(chatRef, { aiOffered: true });
        });
      } catch (err) {
        console.error("Failed to send AI offer:", err);
      }
    };

    sendAiOffer();
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

  // AI auto-reply when aiActive (only to user messages, only if not already handled, and only for messages from Firebase, not pending)
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

    // CRITICAL: Only process messages from Firebase (not pending)
    if (!last.id || last.id.startsWith("pending-")) {
      return;
    }

    // Check if we've already processed this message
    if (processedMessagesRef.current.has(last.id)) {
      return;
    }

    // Mark as being processed
    processedMessagesRef.current.add(last.id);

    let cancelled = false;

    const reply = async () => {
      if (cancelled) {
        processedMessagesRef.current.delete(last.id);
        return;
      }

      setAiTyping(true);

      try {
        const chatRef = doc(db, "privateChats", activeChatId);
        
        // FIRST: Mark the message as handled to prevent re-processing
        const userMsgRef = doc(chatRef, "messages", last.id);
        await updateDoc(userMsgRef, { _handledByAI: true });

        // THEN: Generate AI response
        const history = allMsgs
          .filter((m) => m.role === "user" || m.role === "ai")
          .map((m) => ({
            role: m.role === "ai" ? "assistant" : "user",
            content: m.text || (m.fileUrl ? "[Attachment]" : ""),
          }));

        const lastUserText = last.text || (last.fileUrl ? "[Attachment]" : " ");
        const aiText = await getAIResponse(lastUserText, history);

        // FINALLY: Send AI message
        await runTransaction(db, async (t) => {
          t.set(doc(collection(chatRef, "messages")), {
            text: aiText,
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
        showError("AI failed to respond. Please try again.");
        processedMessagesRef.current.delete(last.id);
      } finally {
        setAiTyping(false);
      }
    };

    const timeoutId = setTimeout(reply, AI_REPLY_DELAY);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
      setAiTyping(false);
    };
  }, [messages, pendingMessages, aiActive, activeChatId, aiTyping, isSending, getTimestampMillis, showError]);

  // Reset processed messages when changing chats
  useEffect(() => {
    processedMessagesRef.current.clear();
  }, [activeChatId]);

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
            initialChoiceMade: false,
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

      // Check if replying to AI, replying to own message while AI active, or if AI is active
      const isReplyingToAI = replyTo?.role === "ai";
      const isReplyingToOwnMessage = replyTo?.role === "user" && replyTo?.userId === userId;
      const shouldTriggerManualAI = (isReplyingToAI || (isReplyingToOwnMessage && aiActive));

      const messageText = newMessage.trim();
      const chatRef = doc(db, "privateChats", currentChatId);

      // Store user message data for AI to reply to
      let userMessageData = null;

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
        };

        if (needsGreeting) {
          chatUpdate.initialGreetingSent = true;
        }

        t.update(chatRef, chatUpdate);

        const userMsgRef = doc(collection(chatRef, "messages"));
        
        userMessageData = {
          id: userMsgRef.id,
          text: messageText,
          fileUrl,
          userId,
          displayName,
          role: "user",
          timestamp: serverTimestamp(),
          _aiEligible: !shouldTriggerManualAI, // Only disable auto-AI if manual AI will trigger
          reactions: {},
          pinned: false,
          replyTo: replyTo
            ? {
                id: replyTo.id,
                displayName: replyTo.displayName,
                text: replyTo.text,
                fileUrl: replyTo.fileUrl || null,
                role: replyTo.role || null,
              }
            : null,
        };

        t.set(userMsgRef, userMessageData);
      });

      // AI RESPONSE (if triggered by replying to AI or own message)
      if (shouldTriggerManualAI) {
        setAiTyping(true);
        try {
          const allPrev = [...messages, ...pendingMessages]
            .filter((m) => m.role === "user" || m.role === "ai")
            .sort((a, b) => getTimestampMillis(a.timestamp) - getTimestampMillis(b.timestamp));

          // Build context-aware prompt when replying
          let aiPrompt = messageText || "Continue";
          if (replyTo) {
            if (isReplyingToAI) {
              // Replying to AI
              aiPrompt = `[User is continuing the conversation about their previous message]
              Your previous response was about: "${replyTo.text || "[Previous AI response]"}"

              User's follow-up: ${messageText}

              Please respond to the user's follow-up question or comment.`;
            } else if (isReplyingToOwnMessage) {
              // Replying to own message - provide context about what they're elaborating on
              aiPrompt = `[User is adding more context to their previous message]
              User's original message: "${replyTo.text || (replyTo.fileUrl ? "[Attachment]" : "[Previous message]")}"

              User's additional context: ${messageText}

              Please respond to the user taking into account both their original message and this follow-up.`;
            }
          }

          const aiResponse = await getAIResponse(aiPrompt, allPrev);

          await runTransaction(db, async (t) => {
            const snap = await t.get(chatRef);
            if (!snap.exists()) throw new Error("Chat disappeared");

            const aiMsgRef = doc(collection(chatRef, "messages"));
            t.set(aiMsgRef, {
              text: aiResponse,
              role: "ai",
              displayName: "Support Assistant",
              userId: "ai",
              timestamp: serverTimestamp(),
              fileUrl: null,
              reactions: {},
              pinned: false,
              _handledByAI: true,
              // AI replies to user's message
              replyTo: userMessageData ? {
                id: userMessageData.id,
                displayName: userMessageData.displayName,
                text: userMessageData.text,
                fileUrl: userMessageData.fileUrl || null,
                role: userMessageData.role || null,
              } : null,
            });

            t.update(chatRef, {
              lastMessage: `Support Assistant: ${aiResponse}`,
              lastUpdated: serverTimestamp(),
              unreadCountForUser: increment(1),
            });
          });

          setPendingMessages((prev) => [
            ...prev,
            {
              id: `pending-ai-${Date.now()}`,
              text: aiResponse,
              role: "ai",
              displayName: "Support Assistant",
              userId: "ai",
              timestamp: { toMillis: () => Date.now() },
              fileUrl: null,
              reactions: {},
              pinned: false,
              replyTo: userMessageData ? {
                id: userMessageData.id,
                displayName: userMessageData.displayName,
                text: userMessageData.text,
                fileUrl: userMessageData.fileUrl || null,
                role: userMessageData.role || null,
              } : null,
            },
          ]);
        } catch (aiErr) {
          console.error("AI error:", aiErr);
          const errText = "Sorry, I couldn't respond right now. Please try again later.";

          await runTransaction(db, async (t) => {
            const snap = await t.get(chatRef);
            if (!snap.exists()) return;

            const errRef = doc(collection(chatRef, "messages"));
            t.set(errRef, {
              text: errText,
              role: "system",
              displayName: "System",
              userId: "system",
              timestamp: serverTimestamp(),
              fileUrl: null,
              reactions: {},
              pinned: false,
              replyTo: userMessageData ? {
                id: userMessageData.id,
                displayName: userMessageData.displayName,
                text: userMessageData.text,
                fileUrl: userMessageData.fileUrl || null,
                role: userMessageData.role || null,
              } : null,
            });

            t.update(chatRef, {
              lastMessage: `System: ${errText}`,
              lastUpdated: serverTimestamp(),
            });
          });
        } finally {
          setAiTyping(false);
        }
      }

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
      showError("Failed to end chat.");
    }
  };

  // Handlers (initial choice, AI choice, reactions, emoji)
  const handleInitialChoice = async (choice) => {
    if (!activeChatId || initialChoiceMade) return;
    
    // Immediately hide the buttons
    setInitialChoiceMade(true);
    
    const chatRef = doc(db, "privateChats", activeChatId);

    try {
      await runTransaction(db, async (t) => {
        const snap = await t.get(chatRef);
        if (!snap.exists()) return;

        const baseTime = Date.now();
        const choiceText = choice === "therapist" ? "Chat with Therapist" : "Chat with Support Assistant";
        
        // User's choice message (comes first)
        t.set(doc(collection(chatRef, "messages")), {
          text: choiceText,
          userId,
          displayName,
          role: "user",
          timestamp: serverTimestamp(),
          reactions: {},
          pinned: false,
          _handledByAI: true,
        });
        
        t.update(chatRef, {
          lastMessage: `${displayName}: ${choiceText || "Hello"}`,
          lastUpdated: serverTimestamp(),
          unreadCountForTherapist: increment(1),
          initialChoiceMade: true, // Mark in database
        });

        if (choice === "assistant") {
          t.update(chatRef, { aiActive: true, aiOffered: false, status: "new" });
          setAiActive(true);
          
          // System message (comes after user's choice)
          t.set(doc(collection(chatRef, "messages")), {
            text: "You are now chatting with our support assistant.",
            role: "system",
            timestamp: serverTimestamp(),
          });

          setAiTyping(true);
          setTimeout(async () => {
            try {
              const allPrev = [...messages, ...pendingMessages]
                .filter((m) => m.role === "user" || m.role === "ai")
                .sort((a, b) => getTimestampMillis(a.timestamp) - getTimestampMillis(b.timestamp));

              // Send a welcoming greeting to start the conversation
              const welcomePrompt = `You are continuing a conversation where the user just chose to chat with you (the Support Assistant).
              They are ready to start. Please respond naturally without greeting them again, as you already welcomed them. 
              Just ask how you can help or invite them to share what's on their mind.`;
              
              const aiResp = await getAIResponse(welcomePrompt, allPrev);

              await runTransaction(db, async (transaction) => {
                transaction.set(doc(collection(chatRef, "messages")), {
                  text: aiResp,
                  role: "ai",
                  displayName: "Support Assistant",
                  timestamp: serverTimestamp(),
                  _handledByAI: true,
                });
                transaction.update(chatRef, {
                  lastMessage: `Support Assistant: ${aiResp}`,
                  lastUpdated: serverTimestamp(),
                  unreadCountForUser: increment(1),
                });
              });
            } catch (e) {
              console.error("AI initial failed:", e);
              const errMsg = "Sorry, couldn't respond right now.";
              await runTransaction(db, async (transaction) => {
                transaction.set(doc(collection(chatRef, "messages")), { 
                  text: errMsg, 
                  role: "system", 
                  timestamp: serverTimestamp() 
                });
              });
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
          
          // System message (comes after user's choice)
          t.set(doc(collection(chatRef, "messages")), {
            text: "We are contacting an available therapist for you.",
            role: "system",
            timestamp: serverTimestamp(),
          });
        }
      });
      setAiEnabled(choice === "assistant");
    } catch (err) {
      console.error("Initial choice error:", err);
      showError("Failed to process your choice.");
      // Rollback on error
      setInitialChoiceMade(false);
    }
  };

  const handleAiChoice = async (choice) => {
    if (!activeChatId || aiOfferAnswered) return;
    
    // Immediately hide the buttons
    setAiOfferAnswered(true);
    
    const chatRef = doc(db, "privateChats", activeChatId);

    try {
      await runTransaction(db, async (t) => {
        const snap = await t.get(chatRef);
        if (!snap.exists()) return;

        const baseTime = Date.now();

        // User's choice message
        t.set(doc(collection(chatRef, "messages")), {
          text: choice === "yes" ? "Yes" : "No",
          userId,
          displayName,
          role: "user",
          timestamp: serverTimestamp(),
          _handledByAI: true,
        });
        
        // Mark AI offer as answered
        t.update(chatRef, {
          aiOfferAnswered: true,
        });

        if (choice === "yes") {
          t.update(chatRef, { aiActive: true, aiOffered: false });
          setAiActive(true);
          // System message comes AFTER user's choice
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

              let aiPrompt;
              let aiResp;

              if (recent.length > 0) {
                // User has sent messages before - respond to their last message
                const lastTxt = recent[0]?.text || (recent[0]?.fileUrl ? "Attachment" : "");
                aiPrompt = `The user has been waiting and you're now available to help. Their last message was: "${lastTxt}". Please respond directly to what they said without introducing yourself, as this is a continuation of an existing conversation.`;
                aiResp = await getAIResponse(aiPrompt, allPrev);
              } else {
                // No previous messages - send a welcoming greeting
                aiPrompt = "The user accepted your offer to chat. You already introduced yourself. Just briefly acknowledge their choice and ask how you can help - no need to greet or introduce yourself again.";
                aiResp = await getAIResponse(aiPrompt, allPrev);
              }

              await runTransaction(db, async (transaction) => {
                transaction.set(doc(collection(chatRef, "messages")), {
                  text: aiResp,
                  role: "ai",
                  displayName: "Support Assistant",
                  timestamp: serverTimestamp(),
                  _handledByAI: true,
                });
                transaction.update(chatRef, {
                  lastMessage: `Support Assistant: ${aiResp}`,
                  lastUpdated: serverTimestamp(),
                  unreadCountForUser: increment(1),
                });
              });
            } catch (e) {
              console.error("AI fallback failed:", e);
              const errTxt = "Sorry, couldn't respond right now. Please wait for a therapist.";
              await runTransaction(db, async (transaction) => {
                transaction.set(doc(collection(chatRef, "messages")), { 
                  text: errTxt, 
                  role: "system", 
                  timestamp: serverTimestamp() 
                });
              });
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
          // System message comes AFTER user's choice
          t.set(doc(collection(chatRef, "messages")), {
            text: "Okay, please hold on while we connect you to a therapist.",
            role: "system",
            timestamp: serverTimestamp(),
          });
        }
      });
      setAiEnabled(choice === "yes");
    } catch (err) {
      console.error("AI choice error:", err);
      showError("Failed to process your request.");
      // Rollback on error
      setAiOfferAnswered(false);
    }
  };

  // Menu ellipsis
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
    (file = null) => {
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
      showError("Failed to fetch profile.");
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
                onClick={() => {
                  setActiveChatId(null);
                  navigate("/anonymous-dashboard/");
                }}
                aria-label="Back to dashboard"
              />
            )}
            {therapistAvatar ? (
              <img
                src={therapistAvatar}
                alt={therapistDisplayName}
                className="text-avatar"
                onClick={() => currentTherapist && handleTherapistClick(currentTherapist)}
              />
            ) : (
              <div className="text-avatar placeholder" onClick={() => currentTherapist && handleTherapistClick(currentTherapist)}>
                {therapistDisplayName?.charAt(0)?.toUpperCase() || "?"}
              </div>
            )}

            <div className="card-content">
              <strong className="group-title" onClick={() => currentTherapist && handleTherapistClick(currentTherapist)}>{therapistDisplayName}</strong>
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
            {/* MENU TRIGGER */}
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
              <div className="chat-options-menu"
                onClick={(e) => { 
                  e.stopPropagation();
                  setMenuOpen(prev => !prev);
                }}
              >
                {/* View Therapist Profile */}
                {currentTherapist && (
                  <div className="menu-item" onClick={() => handleTherapistClick(currentTherapist)}>
                    <i className="fas fa-user"></i>
                    <span>View Profile</span>
                  </div>
                )}
                <div className="menu-item">
                  <i className="fa-solid fa-circle-exclamation"></i>
                  <span>Report</span>
                </div>
                <div className="menu-divider"></div>
                {/* Leave Button */}
                <div className="menu-item leave-button" onClick={() => setShowLeaveConfirm(true)}>
                  <i className="fas fa-sign-out-alt"></i>
                  <span>End Chat</span>
                </div>
              </div>
            )}
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
                  <li>The current therapist won't be able to reach you</li>
                  <li>You will be re-assigned to a new therapist on next chat</li>
                </ul>
                <p className="confirm-question">Are you sure you'd like to end this chat now?</p>
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
          {isInitialLoading && combinedPrivateChat.length === 0 && (
              <div className="loading-messages-box">
                <div className="loading-messages">
                  <div className="spinner"></div>
                  <p>Loading messages...</p>
                </div>
              </div>
            )}

            {isLoadingOlder && (
              <div className="loading-older-messages">
                <div className="spinner small"></div>
                <p>Loading older messages...</p>
              </div>
            )}

            {!isInitialLoading && combinedPrivateChat.length === 0 && (
              <div className="empty-chat">
                <p>Send your first message to start the conversation</p>
              </div>
            )}

            {!isInitialLoading && combinedPrivateChat.length > 0 && combinedPrivateChat.map((msg, index) => {
              const previous = index > 0 ? combinedPrivateChat[index - 1] : null;
              const isGrouped = shouldGroupMessage(msg, previous);

              return (
                <React.Fragment key={`${msg.id}-${msg.type || "msg"}`}>
                  {/* New messages divider */}
                  {lastReadIndex >= 0 &&
                    index === lastReadIndex &&
                    newMessagesSinceLastScroll > 0 &&
                    !isUserAtBottom.current && (
                      <div className="new-messages-divider">
                        <div className="new-messages">
                          {newMessagesSinceLastScroll} new message{newMessagesSinceLastScroll > 1 ? "s" : ""}
                        </div>
                      </div>
                    )
                  }

                  <div className={`message ${isGrouped ? "grouped" : ""}`} id={`msg-${msg.id}`}>
                    <ChatMessage
                      msg={msg}
                      toggleReaction={msg.id?.startsWith("pending-") ? () => {} : toggleReaction}
                      currentUserId={userId}
                      isPrivateChat={true}
                      therapistInfo={{ role: "user" }}
                      handleTherapistClick={() => {}}
                      scrollToMessage={scrollToMessage}
                      isAiOffer={msg.type === "ai-offer"}
                      onAiYes={() => handleAiChoice("yes")}
                      onAiNo={() => handleAiChoice("no")}
                      isInitialChoice={msg.type === "initial-choice" || msg.type === "initial-choice-ai"}
                      onInitialChoice={handleInitialChoice}
                      aiTyping={aiTyping}
                      isSending={isSending}
                      onReply={handleReply}
                      initialChoiceMade={initialChoiceMade}
                      aiOfferAnswered={aiOfferAnswered}
                      currentTherapistUid={currentTherapistUid}
                    />
                  </div>
                </React.Fragment>
              );
          })}

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

          {/* Scroll to bottom button */}
          {showScrollToBottom && (
            <button
              className="scroll-to-bottom-btn"
              onClick={scrollToNewMessages}
              aria-label="Scroll to new messages"
            >
              <i className="fas fa-chevron-down"></i>
              {newMessagesSinceLastScroll > 0 && (
                <span className="new-messages-badge">
                  {newMessagesSinceLastScroll > 99 ? "99+" : newMessagesSinceLastScroll}
                </span>
              )}
            </button>
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
        <div className="info-modal" ref={modalRef}>
          <TherapistProfile
            therapist={selectedTherapist}
            isOnline={selectedTherapist.online}
            onBack={() => setSelectedTherapist(null)}
          />
        </div>
      )}
    </div>
  );
}  
export default AnonymousPrivateChatView;