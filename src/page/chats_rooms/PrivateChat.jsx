import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { db, auth, storage, ref, uploadBytes, getDownloadURL } from "../../utils/firebase";
import { getAnonName } from "../../login/anonymous_login";
import { useTypingStatus } from "../../components/useTypingStatus";
import { getAIResponse } from "../../utils/AiChatIntegration";
import { mapMessagesForAI } from "../../utils/aiMessageMapper";
import useNotificationSound from '../../components/useNotificationSound';
import {
  collection,
  onSnapshot,
  serverTimestamp,
  query,
  orderBy,
  doc,
  getDoc,
  arrayRemove,
  limit,
  runTransaction,
  where,
  getDocs,
  increment,
  Timestamp,
} from "firebase/firestore";
import { debounce } from "lodash";
import EmojiPicker from "emoji-picker-react";
import "../chats_rooms/privateChat.css";

function PrivateChat({ chatId }) {
  const [messages, setMessages] = useState([]);
  const [events, setEvents] = useState([]);
  const [isTherapistAvailable, setIsTherapistAvailable] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [aiTyping, setAiTyping] = useState(false);
  const [newMessage, setNewMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [activeTherapists, setActiveTherapists] = useState([]);
  const [therapistsOnline, setTherapistsOnline] = useState([]);
  const [selectedTherapist, setSelectedTherapist] = useState(null);
  const [therapistName, setTherapistName] = useState("Therapist");
  const [chatData, setChatData] = useState(null);
  const [chatLoaded, setChatLoaded] = useState(false);
  const [therapistsLoaded, setTherapistsLoaded] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [file, setFile] = useState(null);
  const playNotification = useNotificationSound();
  const prevMessagesRef = useRef([]);
  const messagesEndRef = useRef(null);
  const navigate = useNavigate();

  // Refs to track previous values without causing re-renders
  const prevParticipantsRef = useRef([]);
  const lastJoinEventRef = useRef(null);
  const lastLeaveEventRef = useRef(null);
  const hasOfferedNoTherapistRef = useRef(false);
  const userIdRef = useRef(auth.currentUser?.uid);

  // Update userIdRef if auth changes (rare, but safe)
  useEffect(() => {
    userIdRef.current = auth.currentUser?.uid;
  }, [auth.currentUser?.uid]);

  // Auto-scroll chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, events]);

  // Utils: Safely convert timestamp to Date
  const getMessageDate = (timestamp) => {
    if (!timestamp) return null;
    if (typeof timestamp.toDate === 'function') {
      return timestamp.toDate();
    }
    if (timestamp instanceof Date) {
      return timestamp;
    }
    if (typeof timestamp === 'number') {
      return new Date(timestamp);
    }
    if (timestamp.seconds != null) {
      return new Date(timestamp.seconds * 1000 + Math.floor(timestamp.nanoseconds / 1000000));
    }
    return null;
  };

  const formatMessageTime = (timestamp) => {
    const date = getMessageDate(timestamp);
    return date ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  };

  const getTimestampMillis = (timestamp) => {
    if (!timestamp) return Date.now(); // Fallback for null/sentinel/invalid
    const date = getMessageDate(timestamp);
    return date ? date.getTime() : Date.now();
  };

  // Watch therapist presence
  useEffect(() => {
    if (!chatId) return;
    const q = query(collection(db, "therapistsOnline"), limit(50));
    const unsub = onSnapshot(q, (snap) => {
      const onlineTherapists = snap.docs
        .map((d) => ({ uid: d.id, ...d.data() }))
        .filter((t) => t.online);
      setTherapistsOnline(onlineTherapists);
      setIsTherapistAvailable(onlineTherapists.length > 0);
      setActiveTherapists(onlineTherapists.map((t) => t.name || "Therapist"));
      setTherapistsLoaded(true);
    }, (err) => {
      console.error("Error fetching therapists online:", err);
      alert("Failed to fetch therapist status. Please try again.");
    });
    return () => unsub();
  }, [chatId]);

  // Watch messages (only incremental for remote, no full set on every snapshot)
  useEffect(() => {
    if (!chatId) return;
    const chatRef = doc(db, "privateChats", chatId);
    const q = query(collection(chatRef, "messages"), orderBy("timestamp"), limit(50));
    const unsubscribeMessages = onSnapshot(q, {
      includeMetadataChanges: true
    }, (snapshot) => {
      // Only handle incremental changes; rely on optimistic for local
      let hasRemoteChange = false;
      snapshot.docChanges().forEach((change) => {
        const msgData = change.doc.data();
        const newMsg = { id: change.doc.id, ...msgData };
        if (change.type === 'added' && !change.doc.metadata.hasPendingWrites) {
          hasRemoteChange = true;
          setMessages((prev) => {
            // Remove optimistic match if exists (by text + role + userId approx)
            const filtered = prev.filter((m) => !(m.optimistic && m.text === newMsg.text && m.role === newMsg.role));
            // Add real if not already (by id)
            const exists = filtered.some((m) => m.id === newMsg.id);
            return exists ? filtered : [...filtered, newMsg];
          });
        } else if (change.type === 'modified' && !change.doc.metadata.hasPendingWrites) {
          hasRemoteChange = true;
          setMessages((prev) => prev.map((m) => (m.id === newMsg.id ? newMsg : m)));
        }
        // Ignore removed or local pending
      });
      if (hasRemoteChange) {
        playNotification();
      }

      // Initial load: if no messages yet (empty snapshot.docs on first call)
      if (messages.length === 0 && snapshot.docs.length > 0 && !snapshot.metadata.fromCache) {
        const msgs = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data()
        }));
        setMessages(msgs);
        prevMessagesRef.current = msgs;
      }
    }, (err) => {
      console.error("Error fetching messages:", err);
      alert("Failed to load messages. Please try again.");
    });
    return () => unsubscribeMessages();
  }, [chatId, playNotification, messages.length]);

  // Watch events
  useEffect(() => {
    if (!chatId) return;
    const chatRef = doc(db, "privateChats", chatId);
    const q = query(collection(chatRef, "events"), orderBy("timestamp"), limit(50));
    const unsubscribeEvents = onSnapshot(q, (snapshot) => {
      const evts = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setEvents(evts);
    }, (err) => {
      console.error("Error fetching events:", err);
      alert("Failed to load events. Please try again.");
    });
    return () => unsubscribeEvents();
  }, [chatId]);

  // Watcher: Only set chat data (no transactions or state that triggers loops)
  useEffect(() => {
    if (!chatId) return;
    const chatRef = doc(db, "privateChats", chatId);
    const unsubscribeChat = onSnapshot(chatRef, (snap) => {
      if (!snap.exists()) {
        navigate("/chat-room");
        return;
      }
      const data = snap.data();
      setChatData(data);
      setAiEnabled(data.aiActive || false);
      setChatLoaded(true);

      prevParticipantsRef.current = data.participants || [];
    }, (err) => {
      console.error("Error fetching chat data:", err);
      navigate("/chat-room");
    });
    return () => unsubscribeChat();
  }, [chatId, navigate]);

  // Consolidated Logic: Handle join/leave detection, transactions, AND initial AI offer
  useEffect(() => {
    if (!chatLoaded || !chatData || !therapistsLoaded) return;

    const currentParticipants = chatData.participants || [];
    const userId = userIdRef.current;
    const prevSet = new Set(prevParticipantsRef.current);
    const currentSet = new Set(currentParticipants);
    const now = Date.now();
    const lastJoinEventTime = chatData.lastJoinEvent || 0;
    const lastLeaveEventTime = chatData.lastLeaveEvent || 0;

    const therapistJoined = currentParticipants.some(
      (uid) => uid !== userId && !prevSet.has(uid)
    );
    const therapistLeft = prevParticipantsRef.current.some(
      (uid) => uid !== userId && !currentSet.has(uid)
    );
    const therapistPresent = currentParticipants.some((uid) => uid !== userId);

    // Handle therapist join
    if (therapistJoined && now - (lastJoinEventRef.current || 0) > 2000 && now > lastJoinEventTime) {
      const chatRef = doc(db, "privateChats", chatId);
      runTransaction(db, async (transaction) => {
        const chatSnap = await transaction.get(chatRef);
        if (!chatSnap.exists()) throw new Error("Chat document does not exist");
        transaction.update(chatRef, {
          therapistJoinedOnce: true,
          aiActive: false,
          aiOffered: false,
          lastJoinEvent: now,
          needsTherapist: true,
        });
        const unreadQuery = query(collection(chatRef, "messages"), where("read", "==", false));
        const unreadSnap = await getDocs(unreadQuery);
        unreadSnap.forEach((doc) => {
          transaction.update(doc.ref, { read: true });
        });
        transaction.set(doc(collection(chatRef, "events")), {
          type: "join",
          user: "Therapist",
          text: "A therapist has joined. You can now continue your conversation with them.",
          role: "system",
          timestamp: serverTimestamp(),
        });
      }).catch((err) => {
        console.error("Error updating on join:", err);
        alert("Failed to process therapist join event. Please try again.");
      });
      lastJoinEventRef.current = now;
      hasOfferedNoTherapistRef.current = false;
    }

    // Handle therapist leave
    if (
      therapistLeft &&
      chatData.therapistJoinedOnce &&
      now - (lastLeaveEventRef.current || 0) > 2000 &&
      now > lastLeaveEventTime &&
      !chatData.lastLeaveAiOffered
    ) {
      const chatRef = doc(db, "privateChats", chatId);
      runTransaction(db, async (transaction) => {
        const chatSnap = await transaction.get(chatRef);
        if (!chatSnap.exists()) throw new Error("Chat document does not exist");
        transaction.set(doc(collection(chatRef, "messages")), {
          text: "Your therapist has left the chat. Would you like to continue chatting with our support assistant?",
          role: "system",
          type: "ai-offer",
          timestamp: serverTimestamp(),
        });
        transaction.update(chatRef, {
          aiOffered: true,
          therapistJoinedOnce: false,
          lastLeaveEvent: now,
          lastLeaveAiOffered: now,
          needsTherapist: true,
        });
      }).catch((err) => {
        console.error("Error updating on leave:", err);
        alert("Failed to process therapist leave event. Please try again.");
      });
      lastLeaveEventRef.current = now;
    }

    // Handle initial AI offer if no therapist
    const { aiOffered, therapistJoinedOnce, needsTherapist } = chatData;
    if (
      messages.length > 0 &&
      !therapistPresent &&
      !aiOffered &&
      !therapistJoinedOnce &&
      needsTherapist &&
      !isTherapistAvailable &&
      !hasOfferedNoTherapistRef.current
    ) {
      hasOfferedNoTherapistRef.current = true;
      const chatRef = doc(db, "privateChats", chatId);
      runTransaction(db, async (transaction) => {
        const chatSnap = await transaction.get(chatRef);
        if (!chatSnap.exists()) throw new Error("Chat document does not exist");
        transaction.update(chatRef, { aiOffered: true, needsTherapist: true });
        transaction.set(doc(collection(chatRef, "messages")), {
          text: "No therapist is online right now. Would you like to chat with our support assistant while you wait?",
          role: "system",
          type: "ai-offer",
          timestamp: serverTimestamp(),
        });
      }).catch((err) => {
        console.error("Error offering AI:", err);
        alert("Failed to offer AI assistant. Please try again.");
      });
    }
  }, [chatLoaded, chatData, therapistsLoaded, isTherapistAvailable, chatId, messages.length]);

  // Combine messages and events (no caching)
  const combinedChat = [...messages, ...events].sort((a, b) => {
    return getTimestampMillis(a.timestamp) - getTimestampMillis(b.timestamp);
  });

  const displayName = auth.currentUser?.email ? therapistName : getAnonName();
  const { typingUsers, handleTyping } = useTypingStatus(displayName);

  // Send message with file support
  const sendMessage = async () => {
    if (!newMessage.trim() && !file) return;
    if (!auth.currentUser || !chatId) return;
    setIsSending(true);
    const role = auth.currentUser.email ? "therapist" : "user";
    const nameToUse = role === "therapist" ? therapistName : getAnonName();
    const chatRef = doc(db, "privateChats", chatId);

    try {
      let fileUrl = null;
      if (file) {
        const storageRef = ref(storage, `privateChats/${chatId}/${Date.now()}_${file.name}`);
        await uploadBytes(storageRef, file);
        fileUrl = await getDownloadURL(storageRef);
      }
      let messageText = newMessage;
      const isAiTrigger = role === "user" && newMessage.toLowerCase().includes("@ai");
      if (isAiTrigger) {
        messageText = `"${newMessage.replace(/@ai/gi, "").trim()}"\n\n`;
      }

      // Optimistic update data
      const optimisticId = `optimistic-${Date.now()}-${Math.random()}`; // More unique
      const clientTimestamp = Timestamp.now();
      const optimisticMessage = {
        id: optimisticId,
        text: messageText,
        userId: auth.currentUser.uid,
        displayName: nameToUse,
        role,
        timestamp: clientTimestamp,
        fileUrl,
        reactions: {},
        read: false,
        optimistic: true, // Flag to identify for dedup
      };
      setMessages((prev) => [...prev, optimisticMessage]);

      await runTransaction(db, async (transaction) => {
        const chatSnap = await transaction.get(chatRef);
        if (!chatSnap.exists()) throw new Error("Chat document does not exist");
        const data = chatSnap.data();
        const hasTherapist = data.participants?.some((uid) => uid !== auth.currentUser.uid) || false;
        const needsTherapist = !hasTherapist && role !== "therapist";
        transaction.set(doc(collection(chatRef, "messages")), {
          text: messageText,
          userId: auth.currentUser.uid,
          displayName: nameToUse,
          role,
          timestamp: serverTimestamp(),
          fileUrl,
          reactions: {},
          read: false,
        });
        transaction.update(chatRef, {
          lastMessage: newMessage || "Attachment",
          lastUpdated: serverTimestamp(),
          unreadCountForTherapist: role === "therapist" ? 0 : increment(1),
          needsTherapist: needsTherapist ? true : data.needsTherapist,
        });
      });

      const userMessage = newMessage.replace(/@ai/gi, "").trim();
      setNewMessage("");
      setFile(null);
      setIsSending(false);

      // AI logic (uses messages incl optimistic, but mapMessagesForAI likely filters)
      const chatSnap = await getDoc(chatRef);
      if (!chatSnap.exists()) {
        navigate("/chat-room");
        aiTyping && setAiTyping(false);
        return;
      }
      const data = chatSnap.data();
      const therapistInChat = data.participants?.some((uid) => uid !== auth.currentUser?.uid) || false;

      if ((isAiTrigger || data.aiActive) && !therapistInChat) {
        try {
          setAiTyping(true);
          const aiInputMessages = mapMessagesForAI(messages); // May include optimistic, but should be fine if mapper handles
          const aiResponse = await getAIResponse(userMessage || "Continue", aiInputMessages);

          // Optimistic AI message
          const optimisticAiId = `optimistic-ai-${Date.now()}-${Math.random()}`;
          const optimisticAiMessage = {
            id: optimisticAiId,
            text: `"${userMessage}"\n\n${aiResponse}`,
            role: "ai",
            displayName: "Support Assistant",
            timestamp: Timestamp.now(),
            fileUrl: null,
            reactions: {},
            optimistic: true,
          };
          setMessages((prev) => [...prev, optimisticAiMessage]);

          await runTransaction(db, async (transaction) => {
            const chatSnap = await transaction.get(chatRef);
            if (!chatSnap.exists()) throw new Error("Chat document does not exist");
            transaction.set(doc(collection(chatRef, "messages")), {
              text: `"${userMessage}"\n\n${aiResponse}`,
              role: "ai",
              displayName: "Support Assistant",
              timestamp: serverTimestamp(),
              fileUrl: null,
              reactions: {},
            });
          });
        } catch (err) {
          console.error("AI response error:", err);
          // Optimistic error message
          const errorId = `optimistic-error-${Date.now()}`;
          setMessages((prev) => [...prev, {
            id: errorId,
            text: "Sorry, I couldn’t respond right now. Please wait for a therapist.",
            role: "system",
            timestamp: Timestamp.now(),
            optimistic: true,
          }]);
          await runTransaction(db, async (transaction) => {
            const chatSnap = await transaction.get(chatRef);
            if (!chatSnap.exists()) throw new Error("Chat document does not exist");
            transaction.set(doc(collection(chatRef, "messages")), {
              text: "Sorry, I couldn’t respond right now. Please wait for a therapist.",
              role: "system",
              timestamp: serverTimestamp(),
            });
          });
        } finally {
          setAiTyping(false);
        }
      }
    } catch (err) {
      console.error("Error sending message:", err);
      alert("Failed to send message. Please try again.");
      setIsSending(false);
      // Remove last optimistic on error
      setMessages((prev) => prev.filter((m) => !m.optimistic || m.id !== prev[prev.length - 1]?.id));
    }
  };

  // Handle AI choice - add optimistic for user choice and system
  const handleAiChoice = async (choice) => {
    const chatRef = doc(db, "privateChats", chatId);
    const userDisplayName = getAnonName();
    try {
      // Optimistic user choice
      const optChoiceId = `opt-choice-${Date.now()}`;
      setMessages((prev) => [...prev, {
        id: optChoiceId,
        text: choice === "yes" ? "Yes" : "No",
        userId: auth.currentUser.uid,
        displayName: userDisplayName,
        role: "user",
        timestamp: Timestamp.now(),
        read: false,
        optimistic: true,
      }]);

      await runTransaction(db, async (transaction) => {
        const chatSnap = await transaction.get(chatRef);
        if (!chatSnap.exists()) throw new Error("Chat document does not exist");
        transaction.set(doc(collection(chatRef, "messages")), {
          text: choice === "yes" ? "Yes" : "No",
          userId: auth.currentUser.uid,
          displayName: userDisplayName,
          role: "user",
          timestamp: serverTimestamp(),
          read: false,
        });
        if (choice === "yes") {
          transaction.update(chatRef, { aiActive: true, aiOffered: false, needsTherapist: false });
          transaction.set(doc(collection(chatRef, "messages")), {
            text: "You are now chatting with our support assistant until a therapist joins.",
            role: "system",
            timestamp: serverTimestamp(),
          });
          // Optimistic system
          const optSystemId = `opt-system-${Date.now()}`;
          setMessages((prev) => [...prev, {
            id: optSystemId,
            text: "You are now chatting with our support assistant until a therapist joins.",
            role: "system",
            timestamp: Timestamp.now(),
            optimistic: true,
          }]);
          try {
            setAiTyping(true);
            const aiInputMessages = mapMessagesForAI(messages);
            const aiResponse = await getAIResponse("Start conversation", aiInputMessages);
            transaction.set(doc(collection(chatRef, "messages")), {
              text: aiResponse,
              role: "ai",
              displayName: "Support Assistant",
              timestamp: serverTimestamp(),
            });
            // Optimistic AI
            const optAiId = `opt-ai-${Date.now()}`;
            setMessages((prev) => [...prev, {
              id: optAiId,
              text: aiResponse,
              role: "ai",
              displayName: "Support Assistant",
              timestamp: Timestamp.now(),
              optimistic: true,
            }]);
          } catch (err) {
            console.error("AI response error:", err);
            transaction.set(doc(collection(chatRef, "messages")), {
              text: "Sorry, I couldn’t respond right now. Please wait for a therapist.",
              role: "system",
              timestamp: serverTimestamp(),
            });
          }
        } else {
          transaction.update(chatRef, { aiActive: false, aiOffered: false, needsTherapist: true });
          transaction.set(doc(collection(chatRef, "messages")), {
            text: "Okay, please hold on while we connect you to a therapist.",
            role: "system",
            timestamp: serverTimestamp(),
          });
        }
      });
      setAiEnabled(choice === "yes");
    } catch (err) {
      console.error("Error handling AI choice:", err);
      alert("Failed to process AI choice. Please try again.");
      // Remove optimistics on error
      setMessages((prev) => prev.filter((m) => !m.optimistic));
    } finally {
      setAiTyping(false);
    }
  };

  // Toggle reaction
  const toggleReaction = async (msgId, reactionType) => {
    if (!auth.currentUser || !chatId) return;
    const msgRef = doc(db, `privateChats/${chatId}/messages`, msgId);
    try {
      await runTransaction(db, async (transaction) => {
        const msgSnap = await transaction.get(msgRef);
        if (!msgSnap.exists()) return;
        const reactions = msgSnap.data().reactions || {};
        const userId = auth.currentUser.uid;
        const currentReactions = reactions[reactionType] || [];
        const updatedReactions = currentReactions.includes(userId)
          ? currentReactions.filter((id) => id !== userId)
          : [...currentReactions, userId];
        const updated = { ...reactions, [reactionType]: updatedReactions };
        transaction.update(msgRef, { reactions: updated });
      });
    } catch (err) {
      console.error("Error toggling reaction:", err);
      alert("Failed to update reaction. Please try again.");
    }
  };

  // Handle emoji click
  const onEmojiClick = (emojiData) => {
    setNewMessage(newMessage + emojiData.emoji);
    setShowEmojiPicker(false);
  };

  // Handle file change
  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
  };

  // Leave chat
  const leaveChat = async () => {
    if (!chatId || !auth.currentUser) return;
    const chatRef = doc(db, "privateChats", chatId);
    try {
      await runTransaction(db, async (transaction) => {
        const chatSnap = await transaction.get(chatRef);
        if (!chatSnap.exists()) throw new Error("Chat document does not exist");
        transaction.update(chatRef, {
          aiOffered: false,
          aiActive: false,
          therapistJoinedOnce: false,
          participants: arrayRemove(auth.currentUser.uid),
          needsTherapist: true,
        });
        transaction.set(doc(collection(chatRef, "events")), {
          type: "leave",
          user: getAnonName(),
          text: `${getAnonName()} has left the chat.`,
          role: "system",
          timestamp: serverTimestamp(),
        });
      });
      navigate("/chat-room");
    } catch (err) {
      console.error("Error leaving chat:", err);
      alert("Failed to leave chat. Please try again.");
    }
  };

  // Auto-remove on tab close
  useEffect(() => {
    if (!chatId || !auth.currentUser) return;
    let isReloading = false;
    const debouncedLeave = debounce(async () => {
      if (isReloading) return;
      const uid = auth.currentUser.uid;
      const privateChatRef = doc(db, "privateChats", chatId);
      try {
        await runTransaction(db, async (transaction) => {
          const privateChatSnap = await transaction.get(privateChatRef);
          if (privateChatSnap.exists()) {
            transaction.update(privateChatRef, {
              participants: arrayRemove(uid),
              aiOffered: false,
              therapistJoinedOnce: false,
              needsTherapist: true,
            });
            transaction.set(doc(collection(privateChatRef, "events")), {
              type: "leave",
              user: getAnonName(),
              text: `${getAnonName()} has left the chat.`,
              role: "system",
              timestamp: serverTimestamp(),
            });
          }
        });
      } catch (err) {
        console.error("Error auto-leaving chats:", err);
        alert("Failed to auto-leave chats. Please try again.");
      }
    }, 1000);
    const handleBeforeUnload = () => {
      debouncedLeave();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        isReloading = true;
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("visibilitychange", handleVisibilityChange);
      debouncedLeave.cancel();
    };
  }, [chatId]);

  // Fetch therapist name
  useEffect(() => {
    if (!auth.currentUser?.email) return;
    const therapistRef = doc(db, "therapists", auth.currentUser.uid);
    const unsubscribe = onSnapshot(therapistRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setTherapistName(data.name || "Therapist");
      }
    }, (err) => {
      console.error("Error fetching therapist profile:", err);
      alert("Failed to fetch therapist profile. Please try again.");
    });
    return () => unsubscribe();
  }, []);

  // Handle therapist click
  const handleTherapistClick = async (msg) => {
    if (msg.role !== "therapist") return;
    try {
      const snap = await getDoc(doc(db, "therapists", msg.userId));
      if (snap.exists()) setSelectedTherapist({ ...snap.data(), uid: msg.userId });
    } catch (err) {
      console.error("Error fetching therapist profile:", err);
      alert("Failed to fetch therapist profile. Please try again.");
    }
  };

  return (
    <div className="private-chat">
      <div className="detailLeave">
        <h3 className="onlineStatus">
          {/* <span className={`therapist-status ${isTherapistAvailable ? "" : "offline"}`}></span> */}
          {isTherapistAvailable
            ? `Therapist Online: ${activeTherapists.join(", ")}`
            : "Waiting for Therapist"}
        </h3>
        <div className="leave-participant">
          <button className="exit-chat-button" onClick={leaveChat} disabled={isSending || aiTyping}>
            Exit Chat
          </button>         
        </div>
      </div>
      {selectedTherapist && (
        <div className="therapist-profile-card">
          <button onClick={() => setSelectedTherapist(null)} disabled={isSending || aiTyping}>
            Back
          </button>
          <h4>{selectedTherapist.name}</h4>
          <p>{selectedTherapist.profile}</p>
        </div>
      )}
      <div className="chat-container">
        {combinedChat.map((msg) => (
          <div key={msg.id}>
            {msg.type === "ai-offer" && chatData?.aiOffered && !aiEnabled && msg.role === "system" ? (
              <div className="ai-offer">
                <p className="chat-message system"><em>{msg.text}</em></p>
                <button onClick={() => handleAiChoice("yes")} disabled={isSending || aiTyping}>
                  Yes
                </button>
                <button onClick={() => handleAiChoice("no")} disabled={isSending || aiTyping}>
                  No
                </button>
              </div>
            ) : (
              <p
                className={`chat-message ${
                  msg.role === "therapist"
                    ? "therapist"
                    : msg.role === "system"
                    ? "system"
                    : msg.role === "ai"
                    ? "ai"
                    : "user"
                } ${msg.role === "user" && msg.read ? "read" : ""}`}
                onClick={() => handleTherapistClick(msg)}
              >
                {msg.role === "system" ? (
                  <em>{msg.text}</em>
                ) : msg.role === "ai" ? (
                  <>
                    <strong>{msg.displayName || msg.role}:</strong>
                    <div className="message-content-time">
                      {msg.text.split("\n\n").map((part, index) => (
                        <span
                          key={index}
                          className={index === 0 ? "ai-user-quote" : "ai-response"}
                        >
                          {part}
                        </span>
                      ))}
                      {msg.fileUrl && (
                        <a
                          href={msg.fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="attachment-link"
                        >
                          <i className="fa-solid fa-paperclip"></i> View Attachment
                        </a>
                      )}
                      <span className="message-timestamp">
                        {formatMessageTime(msg.timestamp)}
                      </span>
                      <span className="message-reactions">
                        <i
                          className="fa-solid fa-heart reaction"
                          style={{ color: msg.reactions?.heart?.length > 0 ? "red" : "gray" }}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleReaction(msg.id, "heart");
                          }}
                        >
                          {msg.reactions?.heart?.length || 0}
                        </i>
                        <i
                          className="fa-solid fa-thumbs-up reaction"
                          style={{ color: msg.reactions?.thumbsUp?.length > 0 ? "blue" : "gray" }}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleReaction(msg.id, "thumbsUp");
                          }}
                        >
                          {msg.reactions?.thumbsUp?.length || 0}
                        </i>
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <strong>{msg.displayName || msg.role}:</strong>
                    <div className="message-content-time">
                      <span>{msg.text}</span>
                      {msg.fileUrl && (
                        <a
                          href={msg.fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="attachment-link"
                        >
                          <i className="fa-solid fa-paperclip"></i> View Attachment
                        </a>
                      )}
                      <span className="message-timestamp">
                        {formatMessageTime(msg.timestamp)}
                      </span>
                      <span className="message-reactions">
                        <i
                          className="fa-solid fa-heart reaction"
                          style={{ color: msg.reactions?.heart?.length > 0 ? "red" : "gray" }}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleReaction(msg.id, "heart");
                          }}
                        >
                          {msg.reactions?.heart?.length || 0}
                        </i>
                        <i
                          className="fa-solid fa-thumbs-up reaction"
                          style={{ color: msg.reactions?.thumbsUp?.length > 0 ? "blue" : "gray" }}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleReaction(msg.id, "thumbsUp");
                          }}
                        >
                          {msg.reactions?.thumbsUp?.length || 0}
                        </i>
                      </span>
                    </div>
                  </>
                )}
              </p>
            )}
          </div>
        ))}
        {typingUsers.length > 0 && (
          <p className="typing-indicator">
            {typingUsers.join(", ")} {typingUsers.length === 1 ? "is" : "are"} typing...
          </p>
        )}
        {aiTyping && (
          <p className="typing-indicator ai-typing">
            Support Assistant is typing...
          </p>
        )}
        <div ref={messagesEndRef} />
      </div>
      <div className="chat-input">
        <button
          className="emoji-btn"
          onClick={() => setShowEmojiPicker(!showEmojiPicker)}
          disabled={isSending || aiTyping}
        >
          <i className="fa-regular fa-face-smile"></i>
        </button>
        {showEmojiPicker && <EmojiPicker onEmojiClick={onEmojiClick} />}
        <input
          type="file"
          id="private-file-upload"
          style={{ display: "none" }}
          onChange={handleFileChange}
        />
        <button
          className="attach-btn"
          onClick={() => document.getElementById("private-file-upload").click()}
          disabled={isSending || aiTyping}
        >
          <i className="fa-solid fa-paperclip"></i>
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
          disabled={isSending || aiTyping}
        />
        <button className="send-btn" onClick={sendMessage} disabled={isSending || aiTyping}>
          {isSending ? "Sending..." : <i className="fa-solid fa-paper-plane"></i>}
        </button>
      </div>
    </div>
  );
}

export default PrivateChat;