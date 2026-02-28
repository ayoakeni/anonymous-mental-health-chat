import React, { useEffect, useState, useRef, useMemo, useCallback } from "react";
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
  endBefore,
  limitToLast,
} from "firebase/firestore";
import { useTypingStatus } from "../../hooks/useTypingStatus";
import ChatMessage from "../ChatMessage";
import ResizableSplitView from "../../components/resizableSplitView";
import { useIsInsideChat } from "../../hooks/useIsInsideChatMobile";
import EmojiPicker from "emoji-picker-react";
import TherapistProfile from "../TherapistProfile";
import { getAIResponse, mapMessagesForAI} from "../../utils/AiChatIntegration";
import { shouldGroupMessage } from "../../utils/messageGrouping";

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
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  
  // ─── NEW: Scroll & loading states ───
  const [isInitialLoading, setIsInitialLoading] = useState(false);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [initialPositioningDone, setInitialPositioningDone] = useState(false);
  const [newMessagesSinceLastScroll, setNewMessagesSinceLastScroll] = useState(0);
  const [firstUnreadMessageId, setFirstUnreadMessageId] = useState(null);
  const [lastReadIndex, setLastReadIndex] = useState(-1);
  const [initialScrollDone, setInitialScrollDone] = useState(false);
  const [hasJumpedToFirstUnread, setHasJumpedToFirstUnread] = useState(false);
  const isUserAtBottom = useRef(true);
  const isInitial = useRef(true);
  const prevMessageCount = useRef(0);
  const prevCombinedLength = useRef(0);
  const prevLastMsgId = useRef(null);
  const latestTimestamp = useRef(null);
  const earliestTimestamp = useRef(null);
  
  const messagesEndRef = useRef(null);
  const chatBoxRef = useRef(null);
  const modalRef = useRef(null);
  const navigate = useNavigate();
  const { typingUsers, handleTyping } = useTypingStatus(displayName, activeGroupId ? activeGroupId : null);
  const isMobile = useMediaQuery("(max-width: 768px)");
  const isInsideChat = useIsInsideChat();
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [replyTo, setReplyTo] = useState(null);

  // Memoize active group to avoid repeated find calls
  const activeGroup = useMemo(() => 
    groupChats.find((g) => g.id === activeGroupId), 
    [groupChats, activeGroupId]
  );

  // Reset scroll state when changing chats
  useEffect(() => {
    setInitialScrollDone(false);
    setInitialPositioningDone(false);
    setLastReadIndex(-1);
    setNewMessagesSinceLastScroll(0);
    setFirstUnreadMessageId(null);
    setHasJumpedToFirstUnread(false);
    setShowScrollToBottom(false);
    isInitial.current = true;

    if (chatBoxRef.current) {
      chatBoxRef.current.scrollTop = 0;
    }
  }, [activeGroupId]);

  // Load more messages (pagination)
  const loadMoreMessages = useCallback(async () => {
    if (!activeGroupId || !hasMoreMessages || isLoadingOlder) return;
    setIsLoadingOlder(true);
    
    try {
      const groupRef = doc(db, "groupChats", activeGroupId);
      const q = query(
        collection(groupRef, "messages"),
        orderBy("timestamp", "asc"),
        endBefore(earliestTimestamp.current),
        limitToLast(30)
      );
      const snapshot = await getDocs(q);
      const newMessages = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      
      setMessages((prev) => {
        const existingIds = new Set(prev.map((m) => m.id));
        const filteredNew = newMessages.filter((m) => !existingIds.has(m.id));
        return [...filteredNew, ...prev];
      });
      
      setHasMoreMessages(snapshot.docs.length === 30);
      if (newMessages.length > 0) {
        earliestTimestamp.current = newMessages[0].timestamp;
      }
    } catch (err) {
      console.error("Error loading more messages:", err);
      showError("Failed to load more messages. Please try again.");
    } finally {
      setIsLoadingOlder(false);
    }
  }, [activeGroupId, hasMoreMessages, isLoadingOlder, showError]);

  const handleScroll = useCallback(() => {
    if (!chatBoxRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = chatBoxRef.current;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    const atBottom = distanceFromBottom <= 120;

    const wasNotAtBottom = !isUserAtBottom.current;
    isUserAtBottom.current = atBottom;
    setShowScrollToBottom(!atBottom);

    if (atBottom && (wasNotAtBottom || firstUnreadMessageId)) {
      setNewMessagesSinceLastScroll(0);
      setFirstUnreadMessageId(null);
      setHasJumpedToFirstUnread(false);
      // Mark as read
      if (activeGroupId && userId) {
        const groupRef = doc(db, "groupChats", activeGroupId);
        runTransaction(db, async (tx) => {
          const snap = await tx.get(groupRef);
          if (!snap.exists()) return;
          const data = snap.data();
          if (data.participants?.includes(userId)) {
            tx.update(groupRef, { [`unreadCount.${userId}`]: 0 });
          }
        }).catch(err => console.error("Failed to mark as read:", err));
      }
      setLastReadIndex(combinedGroupChat.length);
    }

    if (scrollTop <= 400 && hasMoreMessages && !isLoadingOlder && initialPositioningDone) {
      loadMoreMessages();
    }
  }, [hasMoreMessages, isLoadingOlder, loadMoreMessages, initialPositioningDone, firstUnreadMessageId, activeGroupId, userId]);

  // Maintain scroll position when loading older
  useEffect(() => {
    if (!isLoadingOlder || !chatBoxRef.current) return;

    const container = chatBoxRef.current;
    const prevHeight = container.scrollHeight;
    const prevTop = container.scrollTop;

    const timer = setTimeout(() => {
      const heightAdded = container.scrollHeight - prevHeight;
      const targetTop = prevTop + heightAdded - 120;

      container.scrollTo({
        top: targetTop,
        behavior: "auto"
      });
    }, 0);

    return () => clearTimeout(timer);
  }, [isLoadingOlder, messages]);

  useEffect(() => {
    const chatBox = chatBoxRef.current;
    if (!chatBox) return;
    chatBox.addEventListener("scroll", handleScroll);
    handleScroll();
    return () => chatBox.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  const combinedGroupChat = useMemo(() => {
    return [...messages, ...groupEvents, ...pendingMessages].sort(
      (a, b) => getTimestampMillis(a.timestamp) - getTimestampMillis(b.timestamp)
    );
  }, [messages, groupEvents, pendingMessages, getTimestampMillis]);

  useEffect(() => {
    const currLen = combinedGroupChat.length;
    const addedCount = currLen - prevCombinedLength.current;
    if (addedCount > 0 && combinedGroupChat[currLen - 1]?.id === prevLastMsgId.current) {
      setLastReadIndex(prev => prev + addedCount);
    }
    prevCombinedLength.current = currLen;
    prevLastMsgId.current = combinedGroupChat[currLen - 1]?.id;
  }, [combinedGroupChat]);

  // Set initial lastReadIndex based on unread
  useEffect(() => {
    if (lastReadIndex !== -1 || isInitialLoading || combinedGroupChat.length === 0) return;
    const unread = activeGroup?.unreadCount?.[userId] || 0;
    setLastReadIndex(combinedGroupChat.length - unread);
    setInitialScrollDone(false);
  }, [lastReadIndex, isInitialLoading, combinedGroupChat, activeGroup, userId]);

  // Initial scroll positioning
  useEffect(() => {
    if (initialScrollDone || isInitialLoading || combinedGroupChat.length === 0) return;

    const unreadCount = activeGroup?.unreadCount?.[userId] || 0;

    if (unreadCount > 0 && lastReadIndex >= 0 && lastReadIndex < combinedGroupChat.length) {
      const firstUnreadIndex = lastReadIndex;
      const targetEl = document.getElementById(`msg-${combinedGroupChat[firstUnreadIndex]?.id}`);

      if (targetEl && chatBoxRef.current) {
        const offset = targetEl.offsetTop - 80;
        chatBoxRef.current.scrollTo({
          top: offset,
          behavior: "auto"
        });

        targetEl.classList.add("message-highlight");
        setTimeout(() => targetEl.classList.remove("message-highlight"), 2200);
      } else {
        messagesEndRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
      }
    } else {
      messagesEndRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
    }

    setInitialScrollDone(true);
    isInitial.current = false;

    setTimeout(() => {
      setInitialPositioningDone(true);
      handleScroll();
    }, 250);

  }, [initialScrollDone, isInitialLoading, combinedGroupChat, lastReadIndex, activeGroup, userId, messagesEndRef, handleScroll, activeGroupId]);

  // Track new messages
  useEffect(() => {
    const currentCount = combinedGroupChat?.length || 0;
    if (currentCount <= prevMessageCount.current) return;

    if (isLoadingOlder) {
      prevMessageCount.current = currentCount;
      return;
    }

    if (isInitial.current) {
      prevMessageCount.current = currentCount;
      return;
    }

    const added = currentCount - prevMessageCount.current;
    const newMsgs = combinedGroupChat.slice(-added);

    const isSelfOrSystem = newMsgs.every(
      (msg) => msg.role === "system" || msg.userId === userId
    );

    if (isSelfOrSystem) {
      setLastReadIndex((prev) => prev + added);
    } else {
      if (!isUserAtBottom.current) {
        setNewMessagesSinceLastScroll((prev) => prev + added);
        setHasJumpedToFirstUnread(false);
        setFirstUnreadMessageId((current) => current || newMsgs[0]?.id);
      } else {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
        setNewMessagesSinceLastScroll(0);
        setFirstUnreadMessageId(null);
        setLastReadIndex(combinedGroupChat.length);
      }
    }

    prevMessageCount.current = currentCount;
  }, [combinedGroupChat, userId, isUserAtBottom.current, isLoadingOlder, messagesEndRef]);

  const scrollToBottom = useCallback(() => {
    if (messagesEndRef.current && chatBoxRef.current) {
      chatBoxRef.current.scrollTo({
        top: messagesEndRef.current.offsetTop,
        behavior: "smooth"
      });
      setNewMessagesSinceLastScroll(0);
      setFirstUnreadMessageId(null);
      setLastReadIndex(combinedGroupChat.length);
    }
  }, [combinedGroupChat.length]);

  const scrollToNewMessages = useCallback(() => {
    if (hasJumpedToFirstUnread || !firstUnreadMessageId) {
      scrollToBottom();
      setHasJumpedToFirstUnread(false);
      return;
    }

    const el = document.getElementById(`msg-${firstUnreadMessageId}`);
    if (el && chatBoxRef.current) {
      const containerTop = chatBoxRef.current.getBoundingClientRect().top;
      const msgTop = el.getBoundingClientRect().top;
      const offset = msgTop - containerTop - 60;

      chatBoxRef.current.scrollBy({
        top: offset,
        behavior: "smooth"
      });

      el.classList.add("message-highlight");
      setTimeout(() => el.classList.remove("message-highlight"), 1800);

      setHasJumpedToFirstUnread(true);
    } else {
      scrollToBottom();
      setHasJumpedToFirstUnread(true);
    }
  }, [firstUnreadMessageId, hasJumpedToFirstUnread, scrollToBottom]);

  // Menu ellipsis
  useEffect(() => {
    const closeMenu = (e) => {
      if (!e.target.closest(".leave-participant") && !e.target.closest(".chat-options-menu")) {
        setIsParticipantsOpen(false);
      }
    };
    if (isParticipantsOpen) document.addEventListener("click", closeMenu);
    return () => document.removeEventListener("click", closeMenu);
  }, [isParticipantsOpen]);

  // Scroll to pinned message or replied message 
  const scrollToMessage = useCallback((msgId) => {
    const el = document.getElementById(`msg-${msgId}`);
    if (!el) return;

    document.querySelectorAll(".message-highlight").forEach(e => {
      e.classList.remove("message-highlight");
    });

    el.classList.add("message-highlight");
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => {
      el.classList.remove("message-highlight");
    }, 1600);
  }, []);
  
  // Reset invalid activeGroupId
  useEffect(() => {
    if (activeGroupId && !groupChats.find(g => g.id === activeGroupId)) {
      console.warn(`Active group ${activeGroupId} not found in groupChats, resetting`);
      setActiveGroupId(null);
      navigate("/anonymous-dashboard/group-chat");
    }
  }, [activeGroupId, groupChats, navigate, setActiveGroupId]);
  
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

  // Fetch group chat data with INITIAL LOADING
  useEffect(() => {
    if (!activeGroupId) return;
    
    setIsInitialLoading(true);
    const groupRef = doc(db, "groupChats", activeGroupId);

    const loadInitialMessages = async () => {
      try {
        const messagesQuery = query(
          collection(groupRef, "messages"),
          orderBy("timestamp", "asc"),
          limitToLast(30)
        );
        const snapshot = await getDocs(messagesQuery);
        const msgs = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        
        setMessages(msgs);
        setPendingMessages((prev) =>
          prev.filter((pending) => !msgs.some((msg) => msg.text === pending.text && msg.role === pending.role))
        );
        setHasMoreMessages(snapshot.docs.length === 30);
        
        if (msgs.length > 0) {
          latestTimestamp.current = msgs[msgs.length - 1].timestamp;
          earliestTimestamp.current = msgs[0].timestamp;
        }

        // ── Always set up real-time listener, even for empty groups ──
        const newMessagesQuery = latestTimestamp.current
          ? query(
              collection(groupRef, "messages"),
              orderBy("timestamp", "asc"),
              startAfter(latestTimestamp.current)
            )
          : query(
              collection(groupRef, "messages"),
              orderBy("timestamp", "asc")
            );
        
        const unsubMessages = onSnapshot(newMessagesQuery, (newSnapshot) => {
          if (newSnapshot.empty) return;
          
          const newMsgs = newSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
          setMessages((prev) => {
            const existingIds = new Set(prev.map((m) => m.id));
            const filtered = newMsgs.filter((m) => !existingIds.has(m.id));
            if (filtered.length === 0) return prev;
            return [...prev, ...filtered];
          });
          
          setPendingMessages((prev) =>
            prev.filter((pending) => !newMsgs.some((msg) => msg.text === pending.text && msg.role === pending.role))
          );
          
          if (newMsgs.length > 0) {
            playNotification();
            latestTimestamp.current = newMsgs[newMsgs.length - 1].timestamp;
          }
        });

        return unsubMessages;
      } catch (err) {
        console.error("Error fetching messages:", err);
        showError("Failed to load messages. Please try again.");
      } finally {
        setIsInitialLoading(false);
      }
    };

    const unsubMessages = loadInitialMessages();

    const eventsQuery = query(collection(groupRef, "events"), orderBy("timestamp"), limit(50));
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
      if (unsubMessages && typeof unsubMessages.then === 'function') {
        unsubMessages.then(unsub => unsub && unsub());
      }
      unsubEvents();
      unsubParticipants();
      setPendingMessages([]);
      latestTimestamp.current = null;
      earliestTimestamp.current = null;
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
      document.querySelector(".inputInsert")?.focus();
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

  // Send message (same as before - no changes needed)
  const sendMessage = async (text = "", file = null, replyToMsg = null) => {
    if (!text.trim() && !file) return;
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
      const isReplyingToAI = replyToMsg?.role === "ai";
      const isAiTrigger = text.toLowerCase().includes("@ai") || isReplyingToAI;
      const cleanUserText = text.replace(/@ai/gi, "").trim();

      const groupRef = doc(db, "groupChats", activeGroupId);
      const messagesRef = collection(db, `groupChats/${activeGroupId}/messages`);

      let userMessageData = null;
      
      await runTransaction(db, async (tx) => {
        const groupSnap = await tx.get(groupRef);
        if (!groupSnap.exists()) throw new Error("Group does not exist");
        const participants = groupSnap.data()?.participants || [];
        const unreadCount = groupSnap.data()?.unreadCount || {};

        const userMsgRef = doc(messagesRef);
        
        userMessageData = {
          id: userMsgRef.id,
          text: cleanUserText || "",
          fileUrl,
          userId,
          displayName,
          role: "user",
          timestamp: serverTimestamp(),
          reactions: {},
          pinned: false,
          replyTo: replyToMsg ? {
            id: replyToMsg.id,
            displayName: replyToMsg.displayName,
            text: replyToMsg.text,
            fileUrl: replyToMsg.fileUrl || null,
            role: replyToMsg.role || null,
          } : null,
        };
        
        tx.set(userMsgRef, userMessageData);

        tx.update(groupRef, {
          lastMessage: {
            text: cleanUserText || "Attachment",
            displayName,
            timestamp: serverTimestamp(),
          },
          unreadCount: incrementUnreadCounts(participants, unreadCount, userId),
        });
      });

      const pendingUserId = `pending-user-${Date.now()}`;
      setPendingMessages((prev) => [
        ...prev,
        {
          id: pendingUserId,
          text: cleanUserText,
          fileUrl,
          userId,
          displayName,
          role: "user",
          timestamp: { toMillis: () => Date.now() },
          reactions: {},
          pinned: false,
          replyTo: replyToMsg ? {
            id: replyToMsg.id,
            displayName: replyToMsg.displayName,
            text: replyToMsg.text,
            fileUrl: replyToMsg.fileUrl || null,
            role: replyToMsg.role || null,
          } : null,
        },
      ]);

      setNewMessage("");
      setShowEmojiPicker(false);

      if (isAiTrigger) {
        setAiTyping(true);
        try {
          const aiInput = mapMessagesForAI(messages);
          
          let aiPrompt = cleanUserText || "Continue";
          if (replyToMsg) {
            if (isReplyingToAI) {
              aiPrompt = `[User is continuing the conversation about their previous message]
              Your previous response was about: "${replyToMsg.text || "[Previous AI response]"}"

              User's follow-up: ${cleanUserText}

              Please respond to the user's follow-up question or comment.`;
            } else {
              aiPrompt = `[User is asking for AI assistance regarding another user's message]
              Original message from ${replyToMsg.displayName}: "${replyToMsg.text || (replyToMsg.fileUrl ? "[Attachment]" : "[No content]")}"

              User's question/request: ${cleanUserText}

              Please provide helpful assistance based on this context.`;
            }
          }
          
          const aiResponse = await getAIResponse(aiPrompt, aiInput);
          const aiFullText = aiResponse;

          await runTransaction(db, async (tx) => {
            const groupSnap = await tx.get(groupRef);
            if (!groupSnap.exists()) throw new Error("Group does not exist");
            const participants = groupSnap.data()?.participants || [];
            const unreadCount = groupSnap.data()?.unreadCount || {};

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
              replyTo: userMessageData ? {
                id: userMessageData.id,
                displayName: userMessageData.displayName,
                text: userMessageData.text,
                fileUrl: userMessageData.fileUrl || null,
                role: userMessageData.role || null,
              } : null,
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

          await runTransaction(db, async (tx) => {
            const groupSnap = await tx.get(groupRef);
            if (!groupSnap.exists()) throw new Error("Group does not exist");
            const participants = groupSnap.data()?.participants || [];
            const unreadCount = groupSnap.data()?.unreadCount || {};

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
              replyTo: userMessageData ? {
                id: userMessageData.id,
                displayName: userMessageData.displayName,
                text: userMessageData.text,
                fileUrl: userMessageData.fileUrl || null,
                role: userMessageData.role || null,
              } : null,
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
              replyTo: userMessageData ? {
                id: userMessageData.id,
                displayName: userMessageData.displayName,
                text: userMessageData.text,
                fileUrl: userMessageData.fileUrl || null,
                role: userMessageData.role || null,
              } : null,
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
      setReplyTo(null);
    }
  };

  // Toggle reaction (same as before)
  const toggleReaction = async (msgId, reactionType) => {
    if (!userId || !activeGroupId) return;

    const msgRef = doc(db, `groupChats/${activeGroupId}/messages`, msgId);

    try {
      await runTransaction(db, async (transaction) => {
        const msgSnap = await transaction.get(msgRef);
        if (!msgSnap.exists()) return;

        const reactions = msgSnap.data().reactions || {};
        const currentUserId = userId;

        const reactionTypes = ["heart", "thumbsUp"];
        const otherType = reactionTypes.find(t => t !== reactionType);

        const hasThisReaction = reactions[reactionType]?.includes(currentUserId) || false;
        const hasOtherReaction = reactions[otherType]?.includes(currentUserId) || false;

        const updatedReactions = { ...reactions };

        if (hasThisReaction) {
          updatedReactions[reactionType] = (reactions[reactionType] || []).filter(
            id => id !== currentUserId
          );
          if (hasOtherReaction) {
            updatedReactions[otherType] = (reactions[otherType] || []).filter(
              id => id !== currentUserId
            );
          }
        } else {
          updatedReactions[reactionType] = [
            ...(reactions[reactionType] || []),
            currentUserId
          ];

          if (hasOtherReaction) {
            updatedReactions[otherType] = (reactions[otherType] || []).filter(
              id => id !== currentUserId
            );
          }
        }

        Object.keys(updatedReactions).forEach(key => {
          if (updatedReactions[key]?.length === 0) {
            delete updatedReactions[key];
          }
        });

        transaction.update(msgRef, { reactions: updatedReactions });
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

  const handleReply = (message) => {
    setReplyTo({
      id: message.id,
      displayName: message.displayName,
      text: message.text,
      fileUrl: message.fileUrl,
      role: message.role,
    });
    document.querySelector(".inputInsert")?.focus();
  };

  const handleSend = useCallback((text = "", file = null) => {
    if (!text.trim() && !file) return;
    sendMessage(text.trim(), file, replyTo);
    setNewMessage("");
    setReplyTo(null);
  }, [sendMessage, replyTo]);

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
            const isMember = group.isMember;

            return (
              <div
                key={group.id}
                className={`chat-card ${activeGroupId === group.id ? "selected" : ""} ${!isMember ? "left-group" : ""}`}
                onClick={() => {
                  if (isMember || activeGroupId === group.id) {
                    joinGroupChat(group.id);
                  } else {
                    joinGroupChat(group.id);
                  }
                }}
              >
                <div className="chat-card-inner">
                  <div className="chat-avater-content">
                    <span className={`therapist-avatar ${!isMember ? "grayed" : ""}`}>
                      {group.name?.[0] || "G"}
                    </span>
                    <div className="chat-card-content">
                      <strong className={`chat-card-title ${!isMember ? "grayed-text" : ""}`}>
                        {group.name || "Unnamed Group"}
                        {!isMember && <span className="left-badge"> (Left)</span>}
                      </strong>
                      <small className={`chat-card-preview ${!isMember ? "grayed-text" : ""}`}>
                        {isMember ? (
                          group.lastMessage
                            ? `${group.lastMessage.displayName || "Anonymous"}: ${group.lastMessage.text}`
                            : "No messages yet"
                        ) : (
                          "You left this group • Tap to rejoin"
                        )}
                      </small>
                    </div>
                  </div>
                  <div className="chat-card-meta">
                    {lastTs && isMember && (
                      <div className="message-timestamp">
                        <span className="meta-date">{dateStr || "N/A"}</span>
                        <span className="meta-time">{timeStr || "N/A"}</span>
                      </div>
                    )}
                    {isMember && (() => {
                      const personalUnread = group.unreadCount?.[userId] || 0;
                      return personalUnread > 0 && <span className="unread-badge">{personalUnread}</span>;
                    })()}
                    {!isMember && (
                      <span className="rejoin-hint">Rejoin</span>
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

  // RIGHT PANEL: Active Chat
  const rightPanel = (
    <div className="chat-box-container">
      {activeGroupId ? (
        <div className="group-chat-box">
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

                {isParticipantsOpen && (
                  <div 
                    className="chat-options-menu" 
                    onClick={(e) => e.stopPropagation()}
                  >
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

                    <div className="menu-item leave-button" onClick={() => setShowLeaveConfirm(true)}>
                      <i className="fas fa-sign-out-alt"></i>
                      <span>Leave Group</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
            
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
            
            {combinedGroupChat.some((msg) => msg.pinned) && (
              <div
                className="pinned-message"
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
                    <strong>{combinedGroupChat.find(m => m.pinned)?.pinnedBy || "Someone"}:</strong>{" "}
                    <span>
                      {(() => {
                        const pinnedMsg = combinedGroupChat.find(m => m.pinned);
                        return pinnedMsg?.text || (pinnedMsg?.fileUrl ? "Attachment" : "");
                      })()}
                    </span>
                  </span>
                </span>
              </div>
            )}
          </div>
          
          <div className={selectedTherapist ? "chat-box blurred" : "chat-box"} role="log" aria-live="polite" ref={chatBoxRef}>
            {/* INITIAL LOADING */}
            {isInitialLoading && combinedGroupChat.length === 0 && (
              <div className="loading-messages-box">
                <div className="loading-messages">
                  <div className="spinner"></div>
                  <p>Loading messages...</p>
                </div>
              </div>
            )}

            {/* NO MESSAGES */}
            {!isInitialLoading && combinedGroupChat.length === 0 && (
              <p className="no-message">No messages in this group yet.</p>
            )}

            {/* CHAT CONTENT */}
            {!isInitialLoading && combinedGroupChat.length > 0 && (
              <>
                {/* LOADING OLDER */}
                {isLoadingOlder && (
                  <div className="loading-older-messages">
                    <div className="spinner small"></div>
                    <p>Loading older messages...</p>
                  </div>
                )}

                {combinedGroupChat.map((msg, index) => {
                  const isTherapist = therapistsOnline.some(t => t.uid === userId && t.online);
                  const previousMsg = index > 0 ? combinedGroupChat[index - 1] : null;
                  const isGrouped = shouldGroupMessage(msg, previousMsg);

                  return (
                    <React.Fragment key={`${msg.id}-${msg.type || "message"}`}>
                      {/* Unread divider */}
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

                      <div className={`message ${isGrouped ? 'grouped' : ''}`} id={`msg-${msg.id}`}>
                        <ChatMessage
                          msg={msg}
                          toggleReaction={msg.id?.startsWith("pending-") ? () => {} : toggleReaction}
                          currentUserId={userId}
                          currentView="anonymous"
                          isPrivateChat={false}
                          therapistInfo={{ role: isTherapist ? "therapist" : "user" }}
                          handleTherapistClick={handleTherapistClick}
                          scrollToMessage={scrollToMessage}
                          therapistId={isTherapist ? userId : null}
                          onReply={handleReply}
                        />
                      </div>
                    </React.Fragment>
                  );
                })}
              </>
            )}
            
            {/* Typing Indicator */}
            {(typingUsers.length > 0 || aiTyping) && (
              <div className="typing-indicator">
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
              </div>
            )}

            {/* Scroll to bottom button */}
            {showScrollToBottom && (
              <button 
                className="scroll-to-bottom-btn" 
                onClick={scrollToNewMessages} 
                aria-label="Jump to new messages"
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
                <button
                  className="cancel-reply-btn"
                  onClick={() => setReplyTo(null)}
                  aria-label="Cancel reply"
                >
                  <i className="fas fa-times"></i>
                </button>
              </div>
            )}
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
                    handleSend(newMessage);
                  }
                }}
                aria-label="Message input"
                disabled={isSending}
              />
              <input
                type="file"
                id="group-file-upload"
                style={{ display: "none" }}
                onChange={(e) => {
                  const file = e.target.files[0];
                  if (file) {
                    handleSend("", file);
                  }
                }}
                aria-label="Upload file"
              />
              <button
                className="attach-btn"
                onClick={() => document.getElementById("group-file-upload").click()}
                aria-label="Attach file"
              >
                <i className="fa-solid fa-paperclip"></i>
              </button>
              <button className="send-btn" onClick={() => handleSend(newMessage)} disabled={isSending} aria-label="Send message">
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