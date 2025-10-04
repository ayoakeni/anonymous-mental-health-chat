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
  arrayRemove 
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
  const messagesEndRef = useRef(null);
  const aiOfferTimerRef = useRef(null);
  const navigate = useNavigate();
  
  // Auto-scroll chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, events]);

  useEffect(() => {
    return () => {
      if (aiOfferTimerRef.current) {
        clearTimeout(aiOfferTimerRef.current);
        aiOfferTimerRef.current = null;
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
    });

    return () => unsub();
  }, []);

  // Watch messages only for rendering
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

  // Watch chat document for therapist join / AI disable
    useEffect(() => {
    if (!chatId) return;
    const chatRef = doc(db, "privateChats", chatId);

    const unsubscribeChat = onSnapshot(chatRef, async (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      const participants = data.participants || [];

      const otherParticipants = participants.filter(uid => uid !== auth.currentUser?.uid);
      const therapistPresent = otherParticipants.length > 0; // or check role in data

      if (therapistPresent && !data.therapistJoinedOnce) {
        // Mark that therapist joined
        await updateDoc(chatRef, { therapistJoinedOnce: true });

        // Add system event
        await addDoc(collection(chatRef, "events"), {
          text: "A therapist has joined. You can now continue your conversation with them.",
          role: "system",
          timestamp: serverTimestamp(),
        });

        // Disable AI if it was enabled
        if (aiEnabled) {
          setAiEnabled(false);
          await updateDoc(chatRef, { aiActive: false });
        }
      }
    });

    return () => unsubscribeChat();
  }, [chatId, aiEnabled]);

  // Combine messages + events for rendering
  const combinedChat = [...messages, ...events].sort((a, b) => {
    // Firestore timestamps are objects, convert to millis
    const t1 = a.timestamp?.toMillis ? a.timestamp.toMillis() : 0;
    const t2 = b.timestamp?.toMillis ? b.timestamp.toMillis() : 0;
    return t1 - t2;
  });

  // Handle AI choice
  const handleAiChoice = async (choice) => {
    const chatRef = doc(db, "privateChats", chatId);
    if (choice === "yes") {
      setAiEnabled(true);
      await updateDoc(chatRef, { aiActive: true });

      // System message
      await addDoc(collection(chatRef, "messages"), {
        text: "You are now chatting with our support assistant until a therapist joins.",
        role: "system",
        timestamp: serverTimestamp(),
      });

      // Trigger AI auto-reply right away
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
      await updateDoc(chatRef, { aiActive: false });
      await addDoc(collection(chatRef, "messages"), {
        text: "Okay, please hold on while we connect you to a therapist.",
        role: "system",
        timestamp: serverTimestamp(),
      });
    }
  };

  // Anonymous exist button
  const leaveChat = async () => {
    if (!chatId || !auth.currentUser) return;
    const chatRef = doc(db, "privateChats", chatId);
    try {
      await updateDoc(chatRef, { aiOffered: false, aiActive: false, therapistJoinedOnce: false });
      await updateDoc(chatRef, {
        participants: arrayRemove(auth.currentUser.uid),
      });

      // Event
      await addDoc(collection(chatRef, "events"), {
        type: "leave",
        user: getAnonName(),
        text: getAnonName()`has left the chat.`,
        role: "system",
        timestamp: serverTimestamp(),
      });

      // Redirect user after leaving
      navigate("/chat_room");
    } catch (err) {
      console.error("Error leaving chat:", err);
    }
  };

  // Anonymous remove only on full tab close (not refresh)
  useEffect(() => {
    if (!chatId || !auth.currentUser) return;

    let isReloading = false;

    const handleBeforeUnload = async () => {
      if (isReloading) return; // skip refresh/navigation

      const uid = auth.currentUser.uid;
      const privateChatRef = doc(db, "privateChats", chatId);
      const groupChatRef = doc(db, "groupChats", "mainGroup");

      try {
        // Remove from private chat
        await updateDoc(privateChatRef, {
          participants: arrayRemove(uid),
        });

        // Event
        await addDoc(collection(privateChatRef, "events"), {
          type: "leave",
          user: getAnonName(),
          text: getAnonName()`has left the chat.`,
          role: "system",
          timestamp: serverTimestamp(),
        });

        // Remove from group chat
        await updateDoc(groupChatRef, {
          participants: arrayRemove(uid),
        });
        
        // Event
        await addDoc(collection(groupChatRef, "events"), {
          type: "leave",
          user: getAnonName(),
          text: getAnonName()`has left the chat.`,
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

  const displayName = auth.currentUser?.email ? therapistName : getAnonName();
  const { typingUsers, handleTyping } = useTypingStatus(displayName);

  // Send message
  const sendMessage = async () => {
    if (!newMessage.trim() || !auth.currentUser || !chatId) return;

    const role = auth.currentUser.email ? "therapist" : "user";
    const nameToUse = role === "therapist" ? therapistName : getAnonName();

    // Save message
    await addDoc(collection(db, "privateChats", chatId, "messages"), {
      text: newMessage,
      userId: auth.currentUser.uid,
      displayName: nameToUse,
      role,
      timestamp: serverTimestamp(),
    });

    const userMessage = newMessage;
    setNewMessage("");

    const chatRef = doc(db, "privateChats", chatId);
    const chatSnap = await getDoc(chatRef);

    // Case 1: No therapist online → offer AI immediately
    if (!isTherapistAvailable && !aiEnabled) {
      if (chatSnap.exists() && !chatSnap.data().aiOffered) {
        await updateDoc(chatRef, { aiOffered: true });
        await addDoc(collection(chatRef, "events"), {
          text: "No therapist is online right now. Would you like to chat with our support assistant while you wait?",
          role: "system",
          type: "ai-offer",
          timestamp: serverTimestamp(),
        });
        return;
      }
    }

    // Case 2: Therapists online globally but none in this chat → wait 30s then offer AI
    if (isTherapistAvailable && !aiEnabled) {
      if (!chatSnap.data().aiOffered) {
        // Clear any existing timer
        if (aiOfferTimerRef.current) {
          clearTimeout(aiOfferTimerRef.current);
          aiOfferTimerRef.current = null;
        }

        aiOfferTimerRef.current = setTimeout(async () => {
          const latestSnap = await getDoc(chatRef);
          if (!latestSnap.exists()) return;

          const participants = latestSnap.data().participants || [];
          const therapistInChat = participants.some(uid => uid !== auth.currentUser?.uid);

          if (!therapistInChat && !latestSnap.data().aiOffered) {
            await updateDoc(chatRef, { aiOffered: true });
            await addDoc(collection(chatRef, "events"), {
              text: "No therapist has joined yet. Would you like to chat with our support assistant while you wait?",
              role: "system",
              type: "ai-offer",
              timestamp: serverTimestamp(),
            });
          }
        }, 30000);
      }
    }

    // Case 3: Therapist has left to re-offer AI
    const participants = chatSnap.data().participants || [];
    const therapistInChat = participants.some(uid => uid !== auth.currentUser?.uid);
    const therapistPreviouslyJoined = chatSnap.data().therapistJoinedOnce || false;

    // Show "Your therapist has left" only if a therapist was previously in the chat
    if (!therapistInChat && therapistPreviouslyJoined && !chatSnap.data().aiOffered) {
      await updateDoc(chatRef, { aiOffered: false });
      await addDoc(collection(chatRef, "events"), {
        text: "Your therapist has left the chat. Would you like to continue chatting with our support assistant?",
        role: "system",
        type: "ai-offer",
        timestamp: serverTimestamp(),
      });
      return;
    }

    // Case 4: AI enabled → auto-reply
    if (aiEnabled) {
      try {
        setAiTyping(true);

        const aiInputMessages = mapMessagesForAI(messages);
        const aiResponse = await getAIResponse(userMessage, aiInputMessages);

        await addDoc(collection(db, "privateChats", chatId, "messages"), {
          text: aiResponse,
          role: "ai",
          displayName: "Support Assistant",
          timestamp: serverTimestamp(),
        });
      } catch (err) {
        console.error("AI response error:", err);
        await addDoc(collection(chatRef, "messages"), {
          text: "Sorry, I couldn't respond right now. Please wait for a therapist.",
          role: "system",
          timestamp: serverTimestamp(),
        });
      } finally {
        setAiTyping(false);
      }
    }

    // Update chat metadata
    await updateDoc(chatRef, {
      lastMessage: userMessage,
      lastUpdated: serverTimestamp(),
      unreadCountForTherapist: role === "therapist" ? 0 : increment(1),
    });
  };

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
          {msg.type === "ai-offer" ? (
            <div style={{ marginBottom: "10px" }}>
              <p style={{ color: "gray" }}>{msg.text}</p>
              {!aiEnabled && (
                <>
                  <button onClick={() => handleAiChoice("yes")}>Yes</button>
                  <button onClick={() => handleAiChoice("no")}>No</button>
                </>
              )}
            </div>
          ) : (
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
              onClick={() =>
                msg.role === "therapist" ? handleTherapistClick(msg) : null
              }
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
        <p style={{ fontStyle: "italic", color: "gray" }}>
          {typingUsers.join(", ")}{" "}
          {typingUsers.length === 1 ? "is" : "are"} typing...
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
