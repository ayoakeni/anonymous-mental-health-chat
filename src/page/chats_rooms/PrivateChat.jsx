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
  const [therapistJoinedBefore, setTherapistJoinedBefore] = useState(false);
  const messagesEndRef = useRef(null);
  
  // Auto-scroll chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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

  // Watch messages + therapist join
  useEffect(() => {
    if (!chatId) return;
    const chatRef = doc(db, "privateChats", chatId);
    const q = query(collection(chatRef, "messages"), orderBy("timestamp"));

    const unsubscribeMessages = onSnapshot(q, async (snapshot) => {
      const msgs = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setMessages(msgs);

      // Check participants → disable AI if therapist joined
      const chatSnap = await getDoc(chatRef);
      const participants = chatSnap.exists()
        ? chatSnap.data().participants || []
        : [];
      const hasTherapistNow = participants.some(
        (uid) => uid !== auth.currentUser?.uid
      );

      if (hasTherapistNow && aiEnabled) {
        setAiEnabled(false);
        await updateDoc(chatRef, { aiActive: false });
        await addDoc(collection(chatRef, "messages"), {
          text: "A therapist has joined. You can now continue your conversation with them.",
          role: "system",
          timestamp: serverTimestamp(),
        });
      }
    });

    return () => unsubscribeMessages();
  }, [chatId, aiEnabled]);

  // Handle AI choice
  const handleAiChoice = async (choice) => {
    const chatRef = doc(db, "privateChats", chatId);
    if (choice === "yes") {
      setAiEnabled(true);
      await updateDoc(chatRef, { aiActive: true });
      await addDoc(collection(chatRef, "messages"), {
        text: "You are now chatting with our support assistant until a therapist joins.",
        role: "system",
        timestamp: serverTimestamp(),
      });
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

  // Detect therapist leaving → re-offer AI (with joined-before check)
  useEffect(() => {
    if (!chatId) return;
    const chatRef = doc(db, "privateChats", chatId);

    const unsub = onSnapshot(chatRef, async (snap) => {
      if (!snap.exists()) return;
      const participants = snap.data().participants || [];
      const hasTherapistNow = participants.some(
        (uid) => uid !== auth.currentUser?.uid
      );

      if (hasTherapistNow) {
        setTherapistJoinedBefore(true);
      }

      // Only show "therapist left" if they were here before
      if (!hasTherapistNow && therapistJoinedBefore && !aiEnabled && !snap.data().aiOffered) {
        await updateDoc(chatRef, { aiOffered: true });
        await addDoc(collection(chatRef, "messages"), {
          text: "The therapist has left. Would you like to continue with our support assistant?",
          role: "system",
          type: "ai-offer",
          timestamp: serverTimestamp(),
        });
      }
    });

    return () => unsub();
  }, [chatId, aiEnabled, therapistJoinedBefore]);

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
        await addDoc(collection(chatRef, "messages"), {
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
      const hasTherapistInChat = messages.some((m) => m.role === "therapist");
      if (!hasTherapistInChat && chatSnap.exists() && !chatSnap.data().aiOffered) {
        setTimeout(async () => {
          const latestSnap = await getDoc(chatRef);
          const stillNoTherapist = !messages.some((m) => m.role === "therapist");
          if (stillNoTherapist && latestSnap.exists() && !latestSnap.data().aiOffered) {
            await updateDoc(chatRef, { aiOffered: true });
            await addDoc(collection(chatRef, "messages"), {
              text: "No therapist has joined yet. Would you like to chat with our support assistant while you wait?",
              role: "system",
              type: "ai-offer",
              timestamp: serverTimestamp(),
            });
          }
        }, 30000); // 30s delay
      }
    }

    // Case 3: Therapist left → re-offer AI
    if (!isTherapistAvailable && chatSnap.exists() && !chatSnap.data().aiOffered) {
      await updateDoc(chatRef, { aiOffered: true });
      await addDoc(collection(chatRef, "messages"), {
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

        const aiResponse = await getAIResponse(
          userMessage,
          messages.map((m) => ({
            role: m.role === "user" ? "user" : "assistant",
            content: m.text,
          }))
        );

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

    // -------- Update chat metadata --------
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
