import { useState, useEffect } from "react";
import { collection, query, where, onSnapshot, limit } from "firebase/firestore";
import { db, auth } from "../../utils/firebase";
import { useNavigate } from "react-router-dom";
import "../../assets/styles/anonymousDashboardHome.css";

const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
};

const getGreetingIcon = () => {
  const hour = new Date().getHours();
  if (hour < 12) return "fa-sun";
  if (hour < 17) return "fa-cloud-sun";
  return "fa-moon";
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

  // Scroll effect — hide header on scroll down, show on scroll up
  useEffect(() => {
    let lastScrollY = window.scrollY;
    let ticking = false;

    const updateScrollDir = () => {
      const scrollY = window.scrollY;
      const header = document.querySelector(".adh-header");
      if (!header) return;

      if (scrollY <= 0) {
        header.classList.remove("hidden", "scrolled");
      } else if (scrollY > lastScrollY && scrollY > 20) {
        header.classList.add("hidden", "scrolled");
      } else if (scrollY < lastScrollY) {
        header.classList.remove("hidden");
        header.classList.toggle("scrolled", scrollY > 50);
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

    window.addEventListener("scroll", onScroll);
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const recentChats = [
    ...(Array.isArray(groupChats)
      ? groupChats.slice(0, 3).map((chat) => ({ ...chat, type: "group" }))
      : []),
  ]
    .sort(
      (a, b) =>
        (b.lastMessage?.timestamp?.seconds || 0) -
        (a.lastMessage?.timestamp?.seconds || 0)
    )
    .slice(0, 3);

  const [moodHistory, setMoodHistory] = useState([]);
  const [moodHistoryLoading, setMoodHistoryLoading] = useState(true);
  const [moodHistoryError, setMoodHistoryError] = useState(null);

  const moodOptions = [
    { value: "happy",   label: "Happy",   emoji: "😊" },
    { value: "sad",     label: "Sad",     emoji: "😢" },
    { value: "anxious", label: "Anxious", emoji: "😣" },
    { value: "neutral", label: "Neutral", emoji: "😐" },
    { value: "angry",   label: "Angry",   emoji: "😠" },
  ];

  const quotes = [
    { text: "You are stronger than you know.",  author: "Unknown" },
    { text: "Every day is a new beginning.",     author: "Unknown" },
    { text: "Small steps lead to big changes.",  author: "Unknown" },
  ];
  const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];

  useEffect(() => {
    const uid = auth.currentUser?.uid || "anonymous";
    const q = query(
      collection(db, "moods"),
      where("userId", "==", uid),
      limit(5)
    );
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const moods = snapshot.docs
          .map((doc) => doc.data())
          .sort(
            (a, b) =>
              (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0)
          );
        setMoodHistory(moods);
        setMoodHistoryLoading(false);
      },
      () => {
        setMoodHistoryError("Failed to load mood history.");
        setMoodHistoryLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  const renderTimestamp = (timestamp) => {
    if (!timestamp?.seconds) return "N/A";
    const formatted = formatTimestamp(timestamp);
    if (
      typeof formatted === "object" &&
      formatted.dateStr &&
      formatted.timeStr
    ) {
      return `${formatted.dateStr} · ${formatted.timeStr}`;
    }
    return formatted || "N/A";
  };

  const [tasks, setTasks] = useState([
    { id: 1, text: "Drink a glass of water",  icon: "💧", completed: false },
    { id: 2, text: "Take a 10-minute walk",    icon: "🚶", completed: false },
    { id: 3, text: "Practice deep breathing",  icon: "🌬️", completed: false },
  ]);

  const toggleTask = (id) =>
    setTasks((prev) =>
      prev.map((task) =>
        task.id === id ? { ...task, completed: !task.completed } : task
      )
    );

  const completedCount = tasks.filter((t) => t.completed).length;
  const progressPct = Math.round((completedCount / tasks.length) * 100);

  return (
    <div className="adh-root">

      {/* ── HEADER ── */}
      <header className="adh-header">
        <div className="adh-header-inner">
          <div>
            <p className="adh-greeting-line">
              <i className={`fa-solid ${getGreetingIcon()} adh-greeting-icon`} />
              {getGreeting()}
            </p>
            <h1 className="adh-heading">
              Welcome back,{" "}
              <em>{displayName || "Friend"}</em>
            </h1>
            <p className="adh-subtext">
              Here's your wellness overview. Take a breath — you're doing great.
            </p>
          </div>
          <div className="adh-date-badge">
            {new Date().toLocaleDateString("en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
            })}
          </div>
        </div>
      </header>

      <div className="adh-divider" />

      {/* ── GRID ── */}
      <div className="adh-grid">

        {/* Recent Chats */}
        <div className="adh-card">
          <p className="adh-card-label">Messages</p>
          <h2 className="adh-card-title">Recent Chats</h2>
          {recentChats.length > 0 ? (
            <ul className="adh-chat-list">
              {recentChats.map((chat) => (
                <li
                  key={`${chat.type}-${chat.id}`}
                  className="adh-chat-item"
                  onClick={() => {
                    if (chat.type === "group")
                      navigate(`/anonymous-dashboard/group-chat/${chat.id}`);
                  }}
                >
                  <div className="adh-avatar">
                    {chat.type === "group"
                      ? chat.name?.[0] || "G"
                      : anonNames[chat.id]?.[0] || "T"}
                  </div>
                  <div className="adh-chat-info">
                    <div className="adh-chat-name">
                      {chat.type === "group"
                        ? chat.name
                        : anonNames[chat.id] || "Therapist"}
                    </div>
                    <div className="adh-chat-preview">
                      {chat.lastMessage?.text?.substring(0, 35) ||
                        "No messages yet"}
                    </div>
                  </div>
                  <div className="adh-chat-meta">
                    <span className="adh-chat-time">
                      {renderTimestamp(chat.lastMessage?.timestamp)}
                    </span>
                    {(chat.unreadCount?.[userId] || 0) > 0 && (
                      <span className="adh-badge">
                        {chat.unreadCount[userId]}
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="adh-empty">
              No recent chats.
              <br />
              Start a new conversation!
            </p>
          )}
        </div>

        {/* Mood History */}
        <div className="adh-card">
          <p className="adh-card-label">Mood</p>
          <h2 className="adh-card-title">Recent Moods</h2>
          {moodHistoryLoading ? (
            <p className="adh-empty">Loading…</p>
          ) : moodHistoryError ? (
            <p className="adh-empty adh-error">{moodHistoryError}</p>
          ) : moodHistory.length > 0 ? (
            <ul className="adh-mood-list">
              {moodHistory.map((mood, i) => {
                const opt =
                  moodOptions.find((m) => m.value === mood.mood) || {
                    label: mood.mood,
                    emoji: "❓",
                  };
                return (
                  <li key={i} className="adh-mood-item">
                    <span className="adh-mood-emoji">{opt.emoji}</span>
                    <span className="adh-mood-label">{opt.label}</span>
                    <span className="adh-mood-time">
                      {renderTimestamp(mood.timestamp)}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="adh-empty">
              No moods logged yet.
              <br />
              Log one to get started!
            </p>
          )}
        </div>

        {/* Daily Tasks */}
        <div className="adh-card">
          <p className="adh-card-label">Tasks</p>
          <h2 className="adh-card-title">Daily Wellness</h2>
          <div className="adh-progress-row">
            <div className="adh-progress-bar-bg">
              <div
                className="adh-progress-bar-fill"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <span className="adh-progress-label">
              {completedCount}/{tasks.length}
            </span>
          </div>
          <ul className="adh-task-list">
            {tasks.map((task) => (
              <li
                key={task.id}
                className={`adh-task-item ${task.completed ? "done" : ""}`}
                onClick={() => toggleTask(task.id)}
              >
                <div className="adh-task-check">
                  {task.completed ? "✓" : ""}
                </div>
                <span className="adh-task-icon">{task.icon}</span>
                <span className="adh-task-text">{task.text}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Quote */}
        <div className="adh-card adh-quote-card">
          <p className="adh-card-label">Inspiration</p>
          <h2 className="adh-card-title">Daily Quote</h2>
          <p className="adh-quote-text">"{randomQuote.text}"</p>
          <div className="adh-quote-divider" />
          <p className="adh-quote-author">— {randomQuote.author}</p>
        </div>

      </div>
    </div>
  );
};

export default AnonymousDashboardHome;