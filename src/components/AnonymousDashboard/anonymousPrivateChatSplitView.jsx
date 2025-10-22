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
  getDoc,
  increment,
} from "firebase/firestore";
import { useTypingStatus } from "../useTypingStatus";
import { getAIResponse } from "../../utils/AiChatIntegration";
import { mapMessagesForAI } from "../../utils/aiMessageMapper";
import ChatMessage from "../therapistDashboard/ChatMessage";
import LeaveChatButton from "../LeaveChatButton";
import EmojiPicker from "emoji-picker-react";

function AnonymousPrivateChatSplitView({
  privateChats,
  activeChatId,
  setActiveChatId,
  formatTimestamp,
  getTimestampMillis,
  displayName,
  typingUsers,
  userId,
  anonNames,
  showError,
  playNotification,
}) {
  const [messages, setMessages] = useState([]);
  const [events, setEvents] = useState([]);
  const [isTherapistAvailable, setIsTherapistAvailable] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [aiTyping, setAiTyping] = useState(false);
  const [newMessage, setNewMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [activeTherapists, setActiveTherapists] = useState([]);
  const [chatData, setChatData] = useState(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const messagesEndRef = useRef(null);
  const navigate = useNavigate();
  const { handleTyping } = useTypingStatus(displayName);
  const [isLoadingChat, setIsLoadingChat] = useState(false);

  // Memoize active chat to avoid repeated find calls
  const activeChat = useMemo(() => 
    privateChats.find((g) => g.id === activeChatId), 
    [privateChats, activeChatId]
  );

  // Auto scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, events]);

  // Reset invalid activeChatId
  useEffect(() => {
    if (activeChatId && !privateChats.find(g => g.id === activeChatId)) {
      console.warn(`Active chat ${activeChatId} not found in privateChats, resetting`);
      setActiveChatId(null);
      navigate("/anonymous-dashboard/private-chat");
    }
  }, [activeChatId, privateChats, navigate, setActiveChatId]);

  // Watch therapist presence
  useEffect(() => {
    if (!activeChatId) return;
    const q = query(collection(db, "therapistsOnline"), limit(50));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const onlineTherapists = snap.docs
          .map((d) => ({
            uid: d.id,
            ...d.data(),
            name: d.data().name || `Therapist_${d.id.slice(0, 8)}`, // Default name if missing
          }))
          .filter((t) => t.online);
        setActiveTherapists(onlineTherapists);
        setIsTherapistAvailable(onlineTherapists.length > 0);
      },
      (err) => {
        console.error("Error fetching therapists online:", err);
        showError("Failed to fetch therapist status. Please try again.");
      }
    );
    return () => unsub();
  }, [activeChatId, showError]);

  // Watch messages
  useEffect(() => {
    if (!activeChatId) return;
    const chatRef = doc(db, "privateChats", activeChatId);
    const q = query(collection(chatRef, "messages"), orderBy("timestamp"), limit(50));
    const unsubscribeMessages = onSnapshot(
      q,
      (snapshot) => {
        const msgs = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        setMessages(msgs);
        setIsLoadingChat(false);
        if (msgs.length > 0) playNotification();
      },
      (err) => {
        console.error("Error fetching messages:", err);
        showError("Failed to load messages. Please try again.");
        setIsLoadingChat(false);
      }
    );
    return () => unsubscribeMessages();
  }, [activeChatId, playNotification, showError]);

  // Watch events
  useEffect(() => {
    if (!activeChatId) return;
    const chatRef = doc(db, "privateChats", activeChatId);
    const q = query(collection(chatRef, "events"), orderBy("timestamp"), limit(50));
    const unsubscribeEvents = onSnapshot(
      q,
      (snapshot) => {
        const evts = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        setEvents(evts);
      },
      (err) => {
        console.error("Error fetching events:", err);
        showError("Failed to load events. Please try again.");
      }
    );
    return () => unsubscribeEvents();
  }, [activeChatId, showError]);

  // Watch chat data
  useEffect(() => {
    if (!activeChatId) return;
    const chatRef = doc(db, "privateChats", activeChatId);
    const unsubscribeChat = onSnapshot(
      chatRef,
      (snap) => {
        if (!snap.exists()) {
          navigate("/anonymous-dashboard/private-chat");
          return;
        }
        const data = snap.data();
        setChatData(data);
        setAiEnabled(data.aiActive || false);
      },
      (err) => {
        console.error("Error fetching chat data:", err);
        showError("Failed to load chat data. Please try again.");
        navigate("/anonymous-dashboard/private-chat");
      }
    );
    return () => unsubscribeChat();
  }, [activeChatId, navigate, showError]);

  // Join private chat
  const joinPrivateChat = async (chatId) => {
    if (!userId) return;
    try {
      const chatRef = doc(db, "privateChats", chatId);
      await runTransaction(db, async (transaction) => {
        const chatSnap = await transaction.get(chatRef);
        if (!chatSnap.exists()) {
          transaction.set(chatRef, {
            participants: [userId],
            lastMessage: "",
            lastUpdated: serverTimestamp(),
            unreadCountForTherapist: 0,
            aiActive: false,
            aiOffered: false,
            therapistJoinedOnce: false,
            needsTherapist: true,
          });
        } else {
          const chatData = chatSnap.data();
          if (!chatData.participants.includes(userId)) {
            transaction.update(chatRef, {
              participants: arrayUnion(userId),
              needsTherapist: true,
            });
          }
        }
      });
      navigate(`/anonymous-dashboard/private-chat/${chatId}`);
    } catch (err) {
      console.error("Error joining private chat:", err);
      showError("Failed to join private chat. Please try again.");
      navigate("/anonymous-dashboard/private-chat");
    }
  };

  // Leave private chat
  const leavePrivateChat = async () => {
    if (!activeChatId || !userId) return;
    try {
      const chatRef = doc(db, "privateChats", activeChatId);
      await runTransaction(db, async (transaction) => {
        const chatSnap = await transaction.get(chatRef);
        if (!chatSnap.exists()) throw new Error("Chat document does not exist");
        transaction.update(chatRef, {
          participants: arrayRemove(userId),
          aiOffered: false,
          therapistJoinedOnce: false,
          needsTherapist: true,
        });
        transaction.set(doc(collection(chatRef, "events")), {
          type: "leave",
          user: displayName,
          text: `${displayName} has left the chat.`,
          role: "system",
          timestamp: serverTimestamp(),
        });
      });
      setActiveChatId(null);
      navigate("/anonymous-dashboard/private-chat");
    } catch (err) {
      console.error("Error leaving private chat:", err);
      showError("Failed to leave chat. Please try again.");
    }
  };

  // Send message
  const sendMessage = async (file = null) => {
    if (!newMessage.trim() && !file) return;
    if (!userId || !activeChatId) return;
    setIsSending(true);

    try {
      let fileUrl = null;
      if (file) {
        const storageRef = ref(storage, `privateChats/${activeChatId}/${Date.now()}_${file.name}`);
        await uploadBytes(storageRef, file);
        fileUrl = await getDownloadURL(storageRef);
      }

      let messageText = newMessage;
      const chatRef = doc(db, "privateChats", activeChatId);
      await runTransaction(db, async (transaction) => {
        const chatSnap = await transaction.get(chatRef);
        if (!chatSnap.exists()) throw new Error("Chat document does not exist");
        const data = chatSnap.data();
        const hasTherapist = data.participants?.some((uid) => uid !== userId) || false;
        transaction.set(doc(collection(chatRef, "messages")), {
          text: messageText,
          userId,
          displayName,
          role: "user",
          timestamp: serverTimestamp(),
          fileUrl,
          reactions: {},
          read: false,
        });
        transaction.update(chatRef, {
          lastMessage: newMessage || "Attachment",
          lastUpdated: serverTimestamp(),
          unreadCountForTherapist: increment(1),
          needsTherapist: !hasTherapist,
        });
      });

      setNewMessage("");
      setShowEmojiPicker(false);

      const chatSnap = await getDoc(chatRef);
      if (!chatSnap.exists()) {
        navigate("/anonymous-dashboard/private-chat");
        return;
      }
      const data = chatSnap.data();
      const therapistInChat = data.participants?.some((uid) => uid !== userId) || false;

      if (data.aiActive && !therapistInChat) {
        try {
          setAiTyping(true);
          const aiInputMessages = mapMessagesForAI(messages);
          const aiResponse = await getAIResponse(newMessage, aiInputMessages);
          await runTransaction(db, async (transaction) => {
            const chatSnap = await transaction.get(chatRef);
            if (!chatSnap.exists()) throw new Error("Chat document does not exist");
            transaction.set(doc(collection(chatRef, "messages")), {
              text: `"${newMessage}"\n\n${aiResponse}`,
              role: "ai",
              displayName: "Support Assistant",
              timestamp: serverTimestamp(),
              fileUrl: null,
              reactions: {},
            });
          });
        } catch (err) {
          console.error("AI response error:", err);
          await runTransaction(db, async (transaction) => {
            transaction.set(doc(collection(chatRef, "messages")), {
              text: "Sorry, I couldn’t respond right now. Please wait for a therapist.",
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

  // Handle AI choice
  const handleAiChoice = async (choice) => {
    const chatRef = doc(db, "privateChats", activeChatId);
    try {
      await runTransaction(db, async (transaction) => {
        const chatSnap = await transaction.get(chatRef);
        if (!chatSnap.exists()) throw new Error("Chat document does not exist");
        transaction.set(doc(collection(chatRef, "messages")), {
          text: choice === "yes" ? "Yes" : "No",
          userId,
          displayName,
          role: "user",
          timestamp: serverTimestamp(),
          read: false,
        });
        if (choice === "yes") {
          transaction.update(chatRef, { aiActive: true, aiOffered: false, needsTherapist: false });
          transaction.set(doc(collection(chatRef, "messages")), {
            text: "You are now chatting with our support assistant until a therapist joins.",
            role: "system",
            timestamp: serverTimestamp(),
          });
          try {
            setAiTyping(true);
            const aiInputMessages = mapMessagesForAI(messages);
            const aiResponse = await getAIResponse("Start conversation", aiInputMessages);
            transaction.set(doc(collection(chatRef, "messages")), {
              text: aiResponse,
              role: "ai",
              displayName: "Support Assistant",
              timestamp: serverTimestamp(),
              fileUrl: null,
              reactions: {},
            });
          } catch (err) {
            console.error("AI response error:", err);
            transaction.set(doc(collection(chatRef, "messages")), {
              text: "Sorry, I couldn’t respond right now. Please wait for a therapist.",
              role: "system",
              timestamp: serverTimestamp(),
            });
          }
        } else {
          transaction.update(chatRef, { aiActive: false, aiOffered: false, needsTherapist: true });
          transaction.set(doc(collection(chatRef, "messages")), {
            text: "Okay, please hold on while we connect you to a therapist.",
            role: "system",
            timestamp: serverTimestamp(),
          });
        }
      });
      setAiEnabled(choice === "yes");
    } catch (err) {
      console.error("Error handling AI choice:", err);
      showError("Failed to process AI choice. Please try again.");
    } finally {
      setAiTyping(false);
    }
  };

  // Toggle reaction
  const toggleReaction = async (msgId, reactionType) => {
    if (!userId || !activeChatId) return;
    const msgRef = doc(db, `privateChats/${activeChatId}/messages`, msgId);
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

  // Combine messages and events
  const combinedPrivateChat = [...messages, ...events].sort((a, b) => {
    return getTimestampMillis(a.timestamp) - getTimestampMillis(b.timestamp);
  });

  return (
    <div className="split-chat-container">
      <div className="chat-box-card">
        <h3>Private Chats</h3>
        <div className="chat-list-container">
          {privateChats.length === 0 ? (
            <p>No private chats available</p>
          ) : (
            privateChats.map((chat) => {
              const lastTs = chat.lastUpdated;
              const { dateStr, timeStr } = formatTimestamp(lastTs);
              const anonName = anonNames[chat.id] || "Loading...";
              return (
                <div
                  key={chat.id}
                  className={`chat-card ${activeChatId === chat.id ? "selected" : ""}`}
                  onClick={() => joinPrivateChat(chat.id)}
                >
                  <div className="chat-card-inner">
                    <div className="chat-avater-content">
                      <span className="therapist-text-avatar">{anonName[0] || "T"}</span>
                      <div className="chat-card-content">
                        <strong className="chat-card-title">{anonName}</strong>
                        <small className="chat-card-preview">{chat.lastMessage || "No messages yet"}</small>
                      </div>
                    </div>
                    <div className="chat-card-meta">
                      {lastTs ? (
                        <div className="message-timestamp">
                          <span className="meta-date">{dateStr}</span>
                          <span className="meta-time">{timeStr}</span>
                        </div>
                      ) : null}
                      {chat.unreadCountForTherapist > 0 && (
                        <span className="unread-badge">{chat.unreadCountForTherapist}</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
      <div className="chat-box-container">
        {activeChatId ? (
          <div className="private-chat-box">
            <div className="detailLeave">
              <div className="chat-avater">
                <span className="text-avatar">{activeChat?.name?.[0] || "T"}</span>
                <div className="card-content">
                  <strong className="group-title">{activeChat?.name || "Unnamed therapist"}</strong>
                  <small className="participant-preview">
                    {activeTherapists.length > 0 ? (
                      activeTherapists.map((therapist, index) => (
                        <div key={therapist.uid} className="participant">
                          <span className="participant-name">
                            {therapist.name || "Loading..."}<b>,</b>
                          </span>
                        </div>
                      ))
                    ) : (
                      <div className="participant">No therapist</div>
                    )}           
                  </small>
                </div>
              </div>
              <h3 className="onlineStatus">
                {isTherapistAvailable
                  ? `Therapist Online: ${activeTherapists.map(t => t.name).join(", ")}`
                  : "Waiting for Therapist"}
              </h3>
              <div className="leave-participant">
                <LeaveChatButton type="private" onLeave={leavePrivateChat} />
              </div>
            </div>
            <div className="chat-box" role="log" aria-live="polite">
              {isLoadingChat ? (
                <p>Loading chat data...</p>
              ) : combinedPrivateChat.length === 0 ? (
                <p>No messages or events in this chat yet.</p>
              ) : (
                combinedPrivateChat.map((msg) => (
                  <div key={msg.id}>
                    {msg.type === "ai-offer" && chatData?.aiOffered && !aiEnabled && msg.role === "system" ? (
                      <div className="ai-offer">
                        <p className="chat-message system"><em>{msg.text}</em></p>
                        <button onClick={() => handleAiChoice("yes")} disabled={isSending || aiTyping}>
                          Yes
                        </button>
                        <button onClick={() => handleAiChoice("no")} disabled={isSending || aiTyping}>
                          No
                        </button>
                      </div>
                    ) : (
                      <ChatMessage
                        msg={msg}
                        toggleReaction={toggleReaction}
                        therapistInfo={{ role: "user" }}
                        handleTherapistClick={() => {}}
                      />
                    )}
                  </div>
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
                disabled={isSending || aiTyping}
              >
                <i className="fa-regular fa-face-smile"></i>
              </button>
              {showEmojiPicker && <EmojiPicker onEmojiClick={onEmojiClick} />}
              <input
                type="file"
                id="private-file-upload"
                style={{ display: "none" }}
                onChange={(e) => sendMessage(e.target.files[0])}
                aria-label="Upload file"
              />
              <button
                className="attach-btn"
                onClick={() => document.getElementById("private-file-upload").click()}
                aria-label="Attach file"
                disabled={isSending || aiTyping}
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
                disabled={isSending || aiTyping}
              />
              <button
                className="send-btn"
                onClick={() => sendMessage()}
                disabled={isSending || aiTyping}
                aria-label="Send message"
              >
                {isSending ? "Sending..." : <i className="fa-solid fa-paper-plane"></i>}
              </button>
            </div>
          </div>
        ) : (
          <div className="empty-chat">
            <p>Select a private chat to view messages</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default AnonymousPrivateChatSplitView;