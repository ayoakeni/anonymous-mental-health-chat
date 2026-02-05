import { memo } from "react";
import { formatMessageTime } from "../hooks/useTimestampUtils";

const ChatMessage = memo(
  ({
    msg,
    toggleReaction,
    currentUserId,
    currentView,
    isPrivateChat = false,
    deleteMessage,
    pinMessage,
    therapistId,
    handleTherapistClick,
    scrollToMessage,
    onReply,
    isAiOffer = false,
    onAiYes,
    onAiNo,
    aiTyping = false,
    isSending = false,
    onInitialChoice,
    retrySend,
  }) => {
    
    const getQuoteText = () => {
      let text = msg.text || msg.message || "";
      if (msg.fileUrl && !msg.fileUrl.includes("uploading")) {
        text = text || "Attachment";
      }
      return text.trim();
    };

    const shouldShowName = msg.role === "ai" || !isPrivateChat;
    const shouldMakeTherapistClickable =
      currentView === "anonymous" &&
      msg.role === "therapist" &&
      !isPrivateChat;

    const isOwnMessage = msg.userId === currentUserId || msg.userId === therapistId;

    // ──────────────────────────────────────────────────────────────
    //  Status helpers – cleaner to define once
    // ──────────────────────────────────────────────────────────────
    const showSending = msg.isPending && !msg.failed;
    const showFailed = msg.failed;
    const showDeleting = msg.isPendingDelete;

    // Special rendering for AI Offer Card
    if (isAiOffer) {
      return (
        <div className="message system-message ai-offer-wrapper">
          <div className="ai-offer-card">
            <p className="ai-offer-text">
              It looks like you're waiting for a reply.<br />
              Would you like to chat with our <strong>Support Assistant</strong> in the meantime?
            </p>
            <div className="ai-offer-buttons">
              <button
                onClick={onAiYes}
                disabled={isSending || aiTyping}
                className="ai-yes-btn"
              >
                Yes, connect me
              </button>
              <button
                onClick={onAiNo}
                disabled={isSending || aiTyping}
                className="ai-no-btn"
              >
                No, I'll wait
              </button>
            </div>
          </div>
        </div>
      );
    }

    if (msg.type === "initial-choice-ai") {
      return (
        <div className={`chat-message
          ${
            msg.role === "ai"
              ? "ai"
              : msg.role === "system"
              ? "system"
              : "user"
          }`}>
          <div className="message-content">    
            <div className="message-header">
              <strong
                className={shouldMakeTherapistClickable ? "clickable-name" : ""}
                {...(shouldMakeTherapistClickable && {
                  onClick: () => handleTherapistClick(msg),
                  title: "Click to see profile",
                })}
              >
                {msg.displayName || "Support Assistant"}
              </strong>
            </div>
            <div className="message-content-time">
              <span>{msg.text}</span>
              <div className="ai-choice-buttons">
                <button
                  onClick={() => onInitialChoice("therapist")}
                  disabled={isSending || aiTyping}
                  className="choice-therapist-btn"
                >
                  Chat with Therapist
                </button>
                <button
                  onClick={() => onInitialChoice("assistant")}
                  disabled={isSending || aiTyping}
                  className="choice-assistant-btn"
                >
                  Chat with <strong>Support Assistant</strong>
                </button>
              </div>
              <div className="message-meta-group">
                <span className="message-time">
                  {formatMessageTime(msg.timestamp)}
                </span>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div
        className={`chat-message
          ${msg.deleted ? "deleted" : ""}
          ${showSending ? "pending" : ""}
          ${showFailed ? "failed-message" : ""}
          ${showDeleting ? "deleting" : ""}
          ${
            msg.role === "therapist"
              ? "therapist"
              : msg.role === "ai"
              ? "ai"
              : msg.role === "system"
              ? "system"
              : "user"
          }`}
        id={`msg-${msg.id}`}
      >
        <div className="message-content">
          {shouldShowName && (
            <div className="message-header">
              <strong
                className={shouldMakeTherapistClickable ? "clickable-name" : ""}
                {...(shouldMakeTherapistClickable && {
                  onClick: () => handleTherapistClick(msg),
                  title: "Click to see profile",
                })}
              >
                {msg.role === "ai"
                ? msg.displayName || "Support Assistant"
                : msg.displayName || msg.user || "Anonymous"}
              </strong>
            </div>
          )}

          <div className="message-content-time">
            {/* Reply quote */}
            {!msg.deleted && msg.replyTo && (
              <div
                className="reply-quote"
                onClick={(e) => {
                  e.stopPropagation();
                  if (msg.replyTo?.id) scrollToMessage(msg.replyTo.id);
                }}
                title="Click to jump to original message"
              >
                <div className="reply-quote-content">
                  <strong className={shouldMakeTherapistClickable ? "clickable-name" : ""}>
                    {msg.replyTo.role === "ai"
                      ? msg.replyTo.displayName || "Support Assistant"
                      : msg.replyTo.displayName || "Anonymous"}
                  </strong>
                  <div className="reply-quote-text">
                    {msg.replyTo.text || (msg.replyTo.fileUrl ? "Attachment" : "Original message")}
                  </div>
                  {msg.replyTo.fileUrl && (
                    <div className="reply-quote-attachment">
                      <i className="fa-solid fa-paperclip"></i> Attachment
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Main message content */}
            {msg.deleted || showDeleting ? (
              <em className="deleted-message">
                {showDeleting ? msg.text : "This message was deleted"}
              </em>
            ) : msg.role === "ai" ? (
              <>
                {msg.text.split("\n\n").map((part, index) => (
                  <span
                    key={index}
                    className={index === 0 ? "ai-user-quote" : "ai-response"}
                  >
                    <div className="ai-user-quote-text">{part}</div>
                  </span>
                ))}
              </>
            ) : (
              <span>{msg.text || msg.message || ""}</span>
            )}

            {/* File link */}
            {!msg.deleted && msg.fileUrl && !msg.fileUrl.includes("uploading") && (
              <a
                href={msg.fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="attachment-link"
              >
                <i className="fa-solid fa-paperclip"></i> View Attachment
              </a>
            )}

            {/* Pin + timestamp + status indicators */}
            <div className="message-meta-group">
              {!msg.deleted && msg.pinned && (
                <div
                  className="pinned-label"
                  onClick={(e) => {
                    e.stopPropagation();
                    scrollToMessage(msg.id);
                  }}
                  title="Jump to this pinned message"
                >
                  <i className="fas fa-thumbtack"></i> Pinned by{" "}
                  <strong>{msg.pinnedBy || "Unknown"}</strong>
                </div>
              )}

              {/* Status indicators – grouped together */}
              <div className="message-status-container">
                {showFailed && (
                  <span className="status failed">
                    <i className="fa-solid fa-exclamation-circle"></i> Failed •{" "}
                    {retrySend && (
                      <button
                        className="retry-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          retrySend(msg);
                        }}
                      >
                        Retry
                      </button>
                    )}
                  </span>
                )}

                {showDeleting && (
                  <span className="status deleting">
                    <i className="fa-regular fa-trash-can"></i> Deleting…
                  </span>
                )}
              </div>
              {/* Time */}
              <span className="message-time">
                {formatMessageTime(msg.timestamp)}
              </span>
              
              {showSending && (
                <span className="status sending">
                  <i className="fa-regular fa-clock"></i>
                </span>
              )}
            </div>
          </div>

          {/* Reactions – clickable */}
          {!msg.deleted && msg.role !== "system" && (
            <span className="message-reactions">
              <i
                className={`fa-solid fa-heart reaction ${
                  msg.reactions?.heart?.includes(currentUserId) ? "user-reacted" : ""
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleReaction(msg.id, "heart");
                }}
              />
              <i
                className={`fa-solid fa-thumbs-up reaction ${
                  msg.reactions?.thumbsUp?.includes(currentUserId) ? "user-reacted" : ""
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleReaction(msg.id, "thumbsUp");
                }}
              />
            </span>
          )}

          {/* Actions */}
          {!msg.deleted && msg.role !== "system" && (
            <div className="message-actions">
              <button
                className="reply-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onReply?.({
                    id: msg.id,
                    displayName: msg.displayName || msg.user || "Anonymous",
                    text: getQuoteText(),
                    fileUrl: msg.fileUrl,
                  });
                }}
                title="Reply"
              >
                <i className="fas fa-reply"></i>
              </button>

              {therapistId && (
                <button
                  className="pin-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    pinMessage(msg.id, msg.pinned);
                  }}
                  title={msg.pinned ? "Unpin" : "Pin"}
                >
                  {msg.pinned ? (
                    <i className="fas fa-thumbtack pinned"></i>
                  ) : (
                    <i className="fas fa-thumbtack"></i>
                  )}
                </button>
              )}

              {/* Only show delete button to therapists */}
              {therapistId && isOwnMessage && (
                <button
                  className="delete-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteMessage(msg.id);
                  }}
                  title="Delete"
                  disabled={showDeleting}
                >
                  <i className="fas fa-trash"></i>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Reaction counts */}
        {!msg.deleted && msg.role !== "system" && (
          <span className="message-reactions-view">
            {msg.reactions?.heart && (
              <i
                className={`fa-solid fa-heart reaction ${
                  msg.reactions?.heart?.includes(currentUserId) ? "user-reacted" : ""
                }`}
              >
                {msg.reactions.heart.length}
              </i>
            )}
            {msg.reactions?.thumbsUp && (
              <i
                className={`fa-solid fa-thumbs-up reaction ${
                  msg.reactions?.thumbsUp?.includes(currentUserId) ? "user-reacted" : ""
                }`}
              >
                {msg.reactions.thumbsUp.length}
              </i>
            )}
          </span>
        )}
      </div>
    );
  }
);

export default ChatMessage;