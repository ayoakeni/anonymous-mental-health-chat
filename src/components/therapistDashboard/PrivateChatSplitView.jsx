import React, { useEffect, useRef, useCallback, useState, useMemo } from "react";
import ChatMessage from "../ChatMessage";
import ResizableSplitView from "../../components/resizableSplitView";
import { useIsInsideChat } from "../../hooks/useIsInsideChatMobile";
import EmojiPicker from "emoji-picker-react";
import { useTypingStatus } from "../../hooks/useTypingStatus";
import { shouldGroupMessage } from "../../utils/messagegrouping";

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
  retrySend,
  privateChatSearchQuery,
  setPrivateChatSearchQuery, 
}) {
  const { typingUsers, handleTyping } = useTypingStatus(
    therapistInfo?.name, 
    activeChatId && inChat && !isValidatingChat && !chatError ? activeChatId : null
  );
  const isMobile = useMediaQuery("(max-width: 768px)");
  const isInsideChat = useIsInsideChat();
  const [menuOpen, setMenuOpen] = useState(false);
  const fileInputRef = useRef(null);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [replyTo, setReplyTo] = useState(null);

  // ─── Scroll & unread logic (similar to GroupChat) ───
  const isUserAtBottom = useRef(true);
  const isInitial = useRef(true);
  const prevMessageCount = useRef(0);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [initialPositioningDone, setInitialPositioningDone] = useState(false);
  const [newMessagesSinceLastScroll, setNewMessagesSinceLastScroll] = useState(0);
  const [firstUnreadMessageId, setFirstUnreadMessageId] = useState(null);
  const [lastReadIndex, setLastReadIndex] = useState(-1);
  const [initialScrollDone, setInitialScrollDone] = useState(false);
  const [hasJumpedToFirstUnread, setHasJumpedToFirstUnread] = useState(false);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const prevCombinedLength = useRef(0);
  const prevLastMsgId = useRef(null);

  // Find active chat object
  const activeChat = useMemo(() => 
    privateChats.find((c) => c.id === activeChatId), 
    [privateChats, activeChatId]
  );

  const filteredPrivateChats = useMemo(() => {
    if (!privateChatSearchQuery?.trim()) return privateChats;
    const lower = privateChatSearchQuery.toLowerCase();
    return privateChats.filter((chat) => {
      const name = (anonNames[chat.id] || "").toLowerCase();
      const lastMsg = (chat.lastMessage || "").toLowerCase();
      return name.includes(lower) || lastMsg.includes(lower);
    });
  }, [privateChats, privateChatSearchQuery, anonNames]);

  // Reset scroll state when changing chats
  useEffect(() => {
    setInitialScrollDone(false);
    setInitialPositioningDone(false);
    setLastReadIndex(-1);
    setNewMessagesSinceLastScroll(0);
    setFirstUnreadMessageId(null);
    setHasJumpedToFirstUnread(false);
    setShowScrollToBottom(false);
    isInitial.current = true;

    if (chatBoxRef.current) {
      chatBoxRef.current.scrollTop = 0;
    }
  }, [activeChatId]);

  const handleScroll = useCallback(() => {
    if (!chatBoxRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = chatBoxRef.current;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    const atBottom = distanceFromBottom <= 120;

    const wasNotAtBottom = !isUserAtBottom.current;
    isUserAtBottom.current = atBottom;
    setShowScrollToBottom(!atBottom);

    // When user reaches bottom
    if (atBottom && (wasNotAtBottom || firstUnreadMessageId)) {
      setNewMessagesSinceLastScroll(0);
      setFirstUnreadMessageId(null);
      setHasJumpedToFirstUnread(false);
      setLastReadIndex(combinedPrivateChat.length);
    }

    // Load more when near top
    if (scrollTop <= 400 && hasMoreMessages && !isLoadingMessages && initialPositioningDone && !isLoadingOlder) {
      setIsLoadingOlder(true);
      loadMoreMessages().finally(() => setIsLoadingOlder(false));
    }
  }, [hasMoreMessages, isLoadingMessages, loadMoreMessages, combinedPrivateChat.length, isLoadingOlder, initialPositioningDone, firstUnreadMessageId]);

  // Maintain scroll position when loading older messages
  useEffect(() => {
    if (!isLoadingOlder || !chatBoxRef.current) return;

    const container = chatBoxRef.current;
    const prevHeight = container.scrollHeight;
    const prevTop = container.scrollTop;

    const timer = setTimeout(() => {
      const heightAdded = container.scrollHeight - prevHeight;
      const targetTop = prevTop + heightAdded - 120;

      container.scrollTo({
        top: targetTop,
        behavior: "auto"
      });
    }, 0);

    return () => clearTimeout(timer);
  }, [isLoadingOlder, combinedPrivateChat]);

  useEffect(() => {
    const chatBox = chatBoxRef.current;
    if (!chatBox) return;
    chatBox.addEventListener("scroll", handleScroll);
    handleScroll();
    return () => chatBox.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  // Track message count changes
  useEffect(() => {
    const currLen = combinedPrivateChat.length;
    const addedCount = currLen - prevCombinedLength.current;
    if (addedCount > 0 && combinedPrivateChat[currLen - 1]?.id === prevLastMsgId.current) {
      setLastReadIndex(prev => prev + addedCount);
    }
    prevCombinedLength.current = currLen;
    prevLastMsgId.current = combinedPrivateChat[currLen - 1]?.id;
  }, [combinedPrivateChat]);

  // Initial scroll positioning
  useEffect(() => {
    if (initialScrollDone || isLoadingMessages || combinedPrivateChat.length === 0) return;

    const unreadCount = activeChat?.unreadCountForTherapist || 0;

    if (unreadCount > 0 && lastReadIndex >= 0 && lastReadIndex < combinedPrivateChat.length) {
      const firstUnreadIndex = lastReadIndex;
      const targetEl = document.getElementById(`msg-${combinedPrivateChat[firstUnreadIndex]?.id}`);

      if (targetEl && chatBoxRef.current) {
        const offset = targetEl.offsetTop - 80;
        chatBoxRef.current.scrollTo({
          top: offset,
          behavior: "auto"
        });

        targetEl.classList.add("message-highlight");
        setTimeout(() => targetEl.classList.remove("message-highlight"), 2200);
      } else {
        privateMessagesEndRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
      }
    } else {
      privateMessagesEndRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
    }

    setInitialScrollDone(true);
    isInitial.current = false;

    setTimeout(() => {
      setInitialPositioningDone(true);
      handleScroll();
    }, 250);

  }, [initialScrollDone, isLoadingMessages, combinedPrivateChat, lastReadIndex, activeChat, privateMessagesEndRef, handleScroll, activeChatId]);

  // Set lastReadIndex based on unread count
  useEffect(() => {
    if (lastReadIndex !== -1 || isLoadingMessages || combinedPrivateChat.length === 0) return;
    const unread = activeChat?.unreadCountForTherapist || 0;
    setLastReadIndex(combinedPrivateChat.length - unread);
    setInitialScrollDone(false);
  }, [lastReadIndex, isLoadingMessages, combinedPrivateChat, activeChat]);

  // Track new messages
  useEffect(() => {
    const currentCount = combinedPrivateChat?.length || 0;
    if (currentCount <= prevMessageCount.current) return;

    if (isLoadingOlder) {
      prevMessageCount.current = currentCount;
      return;
    }

    if (isInitial.current) {
      prevMessageCount.current = currentCount;
      return;
    }

    const added = currentCount - prevMessageCount.current;
    const newMsgs = combinedPrivateChat.slice(-added);

    const isSelfOrSystem = newMsgs.every(
      (msg) => msg.role === "system" || msg.userId === therapistId
    );

    if (isSelfOrSystem) {
      setLastReadIndex((prev) => prev + added);
    } else {
      if (!isUserAtBottom.current) {
        setNewMessagesSinceLastScroll((prev) => prev + added);
        setHasJumpedToFirstUnread(false);
        setFirstUnreadMessageId((current) => current || newMsgs[0]?.id);
      } else {
        privateMessagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
        setNewMessagesSinceLastScroll(0);
        setFirstUnreadMessageId(null);
        setLastReadIndex(combinedPrivateChat.length);
      }
    }

    prevMessageCount.current = currentCount;
  }, [combinedPrivateChat, therapistId, isUserAtBottom.current, isLoadingOlder, privateMessagesEndRef]);

  const scrollToBottom = useCallback(() => {
    if (privateMessagesEndRef.current && chatBoxRef.current) {
      chatBoxRef.current.scrollTo({
        top: privateMessagesEndRef.current.offsetTop,
        behavior: "smooth"
      });
      setNewMessagesSinceLastScroll(0);
      setFirstUnreadMessageId(null);
      setLastReadIndex(combinedPrivateChat.length);
    }
  }, [combinedPrivateChat.length]);

  const scrollToNewMessages = useCallback(() => {
    if (hasJumpedToFirstUnread || !firstUnreadMessageId) {
      scrollToBottom();
      setHasJumpedToFirstUnread(false);
      return;
    }

    const el = document.getElementById(`msg-${firstUnreadMessageId}`);
    if (el && chatBoxRef.current) {
      const containerTop = chatBoxRef.current.getBoundingClientRect().top;
      const msgTop = el.getBoundingClientRect().top;
      const offset = msgTop - containerTop - 60;

      chatBoxRef.current.scrollBy({
        top: offset,
        behavior: "smooth"
      });

      el.classList.add("message-highlight");
      setTimeout(() => el.classList.remove("message-highlight"), 1800);

      setHasJumpedToFirstUnread(true);
    } else {
      scrollToBottom();
      setHasJumpedToFirstUnread(true);
    }
  }, [firstUnreadMessageId, hasJumpedToFirstUnread, scrollToBottom]);

  // Scroll to pinned message or replied message
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
    document.querySelector(".inputInsert")?.focus();
  };

  const handleSend = useCallback((text = "", file = null) => {
    if (!text.trim() && !file) return;
    sendPrivateMessage(text.trim(), file, replyTo);
    setNewPrivateMessage("");
    setReplyTo(null);
    setTimeout(() => {
      scrollToBottom();
    }, 100);
  }, [sendPrivateMessage, replyTo, scrollToBottom]);

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
      <div className="group-search-box">
        <i className="fa-solid fa-magnifying-glass group-search-icon"></i>
        <input
          className="group-search-input"
          type="text"
          placeholder="Search private chats..."
          value={privateChatSearchQuery}
          onChange={(e) => setPrivateChatSearchQuery(e.target.value)}
          aria-label="Search private chats"
        />
        {privateChatSearchQuery && (
          <button
            className="group-search-clear"
            onClick={() => setPrivateChatSearchQuery("")}
            aria-label="Clear search"
          >
            <i className="fa-solid fa-times"></i>
          </button>
        )}
      </div>
      <div className="chat-list-container">
        {isLoadingChats ? (
          <p>Loading private chats...</p>
        ) : filteredPrivateChats.length === 0 && !privateChatSearchQuery ? (
          <p>No private chats available</p>
        ) : filteredPrivateChats.length === 0 && privateChatSearchQuery ? (
          <div className="group-search-empty">
            <i className="fa-solid fa-binoculars"></i>
            No chats match "{privateChatSearchQuery}"
          </div>
        ) : (
          filteredPrivateChats.map((chat) => {
            const lastTs = chat.lastUpdated;
            const { dateStr, timeStr } = formatTimestamp(lastTs || null);
            const anonName = anonNames[chat.id] || "Loading...";
            const chatUserId = chat.userId;
            const mood = userMoods[chatUserId];

            return (
              <div
                key={chat.id}
                className={`chat-card 
                  ${activeChatId === chat.id ? "selected" : ""}
                   ${chat.activeTherapist === therapistInfo.uid ? "active-session" : ""}
                  ${!chat.activeTherapist && chat.unreadCountForTherapist === 0 ? "pending-chat" : ""}
                `}
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
                        {(() => {
                          const iAmIn = chat.participants?.includes(therapistId);
                          const someoneElseIn = chat.activeTherapist && chat.activeTherapist !== therapistId;
                          const noOneInYet = !chat.activeTherapist;
                          const userHasMessaged = !!chat.lastMessage;

                          if (iAmIn) {
                            return <span className="active-indicator" title="Active • You"> (Active • You)</span>;
                          }

                          if (someoneElseIn) {
                            return <span className="taken-indicator" title="Taken"> (Taken)</span>;
                          }

                          if (noOneInYet && userHasMessaged) {
                            if (chat.requestedTherapist === therapistId) {
                              return <span className="new-request" title="New Request"> (New Request)</span>;
                            }
                            if (chat.aiActive) {
                              return <span className="tdh-tag ai"><i className="fa-solid fa-robot" /> With AI</span>;
                            }
                            return <span className="available-indicator" title="Available"> (Available)</span>;
                          }

                          return null;
                        })()}
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
                      You're about to end this one-on-one conversation.
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

            {/* Pinned message */}
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
              {/* INITIAL LOADING */}
              {isLoadingMessages && combinedPrivateChat.length === 0 && (
                <div className="loading-messages-box">
                  <div className="loading-messages">
                    <div className="spinner"></div>
                    <p>Loading messages...</p>
                  </div>
                </div>
              )}

              {/* NO MESSAGES */}
              {!isLoadingMessages && combinedPrivateChat.length === 0 && (
                <p className="no-message">No messages in this chat yet.</p>
              )}

              {/* CHAT CONTENT */}
              {combinedPrivateChat.length > 0 && (
                <>
                  {/* LOADING OLDER */}
                  {isLoadingOlder && (
                    <div className="loading-older-messages">
                      <div className="spinner small"></div>
                      <p>Loading older messages...</p>
                    </div>
                  )}

                  {combinedPrivateChat.map((msg, index) => {
                    const previousMsg = index > 0 ? combinedPrivateChat[index - 1] : null;
                    const isGrouped = shouldGroupMessage(msg, previousMsg);

                    return (
                      <React.Fragment key={`${msg.id}-${msg.type || "message"}`}>
                        {/* Unread divider */}
                        {lastReadIndex >= 0 &&
                          index === lastReadIndex &&
                          newMessagesSinceLastScroll > 0 &&
                          !isUserAtBottom.current && (
                            <div className="new-messages-divider">
                              <div className="new-messages">
                                {newMessagesSinceLastScroll} new message{newMessagesSinceLastScroll > 1 ? "s" : ""}
                              </div>
                            </div>
                          )
                        }

                        <div className={`message ${isGrouped ? 'grouped' : ''}`} id={`msg-${msg.id}`}>
                          <ChatMessage
                            msg={msg}
                            toggleReaction={toggleReaction}
                            currentUserId={therapistId}
                            isPrivateChat={true}
                            scrollToMessage={scrollToMessage}
                            deleteMessage={deleteMessage}
                            pinMessage={pinMessage}
                            therapistInfo={therapistInfo}
                            therapistId={therapistId}
                            handleTherapistClick={handleTherapistClick}
                            onReply={handleReply}
                            retrySend={retrySend}
                          />
                        </div>
                      </React.Fragment>
                    );
                  })}
                </>
              )}

              {/* Typing Indicator */}
              {typingUsers.length > 0 && (
                <div className="typing-indicator">
                  {typingUsers
                    .map(u => typeof u === "string" ? u : u?.name || "Someone")
                    .join(", ")}{" "}
                  {typingUsers.length === 1 ? "is" : "are"} typing
                  <div className="typing-dots">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                </div>
              )}

              {/* Scroll to bottom button */}
              {showScrollToBottom && (
                <button 
                  className="scroll-to-bottom-btn" 
                  onClick={scrollToNewMessages} 
                  aria-label="Jump to new messages"
                >
                  <i className="fas fa-chevron-down"></i>
                  {newMessagesSinceLastScroll > 0 && (
                    <span className="new-messages-badge">
                      {newMessagesSinceLastScroll > 99 ? "99+" : newMessagesSinceLastScroll}
                    </span>
                  )}
                </button>
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