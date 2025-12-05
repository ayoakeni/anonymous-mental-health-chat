import { useEffect, useRef, useCallback, useState } from "react";
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

/* -------------------------------------------------------------
   MAIN COMPONENT
   ------------------------------------------------------------- */
function PrivateChatSplitView({
  privateChats,
  activeChatId,
  inChat,
  isValidatingChat,
  chatError,
  isTherapistAvailable,
  activeTherapists,
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

  // File validation helper
  const handleFileChange = useCallback(
    (file) => {
      if (
        file &&
        (file.size > 5 * 1024 * 1024 ||
          !["image/", "application/pdf"].some((type) => file.type.startsWith(type)))
      ) {
        showError("Invalid file: too large or unsupported type");
        return;
      }
      sendPrivateMessage(file);
    },
    [sendPrivateMessage, showError]
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
            <button onClick={() => navigate("/therapist-dashboard/private-chat")}>
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
                    {/* Leave Chat */}
                    <LeaveChatButton type="private" therapistInfo={therapistInfo} onLeave={leavePrivateChat} />
                  </div>
                )}
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
                      deleteMessage={(msgId) => deleteMessage(msgId, "private")}
                      therapistInfo={therapistInfo}
                      handleTherapistClick={handleTherapistClick}
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
                      if (newPrivateMessage.trim()) {
                        sendPrivateMessage(newPrivateMessage);
                        setNewPrivateMessage("");
                      }
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
                  onClick={() => {
                    if (newPrivateMessage.trim()) {
                      sendPrivateMessage(newPrivateMessage);
                      setNewPrivateMessage("");
                    }
                  }}
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