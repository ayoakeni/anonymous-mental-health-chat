import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { collection, query, where, onSnapshot, limit } from "firebase/firestore";
import { db, auth } from "../../utils/firebase";
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

  // Mood history state
  const [moodHistory, setMoodHistory] = useState([]);
  const [moodHistoryLoading, setMoodHistoryLoading] = useState(true);
  const [moodHistoryError, setMoodHistoryError] = useState(null);

  // Mood options for mapping (consistent with MoodTracker.jsx)
  const moodOptions = [
    { value: "happy", label: "Happy", emoji: "😊" },
    { value: "sad", label: "Sad", emoji: "😢" },
    { value: "anxious", label: "Anxious", emoji: "😣" },
    { value: "neutral", label: "Neutral", emoji: "😐" },
    { value: "excited", label: "Excited", emoji: "😊" }
  ];

  // Fetch mood history
  useEffect(() => {
    const userId = auth.currentUser?.uid || "anonymous";
    const q = query(
      collection(db, "moods"),
      where("userId", "==", userId),
      limit(5) // Fetch last 5 moods
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        const moods = snapshot.docs
          .map(doc => doc.data())
          .sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
        setMoodHistory(moods);
      } else {
        setMoodHistory([]);
      }
      setMoodHistoryLoading(false);
    }, (error) => {
      console.error("Error fetching mood history:", error);
      setMoodHistoryError("Failed to load mood history. Please try again.");
      setMoodHistoryLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Helper function to format timestamp
  const renderTimestamp = (timestamp) => {
    if (!timestamp) return "Unknown time";
    const formatted = formatTimestamp(timestamp);
    if (typeof formatted === "object" && formatted.dateStr && formatted.timeStr) {
      return (
        <>
          <span className="meta-date">{formatted.dateStr}</span>
          <span className="meta-time">{formatted.timeStr}</span>
        </>
      );
    }
    return formatted || "Unknown time";
  };

  // Daily tasks state
  const [tasks, setTasks] = useState([
    { id: 1, text: "Drink a glass of water", completed: false },
    { id: 2, text: "Take a 10-minute walk", completed: false },
    { id: 3, text: "Practice deep breathing", completed: false }
  ]);

  const toggleTask = (id) => {
    setTasks(tasks.map(task =>
      task.id === id ? { ...task, completed: !task.completed } : task
    ));
  };

  return (
    <div className="dashboard">
      <div className="welcome-header">
        <h2>Welcome, <span className="highlight">{displayName || "Guest"}</span>!</h2>
        <p className="subtext">Explore your chats, log your mood, or try a daily task to support your well-being.</p>
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
                          {renderTimestamp(lastTs)}
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

        {/* Mood History Card */}
        <div className="dash-card mood-history-card">
          <h3>Your Recent Moods</h3>
          {moodHistoryLoading ? (
            <p>Loading mood history...</p>
          ) : moodHistoryError ? (
            <p className="error">{moodHistoryError}</p>
          ) : moodHistory.length > 0 ? (
            <ul className="mood-history-list">
              {moodHistory.map((mood, index) => {
                const moodOption = moodOptions.find((m) => m.value === mood.mood) || { label: mood.mood, emoji: "❓" };
                return (
                  <li key={index} className="mood-history-item">
                    <span className="mood-emoji">{moodOption.emoji}</span>
                    <span className="mood-label">{moodOption.label}</span>
                    <span className="mood-timestamp">{renderTimestamp(mood.timestamp)}</span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p>No moods logged yet. Log a mood to get started!</p>
          )}
        </div>

        {/* Daily Task Card */}
        <div className="dash-card daily-task-card">
          <h3>Daily Wellness Tasks</h3>
          <ul className="task-list">
            {tasks.map((task) => (
              <li key={task.id} className="task-item">
                <input
                  type="checkbox"
                  checked={task.completed}
                  onChange={() => toggleTask(task.id)}
                  className="task-checkbox"
                />
                <span className={`task-text ${task.completed ? "completed" : ""}`}>
                  {task.text}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Resources Card */}
        <div className="dash-card resources-card">
          <h3>Mental Health Resources</h3>
          <ul className="resource-list">
            <li className="resource-item">
              <a href="https://www.mentalhealth.gov" target="_blank" rel="noopener noreferrer">
                MentalHealth.gov
              </a>
              <p>Learn about mental health and find support services.</p>
            </li>
            <li className="resource-item">
              <a href="https://988lifeline.org" target="_blank" rel="noopener noreferrer">
                988 Suicide & Crisis Lifeline
              </a>
              <p>24/7 support for crisis situations.</p>
            </li>
            <li className="resource-item">
              <a href="https://www.mind.org.uk" target="_blank" rel="noopener noreferrer">
                Mind UK
              </a>
              <p>Resources and advice for mental well-being.</p>
            </li>
          </ul>
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