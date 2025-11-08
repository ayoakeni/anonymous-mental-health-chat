import React, { useEffect, useRef, useCallback } from "react";
import { useParams } from "react-router-dom";
import ChatMessage from "./ChatMessage";
import { formatTimestamp } from "../../components/timestampUtils";
import EmojiPicker from "emoji-picker-react";
import LeaveChatButton from "../LeaveChatButton";

function PrivateChatSplitView({
  privateChats,
  activeChatId,
  isValidatingChat,
  chatError,
  isTherapistAvailable,
  activeTherapists,
  selectedTherapist,
  setSelectedTherapist,
  combinedPrivateChat,
  typingUsers,
  privateMessagesEndRef,
  chatBoxRef,
  isLoadingMessages,
  hasMoreMessages,
  loadMoreMessages,
  showEmojiPicker,
  setShowEmojiPicker,
  newPrivateMessage,
  setNewPrivateMessage,
  handleTyping,
  sendPrivateMessage,
  isSendingPrivate,
  leavePrivateChat,
  handleTherapistClick,
  navigate,
  therapistInfo,
  toggleReaction,
  deleteMessage,
  isLoadingChats,
  formatTimestamp,
  onEmojiClick: parentOnEmojiClick,
  anonNames = {},
  showError,
  inChat,
  therapistId,
  userMoods,
}) {

  const isUserAtBottom = useRef(true);

  // Track if user is at the bottom of the chat
  useEffect(() => {
    const chatBox = chatBoxRef.current;
    if (!chatBox) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = chatBox;
      isUserAtBottom.current = scrollHeight - scrollTop <= clientHeight + 50; // 50px buffer
      if (scrollTop === 0 && hasMoreMessages && !isLoadingMessages) {
        loadMoreMessages();
      }
    };

    chatBox.addEventListener("scroll", handleScroll);
    return () => chatBox.removeEventListener("scroll", handleScroll);
  }, [hasMoreMessages, isLoadingMessages, loadMoreMessages, chatBoxRef]);

  // Auto-scroll only if user is at the bottom
  useEffect(() => {
    if (isUserAtBottom.current && privateMessagesEndRef.current) {
      privateMessagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [combinedPrivateChat]);

  const onEmojiClick = useCallback((emojiData) => {
    setNewPrivateMessage((prev) => prev + emojiData.emoji);
    setShowEmojiPicker(false);
  }, [setNewPrivateMessage, setShowEmojiPicker]);

  // File validation helper
  const handleFileChange = useCallback(
    (file) => {
      if (file && (file.size > 5 * 1024 * 1024 || !["image/", "application/pdf"].some((type) => file.type.startsWith(type)))) {
        showError("Invalid file: too large or unsupported type");
        return;
      }
      sendPrivateMessage(file);
    },
    [sendPrivateMessage, showError]
  );

  return (
    <div className="split-chat-container">
      <div className="chat-box-card">
        <h3>Private Chats</h3>
        <div className="chat-list-container">
          {isLoadingChats ? (
            <p>Loading private chats...</p>
          ) : privateChats.length === 0 ? (
            <p>No private chats available</p>
          ) : (
            privateChats.map((chat) => {
              const lastTs = chat.lastUpdated;
              const { dateStr, timeStr } = formatTimestamp(lastTs || null);
              const anonName = anonNames[chat.id] || "Loading...";
              const chatUserId = chat.userId;
              const mood = userMoods[chatUserId];
              return (
                <div
                  key={chat.id}
                  className={`chat-card ${activeChatId === chat.id ? "selected" : ""}`}
                  onClick={() => { 
                    navigate(`/therapist-dashboard/private-chat/${chat.id}`);
                  }}
                >
                  <div className="chat-card-inner">
                    <div className="chat-avater-content">
                      <span className="therapist-avatar">{anonName[0] || "A"}</span>
                      <div className="chat-card-content">
                        <strong className="chat-card-title">
                          {anonName} 
                          {mood && (
                            <span
                              className="mood-emoji"
                              title={mood.label}
                              aria-label={`Mood: ${mood.label}`}
                            >
                              {mood.emoji}
                            </span>
                          )}
                          {chat.needsTherapist ? "(Needs Therapist)" : ""}
                          {therapistId && !chat.participants?.includes(therapistId) && chat.therapistJoinedOnce && (
                            <span className="left-indicator"> (Left)</span>
                          )}
                        </strong>
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
        {activeChatId && inChat ? (
          isValidatingChat ? (
            <div className="chat-list">
              <h3>Loading Private Chat...</h3>
              <p>Validating chat access, please wait...</p>
            </div>
          ) : chatError ? (
            <div className="chat-list">
              <h3>Error Loading Private Chat</h3>
              <p>{chatError}</p>
              <button onClick={() => navigate("/therapist-dashboard/private-chat")}>
                Back to Private Chats
              </button>
            </div>
          ) : (
            <div className="private-chat-box">
              <div className="detailLeave">
                <h3 className="onlineStatus">
                  {isTherapistAvailable
                    ? `Therapist Online: ${activeTherapists.join(", ")}`
                    : "Waiting for Therapist"}
                </h3>
                <div className="leave-participant">
                  <LeaveChatButton type="private" onLeave={leavePrivateChat} />
                </div>
              </div>
              {selectedTherapist && (
                <div className="therapist-profile-card">
                  <button onClick={() => setSelectedTherapist(null)}>Back</button>
                  <h4>{selectedTherapist.name}</h4>
                  <p>{selectedTherapist.profile}</p>
                </div>
              )}
              <div className="chat-box" ref={chatBoxRef} role="log" aria-live="polite">
                {isLoadingMessages ? (
                  <p>Loading messages...</p>
                ) : combinedPrivateChat.length === 0 ? (
                  <p className="no-message">No messages in this chat yet.</p>
                ) : (
                  combinedPrivateChat.map((msg) => (
                    <div className="message" key={`${msg.id}-${msg.type || "message"}`}>
                      <ChatMessage
                        msg={msg}
                        toggleReaction={toggleReaction}
                        deleteMessage={(msgId) => deleteMessage(msgId, "private")}
                        therapistInfo={therapistInfo}
                        handleTherapistClick={handleTherapistClick}
                      />
                    </div>
                  ))
                )}
                {typingUsers.length > 0 && (
                  <p className="typing-indicator">
                    {typingUsers.join(", ")} {typingUsers.length === 1 ? "is" : "are"} typing...
                  </p>
                )}
                <div ref={privateMessagesEndRef} />
              </div>
              <div className="chat-input">
                <button
                  className="emoji-btn"
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                  aria-label="Open emoji picker"
                >
                  <i className="fa-regular fa-face-smile"></i>
                </button>
                {showEmojiPicker && <EmojiPicker onEmojiClick={parentOnEmojiClick || onEmojiClick} />}
                <input
                  type="file"
                  id="private-file-upload"
                  style={{ display: "none" }}
                  onChange={(e) => handleFileChange(e.target.files[0])}
                  aria-label="Upload file"
                />
                <button
                  className="attach-btn"
                  onClick={() => document.getElementById("private-file-upload").click()}
                  aria-label="Attach file"
                >
                  <i className="fa-solid fa-paperclip"></i>
                </button>
                <input
                  className="inputInsert"
                  type="text"
                  value={newPrivateMessage}
                  onChange={(e) => {
                    setNewPrivateMessage(e.target.value);
                    handleTyping(e.target.value);
                  }}
                  placeholder="Type a message..."
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      if (newPrivateMessage.trim()) {
                        sendPrivateMessage(newPrivateMessage);
                        setNewPrivateMessage("");
                      }
                    }
                  }}
                  aria-label="Message input"
                />
                <button
                  className="send-btn"
                  onClick={() => {
                    if (newPrivateMessage.trim()) {
                      sendPrivateMessage(newPrivateMessage);
                      setNewPrivateMessage("");
                    }
                  }}
                  disabled={isSendingPrivate}
                  aria-label="Send message"
                >
                  {isSendingPrivate ? "Sending..." : <i className="fa-solid fa-paper-plane"></i>}
                </button>
              </div>
            </div>
          )
        ) : (
          <div className="empty-chat">
            <p>Select a private chat to view messages</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default PrivateChatSplitView;