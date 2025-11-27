import { memo } from "react";
import { formatMessageTime } from "../../hooks/useTimestampUtils";

const ChatMessage = memo(
  ({
    msg,
    toggleReaction,
    deleteMessage,
    pinMessage,
    therapistId,
    handleTherapistClick,
    scrollToMessage,
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

    // Normal message rendering
    return (
      <p
        className={`chat-message ${
          msg.role === "therapist"
            ? "therapist"
            : msg.role === "ai"
            ? "ai"
            : msg.role === "system"
            ? "system"
            : "user"
        }`}
        onClick={() => handleTherapistClick(msg)}
      >
        <strong>{msg.displayName || msg.user || "Anonymous"}</strong>{" "}
        <div className="message-content-time">
          {msg.role === "ai" ? (
            <>
              {msg.text.split("\n\n").map((part, index) => (
                <span
                  key={index}
                  className={index === 0 ? "ai-user-quote" : "ai-response"}
                >
                  {part}
                </span>
              ))}
            </>
          ) : (
            <span>{msg.text || msg.message}</span>
          )}
          {msg.fileUrl && (
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
            {msg.pinned && (
              <div
                className="pinned-label"
                onClick={(e) => {
                  e.stopPropagation();
                  scrollToMessage(msg.id);
                }}
                title="Jump to this pinned message"
              >
                <i className="fas fa-thumbtack"></i>Pinned by <strong>{msg.pinnedBy || "Unknown"}</strong>
              </div>
            )}
            <span className="message-time">{formatMessageTime(msg.timestamp)}</span>
          </span>

          <span className="message-reactions">
            <i
              className="fa-solid fa-heart reaction"
              style={{ color: msg.reactions?.heart?.length > 0 ? "red" : "gray" }}
              onClick={(e) => {
                e.stopPropagation();
                toggleReaction(msg.id, "heart");
              }}
            ></i>
            <i
              className="fa-solid fa-thumbs-up reaction"
              style={{ color: msg.reactions?.thumbsUp?.length > 0 ? "blue" : "gray" }}
              onClick={(e) => {
                e.stopPropagation();
                toggleReaction(msg.id, "thumbsUp");
              }}
            ></i>
          </span>

          <span className="message-reactions-view">
            <i className="fa-solid fa-heart reaction" style={{ color: msg.reactions?.heart?.length > 0 ? "red" : "gray" }}>
              {msg.reactions?.heart?.length || 0}
            </i>
            <i className="fa-solid fa-thumbs-up reaction" style={{ color: msg.reactions?.thumbsUp?.length > 0 ? "blue" : "gray" }}>
              {msg.reactions?.thumbsUp?.length || 0}
            </i>
          </span>
        </div>

        {msg.role !== "system" && therapistId && (
          <div className="message-actions">
            <button
              className="pin-btn"
              onClick={(e) => {
                e.stopPropagation();
                pinMessage(msg.id, msg.pinned);
              }}
              title={msg.pinned ? "Unpin" : "Pin to top"}
            >
              {msg.pinned ? <i className="fas fa-thumbtack pinned"></i> : <i className="fas fa-thumbtack"></i>}
            </button>
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
      </p>
    );
  }
);

export default ChatMessage;