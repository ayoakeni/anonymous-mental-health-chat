import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  signOut,
  createUserWithEmailAndPassword
} from "firebase/auth";
import {
  collection,
  query,
  onSnapshot,
  doc,
  updateDoc,
  setDoc,
  serverTimestamp,
  writeBatch,
  where,
  getDocs,
  orderBy,
  addDoc
} from "firebase/firestore";
import { auth, db } from "../utils/firebase";
import {
  Users, MessagesSquare, Calendar, Ban, Shield, LogOut,
  Send, UserPlus, Activity, Search, Bell, BarChart3,
  Eye, EyeOff, AlertCircle
} from "lucide-react";

import "../assets/styles/admin.css";

const ADMIN_EMAILS = ["admin@yourapp.com", "support@yourapp.com", "dev@yourapp.com"];

export default function AdminPanel() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [appointmentFilter, setAppointmentFilter] = useState("all");

  const [stats, setStats] = useState({
    totalUsers: 0,
    onlineUsers: 0,
    therapists: 0,
    activeChats: 0,
    pendingAppointments: 0,
    bannedUsers: 0,
  });

  const [appeals, setAppeals] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [therapists, setTherapists] = useState([]);
  const [chats, setChats] = useState([]);
  const [appointments, setAppointments] = useState([]);

  const [showCreateTherapist, setShowCreateTherapist] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [newTherapist, setNewTherapist] = useState({
    name: "", email: "", password: "", position: "", gender: "Prefer not to say"
  });

  // Chat Monitoring
  const [selectedChat, setSelectedChat] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [adminMessage, setAdminMessage] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef(null);

  // Check admin access
  useEffect(() => {
    const user = auth.currentUser;
    if (user && ADMIN_EMAILS.includes(user.email || "")) {
      setIsAuthenticated(true);
    }
  }, []);

  // Main data listeners
  useEffect(() => {
    if (!isAuthenticated) return;

    const unsubs = [];

    unsubs.push(onSnapshot(collection(db, "usersOnline"), snap => {
      setStats(s => ({ ...s, onlineUsers: snap.size }));
    }));

    unsubs.push(onSnapshot(collection(db, "users"), snap => {
      const users = snap.docs.map(d => ({
        id: d.id,
        ...d.data(),
        type: "registered",
        banned: !!d.data().banned,
        suspended: !!d.data().suspended
      }));
      mergeUsers(users);
    }));

    unsubs.push(onSnapshot(collection(db, "anonymousUsers"), snap => {
      const anon = snap.docs.map(d => ({
        id: d.id,
        ...d.data(),
        type: "anonymous",
        name: d.data().anonymousName || "Anonymous User",
        banned: !!d.data().banned,
        suspended: false
      }));
      mergeUsers(anon);
    }));

    unsubs.push(onSnapshot(collection(db, "therapists"), snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data(), type: "therapist" }));
      setTherapists(list);
      setStats(s => ({ ...s, therapists: list.length }));
    }));

    unsubs.push(onSnapshot(collection(db, "privateChats"), snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const active = list.filter(c => c.activeTherapist).length;
      setChats(list);
      setStats(s => ({ ...s, activeChats: active }));
    }));

    unsubs.push(onSnapshot(
      query(collection(db, "anonymousUsers"), where("appealStatus", "==", "pending")),
      (snap) => {
        const appealList = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setAppeals(appealList);
      }
    ));

    unsubs.push(onSnapshot(collection(db, "appointments"), snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const pending = list.filter(a => a.status === "pending").length;
      setAppointments(list);
      setStats(s => ({ ...s, pendingAppointments: pending }));
    }));

    const mergeUsers = (newList) => {
      setAllUsers(prev => {
        // Remove old entries of same type + id
        const filtered = prev.filter(u => !newList.some(n => n.id === u.id && n.type === u.type));
        const combined = [...filtered, ...newList];

        const realUsers = combined.filter(u => u.type === "registered" || u.type === "anonymous");

        // Enhanced name resolution
        realUsers.forEach(user => {
          if (!user.displayName) {
            if (user.type === "anonymous") {
              user.displayName = user.anonymousName || `Anonymous_${user.id.slice(-6)}`;
            } else {
              user.displayName = user.name || user.email?.split("@")[0] || "User";
            }
          }
        });

        const totalBanned = realUsers.filter(u => u.banned).length;

        setStats(s => ({ 
          ...s, 
          totalUsers: realUsers.length,
          bannedUsers: totalBanned 
        }));

        return combined;
      });
    };

    return () => unsubs.forEach(u => u());
  }, [isAuthenticated]);

  // Chat Monitoring
  useEffect(() => {
    if (!selectedChat) {
      setChatMessages([]);
      return;
    }

    const q = query(
      collection(db, "privateChats", selectedChat.id, "messages"),
      orderBy("timestamp", "asc")
    );

    const unsubMsgs = onSnapshot(q, snap => {
      const msgs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setChatMessages(msgs);
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    });

    const unsubTyping = onSnapshot(doc(db, "privateChats", selectedChat.id), docSnap => {
      const data = docSnap.data();
      setIsTyping(data?.therapistTyping || data?.userTyping || false);
    });

    return () => {
      unsubMsgs();
      unsubTyping();
    };
  }, [selectedChat]);

  const handleAppealDecision = async (userId, decision) => {
    const response = decision === "rejected"
      ? prompt("Response to user (optional):")
      : "Your appeal has been accepted. Welcome back!";

    if (decision === "rejected" && response === null) return; // User clicked "Cancel"

    try {
      await updateDoc(doc(db, "anonymousUsers", userId), {
        appealStatus: decision,
        appealResponse: response?.trim() || null,
        appealReviewedAt: serverTimestamp(),
        appealReviewedBy: auth.currentUser?.email || "admin",
        banned: decision === "accepted" ? false : true,
        banReason: decision === "accepted" ? null : undefined,
      });

      alert(decision === "accepted" ? "Appeal accepted! User unbanned." : "Appeal rejected.");
    } catch (err) {
      console.error("Appeal error:", err);
      alert("Failed to process appeal");
    }
  };

  const updateAppointmentStatus = async (apptId, newStatus) => {
    if (!confirm(`Change appointment status to "${newStatus}"?`)) return;

    try {
      await updateDoc(doc(db, "appointments", apptId), {
        status: newStatus,
        updatedAt: serverTimestamp(),
        updatedBy: "admin"
      });
      alert("Appointment updated!");
    } catch (err) {
      console.error(err);
      alert("Failed to update appointment");
    }
  };

  const createTherapist = async () => {
    if (!newTherapist.name || !newTherapist.email || !newTherapist.password) {
      alert("Please fill all required fields");
      return;
    }
    try {
      const cred = await createUserWithEmailAndPassword(auth, newTherapist.email, newTherapist.password);
      await setDoc(doc(db, "therapists", cred.user.uid), {
        name: newTherapist.name,
        email: newTherapist.email,
        position: newTherapist.position || "Therapist",
        gender: newTherapist.gender,
        online: false,
        createdAt: serverTimestamp(),
        verified: true,
        rating: 0,
        totalRatings: 0,
        suspended: false
      });
      alert("Therapist created successfully!");
      setShowCreateTherapist(false);
      setNewTherapist({ name: "", email: "", password: "", position: "", gender: "Prefer not to say" });
    } catch (err) {
      alert("Error: " + err.message);
    }
  };

  const toggleBan = async (userId, currentStatus, userType) => {
    if (!confirm(currentStatus ? "Unban this user?" : "Ban this user?")) return;

    const collectionName = userType === "anonymous" ? "anonymousUsers" : "users";

    let banReason = null;
    let bannedBy = auth.currentUser?.email || "admin";

    if (!currentStatus) {
      banReason = prompt("Enter ban reason (shown to user):", "Inappropriate behavior");
      if (banReason === null) return;
      if (banReason.trim() === "") banReason = "No reason provided";
    }

    try {
      await updateDoc(doc(db, collectionName, userId), {
        banned: !currentStatus,
        bannedAt: !currentStatus ? serverTimestamp() : null,
        banReason: !currentStatus ? banReason?.trim() : null,        // save reason
        bannedBy: !currentStatus ? bannedBy : null,                  // who banned them
      });

      alert(currentStatus ? "User unbanned" : `User banned: "${banReason}"`);
    } catch (err) {
      console.error(err);
      alert("Failed to update ban status");
    }
  };

  const AppealsTab = ({ appeals, onAppealDecision }) => {
    return (
      <div className="appeals-section">
        <h2>Ban Appeals ({appeals.length})</h2>
        {appeals.length === 0 ? (
          <p>No pending appeals</p>
        ) : (
          appeals.map(a => (
            <div key={a.id} className="appeal-card">
              <div className="appeal-header">
                <p><strong>{a.anonymousName || "Anonymous User"}</strong></p>
                <p className="appeal-date">
                  {a.appealSubmittedAt?.toDate?.().toLocaleDateString()}
                </p>
              </div>
              <div className="appeal-content">
                <p><strong>Ban reason:</strong> {a.banReason || "Not specified"}</p>
                <p><strong>Appeal message:</strong> {a.appealMessage}</p>
              </div>
              <div className="appeal-actions">
                <button 
                  onClick={() => onAppealDecision(a.id, "accepted")} 
                  className="btn-accept"
                >
                  Accept & Unban
                </button>
                <button 
                  onClick={() => onAppealDecision(a.id, "rejected")} 
                  className="btn-reject"
                >
                  Reject
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    );
  };

  const toggleSuspendTherapist = async (therapistId, currentStatus, name) => {
    if (!confirm(currentStatus ? `Unsuspend ${name}?` : `Suspend ${name}?`)) return;
    await updateDoc(doc(db, "therapists", therapistId), {
      suspended: !currentStatus,
      suspendedAt: !currentStatus ? serverTimestamp() : null
    });
  };

  const sendAnnouncement = async () => {
    if (!announcement.trim()) return;
    const batch = writeBatch(db);
    const groups = await getDocs(collection(db, "groupChats"));
    groups.docs.forEach(g => {
      const ref = doc(collection(db, "groupChats", g.id, "events"));
      batch.set(ref, {
        type: "announcement",
        text: announcement.trim(),
        role: "admin",
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
      status: "ended",
      aiActive: false,
      endedAt: serverTimestamp(),
    });
  };

  const sendAdminMessage = async () => {
    if (!selectedChat || !adminMessage.trim()) return;
    try {
      await addDoc(collection(db, "privateChats", selectedChat.id, "messages"), {
        text: adminMessage.trim(),
        role: "admin",
        sender: "admin",
        timestamp: serverTimestamp(),
        isAdmin: true
      });
      await updateDoc(doc(db, "privateChats", selectedChat.id), {
        lastMessage: adminMessage.trim(),
        lastMessageTime: serverTimestamp(),
      });
      setAdminMessage("");
    } catch (err) {
      alert("Failed to send message");
    }
  };

  const filteredUsers = useMemo(() => {
    return allUsers
      .filter(u => u.type !== "therapist")
      .filter(u => {
        const term = searchTerm.toLowerCase();
        const matchesSearch =
          (u.name?.toLowerCase().includes(term)) ||
          (u.anonymousName?.toLowerCase().includes(term)) ||
          (u.email?.toLowerCase().includes(term)) ||
          u.id.includes(term);
        const matchesFilter = filterStatus === "all" ||
          (filterStatus === "online" && u.online) ||
          (filterStatus === "banned" && u.banned);
        return matchesSearch && matchesFilter;
      });
  }, [allUsers, searchTerm, filterStatus]);

  const filteredAppointments = useMemo(() => {
    if (appointmentFilter === "all") return appointments;
    return appointments.filter(appt => appt.status === appointmentFilter);
  }, [appointments, appointmentFilter]);

  if (!isAuthenticated) {
    return (
      <div className="admin-panel" style={{ textAlign: "center", padding: "100px" }}>
        <Shield size={80} />
        <h2>Admin Access Required</h2>
        <p>Please log in with an admin account.</p>
      </div>
    );
  }

  return (
    <div className="admin-panel">
      {/* Header & Stats & Tabs — unchanged */}
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
            { id: "appeals", label: "Appeals", icon: AlertCircle },
            { id: "appointments", label: "Appointments", icon: Calendar },
            { id: "announcements", label: "Announcements", icon: Bell },
            { id: "monitor", label: "Monitor Chats", icon: Eye },
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
              <h2>Dashboard Overview</h2>
              <div className="overview-grid">
                <div className="overview-card">
                  <h3>Platform Health</h3>
                  <p>All systems operational</p>
                </div>
                <div className="overview-card">
                  <h3>Recent Activity</h3>
                  <p>{stats.activeChats} active therapy sessions</p>
                  <p>{stats.pendingAppointments} appointments awaiting confirmation</p>
                </div>
                <div className="overview-card">
                  <h3>Moderation Alerts</h3>
                  <p>{stats.bannedUsers} banned users</p>
                  <p>{appeals?.length || 0} pending ban appeals</p>
                </div>
              </div>
            </div>
          )}
          
          {activeTab === "users" && (
            <div className="users-section">
              <div className="section-header">
                <h2>All Users ({filteredUsers.length})</h2>
                <div className="search-filter">
                  <div className="search-box">
                    <Search className="search-icon" />
                    <input type="text" placeholder="Search..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                  </div>
                  <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                    <option value="all">All</option>
                    <option value="online">Online</option>
                    <option value="banned">Banned</option>
                  </select>
                </div>
              </div>
              <div className="users-list">
                {filteredUsers.map(user => (
                  <div key={`${user.type}-${user.id}`} className="user-card">
                    <div className="user-info">
                      <div className="user-avatar-wrapper">
                        {user.profileImage ? (
                          <img 
                            src={user.profileImage} 
                            alt={user.name || user.anonymousName || "User"}
                            className={`user-avatar-img ${user.online ? "online" : "offline"}`}
                            onError={(e) => {
                              e.target.style.display = "none";
                              e.target.nextElementSibling.style.display = "flex";
                            }}
                          />
                        ) : null}
                        <div className={`user-avatar-fallback ${user.online ? "online" : "offline"}`}>
                          {(user.name || user.anonymousName || "U")[0].toUpperCase()}
                        </div>
                      </div>
                      <div>
                        <h4>{user.displayName || "Unknown User"}</h4>
                        <p>
                          <span className="user-type-tag">
                            {user.type === "registered" ? "Registered" : "Anonymous id"}:
                          </span>
                          {user.email || (user.id.slice(0, 10))}
                        </p>
                        {user.banned && <span className="banned-tag">BANNED</span>}
                      </div>
                    </div>

                    {/* BAN BUTTON FOR BOTH REGISTERED AND ANONYMOUS */}
                    {(user.type === "registered" || user.type === "anonymous") && (
                      <button
                        className={`action-btn ${user.banned ? "unban" : "ban"}`}
                        onClick={() => toggleBan(user.id, user.banned, user.type)}
                      >
                        <Ban size={16} /> {user.banned ? "Unban" : "Ban User"}
                      </button>
                    )}
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
                  <UserPlus className="icon" /> Create Therapist
                </button>
              </div>
              <div className="therapist-grid">
                {therapists.map(t => (
                  <div key={t.id} className="therapist-card">
                    <div className="therapist-header">
                      <div className="therapist-avatar-wrapper">
                        {t.profileImage ? (
                          <img 
                            src={t.profileImage} 
                            alt={t.name}
                            className={`therapist-avatar-img ${t.online ? "online" : "offline"}`}
                            onError={(e) => {
                              e.target.style.display = "none";
                              e.target.nextElementSibling.style.display = "flex";
                            }}
                          />
                        ) : null}
                        <div className={`therapist-avatar-fallback ${t.online ? "online" : "offline"}`}>
                          {t.name?.[0]?.toUpperCase() || "T"}
                        </div>
                      </div>
                      <div className="status-badges">
                        <span className={`status-badge ${t.online ? "online" : "offline"}`}>
                          {t.online ? "Online" : "Offline"}
                        </span>
                        {t.suspended && (
                          <span className="status-badge suspended">
                            <AlertCircle size={14} /> Suspended
                          </span>
                        )}
                      </div>
                    </div>
                    <h3>{t.name || "Unnamed Therapist"}</h3>
                    <p className="position">{t.position || "No position set"}</p>
                    <p className="email">{t.email}</p>
                    <div className="therapist-actions">
                      <button
                        onClick={() => alert(
                          `Therapist Profile\n\nName: ${t.name}\nEmail: ${t.email}\nPosition: ${t.position}\nGender: ${t.gender}\nRating: ${t.rating || 0}\nCreated: ${t.createdAt?.toDate?.().toLocaleDateString() || "Unknown"}`
                        )}
                        className="btn-view"
                      >
                        <Eye size={16} /> View Profile
                      </button>
                      <button
                        onClick={() => toggleSuspendTherapist(t.id, t.suspended, t.name)}
                        className={`btn-suspend ${t.suspended ? "unsuspend" : ""}`}
                      >
                        {t.suspended ? <Eye size={16} /> : <EyeOff size={16} />}
                        {t.suspended ? " Unsuspend" : " Suspend"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === "chats" && (
            <div className="chats-section">
              <h2>Active Private Chats ({stats.activeChats})</h2>
              <div className="chat-list">
                {chats.filter(c => c.activeTherapist).map(chat => (
                  <div key={chat.id} className="chat-item">
                    <div className="chat-details">
                      <p><strong>User:</strong> {chat.userName || chat.displayName || `User_${chat.userId?.slice(-6)}` || "User"}</p>
                      <p><strong>Therapist:</strong> {chat.activeTherapistName || "Connected"}</p>
                      <p><strong>Last:</strong> {chat.lastMessage || "No messages"}</p>
                    </div>
                    <button onClick={() => forceEndSession(chat.id)} className="end-session-btn">
                      Force End
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === "appeals" && <AppealsTab appeals={appeals} onAppealDecision={handleAppealDecision} />}
          
          {activeTab === "appointments" && (
            <div className="appointments-section">
              {/* Add a dedicated filter state for appointments */}
              <div className="section-header">
                <h2>Appointments ({appointments.length})</h2>
                <div className="search-filter">
                  <select 
                    value={appointmentFilter} 
                    onChange={(e) => setAppointmentFilter(e.target.value)}
                  >
                    <option value="all">All Appointments</option>
                    <option value="pending">Pending</option>
                    <option value="confirmed">Confirmed</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
              </div>

              {/* Filtered list using useMemo */}
              <div className="appointments-list">
                {filteredAppointments.length === 0 ? (
                  <p>No appointments found for this filter.</p>
                ) : (
                  filteredAppointments.map(appt => (
                    <div key={appt.id} className="appointment-card">
                      <div className="appointment-card__header">
                        <div className="appointment-card__user">
                          <div className="avatar-placeholder">
                            {appt.userName?.[0]?.toUpperCase() || "U"}
                          </div>
                          <div>
                            <div className="user-name">
                              {appt.userName || appt.clientName || appt.displayName || "Anonymous User"}
                            </div>
                            <div className="user-id">ID: {appt.userId?.slice(-8) || "N/A"}</div>
                          </div>
                        </div>

                        <div className={`status-badge status-${appt.status || "unknown"}`}>
                          {appt.status ? appt.status.charAt(0).toUpperCase() + appt.status.slice(1) : "Unknown"}
                        </div>
                      </div>

                      <div className="appointment-card__body">
                        <div className="info-row">
                          <span className="label">Therapist</span>
                          <span className="value">{appt.therapistName || "Not assigned"}</span>
                        </div>

                        <div className="info-row highlight">
                          <span className="label">Date & Time</span>
                          <span className="value">
                            {appt.date} at {appt.time}
                          </span>
                        </div>

                        <div className="info-row">
                          <span className="label">Booked on</span>
                          <span className="value">
                            {appt.createdAt?.toDate?.() ? (
                              <>
                                {new Date(appt.createdAt.toDate()).toLocaleDateString("en-US", {
                                  month: "short",
                                  day: "numeric",
                                  year: "numeric",
                                })}{" "}
                                <span className="text-muted">at</span>{" "}
                                {new Date(appt.createdAt.toDate()).toLocaleTimeString("en-US", {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </>
                            ) : (
                              "Just now"
                            )}
                          </span>
                        </div>

                        {appt.reason && (
                          <div className="info-row">
                            <span className="label">Reason</span>
                            <span className="value">"{appt.reason}"</span>
                          </div>
                        )}

                        {appt.notes && (
                          <div className="info-row">
                            <span className="label">Therapist Note</span>
                            <span className="value note">{appt.notes}</span>
                          </div>
                        )}

                        <div className="info-row rating-row">
                          <span className="label">Rating</span>
                          <div className="rating-display">
                            {appt.clientRating ? (
                              <>
                                <span className="stars">
                                  {"★★★★★".substring(5 - appt.clientRating)}
                                  {"☆☆☆☆☆".substring(0, 5 - appt.clientRating)}
                                </span>
                                <span className="rating-number">({appt.clientRating}/5)</span>
                              </>
                            ) : (
                              <span className="text-muted">No rating yet</span>
                            )}
                          </div>
                        </div>

                        {appt.clientComment && (
                          <div className="info-row">
                            <span className="label">Review</span>
                            <div className="review-bubble">"{appt.clientComment}"</div>
                          </div>
                        )}
                      </div>
                      <div className="appointment-actions">
                        {appt.status === "pending" && (
                          <>
                            <button className="btn-confirm" onClick={() => updateAppointmentStatus(appt.id, "confirmed")}>
                              Confirm
                            </button>
                            <button className="btn-cancel" onClick={() => updateAppointmentStatus(appt.id, "cancelled")}>
                              Cancel
                            </button>
                          </>
                        )}
                        {appt.status === "confirmed" && (
                          <button className="btn-complete" onClick={() => updateAppointmentStatus(appt.id, "completed")}>
                            Mark Complete
                          </button>
                        )}
                        {appt.status === "cancelled" && (
                          <span className="status-final">Cancelled</span>
                        )}
                        {appt.status === "completed" && (
                          <span className="status-final">Completed</span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {activeTab === "announcements" && (
            <div className="announcements-section">
              <h2>Send System Announcement</h2>
              <div className="announcement-box">
                <textarea value={announcement} onChange={e => setAnnouncement(e.target.value)} placeholder="Type your announcement..." />
                <button onClick={sendAnnouncement} className="send-announcement-btn">
                  <Send className="icon" /> Send to All Groups
                </button>
              </div>
            </div>
          )}

          {activeTab === "monitor" && (
            <div className="monitor-section">
              <h2>Live Chat Monitoring</h2>
              <div className="monitor-layout">
                <div className="monitor-sidebar">
                  <h3>Active Sessions ({chats.filter(c => c.activeTherapist).length})</h3>
                  <div className="monitor-chat-list">
                    {chats.filter(c => c.activeTherapist).map(chat => (
                      <div
                        key={chat.id}
                        className={`monitor-chat-item ${selectedChat?.id === chat.id ? "selected" : ""}`}
                        onClick={() => setSelectedChat(chat)}
                      >
                        <div>
                          <p><strong>User:</strong> {chat.userName || chat.displayName || `User_${chat.userId?.slice(-6)}` || "User"}</p>
                          <p><strong>Therapist:</strong> {chat.activeTherapistName || "Connected"}</p>
                          <p className="last-msg-preview">
                            {chat.lastMessage ? chat.lastMessage.substring(0, 40) + "..." : "No messages"}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="monitor-main">
                  {selectedChat ? (
                    <>
                      <div className="monitor-chat-header">
                        <div>
                          <h3>Monitoring Chat</h3>
                          <p>User: {selectedChat.userName || selectedChat.userId?.slice(0, 10)} | Therapist: {selectedChat.activeTherapistName}</p>
                        </div>
                        <button onClick={() => setSelectedChat(null)} className="close-monitor-btn">×</button>
                      </div>
                      <div className="monitor-messages">
                        {chatMessages.map(msg => (
                          <div key={msg.id} className={`monitor-message ${msg.role || "user"}`}>
                            <div className="message-bubble">
                              <div className="message-sender">
                                {msg.role === "user" && "User"}
                                {msg.role === "therapist" && "Therapist"}
                                {msg.role === "admin" && "Admin (You)"}
                              </div>
                              <p>{msg.text || msg.message}</p>
                              <span className="message-time">
                                {msg.timestamp?.toDate?.().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) || ""}
                              </span>
                            </div>
                          </div>
                        ))}
                        {isTyping && (
                          <div className="monitor-message therapist">
                            <div className="message-bubble typing">
                              <span className="typing-dots">
                                <span></span><span></span><span></span>
                              </span>
                            </div>
                          </div>
                        )}
                        <div ref={messagesEndRef} />
                      </div>
                      <div className="monitor-input">
                        <input
                          type="text"
                          placeholder="Send hidden message as admin..."
                          value={adminMessage}
                          onChange={e => setAdminMessage(e.target.value)}
                          onKeyPress={e => e.key === "Enter" && sendAdminMessage()}
                        />
                        <button onClick={sendAdminMessage} disabled={!adminMessage.trim()}>
                          <Send size={20} />
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="monitor-placeholder">
                      <Eye size={64} />
                      <h3>Select a chat to monitor</h3>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </section>
      </main>

      {/* Create Therapist Modal */}
      {showCreateTherapist && (
        <div className="modal-overlay" onClick={() => setShowCreateTherapist(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>Create Therapist Account</h2>
            <div className="form-grid">
              <input placeholder="Full Name" value={newTherapist.name} onChange={e => setNewTherapist(p => ({ ...p, name: e.target.value }))} />
              <input placeholder="Email" value={newTherapist.email} onChange={e => setNewTherapist(p => ({ ...p, email: e.target.value }))} />
              <input placeholder="Password" type="password" value={newTherapist.password} onChange={e => setNewTherapist(p => ({ ...p, password: e.target.value }))} />
              <input placeholder="Position" value={newTherapist.position} onChange={e => setNewTherapist(p => ({ ...p, position: e.target.value }))} />
              <select value={newTherapist.gender} onChange={e => setNewTherapist(p => ({ ...p, gender: e.target.value }))}>
                <option>Prefer not to say</option>
                <option>Male</option>
                <option>Female</option>
                <option>Non-Binary</option>
              </select>
            </div>
            <div className="modal-actions">
              <button onClick={createTherapist} className="btn-primary">Create</button>
              <button onClick={() => setShowCreateTherapist(false)} className="btn-secondary">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}