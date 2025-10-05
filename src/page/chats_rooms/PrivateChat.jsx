import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { db, auth } from "../../utils/firebase";
import { getAnonName } from "../../login/anonymous_login";
import { useTypingStatus } from "../../components/useTypingStatus";
import { getAIResponse } from "../../utils/AiChatIntegration";
import { mapMessagesForAI } from "../../utils/aiMessageMapper";
import {
  collection,
  addDoc,
  onSnapshot,
  serverTimestamp,
  query,
  orderBy,
  doc,
  updateDoc,
  increment,
  getDoc,
  arrayRemove,
} from "firebase/firestore";

function PrivateChat({ chatId }) {
  const [messages, setMessages] = useState([]);
  const [events, setEvents] = useState([]);
  const [isTherapistAvailable, setIsTherapistAvailable] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [aiTyping, setAiTyping] = useState(false);
  const [newMessage, setNewMessage] = useState("");
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
    const unsub = onSnapshot(collection(db, "therapistsOnline"), (snap) => {
      const onlineTherapists = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((t) => t.online);

      setIsTherapistAvailable(onlineTherapists.length > 0);
      setActiveTherapists(onlineTherapists.map((t) => t.name || "Therapist"));
      setTherapistsLoaded(true);
    });

    return () => unsub();
  }, []);

  // Watch messages for rendering
  useEffect(() => {
    if (!chatId) return;
    const chatRef = doc(db, "privateChats", chatId);
    const q = query(collection(chatRef, "messages"), orderBy("timestamp"));

    const unsubscribeMessages = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setMessages(msgs);
    });

    return () => unsubscribeMessages();
  }, [chatId]);

  // Subscribe to events collection
  useEffect(() => {
    if (!chatId) return;
    const chatRef = doc(db, "privateChats", chatId);
    const q = query(collection(chatRef, "events"), orderBy("timestamp"));

    const unsubscribeEvents = onSnapshot(q, (snapshot) => {
      const evts = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setEvents(evts);
    });

    return () => unsubscribeEvents();
  }, [chatId]);

  // Watch chat document and handle join/leave events
  useEffect(() => {
    if (!chatId) return;
    const chatRef = doc(db, "privateChats", chatId);

    const unsubscribeChat = onSnapshot(chatRef, (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      setChatData(data);
      setAiEnabled(data.aiActive || false);
      setChatLoaded(true);

      const currentParticipants = data.participants || [];
      const userId = auth.currentUser?.uid;

      // Compare with prevParticipants to detect changes
      const prevSet = new Set(prevParticipants);
      const currentSet = new Set(currentParticipants);

      // Detect therapist join
      const therapistJoined = currentParticipants.some(
        (uid) => uid !== userId && !prevSet.has(uid)
      );

      // Detect therapist leave
      const therapistLeft = prevParticipants.some(
        (uid) => uid !== userId && !currentSet.has(uid)
      );

      const now = Date.now();
      const lastJoinEventTime = data.lastJoinEvent || 0;
      const lastLeaveEventTime = data.lastLeaveEvent || 0;

      // Handle join (rely on TherapistDashboard to log join event)
      if (therapistJoined && (!lastJoinEvent || now - lastJoinEvent > 2000) && now > lastJoinEventTime) {
        setLastJoinEvent(now);
        setHasOfferedNoTherapist(false); // Reset AI offer
        setHasOfferedNoJoin(false); // Reset AI offer
        updateDoc(chatRef, {
          therapistJoinedOnce: true,
          aiActive: false,
          aiOffered: false,
        }).catch((err) => console.error("Error updating on join:", err));
        console.log("Therapist join detected", { therapistJoined, lastJoinEvent, lastJoinEventTime, now });
      }

      // Handle leave
      if (therapistLeft && data.therapistJoinedOnce && (!lastLeaveEvent || now - lastLeaveEvent > 2000) && now > lastLeaveEventTime) {
        addDoc(collection(chatRef, "events"), {
          text: "Your therapist has left the chat. Would you like to continue chatting with our support assistant?",
          role: "system",
          type: "ai-offer",
          timestamp: serverTimestamp(),
        }).then(() => {
          updateDoc(chatRef, {
            aiOffered: true,
            therapistJoinedOnce: false,
            lastLeaveEvent: now,
          }).catch((err) => console.error("Error updating on leave:", err));
        }).catch((err) => console.error("Error adding leave event:", err));
        setLastLeaveEvent(now);
        console.log("Therapist leave detected", { therapistLeft, lastLeaveEvent, lastLeaveEventTime, now });
      }

      setPrevParticipants(currentParticipants);
    });

    return () => unsubscribeChat();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId, prevParticipants, lastJoinEvent, lastLeaveEvent]);

  // Initial AI offer if no therapists online (only after user sends a message)
  useEffect(() => {
    if (!chatLoaded || !therapistsLoaded || !chatData || hasOfferedNoTherapist || messages.length === 0) return;

    const { participants, aiOffered, therapistJoinedOnce } = chatData;
    const therapistPresent = participants.some((uid) => uid !== auth.currentUser?.uid);

    if (!therapistPresent && !aiOffered && !therapistJoinedOnce && !isTherapistAvailable) {
      const offerAI = async () => {
        setHasOfferedNoTherapist(true);
        const chatRef = doc(db, "privateChats", chatId);
        await updateDoc(chatRef, { aiOffered: true });
        await addDoc(collection(chatRef, "events"), {
          text: "No therapist is online right now. Would you like to chat with our support assistant while you wait?",
          role: "system",
          type: "ai-offer",
          timestamp: serverTimestamp(),
        });
      };
      offerAI().catch((err) => console.error("Error offering AI:", err));
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

    const role = auth.currentUser.email ? "therapist" : "user";
    const nameToUse = role === "therapist" ? therapistName : getAnonName();

    const chatRef = doc(db, "privateChats", chatId);

    // Save message
    await addDoc(collection(chatRef, "messages"), {
      text: newMessage,
      userId: auth.currentUser.uid,
      displayName: nameToUse,
      role,
      timestamp: serverTimestamp(),
    });

    const userMessage = newMessage;
    setNewMessage("");

    // Fetch latest state
    const chatSnap = await getDoc(chatRef);
    if (!chatSnap.exists()) return;
    const data = chatSnap.data();
    const therapistInChat = data.participants.some((uid) => uid !== auth.currentUser?.uid);

    // Start 7s timer for no join if therapists online and no therapist joined
    if (isTherapistAvailable && !therapistInChat && !hasOfferedNoJoin && !data.aiOffered && !data.therapistJoinedOnce) {
      console.log("Starting 7s timer", { isTherapistAvailable, therapistInChat, hasOfferedNoJoin, aiOffered: data.aiOffered, therapistJoinedOnce: data.therapistJoinedOnce });
      setHasOfferedNoJoin(true);
      noJoinTimerRef.current = setTimeout(async () => {
        const latestSnap = await getDoc(chatRef);
        if (!latestSnap.exists()) return;
        const latestData = latestSnap.data();
        const latestTherapistInChat = latestData.participants.some((uid) => uid !== auth.currentUser?.uid);
        if (!latestTherapistInChat && !latestData.aiOffered && !latestData.therapistJoinedOnce) {
          await updateDoc(chatRef, { aiOffered: true });
          await addDoc(collection(chatRef, "events"), {
            text: "No therapist has joined yet. Would you like to chat with our support assistant while you wait?",
            role: "system",
            type: "ai-offer",
            timestamp: serverTimestamp(),
          });
        }
      }, 7000);
    }

    // AI response
    if (data.aiActive && !therapistInChat) {
      try {
        setAiTyping(true);
        const aiInputMessages = mapMessagesForAI(messages);
        const aiResponse = await getAIResponse(userMessage, aiInputMessages);
        await addDoc(collection(chatRef, "messages"), {
          text: aiResponse,
          role: "ai",
          displayName: "Support Assistant",
          timestamp: serverTimestamp(),
        });
      } catch (err) {
        console.error("AI response error:", err);
        await addDoc(collection(chatRef, "messages"), {
          text: "Sorry, I couldn’t respond right now. Please wait for a therapist.",
          role: "system",
          timestamp: serverTimestamp(),
        });
      } finally {
        setAiTyping(false);
      }
    }

    // Update metadata
    await updateDoc(chatRef, {
      lastMessage: userMessage,
      lastUpdated: serverTimestamp(),
      unreadCountForTherapist: role === "therapist" ? 0 : increment(1),
    });
  };

  // Handle AI choice
  const handleAiChoice = async (choice) => {
    const chatRef = doc(db, "privateChats", chatId);
    if (choice === "yes") {
      setAiEnabled(true);
      await updateDoc(chatRef, { aiActive: true, aiOffered: false });

      await addDoc(collection(chatRef, "messages"), {
        text: "You are now chatting with our support assistant until a therapist joins.",
        role: "system",
        timestamp: serverTimestamp(),
      });

      try {
        setAiTyping(true);
        const aiInputMessages = mapMessagesForAI(messages);
        const aiResponse = await getAIResponse("Start conversation", aiInputMessages);

        await addDoc(collection(chatRef, "messages"), {
          text: aiResponse,
          role: "ai",
          displayName: "Support Assistant",
          timestamp: serverTimestamp(),
        });
      } catch (err) {
        console.error("AI response error:", err);
        await addDoc(collection(chatRef, "messages"), {
          text: "Sorry, I couldn’t respond right now. Please wait for a therapist.",
          role: "system",
          timestamp: serverTimestamp(),
        });
      } finally {
        setAiTyping(false);
      }
    } else {
      setAiEnabled(false);
      await updateDoc(chatRef, { aiActive: false, aiOffered: false });
      await addDoc(collection(chatRef, "messages"), {
        text: "Okay, please hold on while we connect you to a therapist.",
        role: "system",
        timestamp: serverTimestamp(),
      });
    }
  };

  // Anonymous exit button
  const leaveChat = async () => {
    if (!chatId || !auth.currentUser) return;
    const chatRef = doc(db, "privateChats", chatId);
    try {
      await updateDoc(chatRef, {
        aiOffered: false,
        aiActive: false,
        therapistJoinedOnce: false,
        participants: arrayRemove(auth.currentUser.uid),
      });

      await addDoc(collection(chatRef, "events"), {
        type: "leave",
        user: getAnonName(),
        text: `${getAnonName()} has left the chat.`,
        role: "system",
        timestamp: serverTimestamp(),
      });

      setHasOfferedNoJoin(false);
      setHasOfferedNoTherapist(false);
      navigate("/chat_room");
    } catch (err) {
      console.error("Error leaving chat:", err);
    }
  };

  // Anonymous remove on tab close (not refresh)
  useEffect(() => {
    if (!chatId || !auth.currentUser) return;

    let isReloading = false;

    const handleBeforeUnload = async () => {
      if (isReloading) return;

      const uid = auth.currentUser.uid;
      const privateChatRef = doc(db, "privateChats", chatId);
      const groupChatRef = doc(db, "groupChats", "mainGroup");

      try {
        await updateDoc(privateChatRef, {
          participants: arrayRemove(uid),
          aiOffered: false,
          therapistJoinedOnce: false,
        });

        await addDoc(collection(privateChatRef, "events"), {
          type: "leave",
          user: getAnonName(),
          text: `${getAnonName()} has left the chat.`,
          role: "system",
          timestamp: serverTimestamp(),
        });

        await updateDoc(groupChatRef, {
          participants: arrayRemove(uid),
        });

        await addDoc(collection(groupChatRef, "events"), {
          type: "leave",
          user: getAnonName(),
          text: `${getAnonName()} has left the chat.`,
          role: "system",
          timestamp: serverTimestamp(),
        });
      } catch (err) {
        console.error("Error auto-leaving chats:", err);
      }
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
    };
  }, [chatId]);

  // Fetch therapist name if logged in as therapist
  useEffect(() => {
    const fetchTherapistName = async () => {
      if (auth.currentUser?.email) {
        const snap = await getDoc(doc(db, "therapists", auth.currentUser.uid));
        if (snap.exists()) setTherapistName(snap.data().name || "Therapist");
      }
    };
    fetchTherapistName();
  }, []);

  const handleTherapistClick = async (msg) => {
    if (msg.role !== "therapist") return;
    try {
      const snap = await getDoc(doc(db, "therapists", msg.userId));
      if (snap.exists()) setSelectedTherapist(snap.data());
    } catch (err) {
      console.error("Error fetching therapist profile:", err);
    }
  };

  return (
    <div>
      <h3>
        Anonymous Chat{" "}
        {isTherapistAvailable
          ? `(Therapist Online: ${activeTherapists.join(", ")})`
          : "(Waiting for Therapist)"}
      </h3>
      <button
        onClick={leaveChat}
        style={{ marginLeft: "10px", backgroundColor: "red", color: "white" }}
      >
        Exit Chat
      </button>
      {selectedTherapist && (
        <div style={{ border: "1px solid #ccc", padding: "10px", marginBottom: "10px" }}>
          <button onClick={() => setSelectedTherapist(null)}>⬅ Back</button>
          <h4>{selectedTherapist.name}</h4>
          <p>{selectedTherapist.profile}</p>
        </div>
      )}

      <div style={{ border: "1px solid #ccc", padding: "10px", height: "250px", overflowY: "scroll", marginBottom: "10px" }}>
        {combinedChat.map((msg) => (
          <div key={msg.id}>
            {msg.type === "ai-offer" && chatData?.aiOffered && !aiEnabled ? (
              <div style={{ marginBottom: "10px" }}>
                <p style={{ color: "gray" }}>{msg.text}</p>
                <button onClick={() => handleAiChoice("yes")}>Yes</button>
                <button onClick={() => handleAiChoice("no")}>No</button>
              </div>
            ) : msg.type !== "ai-offer" ? (
              <p
                style={{
                  color:
                    msg.role === "therapist"
                      ? "blue"
                      : msg.role === "system"
                      ? "gray"
                      : msg.role === "ai"
                      ? "green"
                      : "black",
                  fontWeight: msg.role === "therapist" ? "bold" : "normal",
                  fontStyle: msg.role === "system" ? "italic" : "normal",
                  cursor: msg.role === "therapist" ? "pointer" : "default",
                  textDecoration: msg.role === "therapist" ? "underline" : "none",
                }}
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
            ) : null}
          </div>
        ))}

        {typingUsers.length > 0 && (
          <p style={{ fontStyle: "italic", color: "gray" }}>
            {typingUsers.join(", ")} {typingUsers.length === 1 ? "is" : "are"} typing...
          </p>
        )}
        {aiTyping && (
          <p style={{ fontStyle: "italic", color: "green" }}>
            Support Assistant is typing...
          </p>
        )}
        <div ref={messagesEndRef} />
      </div>

      <input
        type="text"
        value={newMessage}
        onChange={(e) => {
          setNewMessage(e.target.value);
          handleTyping(e.target.value);
        }}
        placeholder="Type a message..."
        style={{ width: "70%", marginRight: "5px" }}
      />
      <button onClick={sendMessage}>Send</button>
    </div>
  );
}

export default PrivateChat;