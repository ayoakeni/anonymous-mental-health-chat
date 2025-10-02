import React, { useState, useEffect, useRef } from "react";
import { db, auth } from "../../utils/firebase";
import { getAnonName } from "../../login/anonymous_login";
import { useTypingStatus } from "../../components/useTypingStatus";
import { getAIResponse } from "../../components/AiChatIntegration";
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
} from "firebase/firestore";

function PrivateChat({ chatId }) {
  const [messages, setMessages] = useState([]);
  const [isTherapistAvailable, setIsTherapistAvailable] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [aiTyping, setAiTyping] = useState(false);
  const [newMessage, setNewMessage] = useState("");
  const [activeTherapists, setActiveTherapists] = useState([]);
  const [selectedTherapist, setSelectedTherapist] = useState(null);
  const [therapistName, setTherapistName] = useState("Therapist");
  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (!chatId) return;

    const chatRef = doc(db, "privateChats", chatId);

    // Detect therapists more accurately
    const isTherapist = (uid) => {
      // Example: treat email-based accounts as therapists
      return uid && uid.includes("@"); 
    };

    const unsubChat = onSnapshot(chatRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        const therapistUids = data.participants?.filter((p) => isTherapist(p)) || [];
        const hasTherapist = therapistUids.length > 0;
        setIsTherapistAvailable(hasTherapist);

        // If therapist left, reset flags
        if (!hasTherapist && data.handoverNotified) {
          updateDoc(chatRef, { handoverNotified: false, aiOffered: false });
        }

        // If therapist joins for the first time
        if (hasTherapist && !data.handoverNotified) {
          updateDoc(chatRef, { handoverNotified: true });
          addDoc(collection(db, "privateChats", chatId, "messages"), {
            text: "A therapist has joined. You can now continue your conversation with them.",
            role: "system",
            timestamp: serverTimestamp(),
          });
          setAiEnabled(false);
          setAiTyping(false);
        }
      }
    });

    // Watch messages
    const unsubMsgs = onSnapshot(
      collection(db, "privateChats", chatId, "messages"),
      (snap) => {
        setMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      }
    );

    return () => {
      unsubChat();
      unsubMsgs();
    };
  }, [chatId]);

  const handleAiChoice = async (choice) => {
    if (choice === "yes") {
      setAiEnabled(true);
      await addDoc(collection(db, "privateChats", chatId, "messages"), {
        text: "You are now chatting with our support assistant until a therapist joins.",
        role: "system",
        timestamp: serverTimestamp(),
      });
    } else {
      setAiEnabled(false);
      await addDoc(collection(db, "privateChats", chatId, "messages"), {
        text: "Okay, please hold on while we connect you to a therapist.",
        role: "system",
        timestamp: serverTimestamp(),
      });
    }
  };

  // Auto scroll chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Fetch the therapist name if current user is a therapist
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

  // Listen for messages
  useEffect(() => {
    if (!chatId) return;

    const q = query(
      collection(db, "privateChats", chatId, "messages"),
      orderBy("timestamp")
    );

    const unsubscribeMessages = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setMessages(msgs);

      // Track active therapists
      const therapists = msgs
        .filter((m) => m.role === "therapist")
        .map((m) => m.displayName);
      setActiveTherapists([...new Set(therapists)]);
    });

    return () => unsubscribeMessages();
  }, [chatId]);

  // Send a message
  const sendMessage = async () => {
    if (!newMessage.trim() || !auth.currentUser || !chatId) return;

    const role = auth.currentUser.email ? "therapist" : "user";
    const nameToUse = role === "therapist" ? therapistName : getAnonName();

    // Save user/therapist message
    await addDoc(collection(db, "privateChats", chatId, "messages"), {
      text: newMessage,
      userId: auth.currentUser.uid,
      displayName: nameToUse,
      role,
      timestamp: serverTimestamp(),
    });

    // Store message before clearing
    const userMessage = newMessage;
    setNewMessage("");

    const chatRef = doc(db, "privateChats", chatId);

    // If no therapist & AI not enabled, offer AI
    if (!isTherapistAvailable && !aiEnabled) {
      const snap = await getDoc(chatRef);
      if (snap.exists() && !snap.data().aiOffered) {
        await updateDoc(chatRef, { aiOffered: true });
        await addDoc(collection(db, "privateChats", chatId, "messages"), {
          text: "No therapist is available right now. Would you like to chat with our support assistant while you wait?",
          role: "system",
          type: "ai-offer",
          timestamp: serverTimestamp(),
        });
        return; // stop here until user accepts AI
      }
    }

    // If AI is enabled and no therapist, auto-respond
    if (!isTherapistAvailable && aiEnabled) {
      try {
        setAiTyping(true);
        const aiReply = await getAIResponse(userMessage);
        setAiTyping(false);

        await addDoc(collection(db, "privateChats", chatId, "messages"), {
          text: aiReply,
          role: "ai",
          displayName: "Support Assistant",
          timestamp: serverTimestamp(),
        });
      } catch (err) {
        console.error("AI error:", err);
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
      else console.warn("Therapist not found");
    } catch (err) {
      console.error("Error fetching therapist profile:", err);
    }
  };

  return (
    <div>
      <h3>
        Anonymous Chat{" "}
        {activeTherapists.length > 0
          ? `with ${activeTherapists.join(", ")}`
          : "(Waiting for Therapist)"}
      </h3>

      {selectedTherapist && (
        <div
          style={{
            border: "1px solid #ccc",
            padding: "10px",
            marginBottom: "10px",
          }}
        >
          <button onClick={() => setSelectedTherapist(null)}>⬅ Back</button>
          <h4>{selectedTherapist.name}</h4>
          <p>{selectedTherapist.profile}</p>
        </div>
      )}

      <div
        style={{
          border: "1px solid #ccc",
          padding: "10px",
          height: "250px",
          overflowY: "scroll",
          marginBottom: "10px",
        }}
      >
        {messages.map((msg) => (
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
