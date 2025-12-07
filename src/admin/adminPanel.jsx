import { useState, useEffect, useMemo } from "react";
import { 
  signInWithEmailAndPassword, 
  signOut, 
  createUserWithEmailAndPassword 
} from "firebase/auth";
import { 
  collection, 
  query, 
  onSnapshot, 
  doc, 
  updateDoc, 
  serverTimestamp,
  writeBatch,
  getDocs
} from "firebase/firestore";
import { auth, db } from "../utils/firebase";
import { 
  Users, MessagesSquare, Calendar, Ban, Shield, LogOut,
  Send, UserPlus, Activity, Search, Bell, BarChart3
} from "lucide-react";

import "../assets/styles/admin.css";

const ADMIN_EMAILS = ["admin@yourapp.com", "support@yourapp.com", "dev@yourapp.com"];

export default function AdminPanel() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [activeTab, setActiveTab] = useState("overview");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

  const [stats, setStats] = useState({
    totalUsers: 0,
    onlineUsers: 0,
    therapists: 0,
    activeChats: 0,
    pendingAppointments: 0,
    bannedUsers: 0,
  });

  const [users, setUsers] = useState([]);
  const [therapists, setTherapists] = useState([]);
  const [chats, setChats] = useState([]);
  const [appointments, setAppointments] = useState([]);

  const [showCreateTherapist, setShowCreateTherapist] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  const [newTherapist, setNewTherapist] = useState({
    name: "", email: "", password: "", position: "", gender: "Prefer not to say"
  });

  useEffect(() => {
    const user = auth.currentUser;
    if (user && ADMIN_EMAILS.includes(user.email || "")) {
      setIsAuthenticated(true);
    }
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      if (ADMIN_EMAILS.includes(cred.user.email || "")) {
        setIsAuthenticated(true);
      } else {
        alert("Access denied.");
        signOut(auth);
      }
    } catch (err) {
      alert("Login failed: " + err.message);
    }
  };

  useEffect(() => {
    if (!isAuthenticated) return;

    const unsubs = [
      onSnapshot(collection(db, "usersOnline"), (snap) => {
        setStats(s => ({ ...s, onlineUsers: snap.size }));
      }),
      onSnapshot(collection(db, "anonymousUsers"), (snap) => {
        const data = snap.docs.map(d => ({ id: d.id, ...d.data(), type: "anonymous" }));
        setUsers(prev => [...prev.filter(u => u.type !== "anonymous"), ...data]);
      }),
      onSnapshot(collection(db, "therapists"), (snap) => {
        const data = snap.docs.map(d => ({ id: d.id, ...d.data(), type: "therapist" }));
        setTherapists(data);
        setUsers(prev => [...prev.filter(u => u.type !== "therapist"), ...data]);
        setStats(s => ({ ...s, therapists: data.length }));
      }),
      onSnapshot(collection(db, "privateChats"), (snap) => {
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        const active = data.filter(c => c.activeTherapist).length;
        setChats(data);
        setStats(s => ({ ...s, activeChats: active }));
      }),
      onSnapshot(collection(db, "appointments"), (snap) => {
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        const pending = data.filter(a => a.status === "pending").length;
        setAppointments(data);
        setStats(s => ({ ...s, pendingAppointments: pending }));
      }),
    ];

    return () => unsubs.forEach(u => u());
  }, [isAuthenticated]);

  const createTherapist = async () => {
    if (!newTherapist.name || !newTherapist.email || !newTherapist.password) {
      alert("Please fill all fields");
      return;
    }

    try {
      const cred = await createUserWithEmailAndPassword(auth, newTherapist.email, newTherapist.password);
      await setDoc(doc(db, "therapists", cred.user.uid), {
        name: newTherapist.name,
        email: newTherapist.email,
        position: newTherapist.position,
        gender: newTherapist.gender,
        online: false,
        createdAt: serverTimestamp(),
        verified: true,
        rating: 0,
        totalRatings: 0,
      });
      alert("Therapist created successfully!");
      setShowCreateTherapist(false);
      setNewTherapist({ name: "", email: "", password: "", position: "", gender: "Prefer not to say" });
    } catch (err) {
      alert("Failed: " + err.message);
    }
  };

  const toggleBan = async (userId, currentStatus) => {
    if (!confirm(`${currentStatus ? "Unban" : "Ban"} this user?`)) return;
    await updateDoc(doc(db, "users", userId), {
      banned: !currentStatus,
      bannedAt: !currentStatus ? serverTimestamp() : null
    });
  };

  const sendAnnouncement = async () => {
    if (!announcement.trim()) return;
    const batch = writeBatch(db);
    const groups = await getDocs(collection(db, "groupChats"));
    groups.docs.forEach(g => {
      batch.set(doc(collection(db, "groupChats", g.id, "events")), {
        type: "announcement",
        text: `Announcement: ${announcement}`,
        role: "system",
        timestamp: serverTimestamp(),
      });
    });
    await batch.commit();
    alert("Announcement sent!");
    setAnnouncement("");
  };

  const forceEndSession = async (chatId) => {
    if (!confirm("Force end this session?")) return;
    await updateDoc(doc(db, "privateChats", chatId), {
      activeTherapist: null,
      status: "waiting",
      aiActive: false,
    });
  };

  const filteredUsers = useMemo(() => {
    return users.filter(u => {
      const matchesSearch = 
        (u.name && u.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (u.anonymousName && u.anonymousName.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (u.email && u.email.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchesFilter = filterStatus === "all" || 
        (filterStatus === "banned" && u.banned) ||
        (filterStatus === "online" && u.online);
      return matchesSearch && matchesFilter;
    });
  }, [users, searchTerm, filterStatus]);

  return (
    <div className="admin-panel">
      <header className="admin-header">
        <div className="header-content">
          <div className="header-title">
            <Shield className="header-icon" />
            <h1>Admin Panel</h1>
          </div>
          <button onClick={() => signOut(auth)} className="logout-btn">
            <LogOut className="icon" /> Logout
          </button>
        </div>
      </header>

      <main className="admin-main">
        <div className="stats-grid">
          {[
            { label: "Total Users", value: stats.totalUsers, icon: Users, color: "blue" },
            { label: "Online Now", value: stats.onlineUsers, icon: Activity, color: "green" },
            { label: "Therapists", value: stats.therapists, icon: Shield, color: "purple" },
            { label: "Active Chats", value: stats.activeChats, icon: MessagesSquare, color: "yellow" },
            { label: "Pending Appts", value: stats.pendingAppointments, icon: Calendar, color: "orange" },
            { label: "Banned Users", value: stats.bannedUsers, icon: Ban, color: "red" },
          ].map((stat, i) => (
            <div key={i} className="stat-card">
              <div className={`stat-icon ${stat.color}`}>
                <stat.icon className="icon" />
              </div>
              <h3>{stat.label}</h3>
              <p>{stat.value}</p>
            </div>
          ))}
        </div>

        <nav className="admin-tabs">
          {[
            { id: "overview", label: "Overview", icon: BarChart3 },
            { id: "users", label: "Users", icon: Users },
            { id: "therapists", label: "Therapists", icon: Shield },
            { id: "chats", label: "Live Chats", icon: MessagesSquare },
            { id: "appointments", label: "Appointments", icon: Calendar },
            { id: "announcements", label: "Announcements", icon: Bell },
          ].map(tab => (
            <button
              key={tab.id}
              className={`tab-btn ${activeTab === tab.id ? "active" : ""}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <tab.icon className="tab-icon" />
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>

        <section className="admin-content">
          {activeTab === "overview" && (
            <div className="overview-section">
              <h2>Welcome back, Admin</h2>
              <p>Everything is running smoothly</p>
            </div>
          )}

          {activeTab === "users" && (
            <div className="users-section">
              <div className="section-header">
                <h2>All Users</h2>
                <div className="search-filter">
                  <div className="search-box">
                    <Search className="search-icon" />
                    <input type="text" placeholder="Search users..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                  </div>
                  <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                    <option value="all">All Users</option>
                    <option value="online">Online</option>
                    <option value="banned">Banned</option>
                  </select>
                </div>
              </div>

              <div className="users-list">
                {filteredUsers.map(user => (
                  <div key={user.id} className="user-card">
                    <div className="user-info">
                      <div className={`user-avatar ${user.online ? "online" : "offline"}`}>
                        {(user.anonymousName || user.name || "U")[0]}
                      </div>
                      <div>
                        <h4>{user.anonymousName || user.name || "Unnamed"}</h4>
                        <p>{user.email || user.id.slice(0, 10)}...</p>
                      </div>
                    </div>
                    <button 
                      className={`action-btn ${user.banned ? "unban" : "ban"}`}
                      onClick={() => toggleBan(user.id, user.banned)}
                    >
                      {user.banned ? "Unban" : "Ban User"}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === "therapists" && (
            <div className="therapists-section">
              <div className="section-header">
                <h2>Therapist Management</h2>
                <button onClick={() => setShowCreateTherapist(true)} className="create-btn">
                  <UserPlus className="icon" />
                  Create Therapist Account
                </button>
              </div>

              <div className="therapist-grid">
                {therapists.map(t => (
                  <div key={t.id} className="therapist-card">
                    <div className="therapist-header">
                      <div className="therapist-avatar">
                        {t.name?.[0] || "T"}
                      </div>
                      <span className={`status-badge ${t.online ? "online" : "offline"}`}>
                        {t.online ? "Online" : "Offline"}
                      </span>
                    </div>
                    <h3>{t.name || "Unnamed Therapist"}</h3>
                    <p className="position">{t.position || "No position"}</p>
                    <p className="email">{t.email}</p>
                    <div className="therapist-actions">
                      <button className="btn-view">View Profile</button>
                      <button className="btn-suspend">Suspend</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === "chats" && (
            <div className="chats-section">
              <h2>Live Private Chats</h2>
              <div className="chat-list">
                {chats.filter(c => c.activeTherapist).map(chat => (
                  <div key={chat.id} className="chat-item">
                    <div className="chat-details">
                      <p className="chat-id">Chat ID: {chat.id}</p>
                      <p className="chat-status">Active Session</p>
                      <p className="last-message">Last: {chat.lastMessage || "No messages"}</p>
                    </div>
                    <button onClick={() => forceEndSession(chat.id)} className="end-session-btn">
                      Force End Session
                    </button>
                  </div>
                ))}
                {chats.filter(c => c.activeTherapist).length === 0 && (
                  <p className="no-data">No active sessions right now.</p>
                )}
              </div>
            </div>
          )}

          {activeTab === "announcements" && (
            <div className="announcements-section">
              <h2>System Announcements</h2>
              <div className="announcement-box">
                <textarea
                  value={announcement}
                  onChange={(e) => setAnnouncement(e.target.value)}
                  placeholder="Type your announcement here..."
                />
                <button onClick={sendAnnouncement} className="send-announcement-btn">
                  <Send className="icon" />
                  Send to All Group Chats
                </button>
              </div>
            </div>
          )}
        </section>
      </main>

      {showCreateTherapist && (
        <div className="modal-overlay">
          <div className="modal">
            <h2>Create Therapist Account</h2>
            <div className="form-grid">
              <input placeholder="Full Name" value={newTherapist.name} onChange={e => setNewTherapist(p => ({...p, name: e.target.value}))} />
              <input placeholder="Email" value={newTherapist.email} onChange={e => setNewTherapist(p => ({...p, email: e.target.value}))} />
              <input placeholder="Password" type="password" value={newTherapist.password} onChange={e => setNewTherapist(p => ({...p, password: e.target.value}))} />
              <input placeholder="Position" value={newTherapist.position} onChange={e => setNewTherapist(p => ({...p, position: e.target.value}))} />
              <select value={newTherapist.gender} onChange={e => setNewTherapist(p => ({...p, gender: e.target.value}))} className="full-width">
                <option>Male</option>
                <option>Female</option>
                <option>Non-Binary</option>
                <option>Prefer not to say</option>
              </select>
            </div>
            <div className="modal-actions">
              <button onClick={createTherapist} className="btn-primary">Create Account</button>
              <button onClick={() => setShowCreateTherapist(false)} className="btn-secondary">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}