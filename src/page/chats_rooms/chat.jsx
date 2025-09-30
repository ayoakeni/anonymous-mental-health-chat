import React, { useState, useEffect } from "react";
import {
  collection,
  addDoc,
  onSnapshot,
  serverTimestamp,
  query,
  orderBy,
  doc,
  getDoc,
} from "firebase/firestore";
import { db, auth } from "../../utils/firebase";
import { getAIResponse } from "../../components/AiChat";
import { loginAnonymously, getAnonName } from "../../login/anonymous_login";
import TherapistProfile from "../../components/TherapistProfile";

function Chatroom() {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [aiTyping, setAiTyping] = useState(false);
  const [selectedTherapist, setSelectedTherapist] = useState(null);
  const [therapistCache, setTherapistCache] = useState({});
  const [therapistsOnline, setTherapistsOnline] = useState([]);

  // Initialize chat & track messages
  useEffect(() => {
    loginAnonymously();

    const q = query(collection(db, "messages"), orderBy("timestamp"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setMessages(msgs);

      // Update therapist presence based on active messages
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

      if (user?.email) {
        // Only send join message once per session
        if (!sessionStorage.getItem("therapistJoined")) {
          await addDoc(collection(db, "messages"), {
            text: `${user.displayName || "Therapist"} joined the chat`,
            role: "system",
            timestamp: serverTimestamp(),
          });
          sessionStorage.setItem("therapistJoined", "true");
        }
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
    let therapistId;

    if (role === "therapist") {
      therapistId = auth.currentUser.uid;

      try {
        const ref = doc(db, "therapists", therapistId);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          displayName = snap.data().name;
          setTherapistCache((prev) => ({ ...prev, [therapistId]: displayName }));
        }
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

    if (role === "therapist") messageData.therapistId = therapistId;

    await addDoc(collection(db, "messages"), messageData);
    setNewMessage("");

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

  return (
    <div
      className="chat-box"
      style={{
        border: "1px solid #ccc",
        padding: "10px",
        height: "350px",
        overflowY: "scroll",
        marginBottom: "10px",
      }}
    >
      <h2>Anonymous Mental Health Chat</h2>

      <p>
        {therapistsOnline.length > 0
          ? `Therapists online: ${therapistsOnline.join(", ")}`
          : "No therapist online currently"}
      </p>

      {selectedTherapist ? (
        <TherapistProfile
          therapist={selectedTherapist}
          onBack={() => setSelectedTherapist(null)}
            onStartChat={() => {
            alert(`Starting private chat with ${selectedTherapist.name}`);
          }}
        />
      ) : (
        <>
          <div className="chat-box" style={{ marginBottom: "10px" }}>
            {messages.map((msg) => {
              let displayName = msg.displayName;
              if (msg.role === "therapist" && msg.therapistId) {
                displayName = therapistCache[msg.therapistId] || displayName;
              }

              return (
                <p
                  key={msg.id}
                  style={{
                    backgroundColor:
                      msg.role === "ai"
                        ? "#f0fff0"
                        : msg.role === "system"
                        ? "#f9f9f9"
                        : "transparent",
                    padding: "8px",
                    borderRadius: "6px",
                    color:
                      msg.role === "ai"
                        ? "green"
                        : msg.role === "therapist"
                        ? "blue"
                        : msg.role === "system"
                        ? "gray"
                        : "black",
                    fontStyle:
                      msg.role === "ai" || msg.role === "system"
                        ? "italic"
                        : "normal",
                    fontWeight: msg.role === "therapist" ? "bold" : "normal",
                  }}
                >
                  {msg.role === "system" ? (
                    <em>{msg.text}</em>
                  ) : (
                    <>
                      <strong
                        style={{
                          cursor:
                            msg.role === "therapist" ? "pointer" : "default",
                          textDecoration:
                            msg.role === "therapist" ? "underline" : "none",
                        }}
                        onClick={async () => {
                          if (msg.role === "therapist" && msg.therapistId) {
                            try {
                              const ref = doc(db, "therapists", msg.therapistId);
                              const snap = await getDoc(ref);
                              if (snap.exists()) {
                                const data = snap.data();
                                setSelectedTherapist(data);
                                setTherapistCache((prev) => ({
                                  ...prev,
                                  [msg.therapistId]: data.name,
                                }));
                              }
                            } catch (err) {
                              console.error(
                                "Error fetching therapist profile:",
                                err
                              );
                            }
                          }
                        }}
                      >
                        {displayName || "Anonymous"}
                      </strong>
                      : {msg.text}
                    </>
                  )}
                </p>
              );
            })}
            {aiTyping && (
              <p style={{ fontStyle: "italic", color: "gray" }}>
                AI Support is typing...
              </p>
            )}
          </div>

          <input
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder={isLoggedIn ? "Type your message..." : "Logging in..."}
            disabled={!isLoggedIn}
            style={{ width: "70%", marginRight: "5px" }}
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
