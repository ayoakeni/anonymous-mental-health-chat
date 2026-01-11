import { useEffect, useRef, useCallback, useState } from "react";
import ChatMessage from "../ChatMessage";
import ResizableSplitView from "../../components/resizableSplitView";
import { useIsInsideChat } from "../../hooks/useIsInsideChatMobile";
import EmojiPicker from "emoji-picker-react";
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

/* -------------------------------------------------------------
   MAIN COMPONENT
   ------------------------------------------------------------- */
function PrivateChatSplitView({
  privateChats,
  activeChatId,
  inChat,
  isValidatingChat,
  chatError,
  selectedTherapist,
  setSelectedTherapist,
  combinedPrivateChat,
  privateMessagesEndRef,
  chatBoxRef,
  isLoadingMessages,
  hasMoreMessages,
  loadMoreMessages,
  showEmojiPicker,
  setShowEmojiPicker,
  newPrivateMessage,
  setNewPrivateMessage,
  sendPrivateMessage,
  isSendingPrivate,
  leavePrivateChat,
  handleTherapistClick,
  navigate,
  therapistInfo,
  toggleReaction,
  deleteMessage,
  pinMessage,
  isLoadingChats,
  formatTimestamp,
  onEmojiClick: parentOnEmojiClick,
  anonNames = {},
  showError,
  therapistId,
  userMoods,
}) {
  const isUserAtBottom = useRef(true);
  const { typingUsers, handleTyping } = useTypingStatus(therapistInfo?.name, activeChatId && inChat && !isValidatingChat && !chatError ? activeChatId : null);
  const isMobile = useMediaQuery("(max-width: 768px)");
  const isInsideChat = useIsInsideChat();
  const [menuOpen, setMenuOpen] = useState(false);
  const fileInputRef = useRef(null);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [replyTo, setReplyTo] = useState(null);

  /* ------------------- SCROLL LOGIC ------------------- */
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
  }, [hasMoreMessages, isLoadingMessages, loadMoreMessages, chatBoxRef]);

  // Scroll to pinned message or replied message
  const scrollToMessage = useCallback((msgId) => {
    const el = document.getElementById(`msg-${msgId}`);
    if (!el) return;

    // Remove existing highlight
    document.querySelectorAll(".message-highlight").forEach(e => {
      e.classList.remove("message-highlight");
    });

    // Highlight and scroll
    el.classList.add("message-highlight");
    el.scrollIntoView({ behavior: "smooth", block: "center" });

    setTimeout(() => {
      el.classList.remove("message-highlight");
    }, 1600);
  }, []);

  // Menu ellipsis
  useEffect(() => {
    const closeMenu = (e) => {
      if (!e.target.closest(".leave-participant") && !e.target.closest(".chat-options-menu")) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) {
      document.addEventListener("click", closeMenu);
    }
    return () => document.removeEventListener("click", closeMenu);
  }, [menuOpen]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (isUserAtBottom.current && privateMessagesEndRef.current) {
      privateMessagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [combinedPrivateChat, privateMessagesEndRef]);

  /* ------------------- EMOJI & FILE HELPERS ------------------- */
  const onEmojiClick = useCallback(
    (emojiData) => {
      setNewPrivateMessage((prev) => prev + emojiData.emoji);
      setShowEmojiPicker(false);
    },
    [setNewPrivateMessage, setShowEmojiPicker]
  );

  const handleReply = (message) => {
    setReplyTo(message);
    // Focus the input
    document.querySelector(".inputInsert")?.focus();
  };

  const handleSend = useCallback((text = "", file = null) => {
    if (!text.trim() && !file) return;
    sendPrivateMessage(text.trim(), file, replyTo);
    setNewPrivateMessage("");
    setReplyTo(null);
  }, [sendPrivateMessage, replyTo]);

  // File validation helper
  const handleFileChange = useCallback(
    (file) => {
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) {
        showError("File too large (max 5 MB)");
        return;
      }
      if (!["image/", "application/pdf"].some((type) => file.type.startsWith(type))) {
        showError("Only images and PDFs are supported");
        return;
      }
      handleSend("", file);
    },
    [handleSend, showError]
  );

  /* ------------------- LEFT PANEL (Chat List) ------------------- */
  const leftPanel = (
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
                onClick={() => navigate(`/therapist-dashboard/private-chat/${chat.id}`)}
              >
                <div className="chat-card-inner">
                  <div className="chat-avater-content">
                    <span className="therapist-avatar">{anonName[0] || "A"}</span>
                    <div className="chat-card-content">
                      <strong className="chat-card-title">
                        {anonName}
                        {mood && (
                          <span className="mood-emoji" title={mood.label} aria-label={`Mood: ${mood.label}`}>
                            {mood.emoji}
                          </span>
                        )}
                        {therapistId && !chat.participants?.includes(therapistId) && (
                          <span className="left-indicator"> (You Left)</span>
                        )}
                      </strong>
                      <small className="chat-card-preview">
                        {chat.lastMessage || "No messages yet"}
                      </small>
                    </div>
                  </div>
                  <div className="chat-card-meta">
                    {lastTs && (
                      <div className="message-timestamp">
                        <span className="meta-date">{dateStr}</span>
                        <span className="meta-time">{timeStr}</span>
                      </div>
                    )}
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
  );

  /* ------------------- RIGHT PANEL (Active Chat) ------------------- */
  const rightPanel = (
    <div className="chat-box-container">
      {activeChatId && inChat ? (
        isValidatingChat ? (
          <div className="chat-info-display">
            <h3>Loading Private Chat...</h3>
            <p>Validating chat access, please wait...</p>
          </div>
        ) : chatError ? (
          <div className="chat-info-display">
            <h3>Error Loading Private Chat</h3>
            <p>{chatError}</p>
            <button className="back-to-pchat" onClick={() => navigate("/therapist-dashboard/private-chat")}>
              Back to Private Chats
            </button>
          </div>
        ) : (
          <div className="private-chat-box">
            
            <div className="detailLeave">
              <div className="chat-avater">
                {isMobile && activeChatId && inChat && (
                  <i
                    className="fa-solid fa-arrow-left mobile-back-btn"
                    onClick={() => navigate("/therapist-dashboard/private-chat")}
                    aria-label="Back to chat list"
                  ></i>
                )}
                <span className="text-avatar">
                  {anonNames[activeChatId]?.[0]?.toUpperCase() || "A"}
                </span>
                <div className="card-content">
                  <strong className="group-title">
                    {anonNames[activeChatId] || "Anonymous"}
                    {activeChatId && (() => {
                    const chat = privateChats.find(c => c.id === activeChatId);
                    const mood = chat?.userId && userMoods[chat.userId];
                    return mood ? (
                        <span 
                          className="mood-emoji" 
                          title={mood.label} 
                          aria-label={`Mood: ${mood.label}`}
                        >
                          {mood.emoji}
                        </span>
                      ) : null;
                    })()}
                  </strong>
                  <small className="participant-preview">
                    <span className="participant-name user-status">
                      {(() => {
                        const chat = privateChats.find(c => c.id === activeChatId);
                        const lastSeen = chat?.lastSeenAt?.toMillis?.();
                        if (!lastSeen) return "Last seen recently";

                        const diffSec = Math.floor((Date.now() - lastSeen) / 1000);

                        if (diffSec < 30) {
                          return (
                            <>
                              <i className="fas fa-circle online-dot"></i> Active now
                            </>
                          );
                        }

                        if (diffSec < 60) return "Last seen just now";
                        if (diffSec < 120) return "Last seen a minute ago";
                        if (diffSec < 3600) return `Last seen ${Math.floor(diffSec / 60)} minutes ago`;
                        if (diffSec < 7200) return "Last seen an hour ago";
                        if (diffSec < 86400) return `Last seen ${Math.floor(diffSec / 3600)} hours ago`;

                        // Older than a day → show date
                        const date = new Date(lastSeen);
                        const today = new Date();
                        const yesterday = new Date(today);
                        yesterday.setDate(yesterday.getDate() - 1);

                        if (date.toDateString() === today.toDateString()) return "Last seen today";
                        if (date.toDateString() === yesterday.toDateString()) return "Last seen yesterday";

                        return `Last seen ${date.toLocaleDateString()}`;
                      })()}
                    </span>
                  </small>
                </div>
              </div>
              <div className="leave-participant">
                {/* MENU TRIGGER */}
                <button
                  className="menu-trigger"
                  onClick={(e) => { 
                    e.stopPropagation();
                    setMenuOpen(prev => !prev);
                  }}
                  aria-expanded={menuOpen}
                >
                  <i className="fa-solid fa-ellipsis-vertical"></i>
                </button>

                {menuOpen && (
                  <div className="chat-options-menu">
                    {/* Leave Button */}
                    <div className="menu-item leave-button" onClick={() => setShowLeaveConfirm(true)}>
                      <i className="fas fa-sign-out-alt"></i>
                      <span>End Chat</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
            {/* Confirmation Modal */}
            {showLeaveConfirm && (
              <div className="modal-backdrop-leave" onClick={() => setShowLeaveConfirm(false)}>
                <div className="confirm-modal-leave" onClick={(e) => e.stopPropagation()}>
                  <div className="confirm-modal-content">
                    <h3>End this private chat?</h3>
                    <p>
                      You’re about to end this one-on-one conversation.
                    </p>
                    <ul className="confirm-list">
                      <li>No new messages can be sent or received in this conversation</li>
                      <li>This chat and its history will no longer appear in your chat list</li>
                      <li>The chat will only reappear in your list if the user sends you a new message in the future</li>
                    </ul>
                    <p className="confirm-question">
                      Are you sure you want to end this chat?
                    </p>
                    <small className="privacy-note">
                      Your past messages remain private and secure.
                    </small>
                  </div>

                  <div className="button-group">
                    <button className="btn-cancel" onClick={() => setShowLeaveConfirm(false)}>
                      Cancel
                    </button>
                    <button
                      className="btn-confirm-leave"
                      onClick={() => {
                        leavePrivateChat();
                        setShowLeaveConfirm(false);
                      }}
                    >
                      End Chat
                    </button>
                  </div>
                </div>
              </div>
            )}
            {combinedPrivateChat.some((msg) => msg.pinned) && (
              <div
                className="pinned-message"
                onClick={() => {
                  const pinnedMsg = combinedPrivateChat.find(m => m.pinned);
                  if (pinnedMsg) scrollToMessage(pinnedMsg.id);
                }}
                style={{ cursor: "pointer" }}
                title="Click to jump to pinned message"
              >
                <span className="pin-text-icon">
                  <i className="fas fa-thumbtack pinned-icon"></i>
                  <span className="pinned-text">
                    <strong>{combinedPrivateChat.find(m => m.pinned)?.pinnedBy || "Someone"}:</strong>{" "}
                    <span>
                      {(() => {
                        const pinnedMsg = combinedPrivateChat.find(m => m.pinned);
                        return pinnedMsg?.text || (pinnedMsg?.fileUrl ? "Attachment" : "");
                      })()}
                    </span>
                  </span>
                </span>
                {therapistId && (
                  <button
                    className="unpin-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      const pinnedMsg = combinedPrivateChat.find(m => m.pinned);
                      if (pinnedMsg) pinMessage(pinnedMsg.id, true);
                    }}
                  >
                    <i className="fas fa-times"></i>
                  </button>
                )}
              </div>
            )}
            {selectedTherapist && (
              <div className="therapist-profile-card">
                <button onClick={() => setSelectedTherapist(null)}>Back</button>
                <h4>{selectedTherapist.name}</h4>
                <p>{selectedTherapist.profile}</p>
              </div>
            )}

            <div className="chat-box" ref={chatBoxRef} role="log" aria-live="polite">
              {isLoadingMessages ? (
                <div className="loading-messages">
                  <div className="spinner"></div>
                  <p>Loading messages...</p>
                </div>
              ) : combinedPrivateChat.length === 0 ? (
                <p className="no-message">No messages in this chat yet.</p>
              ) : (
                combinedPrivateChat.map((msg) => (
                  <div className="message" key={`${msg.id}-${msg.type || "message"}`}>
                    <ChatMessage
                      msg={msg}
                      toggleReaction={toggleReaction}
                      currentUserId={therapistId}
                      isPrivateChat={true}
                      scrollToMessage={scrollToMessage}
                      deleteMessage={(msgId) => deleteMessage(msgId, "private")}
                      pinMessage={pinMessage}
                      therapistInfo={therapistInfo}
                      handleTherapistClick={handleTherapistClick}
                      onReply={handleReply}
                    />
                  </div>
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
              <div ref={privateMessagesEndRef} />
            </div>
            <div className="chat-input-box">
              {replyTo && (
                <div className="reply-preview">
                  <div className="reply-preview-content">
                    <strong>Replying to {replyTo.displayName}:</strong>
                    <div className="reply-preview-text">
                      {replyTo.text || (replyTo.fileUrl ? "Attachment" : "")}
                    </div>
                  </div>
                  <button
                    className="cancel-reply-btn"
                    onClick={() => setReplyTo(null)}
                    aria-label="Cancel reply"
                  >
                    <i className="fas fa-times"></i>
                  </button>
                </div>
              )}
              <div className="chat-input">
                <button
                  className="emoji-btn"
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                  aria-label="Open emoji picker"
                >
                  <i className="fa-regular fa-face-smile"></i>
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
                      handleSend(newPrivateMessage);
                    }
                  }}
                  aria-label="Message input"
                  />

                <input
                  type="file"
                  ref={fileInputRef}
                  style={{ display: "none" }}
                  onChange={(e) => handleFileChange(e.target.files[0])}
                  aria-label="Upload file"
                  />
                <button
                  className="attach-btn"
                  onClick={() => fileInputRef.current?.click()}
                  aria-label="Attach file"
                  >
                  <i className="fa-solid fa-paperclip"></i>
                </button>

                <button
                  className="send-btn"
                  onClick={() => handleSend(newPrivateMessage)}
                  disabled={isSendingPrivate}
                  aria-label="Send message"
                  >
                  {isSendingPrivate ? <span className="spinner small"></span> : <i className="fa-solid fa-paper-plane"></i>}
                </button>
              </div>
              {showEmojiPicker && <EmojiPicker onEmojiClick={parentOnEmojiClick || onEmojiClick} />}
            </div>
          </div>
        )
      ) : (
        <div className="empty-chat">
          <p>Select a private chat to view messages</p>
        </div>
      )}
    </div>
  );

  /* ------------------- RENDER LOGIC ------------------- */
  if (isMobile) {
    const showChat = activeChatId && inChat;

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

export default PrivateChatSplitView;