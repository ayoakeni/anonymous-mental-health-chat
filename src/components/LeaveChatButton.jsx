import "../assets/styles/therapistDashboard.css"

const LeaveChatButton = ({ onLeave }) => {
  return (
    <button className="leaveButton" onClick={onLeave} >
      Leave Chat
    </button>
  );
};

export default LeaveChatButton;
