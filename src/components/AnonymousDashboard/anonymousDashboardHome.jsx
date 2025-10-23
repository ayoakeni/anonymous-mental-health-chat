import React from "react";
import { Link } from "react-router-dom";
import MoodTracker from "../moodTracker";
import "../../styles/anonymousDashboard.css";

const AnonymousDashboardHome = ({
  groupChats = [],
  privateChats = [],
  displayName,
  anonNames = {},
  formatTimestamp
}) => {
  // Select recent chats
  const recentChats = [
    ...(Array.isArray(groupChats) ? groupChats.slice(0, 3).map(chat => ({ ...chat, type: "group" })) : []),
    ...(Array.isArray(privateChats) ? privateChats.slice(0, 3).map(chat => ({ ...chat, type: "private" })) : []),
  ].sort((a, b) => (b.lastMessage?.timestamp?.seconds || 0) - (a.lastMessage?.timestamp?.seconds || 0)).slice(0, 3);

  // Sample motivational quotes
  const quotes = [
    { text: "You are stronger than you know.", author: "Unknown" },
    { text: "Every day is a new beginning.", author: "Unknown" },
    { text: "Small steps lead to big changes.", author: "Unknown" },
  ];
  const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];

  return (
    <div className="dashboard">
      <div className="welcome-header">
        <h2>Welcome, <span className="highlight">{displayName || "Guest"}</span>!</h2>
        <p className="subtext">Explore your chats or log your mood to start your journey.</p>
      </div>

      <div className="dashboard-grid">
        {/* Mood Tracker Card */}
        <div className="dash-card mood-card">
          <h3>How Are You Feeling?</h3>
          <MoodTracker formatTimestamp={formatTimestamp} />
        </div>

        {/* Recent Chats Card */}
        <div className="dash-card recent-chats">
          <h3>Recent Chats</h3>
          {recentChats.length > 0 ? (
            <ul className="chat-list">
              {recentChats.map((chat) => {
                const lastTs = chat.lastMessage?.timestamp;
                const { dateStr, timeStr } = formatTimestamp(lastTs);
                return (
                  <li key={chat.id} className="chat-card">
                    <Link
                      to={chat.type === "group" ? `/group-chat/${chat.id}` : `/private-chat/${chat.id}`}
                      className="chat-card-inner"
                    >
                      <div className="chat-avater-content">
                        <span className="therapist-text-avatar">
                          {chat.type === "group" ? chat.name?.[0] || "G" : anonNames[chat.id]?.[0] || "T"}
                        </span>
                        <div className="chat-card-content">
                          <span className="chat-card-title">
                            {chat.type === "group" ? chat.name : anonNames[chat.id] || "Therapist"}
                          </span>
                          <span className="chat-card-preview">
                            {chat.lastMessage?.text?.substring(0, 30) || "No messages yet"}
                          </span>
                        </div>
                      </div>
                      <div className="chat-card-meta">
                        <span className="message-timestamp">
                          <span className="meta-date">{dateStr}</span>
                          <span className="meta-time">{timeStr}</span>
                        </span>
                        {(chat.unreadCount || chat.unreadCountForTherapist) > 0 && (
                          <span className="unread-badge">
                            {chat.type === "group" ? chat.unreadCount : chat.unreadCountForTherapist}
                          </span>
                        )}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p>No recent chats. Start a new conversation!</p>
          )}
        </div>

        {/* Motivational Quote Card */}
        <div className="dash-card quote-card">
          <h3>Daily Inspiration</h3>
          <p className="quote">"{randomQuote.text}"</p>
          <p className="quote-author">— {randomQuote.author}</p>
        </div>

        {/* Quick Actions Card */}
        <div className="dash-card quick-actions-card">
          <h3>Quick Actions</h3>
          <div className="quick-actions">
            <Link to="/group-chat">
              <button className="quick-action-btn">Join Group Chat</button>
            </Link>
            <Link to="/private-chat">
              <button className="quick-action-btn">Start Private Chat</button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AnonymousDashboardHome;