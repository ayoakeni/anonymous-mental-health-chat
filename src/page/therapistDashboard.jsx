import React, { useEffect, useState, useRef } from "react";
import { useNavigate, useLocation, Routes, Route } from "react-router-dom";
import { db, auth, Timestamp } from "../utils/firebase";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  doc,
  arrayUnion,
  arrayRemove,
  getDoc,
  setDoc,
  where,
  limit,
  runTransaction,
} from "firebase/firestore";
import { debounce } from "lodash";
import { useTypingStatus } from "../components/useTypingStatus";
import { signOut } from "firebase/auth";
import LeaveChatButton from "../components/LeaveChatButton";
import Sidebar from "../components/sidebar";
import "../styles/therapistDashboard.css";

const logFirestoreOperation = (operation, count, details) => {
  console.log(`Firestore ${operation}: ${count} documents`, details);
};

function TherapistDashboard() {
  const [messages, setMessages] = useState([]);
  const [groupEvents, setGroupEvents] = useState([]);
  const [reply, setReply] = useState("");
  const [privateChats, setPrivateChats] = useState([]);
  const [isGroupChatOpen, setIsGroupChatOpen] = useState(false);
  const [inGroupChat, setInGroupChat] = useState(false);
  const [groupUnreadCount, setGroupUnreadCount] = useState(0);
  const [lastSeenTimestamp, setLastSeenTimestamp] = useState(null);
  const [activeChatId, setActiveChatId] = useState(null);
  const [editing, setEditing] = useState(false);
  const [therapistInfo, setTherapistInfo] = useState({
    name: "",
    gender: "",
    position: "",
    profile: "",
    rating: 0,
  });
  const [privateMessages, setPrivateMessages] = useState([]);
  const [privateEvents, setPrivateEvents] = useState([]);
  const [isTherapistAvailable, setIsTherapistAvailable] = useState(false);
  const [activeTherapists, setActiveTherapists] = useState([]);
  const [newPrivateMessage, setNewPrivateMessage] = useState("");
  const [isSendingPrivate, setIsSendingPrivate] = useState(false);
  const [selectedTherapist, setSelectedTherapist] = useState(null);
  const [therapistName, setTherapistName] = useState("Therapist");
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const therapistId = auth.currentUser?.uid;
  const displayName = therapistInfo.name || "Unknown Therapist";
  const { typingUsers, handleTyping } = useTypingStatus(displayName);
  const messagesEndRef = useRef(null);
  const privateMessagesEndRef = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();

  // Toggle sidebar
  const handleToggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  // Calculate total private unread count
  const privateUnreadCount = privateChats.reduce(
    (sum, chat) => sum + (chat.unreadCountForTherapist || 0),
    0
  );

  // Auto scroll group chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, groupEvents]);

  // Auto scroll private chat
  useEffect(() => {
    privateMessagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [privateMessages, privateEvents]);

  // Load private chats
  useEffect(() => {
    if (!therapistId) return;
    const q = query(
      collection(db, "privateChats"),
      where("participants", "array-contains", therapistId),
      limit(50)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const chatsWithMessages = snapshot.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        .filter((chat) => chat.lastMessage && chat.lastMessage.trim() !== "");
      logFirestoreOperation("read", snapshot.docs.length, { collection: "privateChats" });
      setPrivateChats(chatsWithMessages);
    }, (err) => {
      console.error("Error fetching private chats:", err);
      if (err.code === "resource-exhausted") {
        alert("Firestore quota exceeded. Please try again later.");
      }
    });
    return () => unsubscribe();
  }, [therapistId]);

  // Watch therapist presence
  useEffect(() => {
    const q = query(collection(db, "therapistsOnline"), limit(50));
    const unsub = onSnapshot(q, (snap) => {
      const onlineTherapists = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((t) => t.online);
      logFirestoreOperation("read", snap.docs.length, { collection: "therapistsOnline" });
      setIsTherapistAvailable(onlineTherapists.length > 0);
      setActiveTherapists(onlineTherapists.map((t) => t.name || "Therapist"));
    }, (err) => {
      console.error("Error fetching therapists online:", err);
      if (err.code === "resource-exhausted") {
        alert("Firestore quota exceeded. Please try again later.");
      }
    });
    return () => unsub();
  }, []);

  // Watch private chat messages
  useEffect(() => {
    if (!activeChatId) return;
    const chatRef = doc(db, "privateChats", activeChatId);
    const q = query(collection(chatRef, "messages"), orderBy("timestamp"), limit(50));
    const unsubscribeMessages = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      logFirestoreOperation("read", snapshot.docs.length, { collection: `privateChats/${activeChatId}/messages` });
      setPrivateMessages(msgs);
    }, (err) => {
      console.error("Error fetching private messages:", err);
      if (err.code === "resource-exhausted") {
        alert("Firestore quota exceeded. Please try again later.");
      }
    });
    return () => unsubscribeMessages();
  }, [activeChatId]);

  // Watch private chat events
  useEffect(() => {
    if (!activeChatId) return;
    const chatRef = doc(db, "privateChats", activeChatId);
    const q = query(collection(chatRef, "events"), orderBy("timestamp"), limit(50));
    const unsubscribeEvents = onSnapshot(q, (snapshot) => {
      const evts = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      logFirestoreOperation("read", snapshot.docs.length, { collection: `privateChats/${activeChatId}/events` });
      setPrivateEvents(evts);
    }, (err) => {
      console.error("Error fetching private events:", err);
      if (err.code === "resource-exhausted") {
        alert("Firestore quota exceeded. Please try again later.");
      }
    });
    return () => unsubscribeEvents();
  }, [activeChatId]);

  // Group messages listener + unread count
  useEffect(() => {
    const q = query(collection(db, "messages"), orderBy("timestamp"), limit(50));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      logFirestoreOperation("read", snapshot.docs.length, { collection: "messages" });
      setMessages(msgs);
      if (!isGroupChatOpen) {
        const unread = msgs.filter((msg) => {
          const msgTime = msg.timestamp?.toMillis();
          return msgTime && (!lastSeenTimestamp || msgTime > lastSeenTimestamp);
        }).length;
        setGroupUnreadCount(unread);
      }
    }, (err) => {
      console.error("Error fetching group messages:", err);
      if (err.code === "resource-exhausted") {
        alert("Firestore quota exceeded. Please try again later.");
      }
    });
    return () => unsubscribe();
  }, [isGroupChatOpen, lastSeenTimestamp]);

  // Watch group chat events
  useEffect(() => {
    const groupRef = doc(db, "groupChats", "mainGroup");
    const q = query(collection(groupRef, "events"), orderBy("timestamp"), limit(50));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const evts = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      logFirestoreOperation("read", snapshot.docs.length, { collection: "groupChats/mainGroup/events" });
      setGroupEvents(evts);
    }, (err) => {
      console.error("Error fetching group events:", err);
      if (err.code === "resource-exhausted") {
        alert("Firestore quota exceeded. Please try again later.");
      }
    });
    return () => unsubscribe();
  }, []);

  // Watch group chat participation
  useEffect(() => {
    if (!auth.currentUser) return;
    const groupRef = doc(db, "groupChats", "mainGroup");
    const unsub = onSnapshot(groupRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        const isParticipant = data.participants?.includes(auth.currentUser.uid) || false;
        setInGroupChat(isParticipant);
        setIsGroupChatOpen(isParticipant && isGroupChatOpen);
      }
    }, (err) => {
      console.error("Error fetching group chat data:", err);
      if (err.code === "resource-exhausted") {
        alert("Firestore quota exceeded. Please try again later.");
      }
    });
    return () => unsub();
  }, [isGroupChatOpen]);

  // Fetch last seen timestamp
  useEffect(() => {
    if (!therapistId) return;
    const fetchLastSeen = async () => {
      const docRef = doc(db, "therapists", therapistId);
      const snap = await getDoc(docRef);
      logFirestoreOperation("read", 1, { collection: "therapists", doc: therapistId });
      if (snap.exists()) {
        const lastSeenGroupChat = snap.data().lastSeenGroupChat;
        let lastSeen;
        if (lastSeenGroupChat instanceof Timestamp) {
          lastSeen = lastSeenGroupChat.toMillis();
        } else if (typeof lastSeenGroupChat === 'number') {
          lastSeen = lastSeenGroupChat;
        } else {
          lastSeen = Date.now();
        }
        setLastSeenTimestamp(lastSeen);
      } else {
        setLastSeenTimestamp(Date.now());
      }
    };
    fetchLastSeen().catch((err) => {
      console.error("Error fetching last seen:", err);
      if (err.code === "resource-exhausted") {
        alert("Firestore quota exceeded. Please try again later.");
      }
    });
  }, [therapistId]);

  // Fetch therapist profile
  useEffect(() => {
    if (!therapistId) return;
    const therapistRef = doc(db, "therapists", therapistId);
    const unsubscribe = onSnapshot(therapistRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setTherapistInfo(data);
        setTherapistName(data.name || "Therapist");
        logFirestoreOperation("read", 1, { collection: "therapists", doc: therapistId });
      } else {
        const defaultInfo = {
          name: "New Therapist",
          gender: "",
          position: "",
          profile: "",
          rating: 0,
        };
        setTherapistInfo(defaultInfo);
        setTherapistName("Therapist");
      }
    }, (err) => {
      console.error("Error fetching therapist profile:", err);
      if (err.code === "resource-exhausted") {
        alert("Firestore quota exceeded. Please try again later.");
      }
    });
    return () => unsubscribe();
  }, [therapistId]);

  // Tab close vs refresh detection
  useEffect(() => {
    if (!auth.currentUser) return;
    let isReloading = false;
    const debouncedLeave = debounce(async () => {
      if (isReloading) return;
      const uid = auth.currentUser.uid;
      try {
        await runTransaction(db, async (transaction) => {
          if (activeChatId) {
            const privateChatRef = await transaction.get(doc(db, "privateChats", activeChatId));
            if (privateChatRef.exists()) {
              transaction.update(privateChatRef, {
                participants: arrayRemove(uid),
                aiOffered: false,
              });
              transaction.set(doc(collection(privateChatRef, "events")), {
                type: "leave",
                user: displayName,
                text: `${displayName} left the chat.`,
                role: "system",
                timestamp: serverTimestamp(),
              });
            }
          }
          const groupChatRef = await transaction.get(doc(db, "groupChats", "mainGroup"));
          if (groupChatRef.exists()) {
            transaction.update(groupChatRef, {
              participants: arrayRemove(uid),
            });
            transaction.set(doc(collection(groupChatRef, "events")), {
              type: "leave",
              user: displayName,
              timestamp: serverTimestamp(),
            });
          }
        });
        logFirestoreOperation("write", 2, { collections: ["privateChats", "groupChats"] });
      } catch (err) {
        console.error("Error auto-leaving chats:", err);
        if (err.code === "resource-exhausted") {
          alert("Firestore quota exceeded. Please try again later.");
        }
      }
    }, 1000);
    const handleBeforeUnload = () => {
      debouncedLeave();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        isReloading = true;
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("visibilitychange", handleVisibilityChange);
      debouncedLeave.cancel();
    };
  }, [activeChatId, displayName]);

  // Send message to group chat
  const sendReply = async () => {
    if (!reply.trim() || !auth.currentUser) return;
    try {
      await runTransaction(db, async (transaction) => {
        const messagesRef = collection(db, "messages");
        const typingDoc = doc(db, "typingStatus", auth.currentUser.uid);
        transaction.set(doc(messagesRef), {
          text: reply,
          userId: auth.currentUser.uid,
          displayName: therapistInfo.name,
          role: "therapist",
          timestamp: serverTimestamp(),
        });
        transaction.set(typingDoc, { typing: false, name: therapistInfo.name || "Therapist", timestamp: serverTimestamp() });
      });
      logFirestoreOperation("write", 2, { collections: ["messages", "typingStatus"] });
      setReply("");
    } catch (err) {
      console.error("Error sending group message:", err);
      if (err.code === "resource-exhausted") {
        alert("Firestore quota exceeded. Please try again later.");
      }
    }
  };

  // Logout
  const handleLogout = async () => {
    try {
      if (!auth.currentUser) return;
      const uid = auth.currentUser.uid;
      const therapistRef = doc(db, "therapistsOnline", uid);
      await runTransaction(db, async (transaction) => {
        if (activeChatId) {
          const chatRef = await transaction.get(doc(db, "privateChats", activeChatId));
          if (chatRef.exists()) {
            const now = Date.now();
            transaction.set(doc(collection(chatRef, "events")), {
              type: "leave",
              user: displayName,
              text: `${displayName} left the chat.`,
              role: "system",
              timestamp: serverTimestamp(),
            });
            transaction.update(chatRef, {
              participants: arrayRemove(uid),
              aiOffered: true,
              aiActive: false,
              therapistJoinedOnce: false,
              lastLeaveEvent: now,
              lastLeaveAiOffered: now,
            });
          }
        }
        transaction.set(therapistRef, {
          name: displayName || auth.currentUser.email,
          online: false,
          lastSeen: serverTimestamp(),
        });
      });
      logFirestoreOperation("write", activeChatId ? 3 : 1, { collections: ["therapistsOnline", activeChatId ? "privateChats" : null] });
      await signOut(auth);
      setTherapistInfo({
        name: "",
        gender: "",
        position: "",
        profile: "",
        rating: 0,
      });
      setMessages([]);
      setPrivateChats([]);
      setActiveChatId(null);
      navigate("/therapist-login");
    } catch (err) {
      console.error("Logout error:", err);
      if (err.code === "resource-exhausted") {
        alert("Firestore quota exceeded. Please try again later.");
      }
    }
  };

  // Save therapist profile
  const saveProfile = async () => {
    if (!therapistId) return;
    try {
      await setDoc(doc(db, "therapists", therapistId), therapistInfo, { merge: true });
      logFirestoreOperation("write", 1, { collection: "therapists", doc: therapistId });
      alert("Profile saved successfully!");
      setEditing(false);
    } catch (err) {
      console.error("Error saving profile:", err);
      if (err.code === "resource-exhausted") {
        alert("Firestore quota exceeded. Please try again later.");
      }
    }
  };

  // Join group chat
  const joinGroupChat = async () => {
    if (!auth.currentUser) return;
    try {
      const lastMsgTime = messages[messages.length - 1]?.timestamp?.toMillis() || Date.now();
      await runTransaction(db, async (transaction) => {
        const groupRef = doc(db, "groupChats", "mainGroup");
        transaction.set(groupRef, { participants: arrayUnion(auth.currentUser.uid) }, { merge: true });
        transaction.set(doc(db, "therapists", therapistId), { lastSeenGroupChat: serverTimestamp() }, { merge: true });
      });
      logFirestoreOperation("write", 2, { collections: ["groupChats", "therapists"] });
      setLastSeenTimestamp(lastMsgTime);
      setIsGroupChatOpen(true);
      setInGroupChat(true);
      setGroupUnreadCount(0);
      navigate("/therapist-dashboard/group-chat");
    } catch (err) {
      console.error("Error joining group chat:", err);
      if (err.code === "resource-exhausted") {
        alert("Firestore quota exceeded. Please try again later.");
      }
    }
  };

  // Leave group chat
  const leaveGroupChat = async () => {
    if (!auth.currentUser) return;
    try {
      await runTransaction(db, async (transaction) => {
        const groupRef = doc(db, "groupChats", "mainGroup");
        const lastMsgTime = messages[messages.length - 1]?.timestamp?.toMillis() || Date.now();
        transaction.set(doc(db, "therapists", therapistId), { lastSeenGroupChat: serverTimestamp() }, { merge: true });
        transaction.update(groupRef, { participants: arrayRemove(auth.currentUser.uid) });
      });
      logFirestoreOperation("write", 2, { collections: ["therapists", "groupChats"] });
      setIsGroupChatOpen(false);
      setInGroupChat(false);
      setGroupUnreadCount(0);
      setLastSeenTimestamp(lastMsgTime);
      navigate("/therapist-dashboard");
    } catch (err) {
      console.error("Error leaving group chat:", err);
      if (err.code === "resource-exhausted") {
        alert("Firestore quota exceeded. Please try again later.");
      }
    }
  };

  // Join private chat
  const joinPrivateChat = async (chatId) => {
    if (!auth.currentUser) return;
    const chatRef = doc(db, "privateChats", chatId);
    const uid = auth.currentUser.uid;
    const chatSnap = await getDoc(chatRef);
    logFirestoreOperation("read", 1, { collection: "privateChats", doc: chatId });
    if (chatSnap.exists() && chatSnap.data().participants.includes(uid)) {
      setActiveChatId(chatId);
      navigate(`/therapist-dashboard/private-chat/${chatId}`);
      return;
    }
    try {
      await runTransaction(db, async (transaction) => {
        const chatSnap = await transaction.get(chatRef);
        if (!chatSnap.exists()) throw new Error("Chat document does not exist");
        const now = Date.now();
        transaction.update(chatRef, {
          participants: arrayUnion(uid),
          therapistJoinedOnce: true,
          aiOffered: false,
          aiActive: false,
          unreadCountForTherapist: 0,
          lastJoinEvent: now,
        });
        transaction.set(doc(collection(chatRef, "events")), {
          type: "join",
          user: displayName,
          text: `A therapist "${displayName}" has joined. You can now continue your conversation with them.`,
          role: "system",
          timestamp: serverTimestamp(),
        });
      });
      logFirestoreOperation("write", 2, { collection: "privateChats", subcollection: "events" });
      setActiveChatId(chatId);
      navigate(`/therapist-dashboard/private-chat/${chatId}`);
    } catch (err) {
      console.error("Error joining private chat:", err);
      if (err.code === "resource-exhausted") {
        alert("Firestore quota exceeded. Please try again later.");
      }
    }
  };

  // Leave private chat
  const leavePrivateChat = async () => {
    if (!activeChatId || !auth.currentUser) return;
    try {
      const chatRef = doc(db, "privateChats", activeChatId);
      await runTransaction(db, async (transaction) => {
        const chatSnap = await transaction.get(chatRef);
        if (!chatSnap.exists()) throw new Error("Chat document does not exist");
        const now = Date.now();
        transaction.set(doc(collection(chatRef, "events")), {
          type: "leave",
          user: displayName,
          text: `${displayName} left the chat.`,
          role: "system",
          timestamp: serverTimestamp(),
        });
        transaction.update(chatRef, {
          participants: arrayRemove(auth.currentUser.uid),
          aiOffered: true,
          aiActive: false,
          therapistJoinedOnce: false,
          lastLeaveEvent: now,
          lastLeaveAiOffered: now,
        });
      });
      logFirestoreOperation("write", 2, { collection: "privateChats", subcollection: "events" });
      setActiveChatId(null);
      navigate("/therapist-dashboard/private-chat");
    } catch (err) {
      console.error("Error leaving private chat:", err);
      alert("Failed to leave chat. Please try again.");
      if (err.code === "resource-exhausted") {
        alert("Firestore quota exceeded. Please try again later.");
      }
    }
  };

  // Send private chat message
  const sendPrivateMessage = async () => {
    if (!newPrivateMessage.trim() || !auth.currentUser || !activeChatId) return;
    setIsSendingPrivate(true);
    const chatRef = doc(db, "privateChats", activeChatId);
    try {
      await runTransaction(db, async (transaction) => {
        const chatSnap = await transaction.get(chatRef);
        if (!chatSnap.exists()) throw new Error("Chat document does not exist");
        transaction.set(doc(collection(chatRef, "messages")), {
          text: newPrivateMessage,
          userId: auth.currentUser.uid,
          displayName: therapistName,
          role: "therapist",
          timestamp: serverTimestamp(),
        });
        transaction.update(chatRef, {
          lastMessage: newPrivateMessage,
          lastUpdated: serverTimestamp(),
          unreadCountForTherapist: 0,
        });
      });
      logFirestoreOperation("write", 2, { collection: "privateChats", subcollection: "messages" });
    } catch (err) {
      console.error("Error sending private message:", err);
      if (err.code === "resource-exhausted") {
        alert("Firestore quota exceeded. Please try again later.");
      } else if (err.message === "Chat document does not exist") {
        navigate("/therapist-dashboard/private-chat");
      }
      setIsSendingPrivate(false);
      return;
    }
    setNewPrivateMessage("");
    setIsSendingPrivate(false);
  };

  // Handle therapist profile click
  const handleTherapistClick = async (msg) => {
    if (msg.role !== "therapist") return;
    try {
      const snap = await getDoc(doc(db, "therapists", msg.userId));
      logFirestoreOperation("read", 1, { collection: "therapists", doc: msg.userId });
      if (snap.exists()) setSelectedTherapist(snap.data());
    } catch (err) {
      console.error("Error fetching therapist profile:", err);
      if (err.code === "resource-exhausted") {
        alert("Firestore quota exceeded. Please try again later.");
      }
    }
  };

  // Combine private messages and events
  const combinedPrivateChat = [...privateMessages, ...privateEvents].sort((a, b) => {
    const t1 = a.timestamp?.toMillis ? a.timestamp.toMillis() : 0;
    const t2 = b.timestamp?.toMillis ? b.timestamp.toMillis() : 0;
    return t1 - t2;
  });

  // Combine group messages and events
  const combinedGroupChat = [...messages, ...groupEvents].sort((a, b) => {
    const t1 = a.timestamp?.toMillis ? a.timestamp.toMillis() : 0;
    const t2 = b.timestamp?.toMillis ? b.timestamp.toMillis() : 0;
    return t1 - t2;
  });

  return (
    <div className="therapist-dashboard">
      <Sidebar
        groupUnreadCount={groupUnreadCount}
        privateUnreadCount={privateUnreadCount}
        onLogout={handleLogout}
        onToggle={handleToggleSidebar}
      />
      <div className={`box ${isSidebarOpen ? 'open' : 'closed'}`}>
        <Routes>
          <Route
            path="/"
            element={
              <>
                <div className="welcome-header">
                  <h2>Welcome, <span className="highlight">{therapistInfo.name || "Therapist"}</span>!</h2>
                </div>
                <div className="therapist-profile">
                  {editing ? (
                    <div className="profile-edit">
                      <input
                        type="text"
                        placeholder="Name"
                        value={therapistInfo.name}
                        onChange={(e) => setTherapistInfo((prev) => ({ ...prev, name: e.target.value }))}
                      />
                      <input
                        type="text"
                        placeholder="Gender"
                        value={therapistInfo.gender}
                        onChange={(e) => setTherapistInfo((prev) => ({ ...prev, gender: e.target.value }))}
                      />
                      <input
                        type="text"
                        placeholder="Position"
                        value={therapistInfo.position}
                        onChange={(e) => setTherapistInfo((prev) => ({ ...prev, position: e.target.value }))}
                      />
                      <textarea
                        placeholder="Profile description"
                        value={therapistInfo.profile}
                        onChange={(e) => setTherapistInfo((prev) => ({ ...prev, profile: e.target.value }))}
                      />
                      <input
                        type="number"
                        placeholder="Rating"
                        value={therapistInfo.rating}
                        onChange={(e) =>
                          setTherapistInfo((prev) => ({ ...prev, rating: parseFloat(e.target.value) || 0 }))
                        }
                        min={0}
                        max={5}
                        step={0.1}
                      />
                      <button onClick={saveProfile}>Save</button>
                      <button onClick={() => setEditing(false)}>Cancel</button>
                    </div>
                  ) : (
                    <div className="profile-view">
                      <p><strong>Name:</strong> {therapistInfo.name}</p>
                      <p><strong>Gender:</strong> {therapistInfo.gender}</p>
                      <p><strong>Position:</strong> {therapistInfo.position}</p>
                      <p><strong>About:</strong> {therapistInfo.profile}</p>
                      <p><strong>Rating:</strong> <span className="rating">⭐ {therapistInfo.rating}</span></p>
                      <button onClick={() => setEditing(true)}>Edit Profile</button>
                    </div>
                  )}
                </div>
              </>
            }
          />
          <Route
            path="/group-chat"
            element={
              isGroupChatOpen && inGroupChat ? (
                <div className="group-chat">
                  <LeaveChatButton type="group" therapistInfo={therapistInfo} onLeave={leaveGroupChat} />
                  <div className="chat-container">
                    {combinedGroupChat.map((msg) => (
                      <p
                        key={msg.id}
                        className={`chat-message ${
                          msg.role === "therapist" ? "therapist" : msg.role === "ai" ? "ai" : "user"
                        }`}
                      >
                        <strong>{msg.displayName || msg.user || "Anonymous"}:</strong> {msg.text || msg.message}
                      </p>
                    ))}
                    {typingUsers.length > 0 && (
                      <p className="typing-indicator">
                        {typingUsers.join(", ")} {typingUsers.length === 1 ? "is" : "are"} typing...
                      </p>
                    )}
                    <div ref={messagesEndRef} />
                  </div>
                  <div className="chat-input">
                    <input
                      type="text"
                      value={reply}
                      onChange={(e) => {
                        setReply(e.target.value);
                        handleTyping(e.target.value);
                      }}
                      placeholder="Reply to group chat..."
                    />
                    <button onClick={sendReply}>Send</button>
                  </div>
                </div>
              ) : (
                <div className="chat-list">
                  <h3>Group Chat</h3>
                  <div className="chat-card" onClick={joinGroupChat}>
                    <div>
                      <strong>Group Chat</strong>
                      <br />
                      <small>
                        {messages.length > 0
                          ? `${messages[messages.length - 1].displayName || "Anonymous"}: ${
                              messages[messages.length - 1].text
                            }`
                          : "No messages yet"}
                      </small>
                    </div>
                    {groupUnreadCount > 0 && <span className="unread-badge">{groupUnreadCount}</span>}
                  </div>
                </div>
              )
            }
          />
          <Route
            path="/private-chat"
            element={
              <div className="chat-list">
                <h3>Private Chats</h3>
                {privateChats.length === 0 ? (
                  <p>No private chats yet</p>
                ) : (
                  privateChats.map((chat) => (
                    <div key={chat.id} className="chat-card" onClick={() => joinPrivateChat(chat.id)}>
                      <div>
                        <strong>Chat ID:</strong> {chat.id}
                        <br />
                        <small>{chat.lastMessage || "No messages yet"}</small>
                      </div>
                      {chat.unreadCountForTherapist > 0 && (
                        <span className="unread-badge">{chat.unreadCountForTherapist}</span>
                      )}
                    </div>
                  ))
                )}
              </div>
            }
          />
          <Route
            path="/private-chat/:chatId"
            element={
              activeChatId && (
                <div className="private-chat">
                  <h3>
                    Private Chat {activeChatId}{" "}
                    {isTherapistAvailable
                      ? `(Therapist Online: ${activeTherapists.join(", ")})`
                      : "(Waiting for Therapist)"}
                  </h3>
                  <LeaveChatButton onLeave={leavePrivateChat} />
                  {selectedTherapist && (
                    <div className="therapist-profile-card">
                      <button onClick={() => setSelectedTherapist(null)}>⬅ Back</button>
                      <h4>{selectedTherapist.name}</h4>
                      <p>{selectedTherapist.profile}</p>
                    </div>
                  )}
                  <div className="chat-container">
                    {combinedPrivateChat.map((msg) => (
                      <p
                        key={msg.id}
                        className={`chat-message ${
                          msg.role === "therapist"
                            ? "therapist"
                            : msg.role === "system"
                            ? "system"
                            : msg.role === "ai"
                            ? "ai"
                            : "user"
                        }`}
                        onClick={() => (msg.role === "therapist" ? handleTherapistClick(msg) : null)}
                      >
                        {msg.role === "system" ? (
                          <em>{msg.text}</em>
                        ) : (
                          <>
                            <strong>{msg.displayName || msg.role}:</strong> {msg.text}
                          </>
                        )}
                      </p>
                    ))}
                    {typingUsers.length > 0 && (
                      <p className="typing-indicator">
                        {typingUsers.join(", ")} {typingUsers.length === 1 ? "is" : "are"} typing...
                      </p>
                    )}
                    <div ref={privateMessagesEndRef} />
                  </div>
                  <div className="chat-input">
                    <input
                      type="text"
                      value={newPrivateMessage}
                      onChange={(e) => {
                        setNewPrivateMessage(e.target.value);
                        handleTyping(e.target.value);
                      }}
                      placeholder="Type a message..."
                    />
                    <button onClick={sendPrivateMessage} disabled={isSendingPrivate}>
                      {isSendingPrivate ? "Sending..." : "Send"}
                    </button>
                  </div>
                </div>
              )
            }
          />
          <Route
            path="/appointments"
            element={
              <div>
                <h3>Appointments</h3>
                <p>View and manage your appointments here. (Feature coming soon)</p>
              </div>
            }
          />
          <Route
            path="/clients"
            element={
              <div>
                <h3>Clients</h3>
                <p>Manage your client list and view client details. (Feature coming soon)</p>
              </div>
            }
          />
          <Route
            path="/notifications"
            element={
              <div>
                <h3>Notifications</h3>
                <ul>
                  {privateChats
                    .filter((chat) => chat.unreadCountForTherapist > 0)
                    .map((chat) => (
                      <li key={chat.id} className="notification-item" onClick={() => joinPrivateChat(chat.id)}>
                        New messages in Private Chat {chat.id} ({chat.unreadCountForTherapist})
                      </li>
                    ))}
                  {groupUnreadCount > 0 && (
                    <li className="notification-item" onClick={joinGroupChat}>
                      {groupUnreadCount} new messages in Group Chat
                    </li>
                  )}
                  {privateChats.every((chat) => chat.unreadCountForTherapist === 0) && groupUnreadCount === 0 && (
                    <li>No new notifications</li>
                  )}
                </ul>
              </div>
            }
          />
          <Route
            path="/profile"
            element={
              <div className="therapist-profile">
                {editing ? (
                  <div className="profile-edit">
                    <input
                      type="text"
                      placeholder="Name"
                      value={therapistInfo.name}
                      onChange={(e) => setTherapistInfo((prev) => ({ ...prev, name: e.target.value }))}
                    />
                    <input
                      type="text"
                      placeholder="Gender"
                      value={therapistInfo.gender}
                      onChange={(e) => setTherapistInfo((prev) => ({ ...prev, gender: e.target.value }))}
                    />
                    <input
                      type="text"
                      placeholder="Position"
                      value={therapistInfo.position}
                      onChange={(e) => setTherapistInfo((prev) => ({ ...prev, position: e.target.value }))}
                    />
                    <textarea
                      placeholder="Profile description"
                      value={therapistInfo.profile}
                      onChange={(e) => setTherapistInfo((prev) => ({ ...prev, profile: e.target.value }))}
                    />
                    <input
                      type="number"
                      placeholder="Rating"
                      value={therapistInfo.rating}
                      onChange={(e) =>
                        setTherapistInfo((prev) => ({ ...prev, rating: parseFloat(e.target.value) || 0 }))
                      }
                      min={0}
                      max={5}
                      step={0.1}
                    />
                    <button onClick={saveProfile}>Save</button>
                    <button onClick={() => setEditing(false)}>Cancel</button>
                  </div>
                ) : (
                  <div className="profile-view">
                    <p><strong>Name:</strong> {therapistInfo.name}</p>
                    <p><strong>Gender:</strong> {therapistInfo.gender}</p>
                    <p><strong>Position:</strong> {therapistInfo.position}</p>
                    <p><strong>About:</strong> {therapistInfo.profile}</p>
                    <p><strong>Rating:</strong> <span className="rating">⭐ {therapistInfo.rating}</span></p>
                    <button onClick={() => setEditing(true)}>Edit Profile</button>
                  </div>
                )}
              </div>
            }
          />
          <Route
            path="/settings"
            element={
              <div>
                <h3>Settings</h3>
                <p>Adjust notification preferences and chat settings. (Feature coming soon)</p>
              </div>
            }
          />
        </Routes>
      </div>
    </div>
  );
}

export default TherapistDashboard;