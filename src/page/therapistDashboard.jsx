// TherapistDashboard.js
import React, { useEffect, useState } from "react";
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

function TherapistDashboard() {
  const [messages, setMessages] = useState([]);
  const [reply, setReply] = useState("");
  const [privateChats, setPrivateChats] = useState([]);
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

  // Load group chat messages
  useEffect(() => {
    const q = query(collection(db, "messages"), orderBy("timestamp"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setMessages(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubscribe();
  }, []);

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
  };

  // Join private chat
  const joinPrivateChat = async (chatId) => {
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

  // Leave private chat
  const leavePrivateChat = async (chatId) => {
    const chatRef = doc(db, "privateChats", chatId);
    await addDoc(collection(db, "privateChats", chatId, "messages"), {
      text: `${therapistInfo.name} left the chat`,
      role: "system",
      timestamp: serverTimestamp(),
    });
    await updateDoc(chatRef, {
      participants: arrayRemove(auth.currentUser.uid),
    });
    setActiveChatId(null);
  };

  return (
    <div style={{ padding: "20px" }}>
      <h2>Therapist Dashboard</h2>

      {/* Therapist Profile */}
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
              onChange={(e) =>
                setTherapistInfo((prev) => ({ ...prev, name: e.target.value }))
              }
              style={{ width: "100%", marginBottom: "5px" }}
            />
            <input
              type="text"
              placeholder="Gender"
              value={therapistInfo.gender}
              onChange={(e) =>
                setTherapistInfo((prev) => ({ ...prev, gender: e.target.value }))
              }
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
              onChange={(e) =>
                setTherapistInfo((prev) => ({ ...prev, profile: e.target.value }))
              }
              style={{ width: "100%", marginBottom: "5px" }}
            />
            <input
              type="number"
              placeholder="Rating"
              value={therapistInfo.rating}
              onChange={(e) =>
                setTherapistInfo((prev) => ({
                  ...prev,
                  rating: parseFloat(e.target.value),
                }))
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
            <p><strong>Name:</strong> {therapistInfo.name}</p>
            <p><strong>Gender:</strong> {therapistInfo.gender}</p>
            <p><strong>Position:</strong> {therapistInfo.position}</p>
            <p><strong>About:</strong> {therapistInfo.profile}</p>
            <p>
              <strong>Rating:</strong>{" "}
              <span style={{ color: "gold" }}>⭐ {therapistInfo.rating}</span>
            </p>
            <button onClick={() => setEditing(true)}>Edit Profile</button>
          </>
        )}
      </div>

      {/* Group Chat */}
      {!activeChatId && (
        <>
          <h3>Group Chat</h3>
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
                  color:
                    msg.role === "therapist"
                      ? "blue"
                      : msg.role === "ai"
                      ? "green"
                      : "black",
                  fontWeight: msg.role === "therapist" ? "bold" : "normal",
                  fontStyle: msg.role === "ai" ? "italic" : "normal",
                }}
              >
                <strong>{msg.displayName || "Anonymous"}</strong>: {msg.text}
              </p>
            ))}
          </div>
          <input
            type="text"
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder="Reply to group chat..."
            style={{ width: "70%", marginRight: "5px" }}
          />
          <button onClick={sendReply}>Send</button>
        </>
      )}

      {/* Private Chats */}
      {!activeChatId && (
        <div style={{ marginTop: "20px" }}>
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
          <button onClick={() => leavePrivateChat(activeChatId)}>⬅ Leave Chat</button>
          <PrivateChat chatId={activeChatId} />
        </div>
      )}
    </div>
  );
}

export default TherapistDashboard;
