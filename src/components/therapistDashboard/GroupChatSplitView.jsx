import React, { useEffect, useRef, useCallback, useState } from "react";
import { useParams } from "react-router-dom";
import ChatMessage from "./ChatMessage";
import ResizableSplitView from "../../components/resizableSplitView";
import { useIsInsideChat } from "../../hooks/useIsInsideChatMobile";
import EmojiPicker from "emoji-picker-react";
import LeaveChatButton from "../LeaveChatButton";
import { useTypingStatus } from "../../hooks/useTypingStatus";

/* -------------------------------------------------------------
   Simple media-query hook (no external deps)
   ------------------------------------------------------------- */
const useMediaQuery = (query) => {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const m = window.matchMedia(query);
    setMatches(m.matches);

    const handler = (e) => setMatches(e.matches);
    m.addEventListener("change", handler);
    return () => m.removeEventListener("change", handler);
  }, [query]);

  return matches;
};

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
  groupMessagesEndRef,
  showEmojiPicker,
  setShowEmojiPicker,
  reply,
  setReply,
  sendReply,
  joinGroupChat,
  leaveGroupChat,
  therapistInfo,
  toggleReaction,
  deleteMessage,
  therapistId,
  handleTherapistClick,
  isLoadingChats,
  formatTimestamp,
  onEmojiClick: parentOnEmojiClick,
  isLoadingNames,
  isLoadingMessages,
  hasMoreMessages,
  loadMoreMessages,
  navigate,
}) {
  const { groupId } = useParams();
  const chatBoxRef = useRef(null);
  const isUserAtBottom = useRef(true);
  const isMobile = useMediaQuery("(max-width: 768px)");
  const isInsideChat = useIsInsideChat();

  const { typingUsers, handleTyping } = useTypingStatus(
    therapistInfo?.name || "Therapist",
    activeGroupId && isGroupChatOpen && inGroupChat ? activeGroupId : null
  );

  // Track if user is at the bottom of the chat
  useEffect(() => {
    const chatBox = chatBoxRef.current;
    if (!chatBox) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = chatBox;
      isUserAtBottom.current = scrollHeight - scrollTop <= clientHeight + 50;
      if (scrollTop === 0 && hasMoreMessages && !isLoadingMessages) {
        loadMoreMessages();
      }
    };

    chatBox.addEventListener("scroll", handleScroll);
    return () => chatBox.removeEventListener("scroll", handleScroll);
  }, [hasMoreMessages, isLoadingMessages, loadMoreMessages]);

  // Auto-scroll only if user is at the bottom
  useEffect(() => {
    if (isUserAtBottom.current && groupMessagesEndRef.current) {
      groupMessagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [combinedGroupChat, groupMessagesEndRef]);

  // Join group chat when groupId changes
  useEffect(() => {
    if (groupId && groupId !== activeGroupId) {
      joinGroupChat(groupId);
    }
  }, [groupId, activeGroupId, joinGroupChat]);

  const onEmojiClick = useCallback((emojiData) => {
    setReply((prev) => prev + emojiData.emoji);
    setShowEmojiPicker(false);
  }, [setReply, setShowEmojiPicker]);

  // LEFT PANEL: Chat List
  const leftPanel = (
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
            const { dateStr, timeStr } = formatTimestamp(lastTs || null);
            return (
              <div
                key={group.id}
                className={`chat-card ${activeGroupId === group.id ? "selected" : ""}`}
                onClick={() => {
                  navigate(`/therapist-dashboard/group-chat/${group.id}`);
                  joinGroupChat(group.id);
                }}
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
  );
  // RIGHT PANEL: Active Chat
  const rightPanel = (
    <div className="chat-box-container">
      {activeGroupId && isGroupChatOpen && inGroupChat ? (
        <div className="group-chat-box">
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
                      {isLoadingNames ? (
                        <div className="participant-item">Loading participants...</div>
                      ) : participants.length > 0 ? (
                        participants.map((uid) => (
                          <div key={uid} className="participant-item">
                            {participantNames[uid] || "Anonymous User"}
                          </div>
                        ))
                      ) : (
                        <div className="participant-item">No participants</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
              {isMobile && activeGroupId&& isGroupChatOpen && inGroupChat && (
                <div className="mobile-back-header">
                  <button
                    className="mobile-back-btn"
                    onClick={() => navigate("/therapist-dashboard/group-chat")}
                    aria-label="Back to chat list"
                  >
                    Back to chats
                  </button>
                </div>
              )}
              <LeaveChatButton type="group" therapistInfo={therapistInfo} onLeave={leaveGroupChat} />
            </div>
          </div>
          {combinedGroupChat.some((msg) => msg.pinned) && (
            <div className="pinned-message">
              <strong>Pinned:</strong>{" "}
              {combinedGroupChat.find((msg) => msg.pinned)?.text || "Welcome to the group chat!"}
            </div>
          )}
          <div className="chat-box" ref={chatBoxRef} role="log" aria-live="polite">
            {isLoadingMessages ? (
              <p>Loading messages...</p>
            ) : combinedGroupChat.length === 0 ? (
              <p className="no-message">No messages in this group yet.</p>
            ) : (
              combinedGroupChat.map((msg, index) => (
                <React.Fragment key={`${msg.id}-${msg.type || "message"}`}>
                  {msg.isNew && index > 0 && !combinedGroupChat[index - 1].isNew && (
                    <div className="new-messages-divider">New Messages</div>
                  )}
                  <div className={`message ${msg.isNew ? "new-message" : ""}`}>
                    <ChatMessage
                      msg={msg}
                      toggleReaction={toggleReaction}
                      deleteMessage={deleteMessage}
                      therapistInfo={therapistInfo}
                      therapistId={therapistId}
                      handleTherapistClick={handleTherapistClick}
                    />
                  </div>
                </React.Fragment>
              ))
            )}
            {/* Typing Indicator */}
            {typingUsers.length > 0 && (
              <p className="typing-indicator">
                {typingUsers.join(", ")} {typingUsers.length === 1 ? "is" : "are"} typing...
              </p>
            )}
            <div ref={groupMessagesEndRef} />
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
              onChange={(e) => {
                const file = e.target.files[0];
                if (file) {
                  sendReply("", file);
                  setReply("");
                }
              }}
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
                  if (reply.trim()) {
                    sendReply(reply);
                    setReply("");
                  }
                }
              }}
              aria-label="Message input"
            />
            <button className="send-btn" 
              onClick={() => {
                if (reply.trim()) {
                  sendReply(reply);
                  setReply("");
                }
              }}
              aria-label="Send message">
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
  );

  /* ------------------- RENDER LOGIC ------------------- */
  if (isMobile) {
    return activeGroupId && isGroupChatOpen && inGroupChat ? (
      <div className={`mobile-chat-wrapper ${isInsideChat ? "no-bottom-padding" : ""}`}>
        {rightPanel}
      </div>
    ) : (
      <div className={`mobile-chat-wrapper ${isInsideChat ? "no-bottom-padding" : ""}`}>
        {leftPanel}
      </div>
    );
  }

  return (
    <ResizableSplitView
      leftPanel={leftPanel}
      rightPanel={rightPanel}
      initialRatio={0.3}
      minLeft={370}
      maxLeft={550}
      minRight={200}
      maxRight={400}
    />
  );
}

export default GroupChatSplitView;