import React, { useState, useEffect, useRef } from "react";
import {
  collection,
  addDoc,
  onSnapshot,
  serverTimestamp,
  query,
  orderBy,
  doc,
  getDoc,
  updateDoc,
  setDoc,
} from "firebase/firestore";
import { db, auth } from "../../utils/firebase";
import { getAIResponse } from "../../components/AiChat";
import { loginAnonymously, getAnonName } from "../../login/anonymous_login";
import TherapistProfile from "../../components/TherapistProfile";
import { useTypingStatus } from "../../components/useTypingStatus";

function Chatroom() {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [aiTyping, setAiTyping] = useState(false);
  const [selectedTherapist, setSelectedTherapist] = useState(null);
  const [therapistsOnline, setTherapistsOnline] = useState([]);
  const displayName = auth.currentUser?.email ? auth.currentUser.displayName || "Therapist" : getAnonName();
  const { typingUsers, handleTyping } = useTypingStatus(displayName);
  const messagesEndRef = useRef(null);
  
  // Auto scroll chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Initialize chat & track messages
  useEffect(() => {
    loginAnonymously();

    const q = query(collection(db, "messages"), orderBy("timestamp"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setMessages(msgs);

      // Track online therapists
      const onlineTherapists = msgs
        .filter((m) => m.role === "therapist")
        .map((t) => t.displayName || "Therapist");
      setTherapistsOnline([...new Set(onlineTherapists)]);
    });

    return () => unsubscribe();
  }, []);

  // Track auth state & handle therapist join message
  useEffect(() => {
    const unsubscribeAuth = auth.onAuthStateChanged(async (user) => {
      setIsLoggedIn(!!user);

      if (user?.email && !sessionStorage.getItem("therapistJoined")) {
        await addDoc(collection(db, "messages"), {
          text: `${user.displayName || "Therapist"} joined the chat`,
          role: "system",
          timestamp: serverTimestamp(),
        });
        sessionStorage.setItem("therapistJoined", "true");
      }
    });

    return () => unsubscribeAuth();
  }, []);

  // Handle therapist leaving on window unload
  useEffect(() => {
    const handleBeforeUnload = async () => {
      if (auth.currentUser?.email) {
        try {
          await addDoc(collection(db, "messages"), {
            text: `${auth.currentUser.displayName || "Therapist"} left the chat`,
            role: "system",
            timestamp: serverTimestamp(),
          });
        } catch (err) {
          console.error("Error sending therapist leave message:", err);
        }
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  // Send a new message
  const sendMessage = async () => {
    if (!newMessage.trim() || !auth.currentUser) return;

    const role = auth.currentUser.email ? "therapist" : "user";
    let displayName = role === "therapist" ? "Therapist" : getAnonName();

    if (role === "therapist") {
      try {
        const snap = await getDoc(doc(db, "therapists", auth.currentUser.uid));
        if (snap.exists()) displayName = snap.data().name;
      } catch (err) {
        console.error("Error fetching therapist name:", err);
      }
    }

    const messageData = {
      text: newMessage,
      userId: auth.currentUser.uid,
      displayName,
      role,
      timestamp: serverTimestamp(),
    };

    await addDoc(collection(db, "messages"), messageData);
    setNewMessage("");

    // Stop typing for this therapist
    const typingDoc = doc(db, "typingStatus", auth.currentUser.uid);
    await updateDoc(typingDoc, { typing: false }).catch(async () => {
      await setDoc(typingDoc, { typing: false, name: displayName, timestamp: serverTimestamp() });
    });

    // Trigger AI if user mentions @ai
    if (role === "user" && newMessage.toLowerCase().includes("@ai")) {
      const cleanMessage = newMessage.replace(/@ai/gi, "").trim();
      const originalMessage = newMessage.trim();
      setAiTyping(true);

      setTimeout(async () => {
        try {
          const aiReply = await getAIResponse(cleanMessage);
          await addDoc(collection(db, "messages"), {
            text: `You said: "${originalMessage}"\n\n${aiReply}`,
            userId: "AI_BOT",
            displayName: "AI Support",
            role: "ai",
            timestamp: serverTimestamp(),
          });
        } catch (err) {
          console.error("AI error:", err);
        } finally {
          setAiTyping(false);
        }
      }, 2000);
    }
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

  const isTherapistOnline = (name) => therapistsOnline.includes(name);

  return (
    <div className="chat-box" style={{ border: "1px solid #ccc", padding: "10px", height: "350px", overflowY: "scroll", marginBottom: "10px" }}>
      <h2>Anonymous Mental Health Chat</h2>

      <p>
        {therapistsOnline.length > 0
          ? `Therapists online: ${therapistsOnline.join(", ")}`
          : "No therapist online currently"}
      </p>

      {selectedTherapist ? (
        <TherapistProfile
          therapist={selectedTherapist}
          isOnline={isTherapistOnline(selectedTherapist.name)}
          onBack={() => setSelectedTherapist(null)}
          onStartChat={() => alert(`Starting private chat with ${selectedTherapist.name}`)}
          onBookAppointment={() => alert(`Booking appointment with ${selectedTherapist.name}`)}
        />
      ) : (
        <>
          <div className="chat-box" style={{ marginBottom: "10px" }}>
            {messages.map((msg) => (
              <p
                key={msg.id}
                style={{
                  backgroundColor: msg.role === "ai" ? "#f0fff0" : msg.role === "system" ? "#f9f9f9" : "transparent",
                  padding: "8px",
                  borderRadius: "6px",
                  color: msg.role === "ai" ? "green" : msg.role === "therapist" ? "blue" : msg.role === "system" ? "gray" : "black",
                  fontStyle: msg.role === "ai" || msg.role === "system" ? "italic" : "normal",
                  fontWeight: msg.role === "therapist" ? "bold" : "normal",
                }}
              >
                {msg.role === "system" ? (
                  <em>{msg.text}</em>
                ) : (
                  <>
                    <strong
                      style={{
                        cursor: msg.role === "therapist" ? "pointer" : "default",
                        textDecoration: msg.role === "therapist" ? "underline" : "none",
                      }}
                      onClick={() => handleTherapistClick(msg)}
                    >
                      {msg.displayName || "Anonymous"}
                    </strong>
                    : {msg.text}
                  </>
                )}
              </p>
            ))}
            {typingUsers.length > 0 && (
              <p style={{ fontStyle: "italic", color: "gray" }}>
                {typingUsers.join(", ")} {typingUsers.length === 1 ? "is" : "are"} typing...
              </p>
            )}
            {aiTyping && (
              <p style={{ fontStyle: "italic", color: "gray" }}>AI Support is typing...</p>
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
            disabled={!isLoggedIn}
            style={{ width: "70%", marginRight: "5px" }}
            placeholder="Type a message..."
          />
          <button onClick={sendMessage} disabled={!isLoggedIn}>
            Send
          </button>
        </>
      )}
    </div>
  );
}

export default Chatroom;
