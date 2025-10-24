import React from "react";
import { useNavigate } from "react-router-dom";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../../utils/firebase";
import "../../styles/therapistDashboardHome.css";

function TherapistDashboardHome({
  therapistInfo,
  groupChats,
  privateChats,
  totalGroupUnread,
  privateUnreadCount,
  anonNames,
  formatTimestamp,
  joinGroupChat,
  joinPrivateChat,
  isLoadingChats,
  isLoadingNames,
  therapistsOnline,
  therapistId,
  showError,
}) {
  const navigate = useNavigate();
  const isOnline = therapistsOnline.some(t => t.uid === therapistId && t.online);

  // Toggle therapist availability
  const toggleAvailability = async () => {
    try {
      const therapistRef = doc(db, "therapistsOnline", therapistId);
      await setDoc(therapistRef, {
        name: therapistInfo.name || "Therapist",
        online: !isOnline,
        lastSeen: serverTimestamp(),
      }, { merge: true });
    } catch (err) {
      console.error("Error toggling availability:", err);
      showError("Failed to update availability. Please try again.");
    }
  };

  // Count pending chats (needsTherapist: true)
  const pendingChats = privateChats.filter(chat => chat.needsTherapist).length;

  return (
    <div className="dashboard-home">
      <div className="welcome-header">
        <h2>
          Welcome, <span className="highlight">{therapistInfo.name || "Therapist"}</span>!
        </h2>
        <div className="availability-toggle">
          <label>
            <input
              type="checkbox"
              checked={isOnline}
              onChange={toggleAvailability}
            />
            {isOnline ? "Online" : "Offline"}
          </label>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="quick-stats">
        <div className="stat-card">
          <h4>Active Chats</h4>
          <p>{groupChats.length + privateChats.length}</p>
        </div>
        <div className="stat-card">
          <h4>Unread Messages</h4>
          <p>{totalGroupUnread + privateUnreadCount}</p>
        </div>
        <div className="stat-card">
          <h4>Pending Chats</h4>
          <p>{pendingChats}</p>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="quick-actions">
        <h3>Quick Actions</h3>
        <div className="action-buttons">
          <button onClick={() => navigate("/therapist-dashboard/group-chat")}>
            View Group Chats
          </button>
          <button onClick={() => navigate("/therapist-dashboard/private-chat")}>
            View Private Chats
          </button>
          <button onClick={() => navigate("/therapist-dashboard/profile")}>
            Update Profile
          </button>
          <button onClick={() => navigate("/therapist-dashboard/appointments")}>
            View Appointments
          </button>
        </div>
      </div>

      {/* Chat Summaries */}
      <div className="chat-summaries">
        <div className="chat-section">
          <h3>Group Chats</h3>
          {isLoadingChats ? (
            <p>Loading chats...</p>
          ) : groupChats.length === 0 ? (
            <p>No group chats available.</p>
          ) : (
            <>
              <div className="chat-list-container">
                {groupChats.slice(0, 5).map(group => (
                  <div
                    key={group.id}
                    className="chat-card"
                    onClick={() => joinGroupChat(group.id)}
                  >
                    <div className="chat-card-inner">
                      <div className="chat-avater-content">
                        <span className="therapist-avatar">
                          {group.id[0].toUpperCase()}
                        </span>
                        <div className="chat-card-content">
                          <span className="chat-card-title">{group.id}</span>
                          <span className="chat-card-preview">
                            {group.lastMessage?.text || "No messages yet"}
                          </span>
                        </div>
                      </div>
                      <div className="chat-card-meta">
                        <span className="message-timestamp">
                          <span className="meta-date">
                            {formatTimestamp(group.lastMessage?.timestamp)?.dateStr}
                          </span>
                          <span className="meta-time">
                            {formatTimestamp(group.lastMessage?.timestamp)?.timeStr}
                          </span>
                        </span>
                        {group.unreadCount > 0 && (
                          <span className="unread-badge">{group.unreadCount}</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {groupChats.length > 5 && (
                <button
                  className="view-all"
                  onClick={() => navigate("/therapist-dashboard/group-chat")}
                >
                  View All Group Chats
                </button>
              )}
            </>
          )}
        </div>

        <div className="chat-section">
          <h3>Private Chats</h3>
          {isLoadingChats || isLoadingNames ? (
            <p>Loading chats...</p>
          ) : privateChats.length === 0 ? (
            <p>No private chats available.</p>
          ) : (
            <>
              <div className="chat-list-container">
                {privateChats.slice(0, 5).map(chat => (
                  <div
                    key={chat.id}
                    className={`chat-card ${chat.needsTherapist ? "pending-chat" : ""}`}
                    onClick={() => joinPrivateChat(chat.id)}
                  >
                    <div className="chat-card-inner">
                      <div className="chat-avater-content">
                        <span className="therapist-avatar">
                          {anonNames[chat.id]?.[0]?.toUpperCase() || "A"}
                        </span>
                        <div className="chat-card-content">
                          <span className="chat-card-title">
                            {anonNames[chat.id] || "Anonymous"}
                            {chat.needsTherapist && <span className="pending-indicator"> (Pending)</span>}
                          </span>
                          <span className="chat-card-preview">
                            {chat.lastMessage || "No messages yet"}
                          </span>
                        </div>
                      </div>
                      <div className="chat-card-meta">
                        <span className="message-timestamp">
                          <span className="meta-date">
                            {formatTimestamp(chat.lastUpdated)?.dateStr}
                          </span>
                          <span className="meta-time">
                            {formatTimestamp(chat.lastUpdated)?.timeStr}
                          </span>
                        </span>
                        {chat.unreadCountForTherapist > 0 && (
                          <span className="unread-badge">{chat.unreadCountForTherapist}</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {privateChats.length > 5 && (
                <button
                  className="view-all"
                  onClick={() => navigate("/therapist-dashboard/private-chat")}
                >
                  View All Private Chats
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Notifications */}
      <div className="notifications-section">
        <h3>Notifications</h3>
        {isLoadingChats ? (
          <p>Loading notifications...</p>
        ) : (
          <ul>
            {privateChats
              .filter(chat => chat.unreadCountForTherapist > 0)
              .map(chat => (
                <li
                  key={chat.id}
                  className="notification-item"
                  onClick={() => joinPrivateChat(chat.id)}
                >
                  New messages in Private Chat with {anonNames[chat.id] || "Anonymous"} ({chat.unreadCountForTherapist})
                </li>
              ))}
            {privateChats
              .filter(chat => chat.needsTherapist)
              .map(chat => (
                <li
                  key={chat.id}
                  className="notification-item pending-chat"
                  onClick={() => joinPrivateChat(chat.id)}
                >
                  New chat request from {anonNames[chat.id] || "Anonymous"}
                </li>
              ))}
            {groupChats.some(group => group.unreadCount > 0) && (
              <li
                className="notification-item"
                onClick={() => navigate("/therapist-dashboard/group-chat")}
              >
                New messages in Group Chats ({totalGroupUnread})
              </li>
            )}
            {privateChats.every(chat => chat.unreadCountForTherapist === 0 && !chat.needsTherapist) &&
              groupChats.every(group => group.unreadCount === 0) && (
                <li>No new notifications</li>
              )}
          </ul>
        )}
      </div>
    </div>
  );
}

export default TherapistDashboardHome;