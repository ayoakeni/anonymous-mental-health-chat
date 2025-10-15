import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { db, auth, storage, ref, uploadBytes, getDownloadURL } from "../../utils/firebase";
import { getAnonName } from "../../login/anonymous_login";
import { useTypingStatus } from "../../components/useTypingStatus";
import { getAIResponse } from "../../utils/AiChatIntegration";
import { mapMessagesForAI } from "../../utils/aiMessageMapper";
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
} from "firebase/firestore";
import { debounce } from "lodash";
import EmojiPicker from "emoji-picker-react";
import "../../styles/privateChat.css";
import Notification from "../../sounds/notification.mp3"

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
  const [prevParticipants, setPrevParticipants] = useState([]);
  const [hasOfferedNoTherapist, setHasOfferedNoTherapist] = useState(false);
  const [lastJoinEvent, setLastJoinEvent] = useState(null);
  const [lastLeaveEvent, setLastLeaveEvent] = useState(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [file, setFile] = useState(null);
  const [notificationSound, setNotificationSound] = useState(null);
  const messagesEndRef = useRef(null);
  const noJoinTimerRef = useRef(null);
  const navigate = useNavigate();

  // Load notification sound
  useEffect(() => {
    const audio = new Audio(Notification);
    setNotificationSound(audio);
  }, []);

  // Auto-scroll chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, events]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (noJoinTimerRef.current) {
        clearTimeout(noJoinTimerRef.current);
        noJoinTimerRef.current = null;
      }
    };
  }, []);

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

  // Watch messages
  useEffect(() => {
    if (!chatId) return;
    const chatRef = doc(db, "privateChats", chatId);
    const q = query(collection(chatRef, "messages"), orderBy("timestamp"), limit(50));
    const unsubscribeMessages = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setMessages(msgs);
      // Play notification sound for new messages
      if (msgs.length > 0 && notificationSound) {
        notificationSound.play().catch((err) => console.error("Audio play error:", err));
      }
    }, (err) => {
      console.error("Error fetching messages:", err);
      alert("Failed to load messages. Please try again.");
    });
    return () => unsubscribeMessages();
  }, [chatId, notificationSound]);

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

  // Watch chat document
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

      const currentParticipants = data.participants || [];
      const userId = auth.currentUser?.uid;
      const prevSet = new Set(prevParticipants);
      const currentSet = new Set(currentParticipants);
      const now = Date.now();
      const lastJoinEventTime = data.lastJoinEvent || 0;
      const lastLeaveEventTime = data.lastLeaveEvent || 0;

      const therapistJoined = currentParticipants.some(
        (uid) => uid !== userId && !prevSet.has(uid)
      );
      const therapistLeft = prevParticipants.some(
        (uid) => uid !== userId && !currentSet.has(uid)
      );

      if (therapistJoined && (!lastJoinEvent || now - lastJoinEvent > 2000) && now > lastJoinEventTime) {
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
        if (notificationSound) {
          notificationSound.play().catch((err) => console.error("Audio play error:", err));
        }
        setLastJoinEvent(now);
        setHasOfferedNoTherapist(false);
      }

      if (
        therapistLeft &&
        data.therapistJoinedOnce &&
        (!lastLeaveEvent || now - lastLeaveEvent > 2000) &&
        now > lastLeaveEventTime &&
        !data.lastLeaveAiOffered
      ) {
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
        setLastLeaveEvent(now);
      }

      // Only update prevParticipants if it has actually changed
      if (JSON.stringify(prevParticipants) !== JSON.stringify(currentParticipants)) {
        setPrevParticipants(currentParticipants);
      }
    }, (err) => {
      console.error("Error fetching chat data:", err);
      navigate("/chat-room");
    });
    return () => unsubscribeChat();
  }, [chatId, navigate, prevParticipants, lastJoinEvent, lastLeaveEvent, notificationSound]);

  // Chat History Persistence
  // useEffect(() => {
  //   if (!chatId) return;
  //   const savedHistory = JSON.parse(localStorage.getItem(`privateChat_${chatId}`)) || [];
  //   setMessages((prev) => [...savedHistory, ...prev.filter((msg) => !savedHistory.some((s) => s.id === msg.id))]);
  //   return () => {
  //     localStorage.setItem(`privateChat_${chatId}`, JSON.stringify(messages));
  //   };
  // }, [chatId]);

  // Initial AI offer
  useEffect(() => {
    if (!chatLoaded || !therapistsLoaded || !chatData || hasOfferedNoTherapist || messages.length === 0) return;
    const { participants, aiOffered, therapistJoinedOnce, needsTherapist } = chatData;
    const therapistPresent = participants.some((uid) => uid !== auth.currentUser?.uid);
    if (!therapistPresent && !aiOffered && !therapistJoinedOnce && needsTherapist && !isTherapistAvailable) {
      const offerAI = async () => {
        setHasOfferedNoTherapist(true);
        const chatRef = doc(db, "privateChats", chatId);
        try {
          await runTransaction(db, async (transaction) => {
            const chatSnap = await transaction.get(chatRef);
            if (!chatSnap.exists()) throw new Error("Chat document does not exist");
            transaction.update(chatRef, { aiOffered: true, needsTherapist: true });
            transaction.set(doc(collection(chatRef, "messages")), {
              text: "No therapist is online right now. Would you like to chat with our support assistant while you wait?",
              role: "system",
              type: "ai-offer",
              timestamp: serverTimestamp(),
            });
          });
        } catch (err) {
          console.error("Error offering AI:", err);
          alert("Failed to offer AI assistant. Please try again.");
        }
      };
      offerAI();
    }
  }, [chatLoaded, therapistsLoaded, chatData, hasOfferedNoTherapist, isTherapistAvailable, chatId, messages]);

  // Combine messages and events
  const combinedChat = [...messages, ...events].sort((a, b) => {
    const t1 = a.timestamp?.toMillis ? a.timestamp.toMillis() : 0;
    const t2 = b.timestamp?.toMillis ? b.timestamp.toMillis() : 0;
    return t1 - t2;
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
      await runTransaction(db, async (transaction) => {
        const chatSnap = await transaction.get(chatRef);
        if (!chatSnap.exists()) throw new Error("Chat document does not exist");
        const data = chatSnap.data();
        const hasTherapist = data.participants?.some((uid) => uid !== auth.currentUser.uid) || false;
        const needsTherapist = !hasTherapist && role !== "therapist";
        let messageText = newMessage;
        if (role === "user" && newMessage.toLowerCase().includes("@ai")) {
          messageText = `You said: "${newMessage.replace(/@ai/gi, "").trim()}"\n\n`;
        }
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

      const chatSnap = await getDoc(chatRef);
      if (!chatSnap.exists()) {
        navigate("/chat-room");
        return;
      }
      const data = chatSnap.data();
      const therapistInChat = data.participants?.some((uid) => uid !== auth.currentUser?.uid) || false;
      if (newMessage.toLowerCase().includes("@ai") && !therapistInChat) {
        try {
          setAiTyping(true);
          const aiInputMessages = mapMessagesForAI(messages);
          const aiResponse = await getAIResponse(userMessage, aiInputMessages);
          await runTransaction(db, async (transaction) => {
            const chatSnap = await transaction.get(chatRef);
            if (!chatSnap.exists()) throw new Error("Chat document does not exist");
            transaction.set(doc(collection(chatRef, "messages")), {
              text: `You said: "${userMessage}"\n\n${aiResponse}`,
              role: "ai",
              displayName: "Support Assistant",
              timestamp: serverTimestamp(),
              fileUrl: null,
              reactions: {},
            });
          });
        } catch (err) {
          console.error("AI response error:", err);
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
      } else if (data.aiActive && !therapistInChat) {
        try {
          setAiTyping(true);
          const aiInputMessages = mapMessagesForAI(messages);
          const aiResponse = await getAIResponse(userMessage, aiInputMessages);
          await runTransaction(db, async (transaction) => {
            const chatSnap = await transaction.get(chatRef);
            if (!chatSnap.exists()) throw new Error("Chat document does not exist");
            transaction.set(doc(collection(chatRef, "messages")), {
              text: `You said: "${userMessage}"\n\n${aiResponse}`,
              role: "ai",
              displayName: "Support Assistant",
              timestamp: serverTimestamp(),
              fileUrl: null,
              reactions: {},
            });
          });
        } catch (err) {
          console.error("AI response error:", err);
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
    }
  };

  // Handle AI choice
  const handleAiChoice = async (choice) => {
    const chatRef = doc(db, "privateChats", chatId);
    const userDisplayName = getAnonName();
    try {
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
        <h3>
          Anonymous Chat{" "}
          <span className={`therapist-status ${isTherapistAvailable ? "" : "offline"}`}></span>
          {isTherapistAvailable
            ? `(Therapist Online: ${activeTherapists.join(", ")})`
            : "(Waiting for Therapist)"}
        </h3>
        <button className="exit-chat-button" onClick={leaveChat} disabled={isSending || aiTyping}>
          Exit Chat
        </button>
      </div>
      <div className="therapist-list">
        {therapistsOnline.map((therapist) => (
          <div
            key={therapist.uid}
            className={`therapist-item ${therapist.online ? "online" : ""} ${
              selectedTherapist?.uid === therapist.uid ? "active" : ""
            }`}
            onClick={() => handleTherapistClick({ userId: therapist.uid, role: "therapist" })}
          >
            <span className="therapist-avatar">{therapist.name?.[0] || "T"}</span>
            {therapist.name}
          </div>
        ))}
      </div>
      {selectedTherapist && (
        <div className="therapist-profile-card">
          <button onClick={() => setSelectedTherapist(null)} disabled={isSending || aiTyping}>
            ⬅ Back
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
                        {msg.timestamp?.toDate().toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
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
                        {msg.timestamp?.toDate().toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
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