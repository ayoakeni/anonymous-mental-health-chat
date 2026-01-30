import React, { useEffect, useRef, useCallback, useState, useMemo } from "react";
import { useParams } from "react-router-dom";
import ChatMessage from "../ChatMessage";
import ResizableSplitView from "../../components/resizableSplitView";
import { useIsInsideChat } from "../../hooks/useIsInsideChatMobile";
import EmojiPicker from "emoji-picker-react";
import { useTypingStatus } from "../../hooks/useTypingStatus";

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
  hasMoreMessages,
  loadMoreMessages,
  isLoadingMessages,
  isInitialLoading,
  isLoadingOlder,
  retrySend,
  navigate,
  markAsRead,
}) {
  const { groupId } = useParams();
  const chatBoxRef = useRef(null);
  const isMobile = useMediaQuery("(max-width: 768px)");
  const isInsideChat = useIsInsideChat();
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [replyTo, setReplyTo] = useState(null);

  // Memoize active group to avoid repeated find calls
  const activeGroup = useMemo(() => 
    groupChats.find((g) => g.id === activeGroupId), 
    [groupChats, activeGroupId]
  );

  const { typingUsers, handleTyping } = useTypingStatus(
    therapistInfo?.name || "Therapist",
    activeGroupId && isGroupChatOpen && inGroupChat ? activeGroupId : null
  );

  // Close menu on outside click
  useEffect(() => {
    const closeMenu = (e) => {
      if (!e.target.closest(".leave-participant") && !e.target.closest(".chat-options-menu")) {
        setIsParticipantsOpen(false);
      }
    };
    if (isParticipantsOpen) document.addEventListener("click", closeMenu);
    return () => document.removeEventListener("click", closeMenu);
  }, [isParticipantsOpen]);

  // ─── Scroll & unread logic ───
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
  const prevCombinedLength = useRef(0);
  const prevLastMsgId = useRef(null);

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
  }, [activeGroupId]);

  const handleScroll = useCallback(() => {
    if (!chatBoxRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = chatBoxRef.current;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    const atBottom = distanceFromBottom <= 120;

    const wasNotAtBottom = !isUserAtBottom.current;
    isUserAtBottom.current = atBottom;
    setShowScrollToBottom(!atBottom);

    // ─── When user finally reaches bottom ───
    if (atBottom && (wasNotAtBottom || firstUnreadMessageId)) {
      setNewMessagesSinceLastScroll(0);
      setFirstUnreadMessageId(null);
      setHasJumpedToFirstUnread(false);
      markAsRead();
      setLastReadIndex(combinedGroupChat.length);
    }

    // load more when near top...
    if (scrollTop <= 400 && hasMoreMessages && !isLoadingMessages && initialPositioningDone) {
      loadMoreMessages();
    }
  }, [hasMoreMessages, isLoadingMessages, loadMoreMessages, markAsRead, combinedGroupChat.length]);

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
  }, [isLoadingOlder, combinedGroupChat]);

  useEffect(() => {
    const chatBox = chatBoxRef.current;
    if (!chatBox) return;
    chatBox.addEventListener("scroll", handleScroll);
    handleScroll();
    return () => chatBox.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  useEffect(() => {
    const currLen = combinedGroupChat.length;
    const addedCount = currLen - prevCombinedLength.current;
    if (addedCount > 0 && combinedGroupChat[currLen - 1]?.id === prevLastMsgId.current) {
      setLastReadIndex(prev => prev + addedCount);
    }
    prevCombinedLength.current = currLen;
    prevLastMsgId.current = combinedGroupChat[currLen - 1]?.id;
  }, [combinedGroupChat]);

  useEffect(() => {
    if (lastReadIndex !== -1 || isLoadingMessages || combinedGroupChat.length === 0) return;
    const unread = activeGroup?.unreadCount?.[therapistId] || 0;
    setLastReadIndex(combinedGroupChat.length - unread);
    setInitialScrollDone(false);
  }, [lastReadIndex, isLoadingMessages, combinedGroupChat, activeGroup, therapistId]);

  useEffect(() => {
    console.log("INITIAL SCROLL TRIGGERED", { 
      group: activeGroupId, 
      initialScrollDone, 
      messages: combinedGroupChat.length 
    });
    if (initialScrollDone || isLoadingMessages || combinedGroupChat.length === 0) return;

    // We only do this once on mount / when switching to this chat
    const unreadCount = activeGroup?.unreadCount?.[therapistId] || 0;

    // Case 1: There ARE unread messages → scroll to first unread
    if (unreadCount > 0 && lastReadIndex >= 0 && lastReadIndex < combinedGroupChat.length) {
      const firstUnreadIndex = lastReadIndex; // first message after last read
      const targetEl = document.getElementById(`msg-${combinedGroupChat[firstUnreadIndex]?.id}`);

      if (targetEl && chatBoxRef.current) {
        // Scroll so the unread divider (or first unread) is nicely visible near the top
        const offset = targetEl.offsetTop - 80; // adjust 80–120px depending on your divider height
        chatBoxRef.current.scrollTo({
          top: offset,
          behavior: "auto" // instant on initial load
        });

        // Optional: highlight the first unread for a moment
        targetEl.classList.add("message-highlight");
        setTimeout(() => targetEl.classList.remove("message-highlight"), 2200);
      } else {
        // Fallback: go to bottom if element not ready yet
        groupMessagesEndRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
      }
    }
    // Case 2: No unread messages → just go to bottom (most common when re-entering)
    else {
      groupMessagesEndRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
    }

    setInitialScrollDone(true);
    isInitial.current = false;

    setTimeout(() => {
      setInitialPositioningDone(true);
      handleScroll();
    }, 250);

  }, [
    initialScrollDone,
    isLoadingMessages,
    combinedGroupChat,
    lastReadIndex,
    activeGroup,
    therapistId,
    groupMessagesEndRef,
    handleScroll,
    activeGroupId
  ]);

  useEffect(() => {
    if (!initialScrollDone) return;
    const unread = activeGroup?.unreadCount?.[therapistId] || 0;
    if (unread > 0 && !isUserAtBottom.current) {
      setNewMessagesSinceLastScroll(unread);
      setShowScrollToBottom(true);
    }
  }, [initialScrollDone, activeGroup, therapistId, isUserAtBottom.current]);

  useEffect(() => {
    const currentCount = combinedGroupChat?.length || 0;
    if (currentCount <= prevMessageCount.current) return;

    if (isLoadingOlder) {
      // Older messages being prepended don't treat as "new"
      prevMessageCount.current = currentCount;
      return;
    }

    if (isInitial.current) {
      prevMessageCount.current = currentCount;
      return;
    }

    const added = currentCount - prevMessageCount.current;
    const newMsgs = combinedGroupChat.slice(-added);

    const isSelfOrSystem = newMsgs.every(
      (msg) => msg.role === "system" || msg.userId === therapistId
    );

    if (isSelfOrSystem) {
      setLastReadIndex((prev) => prev + added);
    } 
    else {
      if (!isUserAtBottom.current) {
        setNewMessagesSinceLastScroll((prev) => prev + added);
        setHasJumpedToFirstUnread(false);
        // (protects against race conditions / very fast messages)
        setFirstUnreadMessageId((current) => current || newMsgs[0]?.id);
      } 
      else {
        // User was watching live → auto follow
        groupMessagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
        setNewMessagesSinceLastScroll(0);
        setFirstUnreadMessageId(null);
        markAsRead();
        setLastReadIndex(combinedGroupChat.length);
      }
    }

    prevMessageCount.current = currentCount;
  }, [combinedGroupChat, therapistId, isUserAtBottom.current, isLoadingOlder, markAsRead, groupMessagesEndRef]);

  const scrollToBottom = useCallback(() => {
    if (groupMessagesEndRef.current && chatBoxRef.current) {
      chatBoxRef.current.scrollTo({
        top: groupMessagesEndRef.current.offsetTop,
        behavior: "smooth"
      });
      setNewMessagesSinceLastScroll(0);
      setFirstUnreadMessageId(null);
      markAsRead();
      setLastReadIndex(combinedGroupChat.length);
    }
  }, [markAsRead, combinedGroupChat.length]);

  const scrollToNewMessages = useCallback(() => {
    // If we've already jumped to first unread → go to bottom instead
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

      // Mark that we've already jumped to first unread
      setHasJumpedToFirstUnread(true);
    } else {
      // Fallback if message element not found yet
      scrollToBottom();
      setHasJumpedToFirstUnread(true);
    }
  }, [firstUnreadMessageId, hasJumpedToFirstUnread, scrollToBottom]);

  // For pin and reply quote
  const scrollToMessage = useCallback((msgId) => {
    const el = document.getElementById(`msg-${msgId}`);
    if (!el) return;

    document.querySelectorAll(".message-highlight").forEach(e => e.classList.remove("message-highlight"));
    el.classList.add("message-highlight");
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => el.classList.remove("message-highlight"), 1600);
  }, []);

  // Join group chat when groupId changes
  useEffect(() => {
    if (groupId && groupId !== activeGroupId) joinGroupChat(groupId);
  }, [groupId, activeGroupId, joinGroupChat]);

  const onEmojiClick = useCallback((emojiData) => {
    setReply(prev => prev + emojiData.emoji);
    setShowEmojiPicker(false);
  }, [setReply, setShowEmojiPicker]);

  const handleReply = (message) => {
    setReplyTo(message);
    document.querySelector(".inputInsert")?.focus();
  };

  const handleSend = useCallback((text = "", file = null) => {
    const trimmed = text.trim();
    if (trimmed || file) {
      sendReply(trimmed, file, replyTo);
      setReply("");
      setReplyTo(null);
      setTimeout(() => {
        scrollToBottom();
      }, 100);
    }
  }, [sendReply, replyTo]);

  // LEFT PANEL
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
            const isMember = group.isMember;

            return (
              <div
                key={group.id}
                className={`chat-card 
                  ${activeGroupId === group.id ? "selected" : ""} 
                  ${!isMember ? "left-group" : ""}`}
                onClick={() => {
                  navigate(`/therapist-dashboard/group-chat/${group.id}`);
                  // Always try to join — safe if already member (arrayUnion is idempotent)
                  joinGroupChat(group.id);
                }}
                style={{ cursor: "pointer" }}
              >
                <div className="chat-card-inner">
                  <div className="chat-avater-content">
                    <span className={`therapist-avatar ${!isMember ? "grayed" : ""}`}>
                      {group.name?.[0] || "G"}
                    </span>
                    <div className="chat-card-content">
                      <strong className={`chat-card-title ${!isMember ? "grayed-text" : ""}`}>
                        {group.name || "Unnamed Group"}
                        {!isMember && <span className="left-badge"> (Left)</span>}
                      </strong>
                      <small className={`chat-card-preview ${!isMember ? "grayed-text" : ""}`}>
                        {isMember ? (
                          group.lastMessage
                            ? `${group.lastMessage.displayName || "Someone"}: ${group.lastMessage.text}`
                            : "No messages yet"
                        ) : (
                          "You left this group • Tap to rejoin"
                        )}
                      </small>
                    </div>
                  </div>
                  <div className="chat-card-meta">
                    {lastTs && isMember && (
                      <div className="message-timestamp">
                        <span className="meta-date">{dateStr}</span>
                        <span className="meta-time">{timeStr}</span>
                      </div>
                    )}
                    {isMember && (() => {
                      const personalUnread = group.unreadCount?.[therapistId] || 0;
                      return personalUnread > 0 && <span className="unread-badge">{personalUnread}</span>;
                    })()}
                    {!isMember && (
                      <span className="rejoin-hint">Rejoin</span>
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

  // RIGHT PANEL
  const rightPanel = (
    <div className="chat-box-container">
      {activeGroupId && isGroupChatOpen && inGroupChat ? (
        <div className="group-chat-box">
          {/* Header, modal, pinned message */}
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

                    {/* Leave Button */}
                    <div className="menu-item leave-button" onClick={() => setShowLeaveConfirm(true)}>
                      <i className="fas fa-sign-out-alt"></i>
                      <span>Leave Group</span>
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
                    <h3>Leave this group?</h3>
                    <ul className="confirm-list">
                      <li>You will no longer see new messages</li>
                      <li>You will be removed from the participant list</li>
                      <li>You can rejoin anytime from the group list</li>
                    </ul>
                    <p className="confirm-question">
                      Are you sure you want to leave this group?
                    </p>
                  </div>

                  <div className="button-group">
                    <button className="btn-cancel" onClick={() => setShowLeaveConfirm(false)}>
                      Cancel
                    </button>
                    <button
                      className="btn-confirm-leave"
                      onClick={() => {
                        leaveGroupChat();
                        setShowLeaveConfirm(false);
                      }}
                    >
                      Leave Group
                    </button>
                  </div>
                </div>
              </div>
            )}
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
            {/* INITIAL LOADING - only first time */}
            {isInitialLoading && combinedGroupChat.length === 0 && (
              <div className="loading-messages-box">
                <div className="loading-messages">
                  <div className="spinner"></div>
                  <p>Loading messages...</p>
                </div>
              </div>
            )}

            {/* NO MESSAGES - after initial load */}
            {!isInitialLoading && combinedGroupChat.length === 0 && (
              <p className="no-message">No messages in this group yet.</p>
            )}

            {/* ─── CHAT CONTENT (only after initial load) ─── */}
            {!isInitialLoading && combinedGroupChat.length > 0 && (
              <>
                {/* LOADING OLDER - only when scrolling up */}
                {isLoadingOlder && (
                  <div className="loading-older-messages">
                    <div className="spinner small"></div>
                    <p>Loading older messages...</p>
                  </div>
                )}

                {combinedGroupChat.map((msg, index) => (
                  <React.Fragment key={`${msg.id}-${msg.type || "message"}`}>
                    {/* unread divider logic */}
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

                    <div className="message" id={`msg-${msg.id}`}>
                      <ChatMessage
                        msg={msg}
                        toggleReaction={toggleReaction}
                        currentUserId={therapistId}
                        currentView="therapist"
                        isPrivateChat={false}
                        // deleteMessage={deleteMessage}
                        deleteMessage={(msgId) => deleteMessage(msgId, "private")}
                        pinMessage={pinMessage}
                        scrollToMessage={scrollToMessage}
                        therapistInfo={therapistInfo}
                        therapistId={therapistId}
                        handleTherapistClick={handleTherapistClick}
                        onReply={handleReply}
                        retrySend={retrySend}
                      />
                    </div>
                  </React.Fragment>
                ))}
              </>
            )}
            
            {/* Typing indicator */}
            {typingUsers.length > 0 && (
              <div className="typing-indicator">
                {typingUsers.map(u => typeof u === "string" ? u : u?.name || "Someone").join(", ")}{" "}
                {typingUsers.length === 1 ? "is" : "are"} typing
                <div className="typing-dots">
                  <span></span><span></span><span></span>
                </div>
              </div>
            )}

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
            <div ref={groupMessagesEndRef} />
          </div>

          {/* Input */}
          <div className="chat-input-box">
            {replyTo && (
              <div className="reply-preview">
                <div className="reply-preview-content">
                  <strong>Replying to {replyTo.displayName}:</strong>
                  <div className="reply-preview-text">
                    {replyTo.text || (replyTo.fileUrl ? "Attachment" : "")}
                  </div>
                </div>
                <button className="cancel-reply-btn" onClick={() => setReplyTo(null)}>
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
                value={reply}
                onChange={(e) => {
                  setReply(e.target.value);
                  handleTyping(e.target.value);
                }}
                placeholder="Reply to group chat..."
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend(reply);
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
                  if (file) handleSend("", file);
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
              <button
                className="send-btn"
                onClick={() => handleSend(reply)}
                disabled={isSendingGroup}
                aria-label="Send message"
              >
                {isSendingGroup ? <span className="spinner small"></span> : <i className="fa-solid fa-paper-plane"></i>}
              </button>
            </div>

            {showEmojiPicker && <EmojiPicker onEmojiClick={parentOnEmojiClick || onEmojiClick} />}
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
        <div className={`mobile-panel ${showChat ? 'hidden' : ''}`}>{leftPanel}</div>
        <div className={`mobile-panel ${!showChat ? 'hidden' : ''}`}>{rightPanel}</div>
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