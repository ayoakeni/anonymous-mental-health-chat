import { memo } from "react";
import { formatMessageTime } from "../../components/timestampUtils";

const ChatMessage = memo(({ msg, toggleReaction, deleteMessage, therapistInfo, handleTherapistClick }) => (
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
      <span className="message-timestamp">
        {formatMessageTime(msg.timestamp)}
      </span>
      <span className="message-reactions">
        <i
          className="fa-solid fa-heart reaction"
          style={{ color: msg.reactions?.heart?.length > 0 ? "red" : "gray" }}
          onClick={(e) => {
            e.stopPropagation();
            toggleReaction(msg.id, "heart");
          }}
          aria-label="React with heart"
        ></i>
        <i
          className="fa-solid fa-thumbs-up reaction"
          style={{ color: msg.reactions?.thumbsUp?.length > 0 ? "blue" : "gray" }}
          onClick={(e) => {
            e.stopPropagation();
            toggleReaction(msg.id, "thumbsUp");
          }}
          aria-label="React with thumbs up"
        ></i>
      </span>
      <span className="message-reactions-view">
        <i
          className="fa-solid fa-heart reaction"
          style={{ color: msg.reactions?.heart?.length > 0 ? "red" : "gray" }}
          aria-label="React with heart"
        >
          {msg.reactions?.heart?.length || 0}
        </i>
        <i
          className="fa-solid fa-thumbs-up reaction"
          style={{ color: msg.reactions?.thumbsUp?.length > 0 ? "blue" : "gray" }}
          aria-label="React with thumbs up"
        >
          {msg.reactions?.thumbsUp?.length || 0}
        </i>
      </span>
    </div>
    {msg.role !== "system" && therapistInfo.role === "therapist" && (
      <button
        className="delete-btn"
        onClick={(e) => {
          e.stopPropagation();
          deleteMessage(msg.id);
        }}
        aria-label="Delete message"
      >
        Delete
      </button>
    )}
  </p>
));

export default ChatMessage;