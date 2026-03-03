import React, { useMemo, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import "../../assets/styles/therapistDashboardHome.css";

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

function TherapistDashboardHome({
  therapistInfo,
  therapistId,
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

  // Scroll — hide on down, reveal on up
  useEffect(() => {
    let lastScrollY = window.scrollY;
    let ticking = false;
    const updateScrollDir = () => {
      const scrollY = window.scrollY;
      const header = document.querySelector(".tdh-header");
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
      if (!ticking) { requestAnimationFrame(updateScrollDir); ticking = true; }
    };
    window.addEventListener("scroll", onScroll);
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const pendingRequestsCount = useMemo(() =>
    privateChats.filter(c => c.lastMessage && !c.activeTherapist).length,
    [privateChats, therapistId]
  );

  const totalNotifications = useMemo(() => {
    const pu = privateChats.filter(c => c.unreadCountForTherapist > 0).length;
    const gu = groupChats.filter(g => g.unreadCount > 0).length;
    return pu + gu;
  }, [privateChats, groupChats]);

  const stats = [
    { label: "Active Chats",      value: groupChats.length + privateChats.length, icon: "fa-comments",        color: "stat-blue"   },
    { label: "Unread Messages",   value: totalGroupUnread + privateUnreadCount,    icon: "fa-envelope",        color: "stat-indigo" },
    { label: "Active Sessions",   value: privateChats.filter(c => c.participants?.includes(therapistId)).length, icon: "fa-circle-dot", color: "stat-green"  },
    { label: "Pending Requests",  value: pendingRequestsCount,                     icon: "fa-clock",           color: "stat-orange", pulse: pendingRequestsCount > 0 },
  ];

  // Build notification items
  const notifItems = useMemo(() => {
    const items = [];
    privateChats
      .filter(c => c.unreadCountForTherapist > 0)
      .slice(0, 2)
      .forEach(chat => items.push({
        key: `unread-${chat.id}`,
        type: "unread",
        icon: "fa-envelope-open-text",
        text: `${chat.unreadCountForTherapist} new message${chat.unreadCountForTherapist > 1 ? "s" : ""} from ${anonNames[chat.id] || "Anonymous"}`,
        path: `/therapist-dashboard/private-chat/${chat.id}`,
      }));
    privateChats
      .filter(c => !c.activeTherapist && c.lastMessage && !c.unreadCountForTherapist)
      .slice(0, 2)
      .forEach(chat => items.push({
        key: `req-${chat.id}`,
        type: "request",
        icon: "fa-user-plus",
        text: `New chat request from ${anonNames[chat.id] || "Anonymous"}`,
        path: `/therapist-dashboard/private-chat/${chat.id}`,
      }));
    if (groupChats.some(g => g.unreadCount > 0))
      items.push({
        key: "group-unread",
        type: "group",
        icon: "fa-users",
        text: `${totalGroupUnread} new message${totalGroupUnread > 1 ? "s" : ""} in group chats`,
        path: "/therapist-dashboard/group-chat",
      });
    return items.slice(0, 4);
  }, [privateChats, groupChats, anonNames, totalGroupUnread]);

  return (
    <div className="tdh-root">

      {/* ── HEADER ── */}
      <header className="tdh-header">
        <div className="tdh-header-inner">
          <div className="tdh-header-text">
            <p className="tdh-eyebrow">
              <i className={`fa-solid ${getGreetingIcon()} tdh-eyebrow-icon`} />
              {getGreeting()}
            </p>
            <h1 className="tdh-heading">
              {therapistInfo.name || "Therapist"}
            </h1>
            <p className="tdh-subtext">Here's what's happening with your sessions today.</p>
          </div>

          <div className="tdh-header-actions">
            <div className="tdh-date-chip">
              <i className="fa-regular fa-calendar tdh-chip-icon" />
              {new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
            </div>

            <Link to="/therapist-dashboard/profile" className={`tdh-avatar-link ${therapistInfo.online ? "online" : ""}`}>
              {therapistInfo.profileImage ? (
                <img className="tdh-avatar-img" src={therapistInfo.profileImage} alt={therapistInfo.name} />
              ) : (
                <div className="tdh-avatar-fallback">
                  {therapistInfo.name ? therapistInfo.name[0].toUpperCase() : "T"}
                </div>
              )}
              {therapistInfo.online && <span className="tdh-online-ring" />}
              <span className="tdh-avatar-overlay">
                <i className="fa-solid fa-pen tdh-edit-icon" />
              </span>
            </Link>
          </div>
        </div>
        <div className="tdh-header-rule" />
      </header>

      {/* ── STATS ── */}
      <section className="tdh-stats-row">
        {stats.map((s, i) => (
          <div key={s.label} className={`tdh-stat ${s.color} ${s.pulse ? "is-urgent" : ""}`} style={{ animationDelay: `${i * 0.07}s` }}>
            <div className="tdh-stat-icon-wrap">
              <i className={`fa-solid ${s.icon}`} />
            </div>
            <div className="tdh-stat-content">
              <span className="tdh-stat-num">
                {s.value}
                {s.pulse && s.value > 0 && <span className="tdh-urgent-dot" />}
              </span>
              <span className="tdh-stat-lbl">{s.label}</span>
            </div>
            <div className="tdh-stat-bg-icon">
              <i className={`fa-solid ${s.icon}`} />
            </div>
          </div>
        ))}
      </section>

      {/* ── BODY GRID ── */}
      <div className="tdh-body-grid">

        {/* Group Chats */}
        <div className="tdh-panel">
          <div className="tdh-panel-header">
            <span className="tdh-panel-icon-wrap group">
              <i className="fa-solid fa-users" />
            </span>
            <div>
              <p className="tdh-panel-eyebrow">Channels</p>
              <h2 className="tdh-panel-title">Group Chats</h2>
            </div>
            {groupChats.length > 0 && (
              <span className="tdh-panel-count">{groupChats.length}</span>
            )}
          </div>

          {isLoadingChats ? (
            <div className="tdh-skeleton-list">
              {[1,2,3].map(n => <div key={n} className="tdh-skeleton" />)}
            </div>
          ) : groupChats.length === 0 ? (
            <div className="tdh-empty-state">
              <i className="fa-regular fa-comment-dots tdh-empty-icon" />
              <p>No group chats yet</p>
            </div>
          ) : (
            <>
              <ul className="tdh-chat-list">
                {groupChats.slice(0, 3).map((group, i) => (
                  <li
                    key={group.id}
                    className="tdh-chat-row"
                    style={{ animationDelay: `${0.1 + i * 0.06}s` }}
                    onClick={() => { navigate(`/therapist-dashboard/group-chat/${group.id}`); joinGroupChat(group.id); }}
                  >
                    <div className="tdh-row-avatar group">
                      {group.name[0].toUpperCase()}
                    </div>
                    <div className="tdh-row-body">
                      <span className="tdh-row-name">{group.name}</span>
                      <span className="tdh-row-preview">
                        <i className="fa-regular fa-message tdh-preview-icon" />
                        {group.lastMessage?.text || "No messages yet"}
                      </span>
                    </div>
                    <div className="tdh-row-meta">
                      <span className="tdh-row-time">
                        {formatTimestamp(group.lastMessage?.timestamp)?.dateStr}
                      </span>
                      {(() => {
                        const u = group.unreadCount?.[therapistId] || 0;
                        return u > 0 && <span className="tdh-unread-pill">{u}</span>;
                      })()}
                    </div>
                  </li>
                ))}
              </ul>
              {groupChats.length > 3 && (
                <button className="tdh-see-all" onClick={() => navigate("/therapist-dashboard/group-chat")}>
                  <i className="fa-solid fa-arrow-right" /> View all {groupChats.length} chats
                </button>
              )}
            </>
          )}
        </div>

        {/* Private Chats */}
        <div className="tdh-panel">
          <div className="tdh-panel-header">
            <span className="tdh-panel-icon-wrap private">
              <i className="fa-solid fa-lock" />
            </span>
            <div>
              <p className="tdh-panel-eyebrow">1-on-1</p>
              <h2 className="tdh-panel-title">Private Chats</h2>
            </div>
            {privateChats.length > 0 && (
              <span className="tdh-panel-count">{privateChats.length}</span>
            )}
          </div>

          {isLoadingChats || isLoadingNames ? (
            <div className="tdh-skeleton-list">
              {[1,2,3].map(n => <div key={n} className="tdh-skeleton" />)}
            </div>
          ) : privateChats.length === 0 ? (
            <div className="tdh-empty-state">
              <i className="fa-regular fa-comments tdh-empty-icon" />
              <p>No private chats yet</p>
            </div>
          ) : (
            <>
              <ul className="tdh-chat-list">
                {privateChats.slice(0, 3).map((chat, i) => {
                  const iAmIn       = chat.participants?.includes(therapistId);
                  const takenByOther = chat.activeTherapist && chat.activeTherapist !== therapistId;
                  const noOneIn     = !chat.activeTherapist;
                  const hasMsg      = !!chat.lastMessage;

                  let tag = null;
                  if (iAmIn)
                    tag = <span className="tdh-tag active"><i className="fa-solid fa-circle-dot" /> Active</span>;
                  else if (takenByOther)
                    tag = <span className="tdh-tag taken"><i className="fa-solid fa-ban" /> Taken</span>;
                  else if (noOneIn && hasMsg)
                    tag = chat.requestedTherapist === therapistId
                      ? <span className="tdh-tag request"><i className="fa-solid fa-bell" /> New Request</span>
                      : <span className="tdh-tag available"><i className="fa-solid fa-circle-check" /> Available</span>;

                  return (
                    <li
                      key={chat.id}
                      className={`tdh-chat-row ${iAmIn ? "row-active" : ""} ${!chat.activeTherapist && !chat.unreadCountForTherapist ? "row-pending" : ""}`}
                      style={{ animationDelay: `${0.1 + i * 0.06}s` }}
                      onClick={() => { navigate(`/therapist-dashboard/private-chat/${chat.id}`); joinPrivateChat(chat.id); }}
                    >
                      <div className={`tdh-row-avatar private ${iAmIn ? "glow" : ""}`}>
                        {anonNames[chat.id]?.[0]?.toUpperCase() || "A"}
                      </div>
                      <div className="tdh-row-body">
                        <span className="tdh-row-name">
                          {anonNames[chat.id] || "Anonymous"}
                          {tag}
                        </span>
                        <span className="tdh-row-preview">
                          <i className="fa-regular fa-message tdh-preview-icon" />
                          {chat.lastMessage || "No messages yet"}
                        </span>
                      </div>
                      <div className="tdh-row-meta">
                        <span className="tdh-row-time">
                          {formatTimestamp(chat.lastUpdated)?.dateStr}
                        </span>
                        {chat.unreadCountForTherapist > 0 && (
                          <span className="tdh-unread-pill">{chat.unreadCountForTherapist}</span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
              {privateChats.length > 3 && (
                <button className="tdh-see-all" onClick={() => navigate("/therapist-dashboard/private-chat")}>
                  <i className="fa-solid fa-arrow-right" /> View all {privateChats.length} chats
                </button>
              )}
            </>
          )}
        </div>

        {/* Notifications */}
        <div className="tdh-panel tdh-notif-panel">
          <div className="tdh-panel-header">
            <span className="tdh-panel-icon-wrap notif">
              <i className="fa-solid fa-bell" />
            </span>
            <div>
              <p className="tdh-panel-eyebrow">Alerts</p>
              <h2 className="tdh-panel-title">Notifications</h2>
            </div>
            {totalNotifications > 0 && (
              <span className="tdh-panel-count urgent">{totalNotifications}</span>
            )}
          </div>

          {isLoadingChats ? (
            <div className="tdh-skeleton-list">
              {[1,2].map(n => <div key={n} className="tdh-skeleton" />)}
            </div>
          ) : notifItems.length === 0 ? (
            <div className="tdh-empty-state">
              <i className="fa-regular fa-bell-slash tdh-empty-icon" />
              <p>You're all caught up!</p>
            </div>
          ) : (
            <>
              <ul className="tdh-notif-list">
                {notifItems.map((item, i) => (
                  <li
                    key={item.key}
                    className={`tdh-notif-item notif-${item.type}`}
                    style={{ animationDelay: `${0.1 + i * 0.06}s` }}
                    onClick={() => navigate(item.path)}
                  >
                    <span className="tdh-notif-icon-wrap">
                      <i className={`fa-solid ${item.icon}`} />
                    </span>
                    <span className="tdh-notif-text">{item.text}</span>
                    <i className="fa-solid fa-chevron-right tdh-notif-arrow" />
                  </li>
                ))}
              </ul>
              {totalNotifications > 4 && (
                <button className="tdh-see-all" onClick={() => navigate("/therapist-dashboard/notifications")}>
                  <i className="fa-solid fa-arrow-right" /> View all notifications
                </button>
              )}
            </>
          )}
        </div>

      </div>
    </div>
  );
}

export default TherapistDashboardHome;