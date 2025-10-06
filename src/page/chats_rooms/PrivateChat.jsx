import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { db, auth } from "../../utils/firebase";
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
  increment,
  getDoc,
  arrayRemove,
  limit,
  writeBatch,
} from "firebase/firestore";
import { debounce } from "lodash"; // Added import for debounce
import "./privateChat.css";

const logFirestoreOperation = (operation, count, details) => {
  console.log(`Firestore ${operation}: ${count} documents`, details);
};

function PrivateChat({ chatId }) {
  const [messages, setMessages] = useState([]);
  const [events, setEvents] = useState([]);
  const [isTherapistAvailable, setIsTherapistAvailable] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [aiTyping, setAiTyping] = useState(false);
  const [newMessage, setNewMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [activeTherapists, setActiveTherapists] = useState([]);
  const [selectedTherapist, setSelectedTherapist] = useState(null);
  const [therapistName, setTherapistName] = useState("Therapist");
  const [chatData, setChatData] = useState(null);
  const [chatLoaded, setChatLoaded] = useState(false);
  const [therapistsLoaded, setTherapistsLoaded] = useState(false);
  const [prevParticipants, setPrevParticipants] = useState([]);
  const [hasOfferedNoTherapist, setHasOfferedNoTherapist] = useState(false);
  const [hasOfferedNoJoin, setHasOfferedNoJoin] = useState(false);
  const [lastJoinEvent, setLastJoinEvent] = useState(null);
  const [lastLeaveEvent, setLastLeaveEvent] = useState(null);
  const messagesEndRef = useRef(null);
  const noJoinTimerRef = useRef(null);
  const navigate = useNavigate();

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

  // Watch therapist presence globally
  useEffect(() => {
    const q = query(collection(db, "therapistsOnline"), limit(50));
    const unsub = onSnapshot(q, (snap) => {
      const onlineTherapists = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((t) => t.online);
      logFirestoreOperation("read", snap.docs.length, { collection: "therapistsOnline" });
      setIsTherapistAvailable(onlineTherapists.length > 0);
      setActiveTherapists(onlineTherapists.map((t) => t.name || "Therapist"));
      setTherapistsLoaded(true);
    }, (err) => {
      console.error("Error fetching therapists online:", err);
      if (err.code === "resource-exhausted") {
        alert("Firestore quota exceeded. Please try again later.");
      }
    });
    return () => unsub();
  }, []);

  // Watch messages for rendering
  useEffect(() => {
    if (!chatId) return;
    const chatRef = doc(db, "privateChats", chatId);
    const q = query(collection(chatRef, "messages"), orderBy("timestamp"), limit(50));
    const unsubscribeMessages = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      logFirestoreOperation("read", snapshot.docs.length, { collection: `privateChats/${chatId}/messages` });
      setMessages(msgs);
    }, (err) => {
      console.error("Error fetching messages:", err);
      if (err.code === "resource-exhausted") {
        alert("Firestore quota exceeded. Please try again later.");
      }
    });
    return () => unsubscribeMessages();
  }, [chatId]);

  // Subscribe to events collection
  useEffect(() => {
    if (!chatId) return;
    const chatRef = doc(db, "privateChats", chatId);
    const q = query(collection(chatRef, "events"), orderBy("timestamp"), limit(50));
    const unsubscribeEvents = onSnapshot(q, (snapshot) => {
      const evts = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      logFirestoreOperation("read", snapshot.docs.length, { collection: `privateChats/${chatId}/events` });
      setEvents(evts);
    }, (err) => {
      console.error("Error fetching events:", err);
      if (err.code === "resource-exhausted") {
        alert("Firestore quota exceeded. Please try again later.");
      }
    });
    return () => unsubscribeEvents();
  }, [chatId]);

  // Watch chat document and handle join/leave events
  useEffect(() => {
    if (!chatId) return;
    const chatRef = doc(db, "privateChats", chatId);
    const unsubscribeChat = onSnapshot(chatRef, (snap, error) => {
      if (error) {
        console.error("Error in chat snapshot:", error);
        if (error.code === "resource-exhausted") {
          alert("Firestore quota exceeded. Please try again later.");
        }
        return;
      }
      if (!snap.exists()) {
        console.log("Chat document deleted or not found, navigating to chat room");
        navigate("/chat_room");
        return;
      }
      const data = snap.data();
      logFirestoreOperation("read", 1, { collection: "privateChats", doc: chatId });
      setChatData(data);
      setAiEnabled(data.aiActive || false);
      setChatLoaded(true);
      const currentParticipants = data.participants || [];
      const userId = auth.currentUser?.uid;
      const prevSet = new Set(prevParticipants);
      const currentSet = new Set(currentParticipants);
      const therapistJoined = currentParticipants.some(
        (uid) => uid !== userId && !prevSet.has(uid)
      );
      const therapistLeft = prevParticipants.some(
        (uid) => uid !== userId && !currentSet.has(uid)
      );
      const now = Date.now();
      const lastJoinEventTime = data.lastJoinEvent || 0;
      const lastLeaveEventTime = data.lastLeaveEvent || 0;
      if (therapistJoined && (!lastJoinEvent || now - lastJoinEvent > 2000) && now > lastJoinEventTime) {
        const batch = writeBatch(db);
        batch.update(chatRef, {
          therapistJoinedOnce: true,
          aiActive: false,
          aiOffered: false,
        });
        batch.set(collection(chatRef, "events"), {
          text: "A therapist has joined. You can now continue your conversation with them.",
          role: "system",
          timestamp: serverTimestamp(),
        });
        batch.commit().catch((err) => {
          console.error("Error updating on join:", err);
          if (err.code === "resource-exhausted") {
            alert("Firestore quota exceeded. Please try again later.");
          }
        });
        setLastJoinEvent(now);
        setHasOfferedNoTherapist(false);
        setHasOfferedNoJoin(false);
      }
      if (
        therapistLeft &&
        data.therapistJoinedOnce &&
        (!lastLeaveEvent || now - lastLeaveEvent > 2000) &&
        now > lastLeaveEventTime &&
        !data.lastLeaveAiOffered
      ) {
        const batch = writeBatch(db);
        batch.set(collection(chatRef, "messages"), {
          text: "Your therapist has left the chat. Would you like to continue chatting with our support assistant?",
          role: "system",
          type: "ai-offer",
          timestamp: serverTimestamp(),
        });
        batch.update(chatRef, {
          aiOffered: true,
          therapistJoinedOnce: false,
          lastLeaveEvent: now,
          lastLeaveAiOffered: now,
        });
        batch.commit().catch((err) => {
          console.error("Error updating on leave:", err);
          if (err.code === "resource-exhausted") {
            alert("Firestore quota exceeded. Please try again later.");
          }
        });
        setLastLeaveEvent(now);
      }
      setPrevParticipants(currentParticipants);
    }, (err) => {
      console.error("Error fetching chat data:", err);
      if (err.code === "resource-exhausted") {
        alert("Firestore quota exceeded. Please try again later.");
      }
    });
    return () => unsubscribeChat();
  }, [chatId, prevParticipants, lastJoinEvent, lastLeaveEvent, navigate]);

  // Initial AI offer if no therapists online
  useEffect(() => {
    if (!chatLoaded || !therapistsLoaded || !chatData || hasOfferedNoTherapist || messages.length === 0) return;
    const { participants, aiOffered, therapistJoinedOnce } = chatData;
    const therapistPresent = participants.some((uid) => uid !== auth.currentUser?.uid);
    if (!therapistPresent && !aiOffered && !therapistJoinedOnce && !isTherapistAvailable) {
      const offerAI = async () => {
        setHasOfferedNoTherapist(true);
        const chatRef = doc(db, "privateChats", chatId);
        const batch = writeBatch(db);
        batch.update(chatRef, { aiOffered: true });
        batch.set(collection(chatRef, "messages"), {
          text: "No therapist is online right now. Would you like to chat with our support assistant while you wait?",
          role: "system",
          type: "ai-offer",
          timestamp: serverTimestamp(),
        });
        await batch.commit();
        logFirestoreOperation("write", 2, { collection: "privateChats", subcollection: "messages" });
      };
      offerAI().catch((err) => {
        console.error("Error offering AI:", err);
        if (err.code === "resource-exhausted") {
          alert("Firestore quota exceeded. Please try again later.");
        }
      });
    }
  }, [chatLoaded, therapistsLoaded, chatData, hasOfferedNoTherapist, isTherapistAvailable, chatId, messages]);

  // Combine messages and events for rendering
  const combinedChat = [...messages, ...events].sort((a, b) => {
    const t1 = a.timestamp?.toMillis ? a.timestamp.toMillis() : 0;
    const t2 = b.timestamp?.toMillis ? b.timestamp.toMillis() : 0;
    return t1 - t2;
  });

  const displayName = auth.currentUser?.email ? therapistName : getAnonName();
  const { typingUsers, handleTyping } = useTypingStatus(displayName);

  // Send message
  const sendMessage = async () => {
    if (!newMessage.trim() || !auth.currentUser || !chatId) return;
    setIsSending(true);
    const role = auth.currentUser.email ? "therapist" : "user";
    const nameToUse = role === "therapist" ? therapistName : getAnonName();
    const chatRef = doc(db, "privateChats", chatId);
    const batch = writeBatch(db);
    batch.set(collection(chatRef, "messages"), {
      text: newMessage,
      userId: auth.currentUser.uid,
      displayName: nameToUse,
      role,
      timestamp: serverTimestamp(),
    });
    batch.update(chatRef, {
      lastMessage: newMessage,
      lastUpdated: serverTimestamp(),
      unreadCountForTherapist: role === "therapist" ? 0 : increment(1),
    });
    try {
      await batch.commit();
      logFirestoreOperation("write", 2, { collection: "privateChats", subcollection: "messages" });
    } catch (err) {
      console.error("Error sending message:", err);
      if (err.code === "resource-exhausted") {
        alert("Firestore quota exceeded. Please try again later.");
      }
      return;
    }
    const userMessage = newMessage;
    setNewMessage("");
    const chatSnap = await getDoc(chatRef);
    logFirestoreOperation("read", 1, { collection: "privateChats", doc: chatId });
    if (!chatSnap.exists()) {
      console.error("Chat document does not exist");
      return;
    }
    const data = chatSnap.data();
    const therapistInChat = data.participants.some((uid) => uid !== auth.currentUser?.uid);
    if (isTherapistAvailable && !therapistInChat && !hasOfferedNoJoin && !data.aiOffered && !data.therapistJoinedOnce) {
      setHasOfferedNoJoin(true);
      noJoinTimerRef.current = setTimeout(async () => {
        const latestSnap = await getDoc(chatRef);
        logFirestoreOperation("read", 1, { collection: "privateChats", doc: chatId });
        if (!latestSnap.exists()) return;
        const latestData = latestSnap.data();
        const latestTherapistInChat = latestData.participants.some((uid) => uid !== auth.currentUser?.uid);
        if (!latestTherapistInChat && !latestData.aiOffered && !latestData.therapistJoinedOnce) {
          const batch = writeBatch(db);
          batch.update(chatRef, { aiOffered: true });
          batch.set(collection(chatRef, "messages"), {
            text: "No therapist has joined yet. Would you like to chat with our support assistant while you wait?",
            role: "system",
            type: "ai-offer",
            timestamp: serverTimestamp(),
          });
          await batch.commit();
          logFirestoreOperation("write", 2, { collection: "privateChats", subcollection: "messages" });
        }
      }, 7000);
    }
    if (data.aiActive && !therapistInChat) {
      try {
        setAiTyping(true);
        const aiInputMessages = mapMessagesForAI(messages);
        const aiResponse = await getAIResponse(userMessage, aiInputMessages);
        const aiBatch = writeBatch(db);
        aiBatch.set(collection(chatRef, "messages"), {
          text: aiResponse,
          role: "ai",
          displayName: "Support Assistant",
          timestamp: serverTimestamp(),
        });
        await aiBatch.commit();
        logFirestoreOperation("write", 1, { collection: "privateChats", subcollection: "messages" });
      } catch (err) {
        console.error("AI response error:", err);
        const errorBatch = writeBatch(db);
        errorBatch.set(collection(chatRef, "messages"), {
          text: "Sorry, I couldn’t respond right now. Please wait for a therapist.",
          role: "system",
          timestamp: serverTimestamp(),
        });
        await errorBatch.commit();
        logFirestoreOperation("write", 1, { collection: "privateChats", subcollection: "messages" });
      } finally {
        setAiTyping(false);
      }
    }
    setIsSending(false);
  };

  // Handle AI choice
  const handleAiChoice = async (choice) => {
    const chatRef = doc(db, "privateChats", chatId);
    const userDisplayName = getAnonName();
    const batch = writeBatch(db);
    batch.set(collection(chatRef, "messages"), {
      text: choice === "yes" ? "Yes" : "No",
      userId: auth.currentUser.uid,
      displayName: userDisplayName,
      role: "user",
      timestamp: serverTimestamp(),
    });
    if (choice === "yes") {
      batch.update(chatRef, { aiActive: true, aiOffered: false });
      batch.set(collection(chatRef, "messages"), {
        text: "You are now chatting with our support assistant until a therapist joins.",
        role: "system",
        timestamp: serverTimestamp(),
      });
      try {
        setAiTyping(true);
        const aiInputMessages = mapMessagesForAI(messages);
        const aiResponse = await getAIResponse("Start conversation", aiInputMessages);
        batch.set(collection(chatRef, "messages"), {
          text: aiResponse,
          role: "ai",
          displayName: "Support Assistant",
          timestamp: serverTimestamp(),
        });
      } catch (err) {
        console.error("AI response error:", err);
        batch.set(collection(chatRef, "messages"), {
          text: "Sorry, I couldn’t respond right now. Please wait for a therapist.",
          role: "system",
          timestamp: serverTimestamp(),
        });
      }
    } else {
      batch.update(chatRef, { aiActive: false, aiOffered: false });
      batch.set(collection(chatRef, "messages"), {
        text: "Okay, please hold on while we connect you to a therapist.",
        role: "system",
        timestamp: serverTimestamp(),
      });
    }
    try {
      await batch.commit();
      logFirestoreOperation("write", choice === "yes" ? 3 : 2, { collection: "privateChats", subcollection: "messages" });
      setAiEnabled(choice === "yes");
    } catch (err) {
      console.error("Error handling AI choice:", err);
      if (err.code === "resource-exhausted") {
        alert("Firestore quota exceeded. Please try again later.");
      }
    } finally {
      setAiTyping(false);
    }
  };

  // Anonymous exit button
  const leaveChat = async () => {
    if (!chatId || !auth.currentUser) return;
    const chatRef = doc(db, "privateChats", chatId);
    const batch = writeBatch(db);
    batch.update(chatRef, {
      aiOffered: false,
      aiActive: false,
      therapistJoinedOnce: false,
      participants: arrayRemove(auth.currentUser.uid),
    });
    batch.set(collection(chatRef, "events"), {
      type: "leave",
      user: getAnonName(),
      text: `${getAnonName()} has left the chat.`,
      role: "system",
      timestamp: serverTimestamp(),
    });
    try {
      await batch.commit();
      logFirestoreOperation("write", 2, { collection: "privateChats", subcollection: "events" });
      setHasOfferedNoJoin(false);
      setHasOfferedNoTherapist(false);
      localStorage.removeItem(`therapist_${auth.currentUser.uid}`); // Clear cache on exit
      navigate("/chat_room");
    } catch (err) {
      console.error("Error leaving chat:", err);
      if (err.code === "resource-exhausted") {
        alert("Firestore quota exceeded. Please try again later.");
      }
    }
  };

  // Anonymous remove on tab close
  useEffect(() => {
    if (!chatId || !auth.currentUser) return;
    let isReloading = false;
    const debouncedLeave = debounce(async () => {
      if (isReloading) return;
      const uid = auth.currentUser.uid;
      const privateChatRef = doc(db, "privateChats", chatId);
      const groupChatRef = doc(db, "groupChats", "mainGroup");
      const batch = writeBatch(db);
      batch.update(privateChatRef, {
        participants: arrayRemove(uid),
        aiOffered: false,
        therapistJoinedOnce: false,
      });
      batch.set(collection(privateChatRef, "events"), {
        type: "leave",
        user: getAnonName(),
        text: `${getAnonName()} has left the chat.`,
        role: "system",
        timestamp: serverTimestamp(),
      });
      batch.update(groupChatRef, {
        participants: arrayRemove(uid),
      });
      batch.set(collection(groupChatRef, "events"), {
        type: "leave",
        user: getAnonName(),
        text: `${getAnonName()} has left the chat.`,
        role: "system",
        timestamp: serverTimestamp(),
      });
      try {
        await batch.commit();
        logFirestoreOperation("write", 4, { collections: ["privateChats", "groupChats"], subcollections: ["events"] });
        localStorage.removeItem(`therapist_${uid}`); // Clear cache on tab close
      } catch (err) {
        console.error("Error auto-leaving chats:", err);
        if (err.code === "resource-exhausted") {
          alert("Firestore quota exceeded. Please try again later.");
        }
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

  // Fetch therapist name if logged in as therapist with real-time updates
  useEffect(() => {
    if (!auth.currentUser?.email) return;
    const therapistRef = doc(db, "therapists", auth.currentUser.uid);
    const unsubscribe = onSnapshot(therapistRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setTherapistName(data.name || "Therapist");
        localStorage.setItem(`therapist_${auth.currentUser.uid}`, JSON.stringify({
          ...data,
          cacheTimestamp: Date.now()
        }));
        logFirestoreOperation("read", 1, { collection: "therapists", doc: auth.currentUser.uid });
      } else {
        setTherapistName("Therapist");
        localStorage.setItem(`therapist_${auth.currentUser.uid}`, JSON.stringify({
          name: "Therapist",
          gender: "",
          position: "",
          profile: "",
          rating: 0,
          cacheTimestamp: Date.now()
        }));
      }
    }, (err) => {
      console.error("Error fetching therapist profile:", err);
      if (err.code === "resource-exhausted") {
        alert("Firestore quota exceeded. Please try again later.");
      }
    });
    return () => unsubscribe();
  }, []);

  // Handle therapist profile click
  const handleTherapistClick = async (msg) => {
    if (msg.role !== "therapist") return;
    try {
      const snap = await getDoc(doc(db, "therapists", msg.userId));
      logFirestoreOperation("read", 1, { collection: "therapists", doc: msg.userId });
      if (snap.exists()) setSelectedTherapist(snap.data());
    } catch (err) {
      console.error("Error fetching therapist profile:", err);
      if (err.code === "resource-exhausted") {
        alert("Firestore quota exceeded. Please try again later.");
      }
    }
  };

  return (
    <div className="private-chat">
      <h3>
        Anonymous Chat{" "}
        {isTherapistAvailable
          ? `(Therapist Online: ${activeTherapists.join(", ")})`
          : "(Waiting for Therapist)"}
      </h3>
      <button className="exit-chat-button" onClick={leaveChat}>
        Exit Chat
      </button>
      {selectedTherapist && (
        <div className="therapist-profile-card">
          <button onClick={() => setSelectedTherapist(null)}>⬅ Back</button>
          <h4>{selectedTherapist.name}</h4>
          <p>{selectedTherapist.profile}</p>
        </div>
      )}
      <div className="chat-container">
        {combinedChat.map((msg) => (
          <div key={msg.id}>
            {msg.type === "ai-offer" &&
            (chatData?.aiOffered || msg.text.includes("Would you like to continue chatting with our support assistant?")) &&
            !aiEnabled &&
            msg.role === "system" ? (
              <div className="ai-offer">
                <p className="system-message"><em>{msg.text}</em></p>
                <button onClick={() => handleAiChoice("yes")}>Yes</button>
                <button onClick={() => handleAiChoice("no")}>No</button>
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
                }`}
                onClick={() => (msg.role === "therapist" ? handleTherapistClick(msg) : null)}
              >
                {msg.role === "system" ? (
                  <em>{msg.text}</em>
                ) : (
                  <>
                    <strong>{msg.displayName || msg.role}:</strong> {msg.text}
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
        <input
          type="text"
          value={newMessage}
          onChange={(e) => {
            setNewMessage(e.target.value);
            handleTyping(e.target.value);
          }}
          placeholder="Type a message..."
        />
        <button onClick={sendMessage} disabled={isSending}>
          {isSending ? "Sending..." : "Send"}
        </button>
      </div>
    </div>
  );
}

export default PrivateChat;