import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  collection,
  onSnapshot,
  serverTimestamp,
  query,
  orderBy,
  doc,
  getDoc,
  runTransaction,
  limit,
} from "firebase/firestore";
import { db, auth } from "../../utils/firebase";
import { getAIResponse } from "../../utils/AiChatIntegration";
import { mapMessagesForAI } from "../../utils/aiMessageMapper";
import { loginAnonymously, getAnonName } from "../../login/anonymous_login";
import TherapistProfile from "../../components/TherapistProfile";
import { useTypingStatus } from "../../components/useTypingStatus";
import "../../styles/chatroom.css";

function Chatroom() {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [aiTyping, setAiTyping] = useState(false);
  const [selectedTherapist, setSelectedTherapist] = useState(null);
  const [therapistsOnline, setTherapistsOnline] = useState([]);
  const [therapistName, setTherapistName] = useState("Therapist");

  const displayName = auth.currentUser?.email ? therapistName : getAnonName();
  const { typingUsers, handleTyping } = useTypingStatus(displayName);
  const messagesEndRef = useRef(null);
  const navigate = useNavigate();

  // Auto scroll chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Initialize authentication and messages
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        await loginAnonymously();
        setIsLoggedIn(!!auth.currentUser);
      } catch (err) {
        console.error("Error during anonymous login:", err);
        if (err.code === "resource-exhausted") {
          alert("Firestore quota exceeded. Please try again later.");
        }
      }
    };
    initializeAuth();

    const q = query(collection(db, "messages"), orderBy("timestamp"), limit(50));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setMessages(msgs);
    }, (err) => {
      console.error("Error fetching messages:", err);
      if (err.code === "resource-exhausted") {
        alert("Firestore quota exceeded. Please try again later.");
      }
    });

    return () => unsubscribe();
  }, []);

  // Track therapists online
  useEffect(() => {
    const q = query(collection(db, "therapistsOnline"), limit(50));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const onlineList = snapshot.docs.map((doc) => ({
        uid: doc.id,
        ...doc.data(),
      }));
      setTherapistsOnline(onlineList);
    }, (err) => {
      console.error("Error fetching therapists online:", err);
      if (err.code === "resource-exhausted") {
        alert("Firestore quota exceeded. Please try again later.");
      }
    });
    return () => unsubscribe();
  }, []);

  // Fetch therapist name with real-time updates
  useEffect(() => {
    if (!auth.currentUser?.email) return;
    const therapistRef = doc(db, "therapists", auth.currentUser.uid);
    const unsubscribe = onSnapshot(therapistRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setTherapistName(data.name || "Therapist");
      } else {
        setTherapistName("Therapist");
      }
    }, (err) => {
      console.error("Error fetching therapist profile:", err);
      if (err.code === "resource-exhausted") {
        alert("Firestore quota exceeded. Please try again later.");
      }
    });
    return () => unsubscribe();
  }, [auth.currentUser?.uid]);

  // Track therapist login
  useEffect(() => {
    const unsubscribeAuth = auth.onAuthStateChanged(async (user) => {
      setIsLoggedIn(!!user);
      if (user?.email && !sessionStorage.getItem("therapistJoined")) {
        try {
          const snap = await getDoc(doc(db, "therapists", user.uid));
          if (snap.exists()) {
            setTherapistName(snap.data().name || "Therapist");
          }
          sessionStorage.setItem("therapistJoined", "true");
        } catch (err) {
          console.error("Error fetching therapist name:", err);
          if (err.code === "resource-exhausted") {
            alert("Firestore quota exceeded. Please try again later.");
          }
        }
      }
    });
    return () => unsubscribeAuth();
  }, []);

  // Therapist click to view profile
  const handleTherapistClick = async (msg) => {
    if (msg.role !== "therapist") return;
    try {
      const snap = await getDoc(doc(db, "therapists", msg.userId));
      if (snap.exists()) {
        setSelectedTherapist({ ...snap.data(), uid: msg.userId });
      }
    } catch (err) {
      console.error("Error fetching therapist profile:", err);
      if (err.code === "resource-exhausted") {
        alert("Firestore quota exceeded. Please try again later.");
      }
    }
  };

  // Start private chat
  const startPrivateChat = async (therapist) => {
    if (!therapist || !therapist.uid || !auth.currentUser) return;
    const uids = [auth.currentUser.uid, therapist.uid].sort();
    const chatId = `chat_${uids[0]}_${uids[1]}`;
    const chatRef = doc(db, "privateChats", chatId);

    try {
      await runTransaction(db, async (transaction) => {
        const chatSnap = await transaction.get(chatRef);
        if (!chatSnap.exists()) {
          transaction.set(chatRef, {
            participants: [auth.currentUser.uid],
            createdBy: auth.currentUser.uid,
            lastMessage: "",
            lastUpdated: serverTimestamp(),
            unreadCountForTherapist: 0,
            aiOffered: false,
            chatStatus: "waiting",
          });
        } else {
          const currentData = chatSnap.data();
          const updatedParticipants = [
            ...new Set([...(currentData.participants || []), auth.currentUser.uid]),
          ];
          transaction.update(chatRef, {
            participants: updatedParticipants,
            lastUpdated: serverTimestamp(),
            chatStatus: updatedParticipants.length === 2 ? "active" : "waiting",
          });
        }
      });
      const isTherapist = auth.currentUser?.email;
      const route = isTherapist
        ? `/therapist-dashboard/private-chat/${chatId}`
        : `/chat-room/${chatId}`;
      navigate(route);
    } catch (err) {
      console.error("Error starting private chat:", err);
      if (err.code === "resource-exhausted") {
        alert("Firestore quota exceeded. Please try again later.");
      }
    }
  };

  // Send message
  const sendMessage = async () => {
    if (!newMessage.trim() || !auth.currentUser) return;

    const role = auth.currentUser.email ? "therapist" : "user";
    let displayName = role === "therapist" ? therapistName : getAnonName();

    try {
      await runTransaction(db, async (transaction) => {
        const messagesRef = collection(db, "messages");
        const typingDoc = doc(db, "typingStatus", auth.currentUser.uid);
        transaction.set(doc(messagesRef), {
          text: newMessage,
          userId: auth.currentUser.uid,
          displayName,
          role,
          timestamp: serverTimestamp(),
        });
        transaction.set(typingDoc, {
          typing: false,
          name: displayName,
          timestamp: serverTimestamp(),
        });
      });

      if (role === "user" && newMessage.toLowerCase().includes("@ai")) {
        const cleanMessage = newMessage.replace(/@ai/gi, "").trim();
        const originalMessage = newMessage.trim();
        setAiTyping(true);

        try {
          const aiInputMessages = mapMessagesForAI(messages);
          const aiReply = await getAIResponse(cleanMessage, aiInputMessages);
          await runTransaction(db, async (transaction) => {
            transaction.set(doc(collection(db, "messages")), {
              text: `You said: "${originalMessage}"\n\n${aiReply}`,
              userId: "AI_BOT",
              displayName: "AI Support",
              role: "ai",
              timestamp: serverTimestamp(),
            });
          });
        } catch (err) {
          console.error("AI error:", err);
          await runTransaction(db, async (transaction) => {
            transaction.set(doc(collection(db, "messages")), {
              text: "Sorry, I couldn’t respond right now. Please try again later.",
              userId: "AI_BOT",
              displayName: "AI Support",
              role: "ai",
              timestamp: serverTimestamp(),
            });
          });
        } finally {
          setAiTyping(false);
        }
      }
    } catch (err) {
      console.error("Error sending message:", err);
      if (err.code === "resource-exhausted") {
        alert("Firestore quota exceeded. Please try again later.");
      }
    }

    setNewMessage("");
  };

  // Check therapist online by uid
  const isTherapistOnline = (uid) =>
  therapistsOnline.some((t) => t.uid === uid && t.online);

  return (
    <div className="chatroom">
      <button className="theme-toggle" onClick={() => alert("Theme toggle coming soon!")}>
        Toggle Theme
      </button>
      <h2>Anonymous Mental Health Chat</h2>
      <p>
        {therapistsOnline.length > 0
          ? `Therapists online: ${therapistsOnline.map((t) => t.name).join(", ")}`
          : "No therapist online currently"}
      </p>
      <div className="therapist-list">
        {therapistsOnline.map((therapist) => (
          <div
            key={therapist.uid}
            className={`therapist-item ${therapist.online ? "online" : ""}`}
            onClick={() => handleTherapistClick({ userId: therapist.uid, role: "therapist" })}
          >
            <span className="therapist-avatar">{therapist.name?.[0] || "T"}</span>
            {therapist.name}
          </div>
        ))}
      </div>
      {selectedTherapist ? (
        <TherapistProfile
          therapist={selectedTherapist}
          isOnline={isTherapistOnline(selectedTherapist.uid)}
          onBack={() => setSelectedTherapist(null)}
          onStartChat={() => startPrivateChat(selectedTherapist)}
          onBookAppointment={() => alert("Appointment booking coming soon!")}
        />
      ) : (
        <>
          {messages.some((msg) => msg.pinned) && (
            <div className="pinned-message">
              <strong>Pinned:</strong>{" "}
              {messages.find((msg) => msg.pinned)?.text || "Welcome to the chatroom!"}
            </div>
          )}
          <div className="chat-box">
            {messages.map((msg) => (
              <p
                key={msg.id}
                className={`chat-message ${msg.role === "therapist" ? "therapist" : msg.role === "ai" ? "ai" : "user"}`}
                onClick={() => handleTherapistClick(msg)}
              >
                <strong>{msg.displayName || "Anonymous"}:</strong> {msg.text}
                <span className="message-timestamp">
                  {msg.timestamp?.toDate().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
                <span className="message-reactions">
                  <span className="reaction">👍</span>
                  <span className="reaction">❤️</span>
                </span>
              </p>
            ))}
            {typingUsers.length > 0 && (
              <p className="typing-indicator">
                {typingUsers.join(", ")} {typingUsers.length === 1 ? "is" : "are"} typing...
              </p>
            )}
            {aiTyping && (
              <p className="typing-indicator ai-typing">
                AI Support is typing...
              </p>
            )}
            <div ref={messagesEndRef} />
          </div>
          {isLoggedIn && (
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
              <button className="emoji-btn">😊</button>
              <button className="attach-btn">📎</button>
              <button onClick={sendMessage}>Send</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default Chatroom;