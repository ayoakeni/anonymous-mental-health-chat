import React, { useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Link } from "react-router-dom";
import { auth } from "../../utils/firebase";
import "../../styles/therapistDashboardHome.css";

const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
};

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
}) {
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

  const pendingRequestsCount = useMemo(() => {
   return privateChats.filter(chat => 
     chat.lastMessage && 
     !chat.activeTherapist
   ).length;
  }, [privateChats, therapistInfo.uid]);

  // ────── NOTIFICATION COUNT ──────
  const totalNotifications = useMemo(() => {
    const privateUnread = privateChats.filter(c => c.unreadCountForTherapist > 0).length;
    const groupUnread = groupChats.filter(g => g.unreadCount > 0).length;
    return privateUnread + groupUnread;
  }, [privateChats, groupChats]);

  return (
    <div className="dashboard-home">
      <div className="welcome-header">
        <h2>
          <span className="greeting">{getGreeting()},</span>
          <span className="highlight">{therapistInfo.name || "Therapist"}</span>!
        </h2>
        <div className={`avatarWrapper ${therapistInfo.online ? "online" : ""}`}>
          <Link className="profileLink" element="button" to="/therapist-dashboard/profile">
            {therapistInfo.profileImage ? (
              <img className="avatar" src={therapistInfo.profileImage} alt={therapistInfo.name} />
            ) : (
              <div className="avatarPlaceholder">
                {therapistInfo.name ? therapistInfo.name[0].toUpperCase() : 'T'}
              </div>
            )}
          </Link>
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
          <h4>Active Sessions</h4>
          <p>
            {privateChats.filter(chat => 
              chat.participants?.includes(therapistInfo.uid)
            ).length}
          </p>
        </div>
        <div className={`stat-card highlight ${pendingRequestsCount > 0 ? 'has-pending' : ''}`}>
          <h4>Pending Requests</h4>
          <span className="stat-card-count">
            <p>{pendingRequestsCount}</p>
            {pendingRequestsCount > 0 && <span className="pulse"></span>}
          </span>
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
                {groupChats.slice(0, 3).map(group => (
                  <div
                    key={group.id}
                    className="chat-card"
                    onClick={() => {
                      navigate(`/therapist-dashboard/group-chat/${group.id}`);
                      joinGroupChat(group.id);
                    }}
                  >
                    <div className="chat-card-inner">
                      <div className="chat-avater-content">
                        <span className="therapist-avatar">
                          {group.name[0].toUpperCase()}
                        </span>
                        <div className="chat-card-content">
                          <span className="chat-card-title">{group.name}</span>
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
              {groupChats.length > 3 && (
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
                {privateChats.slice(0, 3).map(chat => (
                  <div
                    key={chat.id}
                    className={`chat-card 
                      ${chat.activeTherapist === therapistInfo.uid ? "active-session" : ""}
                      ${!chat.activeTherapist && chat.unreadCountForTherapist === 0 ? "pending-chat" : ""}`}
                    onClick={() => {
                      navigate(`/therapist-dashboard/private-chat/${chat.id}`);
                      joinPrivateChat(chat.id);
                    }}
                  >
                    <div className="chat-card-inner">
                      <div className="chat-avater-content">
                        <span className="therapist-avatar">
                          {anonNames[chat.id]?.[0]?.toUpperCase() || "A"}
                        </span>
                        <div className="chat-card-content">
                          <span className="chat-card-title">
                            {anonNames[chat.id] || "Anonymous"}
                            {/*  SMART INDICATORS*/}
                            {(() => {
                              const iAmIn = chat.participants?.includes(therapistInfo.uid);
                              const someoneElseIn = chat.participants?.length > 1 && 
                                                  chat.participants?.some(p => p !== chat.userId && p !== therapistInfo.uid);
                              const userHasMessaged = !!chat.lastMessage;
                              const requestedMe = chat.requestedTherapist === therapistInfo.uid;
                              const isOpenPool = !chat.requestedTherapist || chat.requestedTherapist === null;

                              // 1. You are in the chat → Active
                              if (iAmIn) {
                                return <span className="active-indicator"> (Active • You)</span>;
                              }

                              // 2. Someone else took it → Taken
                              if (someoneElseIn) {
                                return <span className="taken-indicator"> (Taken)</span>;
                              }

                              // 3. No one joined yet + user messaged → Pending!
                              if (userHasMessaged) {
                                if (requestedMe) {
                                  return <span className="new-request"> (New Request)</span>;
                                }
                                if (isOpenPool) {
                                  return <span className="available-indicator"> (Available)</span>;
                                }
                              }

                              // Fallback (very rare)
                              return null;
                            })()}
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
              {privateChats.length > 3 && (
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
          <>
            <ul>
              {/* Flatten all notification items into one array, then take first 3 */}
              {(() => {
                const items = [];

                // 1. Private unread (max 2)
                privateChats
                  .filter(chat => chat.unreadCountForTherapist > 0)
                  .slice(0, 2)
                  .forEach(chat =>
                    items.push({
                      key: `unread-${chat.id}`,
                      content: (
                        <li
                          className="notification-item"
                          onClick={() => navigate(`/therapist-dashboard/private-chat/${chat.id}`)}
                        >
                          You have {chat.unreadCountForTherapist} new message{chat.unreadCountForTherapist > 1 ? "s" : ""} in a private chat with {anonNames[chat.id] || "Anonymous"}
                        </li>
                      ),
                    })
                  );

                // Show chats where no therapist is active AND user has sent a message
                privateChats
                  .filter(chat => 
                    !chat.activeTherapist && 
                    chat.lastMessage && 
                    (!chat.unreadCountForTherapist || chat.unreadCountForTherapist === 0)
                  )
                  .slice(0, 2)
                  .forEach(chat =>
                    items.push({
                      key: `request-${chat.id}`,
                      content: (
                        <li className="notification-item new-request" onClick={() => navigate(`/therapist-dashboard/private-chat/${chat.id}`)}>
                          New chat request from {anonNames[chat.id] || "Anonymous"}
                        </li>
                      ),
                    })
                  );

                // 3. Group unread (only 1 summary)
                if (groupChats.some(g => g.unreadCount > 0)) {
                  items.push({
                    key: "group-unread",
                    content: (
                      <li
                        className="notification-item"
                        onClick={() => navigate("/therapist-dashboard/group-chat")}
                      >
                        You have {totalGroupUnread} new message{totalGroupUnread > 1 ? "s" : ""} in Group Chats
                      </li>
                    ),
                  });
                }

                // Slice to max 3 items
                return items.slice(0, 3).map(item => (
                  <React.Fragment key={item.key}>{item.content}</React.Fragment>
                ));
              })()}

              {/* Empty state */}
              {totalNotifications === 0 && <li>No new notifications</li>}
            </ul>

            {/* View All Button – only if > 3 total */}
            {totalNotifications > 3 && (
              <button
                className="view-all"
                onClick={() => navigate("/therapist-dashboard/notifications")}
              >
                View All Notifications
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default TherapistDashboardHome;