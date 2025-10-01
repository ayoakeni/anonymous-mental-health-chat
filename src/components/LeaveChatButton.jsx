import React from "react";

const LeaveChatButton = ({ onLeave }) => {
  return (
    <button
      onClick={onLeave}
      style={{ background: "orange", color: "white" }}
    >
      ⬅ Leave Chat
    </button>
  );
};

export default LeaveChatButton;
