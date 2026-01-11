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
  }) => {
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

    // Helper to get clean text for quoting (remove file indicators, trim)
    const getQuoteText = () => {
      let text = msg.text || msg.message || "";
      if (msg.fileUrl) text = text || "Attachment";
      return text.trim();
    };

    const shouldShowName = !isPrivateChat;

    const shouldMakeTherapistClickable = 
      currentView === "anonymous" && 
      msg.role === "therapist" && 
      !isPrivateChat;

    return (
      <div className={`chat-message 
        ${msg.deleted ? 'deleted' : ''} 
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
                {msg.displayName || msg.user || "Anonymous"}
              </strong>
            </div>
          )}

          <div className="message-content-time">
            {/* Reply quote block – shown when this message is replying to another */}
            {!msg.deleted && msg.replyTo && (
              <div
                className="reply-quote"
                onClick={(e) => {
                  e.stopPropagation();
                  if (msg.replyTo?.id) {
                    scrollToMessage(msg.replyTo.id);
                  }
                }}
                title="Click to jump to original message"
              >
                <div className="reply-quote-content">
                  <strong className={shouldMakeTherapistClickable ? "clickable-name" : ""}>{msg.replyTo.displayName || "Anonymous"}</strong>
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

            {msg.deleted ? (
              <em className="deleted-message">This message was deleted</em>
            ) : msg.role === "ai" ? (
              <>
                {msg.text.split("\n\n").map((part, index) => (
                  <span
                    key={index}
                    className={index === 0 ? "ai-user-quote" : "ai-response"}
                  >
                    <div className="ai-user-quote-text">
                      {part}
                    </div>
                  </span>
                ))}
              </>
            ) : (
              <span>{msg.text || msg.message}</span>
            )}

            {!msg.deleted && msg.fileUrl && (
              <a
                href={msg.fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="attachment-link"
              >
                <i className="fa-solid fa-paperclip"></i> View Attachment
              </a>
            )}

            <span className="message-pin-timestamp">
              {!msg.deleted && msg.pinned && (
                <div
                  className="pinned-label"
                  onClick={(e) => {
                    e.stopPropagation();
                    scrollToMessage(msg.id);
                  }}
                  title="Jump to this pinned message"
                >
                  <i className="fas fa-thumbtack"></i> Pinned by <strong>{msg.pinnedBy || "Unknown"}</strong>
                </div>
              )}
              <span className="message-time">{formatMessageTime(msg.timestamp)}</span>
            </span>          
          </div>
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
              ></i>
              <i
                className={`fa-solid fa-thumbs-up reaction ${
                  msg.reactions?.thumbsUp?.includes(currentUserId) ? "user-reacted" : ""
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleReaction(msg.id, "thumbsUp");
                }}
              ></i>
            </span>
          )}
          {/* Message actions (pin, delete, reply) */}
          {!msg.deleted && msg.role !== "system" && (
            <div className="message-actions">
              {/* Reply button */}
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
                title="Reply to this message"
              >
                <i className="fas fa-reply"></i>
              </button>

              {/* Pin button (only for therapists) */}
              {therapistId && (
                <button
                  className="pin-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    pinMessage(msg.id, msg.pinned);
                  }}
                  title={msg.pinned ? "Unpin" : "Pin this message"}
                >
                  {msg.pinned ? <i className="fas fa-thumbtack pinned"></i> : <i className="fas fa-thumbtack"></i>}
                </button>
              )}

              {/* Delete button (only own message + therapist) */}
              {msg.userId === therapistId && (
                <button
                  className="delete-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteMessage(msg.id);
                  }}
                  title="Delete this message"
                >
                  <i className="fas fa-trash"></i>
                </button>
              )}
            </div>
          )}
        </div>
        {!msg.deleted && msg.role !== "system" && (
          <span className="message-reactions-view">
            {msg.reactions?.heart && (
              <i
                className={`fa-solid fa-heart reaction ${
                  msg.reactions?.heart?.includes(currentUserId) ? "user-reacted" : ""
                }`}
              >
                {msg.reactions?.heart?.length || 0}
              </i>
            )}
            {msg.reactions?.thumbsUp && (
            <i
              className={`fa-solid fa-thumbs-up reaction ${
                msg.reactions?.thumbsUp?.includes(currentUserId) ? "user-reacted" : ""
              }`}
            >
              {msg.reactions?.thumbsUp?.length || 0}
            </i>)}
          </span>
        )}
      </div>
    );
  }
);

export default ChatMessage;