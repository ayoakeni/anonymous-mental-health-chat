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

  // Watch therapist presence in real-time
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

  // Watch messages
  useEffect(() => {
    if (!chatId) return;

    const q = query(
      collection(db, "privateChats", chatId, "messages"),
      orderBy("timestamp")
    );

    const unsubscribeMessages = onSnapshot(q, async (snapshot) => {
      const msgs = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setMessages(msgs);

      // Detect therapist joining for the first time
      const hasTherapistNow = msgs.some((m) => m.role === "therapist");
      if (hasTherapistNow && aiEnabled) {
        setAiEnabled(false); // stop AI responses
        await addDoc(collection(db, "privateChats", chatId, "messages"), {
          text: "A therapist has joined. You can now continue your conversation with them.",
          role: "system",
          timestamp: serverTimestamp(),
        });
      }
    });

    return () => unsubscribeMessages();
  }, [chatId, aiEnabled]);

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

  // Send a message
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

    // ✅ If no therapist online globally → offer AI immediately
    if (!isTherapistAvailable && !aiEnabled) {
      if (chatSnap.exists() && !chatSnap.data().aiOffered) {
        await updateDoc(chatRef, { aiOffered: true });
        await addDoc(collection(db, "privateChats", chatId, "messages"), {
          text: "No therapist is online right now. Would you like to chat with our support assistant while you wait?",
          role: "system",
          type: "ai-offer",
          timestamp: serverTimestamp(),
        });
        return;
      }
    }

    // ✅ If therapists are online globally but none have joined this chat yet → wait 30s
    if (isTherapistAvailable && !aiEnabled) {
      const hasTherapistInChat = messages.some((m) => m.role === "therapist");
      if (!hasTherapistInChat && chatSnap.exists() && !chatSnap.data().aiOffered) {
        setTimeout(async () => {
          const latestSnap = await getDoc(chatRef);
          const stillNoTherapist = !messages.some((m) => m.role === "therapist");
          if (stillNoTherapist && latestSnap.exists() && !latestSnap.data().aiOffered) {
            await updateDoc(chatRef, { aiOffered: true });
            await addDoc(collection(db, "privateChats", chatId, "messages"), {
              text: "No therapist has joined your chat yet. Would you like to chat with our support assistant while you wait?",
              role: "system",
              type: "ai-offer",
              timestamp: serverTimestamp(),
            });
          }
        }, 30000); // 30s delay
      }
    }

    // ✅ If AI is enabled and no therapist, auto-reply
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
        {isTherapistAvailable
          ? `(Therapist Online: ${activeTherapists.join(", ")})`
          : "(Waiting for Therapist)"}
      </h3>

      {selectedTherapist && (
        <div style={{ border: "1px solid #ccc", padding: "10px", marginBottom: "10px" }}>
          <button onClick={() => setSelectedTherapist(null)}>⬅ Back</button>
          <h4>{selectedTherapist.name}</h4>
          <p>{selectedTherapist.profile}</p>
        </div>
      )}

      <div style={{ border: "1px solid #ccc", padding: "10px", height: "250px", overflowY: "scroll", marginBottom: "10px" }}>
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
                onClick={() => msg.role === "therapist" ? handleTherapistClick(msg) : null}
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
        {aiTyping && <p style={{ fontStyle: "italic", color: "green" }}>Support Assistant is typing...</p>}
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
