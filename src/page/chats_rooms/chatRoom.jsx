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
import { db, auth, storage, ref, uploadBytes, getDownloadURL } from "../../utils/firebase";
import { getAIResponse } from "../../utils/AiChatIntegration";
import { mapMessagesForAI } from "../../utils/aiMessageMapper";
import { loginAnonymously, getAnonName } from "../../login/anonymous_login";
import TherapistProfile from "../../components/TherapistProfile";
import { useTypingStatus } from "../../components/useTypingStatus";
import EmojiPicker from 'emoji-picker-react';
import "../../styles/chatroom.css";

function Chatroom() {
  const [messages, setMessages] = useState([]);
  const [groupEvents, setGroupEvents] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [aiTyping, setAiTyping] = useState(false);
  const [selectedTherapist, setSelectedTherapist] = useState(null);
  const [therapistsOnline, setTherapistsOnline] = useState([]);
  const [therapistName, setTherapistName] = useState("Therapist");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [participants, setParticipants] = useState([]);
  const modalRef = useRef(null);

  const displayName = auth.currentUser?.email ? therapistName : getAnonName();
  const { typingUsers, handleTyping } = useTypingStatus(displayName);
  const messagesEndRef = useRef(null);
  const navigate = useNavigate();

  // Auto scroll chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, groupEvents]);

  // Handle clicks outside the modal to close it
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (modalRef.current && !modalRef.current.contains(event.target)) {
        setSelectedTherapist(null);
      }
    };
    if (selectedTherapist) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [selectedTherapist]);

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

  // Watch group chat events
  useEffect(() => {
    const groupRef = doc(db, "groupChats", "mainGroup");
    const q = query(collection(groupRef, "events"), orderBy("timestamp"), limit(50));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const evts = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        setGroupEvents(evts);
      },
      (err) => {
        console.error("Error fetching group events:", err);
        alert("Failed to load group events. Please try again.");
      }
    );
    return () => unsubscribe();
  }, []);

  // Watch group chat participants
  useEffect(() => {
    const groupRef = doc(db, "groupChats", "mainGroup");
    const unsub = onSnapshot(groupRef, (snap) => {
      if (snap.exists()) {
        setParticipants(snap.data().participants || []);
      }
    });
    return () => unsub();
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

  // Toggle reaction on message
  const toggleReaction = async (msgId, reactionType) => {
    if (!auth.currentUser) return;
    const msgRef = doc(db, "messages", msgId);
    try {
      await runTransaction(db, async (transaction) => {
        const msgSnap = await transaction.get(msgRef);
        if (!msgSnap.exists()) return;
        const reactions = msgSnap.data().reactions || {};
        const userId = auth.currentUser.uid;
        const currentReactions = reactions[reactionType] || [];
        const updatedReactions = currentReactions.includes(userId)
          ? currentReactions.filter((id) => id !== userId)
          : [...currentReactions, userId];
        const updated = { ...reactions, [reactionType]: updatedReactions };
        transaction.update(msgRef, { reactions: updated });
      });
    } catch (err) {
      console.error("Error toggling reaction:", err);
      alert("Failed to update reaction. Please try again.");
    }
  };

  // Handle emoji click
  const onEmojiClick = (emojiData) => {
    setNewMessage(newMessage + emojiData.emoji);
    setShowEmojiPicker(false);
  };

  // Handle file upload
  const handleFileUpload = async (file) => {
    if (!file || !auth.currentUser) return;
    try {
      const storageRef = ref(storage, `chatroom/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const fileUrl = await getDownloadURL(storageRef);
      await runTransaction(db, async (transaction) => {
        const messagesRef = collection(db, "messages");
        const typingDoc = doc(db, "typingStatus", auth.currentUser.uid);
        transaction.set(doc(messagesRef), {
          text: newMessage || "",
          fileUrl,
          userId: auth.currentUser.uid,
          displayName,
          role: auth.currentUser.email ? "therapist" : "user",
          timestamp: serverTimestamp(),
          reactions: {},
        });
        transaction.set(typingDoc, {
          typing: false,
          name: displayName,
          timestamp: serverTimestamp(),
        });
      });
      setNewMessage("");
      setShowEmojiPicker(false);
    } catch (err) {
      console.error("Error uploading file:", err);
      alert("Failed to upload file. Please try again.");
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
          fileUrl: null,
          userId: auth.currentUser.uid,
          displayName,
          role,
          timestamp: serverTimestamp(),
          reactions: {},
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
              fileUrl: null,
              userId: "AI_BOT",
              displayName: "AI Support",
              role: "ai",
              timestamp: serverTimestamp(),
              reactions: {},
            });
          });
        } catch (err) {
          console.error("AI error:", err);
          await runTransaction(db, async (transaction) => {
            transaction.set(doc(collection(db, "messages")), {
              text: "Sorry, I couldn’t respond right now. Please try again later.",
              fileUrl: null,
              userId: "AI_BOT",
              displayName: "AI Support",
              role: "ai",
              timestamp: serverTimestamp(),
              reactions: {},
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
    setShowEmojiPicker(false);
  };

  // Check therapist online by uid
  const isTherapistOnline = (uid) =>
    therapistsOnline.some((t) => t.uid === uid && t.online);

  // Combine messages and events
  const combinedChat = [...messages, ...groupEvents].sort((a, b) => {
    const t1 = a.timestamp?.toMillis ? a.timestamp.toMillis() : 0;
    const t2 = b.timestamp?.toMillis ? b.timestamp.toMillis() : 0;
    return t1 - t2;
  });

  return (
    <div className="chatroom">
      <button className="theme-toggle" onClick={() => alert("Theme toggle coming soon!")}>
        <i className="fa-solid fa-moon"></i>
      </button>
      <h2 className="header-name">Anonymous Mental Health Chat</h2>
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
      <div className="participant-list">
        <h4>Participants ({participants.length})</h4>
        {participants.map((uid) => (
          <div key={uid} className="participant-item">
            {uid}
          </div>
        ))}
      </div>
      {selectedTherapist && (
        <div className="modal-backdrop">
          <div className="modal" ref={modalRef}>
            <TherapistProfile
              therapist={selectedTherapist}
              isOnline={isTherapistOnline(selectedTherapist.uid)}
              onBack={() => setSelectedTherapist(null)}
              onStartChat={() => startPrivateChat(selectedTherapist)}
              onBookAppointment={() => alert("Appointment booking coming soon!")}
            />
          </div>
        </div>
      )}
      <div className={selectedTherapist ? "chatroom-content blurred" : "chatroom-content"}>
        {combinedChat.some((msg) => msg.pinned) && (
          <div className="pinned-message">
            <strong>Pinned:</strong>{" "}
            {combinedChat.find((msg) => msg.pinned)?.text || "Welcome to the chatroom!"}
          </div>
        )}
        <div className="chat-box">
          {combinedChat.map((msg) => (
            <p
              key={msg.id}
              className={`chat-message ${
                msg.role === "therapist"
                  ? "therapist"
                  : msg.role === "ai"
                  ? "ai"
                  : msg.role === "system"
                  ? "system"
                  : "user"
              }`}
              onClick={() => msg.role === "therapist" && handleTherapistClick(msg)}
            >
              {msg.role === "system" ? (
                <em>{msg.text}</em>
              ) : (
                <>
                  <strong>{msg.displayName || msg.user || "Anonymous"}</strong>
                  <div className="message-content-time">
                    <span>{msg.text}</span>
                    {msg.fileUrl && (
                      <a
                        href={msg.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="attachment-link"
                      >
                        <i className="fa-solid fa-paperclip"></i> View Attachment
                      </a>
                    )}
                    <span className="message-timestamp">
                      {msg.timestamp?.toDate().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <span className="message-reactions">
                      <i
                        className="fa-solid fa-heart reaction"
                        style={{ color: msg.reactions?.heart?.length > 0 ? "red" : "gray" }}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleReaction(msg.id, "heart");
                        }}
                      >
                        {msg.reactions?.heart?.length || 0}
                      </i>
                      <i
                        className="fa-solid fa-thumbs-up reaction"
                        style={{ color: msg.reactions?.thumbsUp?.length > 0 ? "blue" : "gray" }}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleReaction(msg.id, "thumbsUp");
                        }}
                      >
                        {msg.reactions?.thumbsUp?.length || 0}
                      </i>
                    </span>
                  </div>
                </>
              )}
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
            <button
              className="emoji-btn"
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            >
              <i className="fa-regular fa-face-smile"></i>
            </button>
            {showEmojiPicker && <EmojiPicker className="EmojiPicker" onEmojiClick={onEmojiClick} />}
            <input
              type="file"
              id="chatroom-file-upload"
              style={{ display: "none" }}
              onChange={(e) => handleFileUpload(e.target.files[0])}
            />
            <button
              className="attach-btn"
              onClick={() => document.getElementById("chatroom-file-upload").click()}
            >
              <i className="fa-solid fa-paperclip"></i>
            </button>
            <input
              className="inputInsert"
              type="text"
              value={newMessage}
              onChange={(e) => {
                setNewMessage(e.target.value);
                handleTyping(e.target.value);
              }}
              placeholder="Type a message..."
            />
            <button className="send-btn" onClick={sendMessage}>
              <i className="fa-solid fa-paper-plane"></i>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default Chatroom;