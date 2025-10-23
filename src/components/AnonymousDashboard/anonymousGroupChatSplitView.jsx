import React, { useEffect, useState, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { db, storage, ref, uploadBytes, getDownloadURL } from "../../utils/firebase";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  doc,
  arrayUnion,
  arrayRemove,
  runTransaction,
  limit,
  increment,
  getDoc,
} from "firebase/firestore";
import { useTypingStatus } from "../useTypingStatus";
import ChatMessage from "../therapistDashboard/ChatMessage";
import LeaveChatButton from "../LeaveChatButton";
import EmojiPicker from "emoji-picker-react";
import TherapistProfile from "../TherapistProfile";
import { getAIResponse } from "../../utils/AiChatIntegration";
import { mapMessagesForAI } from "../../utils/aiMessageMapper";

function AnonymousGroupChatSplitView({
  groupChats,
  activeGroupId,
  setActiveGroupId,
  isLoadingChats,
  formatTimestamp,
  getTimestampMillis,
  displayName,
  typingUsers,
  userId,
  showError,
  playNotification,
}) {
  const [messages, setMessages] = useState([]);
  const [groupEvents, setGroupEvents] = useState([]);
  const [participants, setParticipants] = useState([]);
  const [participantNames, setParticipantNames] = useState({});
  const [isParticipantsOpen, setIsParticipantsOpen] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [newMessage, setNewMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [therapistsOnline, setTherapistsOnline] = useState([]);
  const [selectedTherapist, setSelectedTherapist] = useState(null);
  const [aiTyping, setAiTyping] = useState(false);
  const messagesEndRef = useRef(null);
  const modalRef = useRef(null);
  const navigate = useNavigate();
  const { handleTyping } = useTypingStatus(displayName);

  // Memoize active group to avoid repeated find calls
  const activeGroup = useMemo(() => 
    groupChats.find((g) => g.id === activeGroupId), 
    [groupChats, activeGroupId]
  );

  // Auto scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, groupEvents]);

  // Reset invalid activeGroupId
  useEffect(() => {
    if (activeGroupId && !groupChats.find(g => g.id === activeGroupId)) {
      console.warn(`Active group ${activeGroupId} not found in groupChats, resetting`);
      setActiveGroupId(null);
      navigate("/anonymous-dashboard/group-chat");
    }
  }, [activeGroupId, groupChats, navigate, setActiveGroupId]);

  // Fetch online therapists with default name
  useEffect(() => {
    const q = query(collection(db, "therapistsOnline"), limit(50));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const onlineList = snapshot.docs.map((doc) => ({
          uid: doc.id,
          ...doc.data(),
          name: doc.data().name || `Therapist_${doc.id.slice(0, 8)}`, // Default name if missing
        }));
        setTherapistsOnline(onlineList);
      },
      (err) => {
        console.error("Error fetching therapists online:", err);
        showError("Failed to fetch online therapists. Please try again.");
      }
    );
    return () => unsubscribe();
  }, [showError]);

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

  // Fetch group chat data
  useEffect(() => {
    if (!activeGroupId) return;
    const groupRef = doc(db, "groupChats", activeGroupId);
    const messagesQuery = query(collection(groupRef, "messages"), orderBy("timestamp"), limit(50));
    const eventsQuery = query(collection(groupRef, "events"), orderBy("timestamp"), limit(50));

    const unsubMessages = onSnapshot(
      messagesQuery,
      (snapshot) => {
        const msgs = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        console.log("Fetched messages:", msgs);
        setMessages(msgs);
        if (msgs.length > 0) playNotification();
      },
      (err) => {
        console.error("Error fetching messages:", err);
        showError("Failed to load messages. Please try again.");
      }
    );

    const unsubEvents = onSnapshot(
      eventsQuery,
      (snapshot) => {
        const evts = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        console.log("Fetched events:", evts);
        setGroupEvents(evts);
      },
      (err) => {
        console.error("Error fetching group events:", err);
        showError("Failed to load group events. Please try again.");
      }
    );

    const unsubParticipants = onSnapshot(
      groupRef,
      (snap) => {
        if (snap.exists()) {
          setParticipants(snap.data().participants || []);
        }
      },
      (err) => {
        console.error("Error fetching participants:", err);
        showError("Failed to load participants. Please try again.");
      }
    );

    return () => {
      unsubMessages();
      unsubEvents();
      unsubParticipants();
    };
  }, [activeGroupId, showError, playNotification]);

  // Fetch participant names
  useEffect(() => {
    if (participants.length === 0) {
      setParticipantNames({});
      return;
    }

    const names = {};
    const unsubscribes = participants.map((uid) => {
      const therapistRef = doc(db, "therapists", uid);
      const anonRef = doc(db, "anonymousUsers", uid);

      return onSnapshot(
        therapistRef,
        (therapistSnap) => {
          if (therapistSnap.exists()) {
            names[uid] = therapistSnap.data().name || `Therapist_${uid.slice(0, 3)}`;
            setParticipantNames({ ...names });
          } else {
            onSnapshot(
              anonRef,
              (anonSnap) => {
                names[uid] = anonSnap.exists()
                  ? anonSnap.data().anonymousName || `Anonymous_${uid.slice(0, 3)}`
                  : `Anonymous_${uid.slice(0, 3)}`;
                setParticipantNames({ ...names });
              },
              (err) => {
                console.error(`Error fetching anonymous name for ${uid}:`, err);
                names[uid] = `Anonymous_${uid.slice(0, 3)}`;
                setParticipantNames({ ...names });
              }
            );
          }
        },
        (err) => {
          console.error(`Error fetching therapist name for ${uid}:`, err);
          names[uid] = `Anonymous_${uid.slice(0, 3)}`;
          setParticipantNames({ ...names });
        }
      );
    });

    return () => unsubscribes.forEach((unsub) => unsub());
  }, [participants]);

  // Join group chat
  const joinGroupChat = async (groupId) => {
    if (!userId) return;
    try {
      const groupRef = doc(db, "groupChats", groupId);
      await runTransaction(db, async (transaction) => {
        transaction.update(groupRef, { participants: arrayUnion(userId) });
      });
      setActiveGroupId(groupId);
      navigate(`/anonymous-dashboard/group-chat/${groupId}`);
    } catch (err) {
      console.error("Error joining group chat:", err);
      showError("Failed to join group chat. Please try again.");
      navigate("/anonymous-dashboard/group-chat");
    }
  };

  // Leave group chat
  const leaveGroupChat = async () => {
    if (!userId || !activeGroupId) return;
    try {
      const groupRef = doc(db, "groupChats", activeGroupId);
      await runTransaction(db, async (transaction) => {
        transaction.update(groupRef, { participants: arrayRemove(userId) });
        transaction.set(doc(collection(groupRef, "events")), {
          type: "leave",
          user: displayName,
          text: `${displayName} has left the chat.`,
          role: "system",
          timestamp: serverTimestamp(),
        });
      });
      setActiveGroupId(null);
      navigate("/anonymous-dashboard/group-chat");
    } catch (err) {
      console.error("Error leaving group chat:", err);
      showError("Failed to leave group chat. Please try again.");
    }
  };

  // Send message
  const sendMessage = async (file = null) => {
    if (!newMessage.trim() && !file) return;
    if (!userId || !activeGroupId) return;
    setIsSending(true);

    try {
      let fileUrl = null;
      if (file) {
        const storageRef = ref(storage, `groupChats/${activeGroupId}/${Date.now()}_${file.name}`);
        await uploadBytes(storageRef, file);
        fileUrl = await getDownloadURL(storageRef);
      }

      let messageText = newMessage;
      const isAiTrigger = newMessage.toLowerCase().includes("@ai");
      if (isAiTrigger) {
        messageText = `${displayName}: "${newMessage.replace(/@ai/gi, "").trim()}"\n\n`;
      }

      const groupRef = doc(db, "groupChats", activeGroupId);
      await runTransaction(db, async (transaction) => {
        const messagesRef = collection(db, `groupChats/${activeGroupId}/messages`);
        const typingDoc = doc(db, "typingStatus", userId);
        transaction.set(doc(messagesRef), {
          text: messageText || "",
          fileUrl,
          userId,
          displayName,
          role: "user",
          timestamp: serverTimestamp(),
          reactions: {},
          pinned: false,
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
          unreadCount: increment(1),
        });
      });

      const userMessage = newMessage.replace(/@ai/gi, "").trim();
      setNewMessage("");
      setShowEmojiPicker(false);

      if (isAiTrigger) {
        try {
          setAiTyping(true);
          const aiInputMessages = mapMessagesForAI(messages);
          const aiResponse = await getAIResponse(userMessage || "Continue", aiInputMessages);
          await runTransaction(db, async (transaction) => {
            const messagesRef = collection(db, `groupChats/${activeGroupId}/messages`);
            transaction.set(doc(messagesRef), {
              text: `${displayName}: "${userMessage}"\n\n${aiResponse}`,
              role: "ai",
              displayName: "Support Assistant",
              timestamp: serverTimestamp(),
              fileUrl: null,
              reactions: {},
              pinned: false,
            });
          });
        } catch (err) {
          console.error("AI response error:", err);
          await runTransaction(db, async (transaction) => {
            const messagesRef = collection(db, `groupChats/${activeGroupId}/messages`);
            transaction.set(doc(messagesRef), {
              text: "Sorry, I couldn’t respond right now. Please try again later.",
              role: "system",
              timestamp: serverTimestamp(),
            });
          });
        } finally {
          setAiTyping(false);
        }
      }
    } catch (err) {
      console.error("Error sending message:", err);
      showError("Failed to send message. Please try again.");
    } finally {
      setIsSending(false);
    }
  };

  // Toggle reaction
  const toggleReaction = async (msgId, reactionType) => {
    if (!userId || !activeGroupId) return;
    const msgRef = doc(db, `groupChats/${activeGroupId}/messages`, msgId);
    try {
      await runTransaction(db, async (transaction) => {
        const msgSnap = await transaction.get(msgRef);
        if (!msgSnap.exists()) return;
        const reactions = msgSnap.data().reactions || {};
        const currentReactions = reactions[reactionType] || [];
        const updatedReactions = currentReactions.includes(userId)
          ? currentReactions.filter((id) => id !== userId)
          : [...currentReactions, userId];
        const updated = { ...reactions, [reactionType]: updatedReactions };
        transaction.update(msgRef, { reactions: updated });
      });
    } catch (err) {
      console.error("Error toggling reaction:", err);
      showError("Failed to update reaction. Please try again.");
    }
  };

  // Handle emoji click
  const onEmojiClick = (emojiData) => {
    setNewMessage(newMessage + emojiData.emoji);
    setShowEmojiPicker(false);
  };

  // Handle therapist click to view profile
  const handleTherapistClick = async (msg) => {
    if (msg.role !== "therapist") return;
    try {
      const snap = await getDoc(doc(db, "therapists", msg.userId));
      if (snap.exists()) {
        setSelectedTherapist({ ...snap.data(), uid: msg.userId });
      }
    } catch (err) {
      console.error("Error fetching therapist profile:", err);
      showError("Failed to fetch therapist profile. Please try again.");
    }
  };

  // Check if therapist is online
  const isTherapistOnline = (uid) =>
    therapistsOnline.some((t) => t.uid === uid && t.online);

  // Start private chat
  const startPrivateChat = async (therapist) => {
    if (!therapist || !therapist.uid || !userId) return;
    const uids = [userId, therapist.uid].sort();
    const chatId = `chat_${uids[0]}_${uids[1]}`;
    const chatRef = doc(db, "privateChats", chatId);

    try {
      await runTransaction(db, async (transaction) => {
        const chatSnap = await transaction.get(chatRef);
        if (!chatSnap.exists()) {
          transaction.set(chatRef, {
            participants: [userId],
            createdBy: displayName,
            lastMessage: "",
            lastUpdated: serverTimestamp(),
            unreadCountForTherapist: 0,
            aiActive: false,
            aiOffered: false,
            therapistJoinedOnce: false,
            needsTherapist: true,
          });
        } else {
          const currentData = chatSnap.data();
          const updatedParticipants = [
            ...new Set([...(currentData.participants || []), userId]),
          ];
          transaction.update(chatRef, {
            participants: updatedParticipants,
            lastUpdated: serverTimestamp(),
          });
        }
      });
      navigate(`/anonymous-dashboard/private-chat/${chatId}`);
    } catch (err) {
      console.error("Error starting private chat:", err);
      showError("Failed to start private chat. Please try again.");
    }
  };

  // Combine messages and events
  const combinedGroupChat = [...messages, ...groupEvents].sort((a, b) => {
    return getTimestampMillis(a.timestamp) - getTimestampMillis(b.timestamp);
  });

  return (
    <div className="split-chat-container">
      <div className="chat-box-card">
        <h3>Group Chats</h3>
        <div className="chat-list-container">
          {isLoadingChats ? (
            <p>Loading group chats...</p>
          ) : groupChats.length === 0 ? (
            <p>No group chats available</p>
          ) : (
            groupChats.map((group) => {
              const lastTs = group.lastMessage?.timestamp;
              const { dateStr, timeStr } = formatTimestamp(lastTs);
              return (
                <div
                  key={group.id}
                  className={`chat-card ${activeGroupId === group.id ? "selected" : ""}`}
                  onClick={() => {
                    joinGroupChat(group.id);
                  }}
                >
                  <div className="chat-card-inner">
                    <div className="chat-avater-content">
                      <span className="therapist-text-avatar">{group.name?.[0] || "G"}</span>
                      <div className="chat-card-content">
                        <strong className="chat-card-title">{group.name || "Unnamed Group"}</strong>
                        <small className="chat-card-preview">
                          {group.lastMessage
                            ? `${group.lastMessage.displayName || "Anonymous"}: ${group.lastMessage.text}`
                            : "No messages yet"}
                        </small>
                      </div>
                    </div>
                    <div className="chat-card-meta">
                      {lastTs ? (
                        <div className="message-timestamp">
                          <span className="meta-date">{dateStr}</span>
                          <span className="meta-time">{timeStr}</span>
                        </div>
                      ) : null}
                      {group.unreadCount > 0 && <span className="unread-badge">{group.unreadCount}</span>}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
      <div className="chat-box-container">
        {activeGroupId ? (
          <div className="group-chat-box">
            {/* Therapist Profile Modal */}
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
            {/* Pinned Message */}
            {combinedGroupChat.some((msg) => msg.pinned) && (
              <div className="pinned-message">
                <strong>Pinned:</strong>{" "}
                {combinedGroupChat.find((msg) => msg.pinned)?.text || "Welcome to the chatroom!"}
              </div>
            )}
            <div className="detailLeave">
              <div className="chat-avater">
                <span className="text-avatar">{activeGroup?.name?.[0] || "G"}</span>
                <div className="card-content">
                  <strong className="group-title">{activeGroup?.name || "Unnamed Group"}</strong>
                  <small className="participant-preview">
                    {participants.length > 0 ? (
                      participants.map((uid) => (
                        <div key={uid} className="participant">
                          <span className="participant-name">
                            {participantNames[uid] || "Loading..."}<b>,</b>
                          </span>
                        </div>
                      ))
                    ) : (
                      <div className="participant">No participants</div>
                    )}           
                  </small>
                </div>
              </div>
              {/* Therapist List */}
              <div className="therapist-list">
                {therapistsOnline.map((therapist) => (
                  <div
                    key={therapist.uid}
                    className={`therapist-item ${therapist.online ? "online" : ""} ${
                      selectedTherapist?.uid === therapist.uid ? "active" : ""
                    }`}
                    data-fullname={therapist.name}
                    onClick={() => handleTherapistClick({ userId: therapist.uid, role: "therapist" })}
                  >
                    <span className="therapist-avatar">{therapist.name?.[0] || "T"}</span>
                    {therapist.name?.slice(0, 9) || "Unknown"}
                  </div>
                ))}
              </div>
              <div className="leave-participant">
                <div className="participant-list">
                  <h4
                    className="participant-toggle"
                    onClick={() => setIsParticipantsOpen(!isParticipantsOpen)}
                    role="button"
                    aria-expanded={isParticipantsOpen}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        setIsParticipantsOpen(!isParticipantsOpen);
                      }
                    }}
                  >
                    <i className="fas fa-user" style={{ color: isParticipantsOpen ? "#e0e0e0" : "gray" }} aria-hidden="true"></i>
                    ({participants.length})
                  </h4>
                  {isParticipantsOpen && (
                    <div className="participant-dropdown">
                      <div className="participant-item-container">
                        {participants.length > 0 ? (
                          participants.map((uid) => (
                            <div key={uid} className="participant-item">
                              {participantNames[uid] || "Loading..."}
                            </div>
                          ))
                        ) : (
                          <div className="participant-item">No participants</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                <LeaveChatButton type="group" onLeave={leaveGroupChat} />
              </div>
            </div>
            <div className={selectedTherapist ? "chat-box blurred" : "chat-box"} role="log" aria-live="polite">
              {combinedGroupChat.length === 0 ? (
                <p className="no-message">No messages in this group yet.</p>
              ) : (
                combinedGroupChat.map((msg) => (
                  <ChatMessage
                    key={msg.id}
                    msg={msg}
                    toggleReaction={toggleReaction}
                    therapistInfo={{ role: "user" }}
                    handleTherapistClick={handleTherapistClick}
                  />
                ))
              )}
              {typingUsers.length > 0 && (
                <p className="typing-indicator">
                  {typingUsers.join(", ")} {typingUsers.length === 1 ? "is" : "are"} typing...
                </p>
              )}
              {aiTyping && (
                <p className="typing-indicator ai-typing">
                  Support Assistant is typing...
                </p>
              )}
              <div ref={messagesEndRef} />
            </div>
            <div className="chat-input">
              <button
                className="emoji-btn"
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                aria-label="Open emoji picker"
              >
                <i className="fa-regular fa-face-smile"></i>
              </button>
              {showEmojiPicker && <EmojiPicker onEmojiClick={onEmojiClick} />}
              <input
                type="file"
                id="group-file-upload"
                style={{ display: "none" }}
                onChange={(e) => sendMessage(e.target.files[0])}
                aria-label="Upload file"
              />
              <button
                className="attach-btn"
                onClick={() => document.getElementById("group-file-upload").click()}
                aria-label="Attach file"
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
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                aria-label="Message input"
                disabled={isSending}
              />
              <button className="send-btn" onClick={() => sendMessage()} disabled={isSending} aria-label="Send message">
                {isSending ? "Sending..." : <i className="fa-solid fa-paper-plane"></i>}
              </button>
            </div>
          </div>
        ) : (
          <div className="empty-chat">
            <p>Select a group chat to view messages</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default AnonymousGroupChatSplitView;