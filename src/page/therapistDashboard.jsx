import React, { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { db, auth } from "../utils/firebase";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  addDoc,
  serverTimestamp,
  doc,
  updateDoc,
  arrayUnion,
  arrayRemove,
  getDoc,
  setDoc,
} from "firebase/firestore";
import PrivateChat from "./chats_rooms/PrivateChat";
import { useTypingStatus } from "../components/useTypingStatus";
import { signOut } from "firebase/auth";
import LeaveChatButton from "../components/LeaveChatButton";

function TherapistDashboard() {
  const [messages, setMessages] = useState([]);
  const [reply, setReply] = useState("");
  const [privateChats, setPrivateChats] = useState([]);
  const [isGroupChatOpen, setIsGroupChatOpen] = useState(false);
  const [inGroupChat, setInGroupChat] = useState(false);
  const [groupUnreadCount, setGroupUnreadCount] = useState(0);
  const [activeChatId, setActiveChatId] = useState(null);
  const [editing, setEditing] = useState(false);
  const [therapistInfo, setTherapistInfo] = useState({
    name: "",
    gender: "",
    position: "",
    profile: "",
    rating: 0,
  });
  const therapistId = auth.currentUser?.uid;
  const displayName = therapistInfo.name || "Therapist";
  const { typingUsers, handleTyping } = useTypingStatus(displayName);
  const messagesEndRef = useRef(null);
  const navigate = useNavigate();

  // Auto scroll chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Group messages listener + unread count
  useEffect(() => {
    const q = query(collection(db, "messages"), orderBy("timestamp"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

      // Update unread count if new messages arrive while closed
      if (!isGroupChatOpen && msgs.length > messages.length) {
        setGroupUnreadCount((prev) => prev + (msgs.length - messages.length));
      }

      setMessages(msgs);
    });

    return () => unsubscribe();
  }, [isGroupChatOpen, messages.length]);
  
  useEffect(() => {
    if (!auth.currentUser) return;
    const groupRef = doc(db, "groupChat", "mainGroup");
    const unsub = onSnapshot(groupRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        const isParticipant = data.participants.includes(auth.currentUser.uid);
        setInGroupChat(isParticipant);
        setIsGroupChatOpen(isParticipant && isGroupChatOpen); 
        // keeps group chat open only if user is still a participant
      }
    });
    return () => unsub();
  }, [isGroupChatOpen]);

  // Fetch therapist profile
  useEffect(() => {
    if (!therapistId) return;
    const fetchProfile = async () => {
      try {
        const snap = await getDoc(doc(db, "therapists", therapistId));
        if (snap.exists()) {
          setTherapistInfo(snap.data());
        } else {
          setTherapistInfo({
            name: "New Therapist",
            gender: "",
            position: "",
            profile: "",
            rating: 0,
          });
        }
      } catch (err) {
        console.error("Error fetching therapist profile:", err);
      }
    };
    fetchProfile();
  }, [therapistId]);

  const handleLogout = async () => {
    try {
      if (!auth.currentUser) return;
      // If therapist is inside a private chat, log a system message before leaving
      if (activeChatId) {
        const chatRef = doc(db, "privateChats", activeChatId);
        await addDoc(collection(db, "privateChats", activeChatId, "messages"), {
          text: `${therapistInfo.name} left the chat`,
          role: "system",
          timestamp: serverTimestamp(),
        });
        await updateDoc(chatRef, {
          participants: arrayRemove(auth.currentUser.uid),
        });
      }

      // Sign out from Firebase
      await signOut(auth);

      // Reset state
      setTherapistInfo({ name: "#", gender: "#", position: "#", profile: "#", rating: 0 });
      setMessages([]);
      setPrivateChats([]);
      setActiveChatId(null);

      navigate("/therapist_login");
    } catch (err) {
      console.error("Logout error:", err);
    }
  };

  // Save therapist profile
  const saveProfile = async () => {
    if (!therapistId) return;
    try {
      await setDoc(doc(db, "therapists", therapistId), therapistInfo, { merge: true });
      alert("Profile saved successfully!");
      setEditing(false);
    } catch (err) {
      console.error("Error saving profile:", err);
    }
  };

  // Load private chats
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "privateChats"), (snapshot) => {
      setPrivateChats(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubscribe();
  }, []);

  // Send message to group
  const sendReply = async () => {
    if (!reply.trim() || !auth.currentUser) return;

    await addDoc(collection(db, "messages"), {
      text: reply,
      userId: auth.currentUser.uid,
      displayName: therapistInfo.name,
      role: "therapist",
      timestamp: serverTimestamp(),
    });

    setReply("");
    const typingDoc = doc(db, "typingStatus", auth.currentUser.uid);
    await updateDoc(typingDoc, { typing: false }).catch(async () => {
    await setDoc(typingDoc, { typing: false, name: therapistInfo.name || "Therapist", timestamp: serverTimestamp() });
    });
  };

  const joinGroupChat = async () => {
    if (!auth.currentUser) return;
    const groupRef = doc(db, "groupChat", "mainGroup");

    // Ensure the doc exists, create if missing
    await setDoc(
      groupRef,
      { participants: arrayUnion(auth.currentUser.uid) },
      { merge: true }
    );

    await addDoc(collection(db, "messages"), {
      text: `${therapistInfo.name} joined the group chat`,
      role: "system",
      timestamp: serverTimestamp(),
    });

    setIsGroupChatOpen(true);
    setGroupUnreadCount(0);
  };

  const leaveGroupChat = async () => {
    if (!auth.currentUser) return;
    const groupRef = doc(db, "groupChat", "mainGroup");

    await setDoc(
      groupRef,
      { participants: arrayRemove(auth.currentUser.uid) },
      { merge: true }
    );

    await addDoc(collection(db, "messages"), {
      text: `${therapistInfo.name} left the group chat`,
      role: "system",
      timestamp: serverTimestamp(),
    });

    // Immediately update local state
    setIsGroupChatOpen(false);
    setInGroupChat(false);  // <- ensure UI knows user left
  };

  // Join private chat
  const joinPrivateChat = async (chatId) => {
    if (!auth.currentUser) return;
    const chatRef = doc(db, "privateChats", chatId);
    await updateDoc(chatRef, {
      participants: arrayUnion(auth.currentUser.uid),
      unreadCountForTherapist: 0,
    });
    await addDoc(collection(db, "privateChats", chatId, "messages"), {
      text: `${therapistInfo.name} joined the chat`,
      role: "system",
      timestamp: serverTimestamp(),
    });
    setActiveChatId(chatId);
  };

  return (
    <div style={{ padding: "20px" }}>
      <h2>Therapist Dashboard</h2>
      <button onClick={handleLogout} style={{ marginBottom: "20px", background: "red", color: "white" }}>
        Logout
      </button>
      {/* Therapist Profile (editable) */}
      <div
        style={{
          border: "1px solid #ddd",
          padding: "15px",
          borderRadius: "8px",
          marginBottom: "20px",
          background: "#f9f9f9",
        }}
      >
        <h3>Therapist Profile</h3>
        {editing ? (
          <>
            <input
              type="text"
              placeholder="Name"
              value={therapistInfo.name}
              onChange={(e) => setTherapistInfo((prev) => ({ ...prev, name: e.target.value }))}
              style={{ width: "100%", marginBottom: "5px" }}
            />
            <input
              type="text"
              placeholder="Gender"
              value={therapistInfo.gender}
              onChange={(e) => setTherapistInfo((prev) => ({ ...prev, gender: e.target.value }))}
              style={{ width: "100%", marginBottom: "5px" }}
            />
            <input
              type="text"
              placeholder="Position"
              value={therapistInfo.position}
              onChange={(e) =>
                setTherapistInfo((prev) => ({ ...prev, position: e.target.value }))
              }
              style={{ width: "100%", marginBottom: "5px" }}
            />
            <textarea
              placeholder="Profile description"
              value={therapistInfo.profile}
              onChange={(e) => setTherapistInfo((prev) => ({ ...prev, profile: e.target.value }))}
              style={{ width: "100%", marginBottom: "5px" }}
            />
            <input
              type="number"
              placeholder="Rating"
              value={therapistInfo.rating}
              onChange={(e) =>
                setTherapistInfo((prev) => ({ ...prev, rating: parseFloat(e.target.value) || 0 }))
              }
              style={{ width: "100%", marginBottom: "5px" }}
              min={0}
              max={5}
              step={0.1}
            />
            <button onClick={saveProfile} style={{ marginRight: "10px" }}>
              Save
            </button>
            <button onClick={() => setEditing(false)}>Cancel</button>
          </>
        ) : (
          <>
            <p>
              <strong>Name:</strong> {therapistInfo.name}
            </p>
            <p>
              <strong>Gender:</strong> {therapistInfo.gender}
            </p>
            <p>
              <strong>Position:</strong> {therapistInfo.position}
            </p>
            <p>
              <strong>About:</strong> {therapistInfo.profile}
            </p>
            <p>
              <strong>Rating:</strong> <span style={{ color: "gold" }}>⭐ {therapistInfo.rating}</span>
            </p>
            <button onClick={() => setEditing(true)}>Edit Profile</button>
          </>
        )}
      </div>

      {/* Active Group Chat */}
      {isGroupChatOpen && inGroupChat && !activeChatId && (
        <div>
          <LeaveChatButton
            type="group"
            therapistInfo={therapistInfo}
            onLeave={leaveGroupChat}
          />
          <div
            style={{
              border: "1px solid #ccc",
              padding: "10px",
              height: "200px",
              overflowY: "scroll",
              marginBottom: "10px",
            }}
          >
            {messages.map((msg) => (
              <p
                key={msg.id}
                style={{
                  color: msg.role === "therapist" ? "blue" : msg.role === "ai" ? "green" : "black",
                  fontWeight: msg.role === "therapist" ? "bold" : "normal",
                  fontStyle: msg.role === "ai" ? "italic" : "normal",
                }}
              >
                <strong>{msg.displayName || "Anonymous"}</strong>: {msg.text}
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
            value={reply}
            onChange={(e) => {
              setReply(e.target.value);
              handleTyping(e.target.value);
            }}
            placeholder="Reply to group chat..."
            style={{ width: "70%", marginRight: "5px" }}
          />
          <button onClick={sendReply}>Send</button>
        </div>
      )}

      {/* Group Chat List Style */}
      {!activeChatId && !isGroupChatOpen && (
        <div style={{ marginTop: "20px" }}>
          <h3>Chats</h3>

          {/* Group Chat as a card */}
          <div
            style={{
              border: "1px solid #ddd",
              padding: "10px",
              marginBottom: "8px",
              cursor: "pointer",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
            onClick={joinGroupChat}
          >
            <div>
              <strong>Group Chat</strong> <br />
              <small>
                {messages.length > 0
                  ? `${messages[messages.length - 1].displayName || "Anonymous"}: ${
                      messages[messages.length - 1].text
                    }`
                  : "No messages yet"}
              </small>
            </div>

            {/* Show unread messages as badge */}
            {groupUnreadCount > 0 && (
              <span
                style={{
                  background: "red",
                  color: "white",
                  borderRadius: "50%",
                  padding: "5px 10px",
                  fontSize: "12px",
                }}
              >
                {groupUnreadCount}
              </span>
            )}
          </div>

          {/* Private Chats below group chat */}
          <h3>Private Chats</h3>
          {privateChats.length === 0 ? (
            <p>No private chats yet</p>
          ) : (
            privateChats.map((chat) => (
              <div
                key={chat.id}
                style={{
                  border: "1px solid #ddd",
                  padding: "10px",
                  marginBottom: "8px",
                  cursor: "pointer",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
                onClick={() => joinPrivateChat(chat.id)}
              >
                <div>
                  <strong>Chat ID:</strong> {chat.id} <br />
                  <small>{chat.lastMessage || "No messages yet"}</small>
                </div>
                {chat.unreadCountForTherapist > 0 && (
                  <span
                    style={{
                      background: "red",
                      color: "white",
                      borderRadius: "50%",
                      padding: "5px 10px",
                      fontSize: "12px",
                    }}
                  >
                    {chat.unreadCountForTherapist}
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Active Private Chat */}
      {activeChatId && (
        <div>
          <LeaveChatButton
            type="private"
            chatId={activeChatId}
            therapistInfo={therapistInfo}
            setActiveChatId={setActiveChatId}
          />
          <PrivateChat chatId={activeChatId} />
        </div>
      )}
    </div>
  );
}

export default TherapistDashboard;