import React, { useState, useEffect, useRef } from "react";
import { db, auth } from "../../utils/firebase";
import { getAnonName } from "../../login/anonymous_login";
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
} from "firebase/firestore";

function PrivateChat({ chatId }) {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [activeTherapists, setActiveTherapists] = useState([]);
  const [therapistTyping, setTherapistTyping] = useState(false);
  const typingTimeoutRef = useRef(null); // Use ref instead of state

  useEffect(() => {
    if (!chatId) return;

    const q = query(
      collection(db, "privateChats", chatId, "messages"),
      orderBy("timestamp")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setMessages(msgs);

      // Track active therapists
      const therapists = msgs
        .filter((m) => m.role === "therapist")
        .map((m) => m.displayName);
      setActiveTherapists([...new Set(therapists)]);

      // Check typing
      const lastMsg = msgs[msgs.length - 1];
      if (lastMsg?.role === "therapist" && lastMsg?.typing) {
        setTherapistTyping(true);

        // Clear previous timeout
        clearTimeout(typingTimeoutRef.current);

        // Set new timeout to hide typing
        typingTimeoutRef.current = setTimeout(
          () => setTherapistTyping(false),
          3000
        );
      } else {
        setTherapistTyping(false);
      }
    });

    // System message: therapist joined
    const handleTherapistJoin = async () => {
      if (auth.currentUser?.email) {
        const displayName = "Therapist";
        await addDoc(collection(db, "privateChats", chatId, "messages"), {
          text: `${displayName} joined the chat`,
          role: "system",
          timestamp: serverTimestamp(),
          therapistId: auth.currentUser?.email ? auth.currentUser.uid : null,
        });
      }
    };
    handleTherapistJoin();

    // Reset unread count
    if (auth.currentUser?.email) {
      const chatRef = doc(db, "privateChats", chatId);
      updateDoc(chatRef, { unreadCountForTherapist: 0 });
    }

    // Therapist leaving
    const handleBeforeUnload = async () => {
      if (auth.currentUser?.email) {
        const displayName = "Therapist";
        await addDoc(collection(db, "privateChats", chatId, "messages"), {
          text: `${displayName} left the chat`,
          role: "system",
          timestamp: serverTimestamp(),
        });
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      unsubscribe();
      clearTimeout(typingTimeoutRef.current);
    };
  }, [chatId]);

  const sendMessage = async () => {
    if (!newMessage.trim() || !auth.currentUser || !chatId) return;

    const role = auth.currentUser.email ? "therapist" : "user";
    const displayName = role === "therapist" ? "Therapist" : getAnonName();

    await addDoc(collection(db, "privateChats", chatId, "messages"), {
      text: newMessage,
      userId: auth.currentUser.uid,
      displayName,
      role,
      timestamp: serverTimestamp(),
    });

    const chatRef = doc(db, "privateChats", chatId);
    await updateDoc(chatRef, {
      lastMessage: newMessage,
      lastUpdated: serverTimestamp(),
      unreadCountForTherapist: role === "therapist" ? 0 : increment(1),
    });

    setNewMessage("");
  };

  const handleTyping = async (e) => {
    setNewMessage(e.target.value);
    if (auth.currentUser?.email) {
      await addDoc(collection(db, "privateChats", chatId, "messages"), {
        userId: auth.currentUser.uid,
        displayName: "Therapist",
        role: "therapist",
        typing: true,
        timestamp: serverTimestamp(),
      });
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
          <p
            key={msg.id}
            style={{
              color:
                msg.role === "therapist"
                  ? "blue"
                  : msg.role === "system"
                  ? "gray"
                  : "black",
              fontWeight: msg.role === "therapist" ? "bold" : "normal",
              fontStyle: msg.role === "system" ? "italic" : "normal",
            }}
          >
            {msg.role === "system" ? (
              <em>{msg.text}</em>
            ) : (
              <>
                <strong>{msg.displayName}:</strong> {msg.text}
              </>
            )}
          </p>
        ))}
        {therapistTyping && (
          <p style={{ fontStyle: "italic", color: "gray" }}>
            Therapist is typing...
          </p>
        )}
      </div>

      <input
        value={newMessage}
        onChange={handleTyping}
        placeholder="Type a message..."
        style={{ width: "70%", marginRight: "5px" }}
      />
      <button onClick={sendMessage}>Send</button>
    </div>
  );
}

export default PrivateChat;
