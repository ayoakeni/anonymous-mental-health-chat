import React, { useState, useEffect, useRef } from "react";
import { db, auth } from "../../utils/firebase";
import { getAnonName } from "../../login/anonymous_login";
import { useTypingStatus } from "../../components/useTypingStatus";
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
  const [newMessage, setNewMessage] = useState("");
  const [activeTherapists, setActiveTherapists] = useState([]);
  const [selectedTherapist, setSelectedTherapist] = useState(null);
  const [therapistName, setTherapistName] = useState("Therapist"); // fallback
  const messagesEndRef = useRef(null);

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

  // Auto scroll chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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

    await addDoc(collection(db, "privateChats", chatId, "messages"), {
      text: newMessage,
      userId: auth.currentUser.uid,
      displayName: nameToUse,
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
        <div style={{ border: "1px solid #ccc", padding: "10px", marginBottom: "10px" }}>
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
              cursor: msg.role === "therapist" ? "pointer" : "default",
              textDecoration: msg.role === "therapist" ? "underline" : "none",
            }}
            onClick={() => handleTherapistClick(msg)}
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

        {typingUsers.length > 0 && (
          <p style={{ fontStyle: "italic", color: "gray" }}>
            {typingUsers.join(", ")} {typingUsers.length === 1 ? "is" : "are"} typing...
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
