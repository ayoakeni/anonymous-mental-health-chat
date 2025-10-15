import React, { useEffect } from "react";
import { useParams } from "react-router-dom";
import LeaveChatButton from "../LeaveChatButton";
import "../../styles/privateChat.css"

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
  newPrivateMessage,
  setNewPrivateMessage,
  handleTyping,
  sendPrivateMessage,
  isSendingPrivate,
  joinPrivateChat,
  leavePrivateChat,
  handleTherapistClick,
  navigate,
  isLoadingChats,
  formatTimestamp,
  anonNames = {},
}) {
  const { chatId } = useParams();

  useEffect(() => {
    if (chatId && chatId !== activeChatId) {
      joinPrivateChat(chatId);
    }
  }, [chatId, activeChatId, joinPrivateChat]);

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
                      <span className="therapist-avatar">{anonName[0] || "A"}</span>
                      <div className="chat-card-content">
                        <strong className="chat-card-title">
                          {anonName} {chat.needsTherapist ? "(Needs Therapist)" : ""}
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
        {activeChatId ? (
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
            <div className="private-chat">
              <h3 className="onlineStatus">
                Private Chat {activeChatId}{" "}
                {isTherapistAvailable
                  ? `(Therapist Online: ${activeTherapists.join(", ")})`
                  : "(Waiting for Therapist)"}
              </h3>
              <LeaveChatButton onLeave={leavePrivateChat} />
              {selectedTherapist && (
                <div className="therapist-profile-card">
                  <button onClick={() => setSelectedTherapist(null)}>Back</button>
                  <h4>{selectedTherapist.name}</h4>
                  <p>{selectedTherapist.profile}</p>
                </div>
              )}
              <div className="chat-container" role="log" aria-live="polite">
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
                    <span className="message-timestamp">
                      {msg.timestamp?.toDate().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
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
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      sendPrivateMessage();
                    }
                  }}
                  aria-label="Message input"
                />
                <button onClick={sendPrivateMessage} disabled={isSendingPrivate} aria-label="Send message">
                  {isSendingPrivate ? "Sending..." : "Send"}
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