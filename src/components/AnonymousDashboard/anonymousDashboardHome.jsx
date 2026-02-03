import { useState, useEffect, useRef } from "react";
// import { Link } from "react-router-dom";
import { collection, query, where, onSnapshot, limit, getDoc, doc } from "firebase/firestore";
import { db, auth } from "../../utils/firebase";
import { useNavigate } from "react-router-dom";
// import TherapistProfile from "../TherapistProfile";
import "../../assets/styles/anonymousDashboardHome.css";

const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
};

const AnonymousDashboardHome = ({
  groupChats = [],
  privateChats = [],
  displayName,
  userId,
  anonNames = {},
  formatTimestamp,
}) => {
  const navigate = useNavigate();

  // Scroll effect
  useEffect(() => {
    let lastScrollY = window.scrollY;
    let ticking = false;

    const updateScrollDir = () => {
      const scrollY = window.scrollY;
      const header = document.querySelector('.welcome-header');
      if (!header) return;

      if (scrollY <= 0) {
        header.classList.remove('hidden', 'scrolled');
      } else if (scrollY > lastScrollY && scrollY > 20) {
        // Scrolling DOWN
        header.classList.add('hidden', 'scrolled');
      } else if (scrollY < lastScrollY) {
        // Scrolling UP
        header.classList.remove('hidden');
        header.classList.toggle('scrolled', scrollY > 50);
      }

      lastScrollY = scrollY;
      ticking = false;
    };

    const onScroll = () => {
      if (!ticking) {
        requestAnimationFrame(updateScrollDir);
        ticking = true;
      }
    };

    window.addEventListener('scroll', onScroll);
    onScroll();

    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Select recent chats
  const recentChats = [
    ...(Array.isArray(groupChats) ? groupChats.slice(0, 3).map(chat => ({ ...chat, type: "group" })) : []),
  ].sort((a, b) => (b.lastMessage?.timestamp?.seconds || 0) - (a.lastMessage?.timestamp?.seconds || 0)).slice(0, 3);

  // Mood history state
  const [moodHistory, setMoodHistory] = useState([]);
  const [moodHistoryLoading, setMoodHistoryLoading] = useState(true);
  const [moodHistoryError, setMoodHistoryError] = useState(null);

  const moodOptions = [
    { value: "happy", label: "Happy", emoji: "😊" },
    { value: "sad", label: "Sad", emoji: "😢" },
    { value: "anxious", label: "Anxious", emoji: "😣" },
    { value: "neutral", label: "Neutral", emoji: "😐" },
    { value: "angry", label: "Angry", emoji: "😠" }
  ];

  const quotes = [
    { text: "You are stronger than you know.", author: "Unknown" },
    { text: "Every day is a new beginning.", author: "Unknown" },
    { text: "Small steps lead to big changes.", author: "Unknown" },
  ];
  const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];

  // Fetch mood history
  useEffect(() => {
    const userId = auth.currentUser?.uid || "anonymous";
    const q = query(
      collection(db, "moods"),
      where("userId", "==", userId),
      limit(5)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const moods = snapshot.docs
        .map(doc => doc.data())
        .sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
      setMoodHistory(moods);
      setMoodHistoryLoading(false);
    }, () => {
      setMoodHistoryError("Failed to load mood history.");
      setMoodHistoryLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Helper function to format timestamp
  const renderTimestamp = (timestamp) => {
    if (!timestamp || !timestamp.seconds) return "N/A";
    const formatted = formatTimestamp(timestamp);
    if (typeof formatted === "object" && formatted.dateStr && formatted.timeStr) {
      return (
        <>
          <span className="meta-date">{formatted.dateStr}</span>
          <span className="meta-time">{formatted.timeStr}</span>
        </>
      );
    }
    return formatted || "N/A";
  };

  // Daily tasks state
  const [tasks, setTasks] = useState([
    { id: 1, text: "Drink a glass of water", completed: false },
    { id: 2, text: "Take a 10-minute walk", completed: false },
    { id: 3, text: "Practice deep breathing", completed: false },
  ]);

  const toggleTask = (id) => {
    setTasks((prev) =>
      prev.map((task) =>
        task.id === id ? { ...task, completed: !task.completed } : task
      )
    );
  };

  return (
    <div className="anonymousDashboardHome">
      <div className="welcome-header">
        <h2>
          <span className="greeting">{getGreeting()},</span>
          <span className="highlight">{displayName || "Anonymous User"}</span>!
        </h2>
        <p className="subtext">
          Explore your chats, log your mood, try a daily task, or connect with a therapist.
        </p>
      </div>

      <div className="dashboard-grid">
        {/* Recent Chats Card */}
        <div className="dash-card recent-chats">
          <h3>Recent Chats</h3>
          {recentChats.length > 0 ? (
            <ul className="chat-list">
              {recentChats.map((chat) => {
                const lastTs = chat.lastMessage?.timestamp;
                return (
                  <li key={`${chat.type}-${chat.id}`} className="chat-card">
                    <div
                      onClick={() => {
                        const path =
                          chat.type === "group"
                            ? `/anonymous-dashboard/group-chat/${chat.id}`
                            : "";
                        navigate(path);
                      }}
                      className="chat-card-inner"
                    >
                      <div className="chat-avater-content">
                        <span className="therapist-text-avatar">
                          {chat.type === "group"
                            ? chat.name?.[0] || "G"
                            : anonNames[chat.id]?.[0] || "T"}
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
                        {(() => {
                          const personalUnread = chat.unreadCount?.[userId] || 0;
                          return personalUnread > 0 && <span className="unread-badge">{personalUnread}</span>;
                        })()}
                      </div>
                    </div>
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

        {/* Motivational Quote Card */}
        <div className="dash-card quote-card">
          <h3>Daily Inspiration</h3>
          <p className="quote">"{randomQuote.text}"</p>
          <p className="quote-author">— {randomQuote.author}</p>
        </div>

        {/* Quick Actions Card */}
        {/* <div className="dash-card quick-actions-card">
          <h3>Quick Actions</h3>
          <div className="quick-actions">
            <Link to="group-chat">
              <button className="quick-action-btn">Join Group Chat</button>
            </Link>
            <Link to="private-chat">
              <button className="quick-action-btn">Start Private Chat</button>
            </Link>
          </div>
        </div> */}
      </div>
    </div>
  );
};

export default AnonymousDashboardHome;