import { useState, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
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
  arrayUnion,
  increment,
} from "firebase/firestore";
import { db, auth, storage, ref, uploadBytes, getDownloadURL } from "../../utils/firebase";
import { getAIResponse } from "../../utils/AiChatIntegration";
import { mapMessagesForAI } from "../../utils/AiChatIntegration";
import { loginAnonymously, getAnonName } from "../../login/anonymous_login";
import TherapistProfile from "../../components/TherapistProfile";
import { useTypingStatus } from "../../hooks/useTypingStatus";
import { getTimestampMillis, formatMessageTime } from "../../hooks/useTimestampUtils";
import EmojiPicker from "emoji-picker-react";
import "../chats_rooms/chatroom.css";

function Chatroom() {
  const [messages, setMessages] = useState([]);
  const [groupEvents, setGroupEvents] = useState([]);
  const [groupChats, setGroupChats] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [aiTyping, setAiTyping] = useState(false);
  const [selectedTherapist, setSelectedTherapist] = useState(null);
  const [therapistsOnline, setTherapistsOnline] = useState([]);
  const [therapistName, setTherapistName] = useState("Therapist");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [participants, setParticipants] = useState([]);
  const [activeGroupId, setActiveGroupId] = useState(null);
  const [participantNames, setParticipantNames] = useState({});
  const [isParticipantsDropdownOpen, setIsParticipantsDropdownOpen] = useState(false);
  const modalRef = useRef(null);
  const displayName = auth.currentUser?.email ? therapistName : getAnonName();
  const { typingUsers, handleTyping } = useTypingStatus(displayName);
  const messagesEndRef = useRef(null);
  const navigate = useNavigate();
  const { groupId } = useParams();

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

  // Fetch all group chats
  useEffect(() => {
    const q = query(collection(db, "groupChats"), limit(50));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const chats = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        setGroupChats(chats);
      },
      (err) => {
        console.error("Error fetching group chats:", err);
        if (err.code === "resource-exhausted") {
          alert("Firestore quota exceeded. Please try again later.");
        } else {
          alert("Failed to load group chats. Please try again.");
        }
      }
    );
    return () => unsubscribe();
  }, []);

  // Initialize authentication and set active group
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        await loginAnonymously();
        setIsLoggedIn(!!auth.currentUser);
        if (groupId) {
          setActiveGroupId(groupId);
        } else {
          navigate("/chat-room");
        }
      } catch (err) {
        console.error("Error during anonymous login:", err);
        if (err.code === "resource-exhausted") {
          alert("Firestore quota exceeded. Please try again later.");
        } else {
          alert("Error during login. Please try again.");
        }
      }
    };
    initializeAuth();
  }, [groupId, navigate]);

  // Watch group chat messages, events, and participants
  useEffect(() => {
    if (!activeGroupId) return;
    const groupRef = doc(db, "groupChats", activeGroupId);
    const messagesQuery = query(collection(groupRef, "messages"), orderBy("timestamp"), limit(50));
    const eventsQuery = query(collection(groupRef, "events"), orderBy("timestamp"), limit(50));

    const unsubMessages = onSnapshot(
      messagesQuery,
      (snapshot) => {
        const msgs = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        setMessages(msgs);
      },
      (err) => {
        console.error("Error fetching messages:", err);
        if (err.code === "resource-exhausted") {
          alert("Firestore quota exceeded. Please try again later.");
        }
      }
    );

    const unsubEvents = onSnapshot(
      eventsQuery,
      (snapshot) => {
        const evts = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        setGroupEvents(evts);
      },
      (err) => {
        console.error("Error fetching group events:", err);
        alert("Failed to load group events. Please try again.");
      }
    );

    const unsubParticipants = onSnapshot(groupRef, (snap) => {
      if (snap.exists()) {
        setParticipants(snap.data().participants || []);
      }
    });

    return () => {
      unsubMessages();
      unsubEvents();
      unsubParticipants();
    };
  }, [activeGroupId]);

  // Fetch participant names
  useEffect(() => {
    if (participants.length === 0) {
      setParticipantNames({});
      return;
    }

    const names = {};
    const unsubscribes = participants.map((uid) => {
      // Monitor therapist document
      const therapistRef = doc(db, "therapists", uid);
      const anonRef = doc(db, "anonymousUsers", uid);

      // Check therapist first
      return onSnapshot(therapistRef, (therapistSnap) => {
        if (therapistSnap.exists()) {
          names[uid] = therapistSnap.data().name || `Therapist_${uid.slice(0, 8)}`;
          setParticipantNames({ ...names });
        } else {
          // Check anonymousUsers
          onSnapshot(anonRef, (anonSnap) => {
            names[uid] = anonSnap.exists()
              ? anonSnap.data().anonymousName
              : `Anonymous_${uid.slice(0, 8)}`;
            setParticipantNames({ ...names });
          }, (err) => {
            console.error(`Error fetching anonymous name for ${uid}:`, err);
            names[uid] = `Anonymous_${uid.slice(0, 3)}`;
            setParticipantNames({ ...names });
          });
        }
      }, (err) => {
        console.error(`Error fetching therapist name for ${uid}:`, err);
        names[uid] = `Anonymous_${uid.slice(0, 8)}`;
        setParticipantNames({ ...names });
      });
    });

    return () => {
      unsubscribes.forEach((unsub) => unsub());
    };
  }, [participants]);

  // Toggle participant
  useEffect(() => {
    const handleClickOutside = (event) => {
      const participantList = document.querySelector(".participant-list");
      if (participantList && !participantList.contains(event.target)) {
        setIsParticipantsDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Track therapists online
  useEffect(() => {
    const q = query(collection(db, "therapists"), limit(50));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const onlineList = snapshot.docs.map((doc) => ({
          uid: doc.id,
          ...doc.data(),
        }));
        setTherapistsOnline(onlineList);
      },
      (err) => {
        console.error("Error fetching therapists online:", err);
        if (err.code === "resource-exhausted") {
          alert("Firestore quota exceeded. Please try again later.");
        }
      }
    );
    return () => unsubscribe();
  }, []);

  // Fetch therapist name with real-time updates
  useEffect(() => {
    if (!auth.currentUser?.email || !auth.currentUser.uid) return;

    const therapistRef = doc(db, "therapists", auth.currentUser.uid);
    const unsubscribe = onSnapshot(
      therapistRef,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setTherapistName(data.name || "Therapist");
        } else {
          setTherapistName("Therapist");
        }
      },
      (err) => {
        console.error("Error fetching therapist profile:", err);
        if (err.code === "resource-exhausted") {
          alert("Firestore quota exceeded. Please try again later.");
        }
      }
    );

    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.currentUser?.email]);

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

  // Join group chat
  const joinGroupChat = async (groupId) => {
    if (!auth.currentUser) return;
    try {
      const groupRef = doc(db, "groupChats", groupId);
      await runTransaction(db, async (transaction) => {
        transaction.update(groupRef, { participants: arrayUnion(auth.currentUser.uid) });
      });
      setActiveGroupId(groupId);
      navigate(`/chat-room/${groupId}`);
    } catch (err) {
      console.error("Error joining group chat:", err);
      if (err.code === "resource-exhausted") {
        alert("Firestore quota exceeded. Please try again later.");
      } else {
        alert("Failed to join group chat. Please try again.");
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
            createdBy: displayName,
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
        : `/chat-room/private/${chatId}`;
      navigate(route);
    } catch (err) {
      console.error("Error starting private chat:", err);
      if (err.code === "resource-exhausted") {
        alert("Firestore quota exceeded. Please try again later.");
      } else {
        alert("Failed to start private chat. Please try again.");
      }
    }
  };

  // Toggle reaction on message
  const toggleReaction = async (msgId, reactionType) => {
    if (!auth.currentUser || !activeGroupId) return;
    const msgRef = doc(db, `groupChats/${activeGroupId}/messages`, msgId);
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
    if (!file || !auth.currentUser || !activeGroupId) return;

    const role = auth.currentUser.email ? "therapist" : "user";  // Define role here to match sendMessage logic

    try {
      const storageRef = ref(storage, `groupChats/${activeGroupId}/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const fileUrl = await getDownloadURL(storageRef);
      await runTransaction(db, async (transaction) => {
        const messagesRef = collection(db, `groupChats/${activeGroupId}/messages`);
        const typingDoc = doc(db, "typingStatus", auth.currentUser.uid);
        const groupRef = doc(db, "groupChats", activeGroupId);
        const groupSnap = await transaction.get(groupRef);
        const currentUnread = groupSnap.data()?.unreadCount || 0;
        transaction.set(doc(messagesRef), {
          text: newMessage || "",
          fileUrl,
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
        transaction.update(groupRef, {
          lastMessage: {
            text: newMessage || "Attachment",
            displayName,
            timestamp: serverTimestamp(),
          },
          ...(role === "user" ? { unreadCount: currentUnread + 1 } : {}),
        });
      });
      setNewMessage("");
      setShowEmojiPicker(false);
    } catch (err) {
      console.error("Error uploading file:", err);
      if (err.code === "resource-exhausted") {
        alert("Firestore quota exceeded. Please try again later.");
      } else {
        alert("Failed to upload file. Please try again.");
      }
    }
  };

  // Send message
  const sendMessage = async () => {
    if (!newMessage.trim() || !auth.currentUser || !activeGroupId) return;

    const role = auth.currentUser.email ? "therapist" : "user";
    const displayName = role === "therapist" ? therapistName : getAnonName();

    try {
      await runTransaction(db, async (transaction) => {
        const messagesRef = collection(db, `groupChats/${activeGroupId}/messages`);
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
        transaction.update(doc(db, "groupChats", activeGroupId), {
          lastMessage: {
            text: newMessage,
            displayName,
            timestamp: serverTimestamp(),
          },
          ...(role === "user" ? { unreadCount: increment(1) } : {}),
        })
      });

      if (role === "user" && newMessage.toLowerCase().includes("@ai")) {
        const cleanMessage = newMessage.replace(/@ai/gi, "").trim();
        const originalMessage = newMessage.trim();
        setAiTyping(true);

        try {
          const aiInputMessages = mapMessagesForAI(messages);
          const aiReply = await getAIResponse(cleanMessage, aiInputMessages);
          await runTransaction(db, async (transaction) => {
            transaction.set(doc(collection(db, `groupChats/${activeGroupId}/messages`)), {
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
            transaction.set(doc(collection(db, `groupChats/${activeGroupId}/messages`)), {
              text: "Sorry, I couldn’t respond right now. Please try again later.",
              fileUrl: null,
              userId: "AI_BOT",
              displayName: "AI Support",
              role: "ai",
              timestamp: serverTimestamp(),
              reactions: {},
              ...(role === "user" ? { unreadCount: increment(1) } : {}),
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
      } else {
        alert("Failed to send message. Please try again.");
      }
    }

    setNewMessage("");
    setShowEmojiPicker(false);
  };

  // Check therapist online by uid
  const isTherapistOnline = (uid) =>
  therapistsOnline.some((t) => t.uid === uid && t.online);

  // Combine with safe sort
  const combinedChat = [...messages, ...groupEvents].sort((a, b) => {
    return getTimestampMillis(a.timestamp) - getTimestampMillis(b.timestamp);
  });

  return (
    <div className="chatroom">
      <button className="theme-toggle" onClick={() => alert("Theme toggle coming soon!")}>
        <i className="fa-solid fa-moon"></i>
      </button>
      <h2 className="header-name">Anonymous Mental Health Chat</h2>
      {!activeGroupId ? (
        <div className="chat-list">
          <h3>Group Chats</h3>
          {groupChats.length === 0 ? (
            <p>No group chats available</p>
          ) : (
            groupChats.map((group) => (
              <div key={group.id} className="chat-card" onClick={() => joinGroupChat(group.id)}>
                <div>
                  <strong>{group.name || "Unnamed Group"}</strong>
                  <br />
                  <small>
                    {group.lastMessage
                      ? `${group.lastMessage.displayName || "Anonymous"}: ${group.lastMessage.text}`
                      : "No messages yet"}
                  </small>
                </div>
                {group.unreadCount > 0 && <span className="unread-badge">{group.unreadCount}</span>}
              </div>
            ))
          )}
        </div>
      ) : (
        <>
          <div className="therapist-list">
            {therapistsOnline.map((therapist) => (
              <div
                key={therapist.uid}
                className={`therapist-item ${therapist.online ? "online" : ""}
                ${selectedTherapist?.uid === therapist.uid ? "active" : ""}`}
                data-fullname={therapist.name}
                onClick={() => handleTherapistClick({ userId: therapist.uid, role: "therapist" })}
              >
                <span className="therapist-avatar">{therapist.name?.[0] || "T"}</span>
                {therapist.name}
              </div>
            ))}
          </div>
          <div className="participant-list">
            <h4
              className="participant-toggle"
              onClick={() => setIsParticipantsDropdownOpen(!isParticipantsDropdownOpen)}
              role="button"
              aria-expanded={isParticipantsDropdownOpen}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  setIsParticipantsDropdownOpen(!isParticipantsDropdownOpen);
                }
              }}
            >
              Participants ({participants.length})
              <i
                className={`fa-solid fa-chevron-${isParticipantsDropdownOpen ? "up" : "down"}`}
                style={{ marginLeft: "8px" }}
              ></i>
            </h4>
            {isParticipantsDropdownOpen && (
              <div className="participant-dropdown">
                <div className="participant-item-container">
                  {participants.length > 0 ? (
                    participants.map((uid) => (
                      <div key={uid} className="participant-item">
                        {participantNames[uid] || "Loading name..."}
                      </div>
                    ))
                  ) : (
                    <div className="participant-item">No participants</div>
                  )}
                </div>
              </div>
            )}
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
                        {msg.role === "ai" ? (
                          <>
                            {msg.text.split("\n\n").map((part, index) => (
                              <span
                                key={index}
                                className={index === 0 ? "ai-user-quote" : "ai-response"}
                              >
                                {part}
                              </span>
                            ))}
                          </>
                        ) : (
                          <span>{msg.text}</span>
                        )}
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
                          {formatMessageTime(msg.timestamp)}
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
        </>
      )}
    </div>
  );
}

export default Chatroom;