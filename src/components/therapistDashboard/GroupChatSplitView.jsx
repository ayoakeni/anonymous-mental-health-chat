import React, { useEffect, useRef, useCallback, useState, useMemo } from "react";
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
  isSendingGroup,
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
  pinMessage,
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

  // Memoize active group to avoid repeated find calls
  const activeGroup = useMemo(() => 
    groupChats.find((g) => g.id === activeGroupId), 
    [groupChats, activeGroupId]
  );

  const { typingUsers, handleTyping } = useTypingStatus(
    therapistInfo?.name || "Therapist",
    activeGroupId && isGroupChatOpen && inGroupChat ? activeGroupId : null
  );

  // Menu ellipsis
  useEffect(() => {
    const closeMenu = (e) => {
      // Only close if click is outside the entire menu container
      if (!e.target.closest(".leave-participant") && !e.target.closest(".chat-options-menu")) {
        setIsParticipantsOpen(false);
      }
    };
    if (isParticipantsOpen) {
      document.addEventListener("click", closeMenu);
    }
    return () => {
      document.removeEventListener("click", closeMenu);
    };
  }, [isParticipantsOpen]);

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

  // Scroll to a pinned message by ID
  const scrollToMessage = useCallback((msgId) => {
    const el = document.getElementById(`msg-${msgId}`);
    if (!el) return;

    document.querySelectorAll(".message-highlight").forEach(e => {
      e.classList.remove("message-highlight");
    });

    el.classList.add("message-highlight");

    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => {
      el.classList.remove("message-highlight");
    }, 1600);
  }, []);

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
          <div className="chat-header">
            <div className="detailLeave">
              <div className="chat-avater">
                {isMobile && activeGroup && isGroupChatOpen && inGroupChat && (
                  <i
                    className="fa-solid fa-arrow-left mobile-back-btn"
                    onClick={() => navigate("/therapist-dashboard/group-chat")}
                    aria-label="Back to chat list"
                  >
                  </i>
                )}
                <span className="text-avatar">{activeGroup?.name?.[0] || "G"}</span>
                <div className="card-content">
                  <strong className="group-title">{activeGroup?.name || "Unnamed Group"}</strong>
                  <small className="participant-preview">
                    {participants.length > 0 ? (
                      participants.map((uid, index) => (
                        <span key={uid} className="participant-name">
                          {participantNames[uid] || "Loading"}
                          {index < participants.length - 1 && <b>,</b>}
                        </span>
                      ))
                    ) : (
                      <div className="participant">No participants</div>
                    )}           
                  </small>
                </div>
              </div>
              <div className="leave-participant">
                {/* MENU TRIGGER */}
                <button
                  className="menu-trigger"
                  onClick={(e) => { 
                    e.stopPropagation();
                    setIsParticipantsOpen(!isParticipantsOpen)
                  }}
                  aria-label="Chat options"
                  aria-expanded={isParticipantsOpen}
                >
                  <i className="fa-solid fa-ellipsis-vertical"></i>
                </button>

                {/* DROPDOWN MENU */}
                {isParticipantsOpen && (
                  <div className="chat-options-menu">
                    {/* Participants */}
                    <div
                      className="menu-item participant-toggle"
                      onClick={() => setIsParticipantsOpen(true)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => e.key === "Enter" && setIsParticipantsOpen(true)}
                    >
                      <i className="fas fa-users"></i>
                      <span>Participants ({participants.length})</span>
                    </div>

                    {/* Participants List (shown inside menu now) */}
                    <div className="participant-dropdown-inline">
                      {isLoadingNames ? (
                        <div className="participant-item">Loading...</div>
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

                    <div className="menu-divider"></div>

                    {/* Leave Chat */}
                    <LeaveChatButton type="group" therapistInfo={therapistInfo} onLeave={leaveGroupChat} />
                  </div>
                )}
              </div>
            </div>
            {combinedGroupChat.some((msg) => msg.pinned) && (
              <div className="pinned-message"
                onClick={() => {
                  const pinnedMsg = combinedGroupChat.find(m => m.pinned);
                  if (pinnedMsg) scrollToMessage(pinnedMsg.id);
                }}
                style={{ cursor: "pointer" }}
                title="Click to jump to pinned message"
              >
                <span className="pin-text-icon">
                  <i className="fas fa-thumbtack pinned-icon"></i>
                  <span className="pinned-text">
                    <strong>{combinedGroupChat.find(m => m.pinned)?.pinnedBy}:</strong>{" "}
                    <span>{combinedGroupChat.find((msg) => msg.pinned)?.text || ""}</span>
                  </span>
                </span>
                {therapistId && (
                  <button
                    className="unpin-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      const pinnedMsg = combinedGroupChat.find(m => m.pinned);
                      if (pinnedMsg) pinMessage(pinnedMsg.id, true);
                    }}
                  >
                    <i className="fas fa-times"></i>
                  </button>
                )}
              </div>
            )}
          </div>
          <div className="chat-box" ref={chatBoxRef} role="log" aria-live="polite">
            {isLoadingMessages ? (
              <div className="loading-messages">
                <div className="spinner"></div>
                <p>Loading messages...</p>
              </div>
            ) : combinedGroupChat.length === 0 ? (
              <p className="no-message">No messages in this group yet.</p>
            ) : (
              combinedGroupChat.map((msg, index) => (
                <React.Fragment key={`${msg.id}-${msg.type || "message"}`}>
                  {msg.isNew && index > 0 && !combinedGroupChat[index - 1].isNew && (
                    <div className="new-messages-divider">New Messages</div>
                  )}
                  <div className={`message ${msg.isNew ? "new-message" : ""}`} id={`msg-${msg.id}`}>
                    <ChatMessage
                      msg={msg}
                      toggleReaction={toggleReaction}
                      deleteMessage={deleteMessage}
                      pinMessage={pinMessage}
                      scrollToMessage={scrollToMessage}
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
                {typingUsers
                  .map(u => typeof u === "string" ? u : u?.name || "Someone")
                  .join(", ")}{" "}
                {typingUsers.length === 1 ? "is" : "are"} typing
                <div className="typing-dots">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
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
            <button className="send-btn" 
              onClick={() => {
                if (reply.trim()) {
                  sendReply(reply);
                  setReply("");
                }
              }}
              disabled={isSendingGroup}
              aria-label="Send message">
              {isSendingGroup ? <span className="spinner small"></span> : <i className="fa-solid fa-paper-plane"></i>}
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
    const showChat = activeGroupId && isGroupChatOpen && inGroupChat;

    return (
      <div className={`mobile-chat-wrapper ${isInsideChat ? "no-bottom-padding" : ""}`.trim()}>
        <div className={`mobile-panel ${showChat ? 'hidden' : ''}`.trim()}>
          {leftPanel}
        </div>
        <div className={`mobile-panel ${!showChat ? 'hidden' : ''}`.trim()}>
          {rightPanel}
        </div>
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