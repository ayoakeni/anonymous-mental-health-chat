import React, { useEffect } from "react";
import { useParams } from "react-router-dom";
import ChatMessage from "./ChatMessage";
import EmojiPicker from "emoji-picker-react";
import LeaveChatButton from "../LeaveChatButton";

function GroupChatSplitView({
  groupChats,
  activeGroupId,
  isGroupChatOpen,
  inGroupChat,
  therapistsOnline,
  participants,
  isParticipantsOpen,
  setIsParticipantsOpen,
  participantNames,
  combinedGroupChat,
  typingUsers,
  messagesEndRef,
  showEmojiPicker,
  setShowEmojiPicker,
  reply,
  setReply,
  handleTyping,
  sendReply,
  joinGroupChat,
  leaveGroupChat,
  therapistInfo,
  toggleReaction,
  deleteMessage,
  handleTherapistClick,
  isLoadingChats,
  formatTimestamp,
  onEmojiClick: parentOnEmojiClick,
}) {
  const { groupId } = useParams();

  useEffect(() => {
    if (groupId && groupId !== activeGroupId) {
      joinGroupChat(groupId);
    }
  }, [groupId, activeGroupId, joinGroupChat]);

  // Local emoji handler if not passed
  const onEmojiClick = (emojiData) => {
    setReply(reply + emojiData.emoji);
    setShowEmojiPicker(false);
  };

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
                  onClick={() => joinGroupChat(group.id)}
                >
                  <div className="chat-card-inner">
                    <div className="chat-avater-content">
                      <span className="therapist-avatar">{group.name?.[0] || "U"}</span>
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
        {activeGroupId && isGroupChatOpen && inGroupChat ? (
          <div className="group-chat">
            <div className="detailLeave">
              <h3 className="onlineStatus">
                {groupChats.find((g) => g.id === activeGroupId)?.name || "Group Chat"}{" "}
                {therapistsOnline.length > 0
                  ? `(Therapists Online: ${therapistsOnline.map((t) => t.name).join(", ")})`
                  : "(No therapists online)"}
              </h3>
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
                              {participantNames[uid] || uid}
                            </div>
                          ))
                        ) : (
                          <div className="participant-item">No participants</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                <LeaveChatButton type="group" therapistInfo={therapistInfo} onLeave={leaveGroupChat} />
              </div>
            </div>
            {combinedGroupChat.some((msg) => msg.pinned) && (
              <div className="pinned-message">
                <strong>Pinned:</strong>{" "}
                {combinedGroupChat.find((msg) => msg.pinned)?.text || "Welcome to the group chat!"}
              </div>
            )}
            <div className="chat-box" role="log" aria-live="polite">
              {combinedGroupChat.map((msg) => (
                <ChatMessage
                  key={msg.id}
                  msg={msg}
                  toggleReaction={toggleReaction}
                  deleteMessage={deleteMessage}
                  therapistInfo={therapistInfo}
                  handleTherapistClick={handleTherapistClick}
                />
              ))}
              {typingUsers.length > 0 && (
                <p className="typing-indicator">
                  {typingUsers.join(", ")} {typingUsers.length === 1 ? "is" : "are"} typing...
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
              {showEmojiPicker && <EmojiPicker onEmojiClick={parentOnEmojiClick || onEmojiClick} />}
              <input
                type="file"
                id="group-file-upload"
                style={{ display: "none" }}
                onChange={(e) => sendReply(e.target.files[0])}
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
                value={reply}
                onChange={(e) => {
                  setReply(e.target.value);
                  handleTyping(e.target.value);
                }}
                placeholder="Reply to group chat..."
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendReply();
                  }
                }}
                aria-label="Message input"
              />
              <button className="send-btn" onClick={() => sendReply()} aria-label="Send message">
                <i className="fa-solid fa-paper-plane"></i>
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

export default GroupChatSplitView;