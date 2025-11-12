import { useState, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import '../styles/sidebar.css';

const Sidebar = ({
  groupUnreadCount,
  privateUnreadCount,
  onLogout,
  isAnonymous = false,
}) => {

  // Detect device size *once* on mount
  const [isMobile, setIsMobile] = useState(false);
  const [isOpen, setIsOpen] = useState(true); // default for desktop
  const location = useLocation();
  const sidebarRef = useRef(null);

  useEffect(() => {
    const check = () => {
      const mobile = window.innerWidth <= 480;
      setIsMobile(mobile);
      // mobile → always start closed (bottom bar)
      setIsOpen(!mobile);
    };

    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Toggle (desktop only)
  const toggleSidebar = () => {
    if (isMobile) return; // ignore on mobile
    setIsOpen(prev => !prev);
  };

  // Click-outside – **desktop only**
  useEffect(() => {
    if (isMobile) return;

    const handleClickOutside = event => {
      if (
        isOpen &&
        sidebarRef.current &&
        !sidebarRef.current.contains(event.target)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, isMobile]);

  return (
    <div
      className={`sidebar ${isOpen ? 'open' : 'closed'}`}
      ref={sidebarRef}
    >
      {/* Toggle button – **desktop only** */}
      {!isMobile && (
        <button
          className="toggle-btn"
          onClick={toggleSidebar}
          aria-label="Toggle Sidebar"
        >
          <i className={`fas ${isOpen ? 'fa-times' : 'fa-bars'}`}></i>
        </button>
      )}

      <div className="list">
        {/* ---------- Dashboard ---------- */}
        <Link
          data-tooltip="Dashboard"
          to={isAnonymous ? '/anonymous-dashboard' : '/therapist-dashboard'}
        >
          <span
            role="button"
            aria-label="Dashboard"
            tabIndex="0"
            className={`iconBadge ${
              location.pathname ===
              (isAnonymous ? '/anonymous-dashboard' : '/therapist-dashboard')
                ? 'active'
                : ''
            }`}
          >
            <i className="fas fa-home"></i>
            {isOpen && <span className="link-text">Dashboard</span>}
          </span>
        </Link>

        {/* ---------- Group Chat ---------- */}
        <Link
          data-tooltip="Group Chat"
          to={
            isAnonymous
              ? '/anonymous-dashboard/group-chat'
              : '/therapist-dashboard/group-chat'
          }
        >
          <span
            role="button"
            aria-label="Group Chat"
            tabIndex="0"
            className={`iconBadge ${
              location.pathname ===
              (isAnonymous
                ? '/anonymous-dashboard/group-chat'
                : '/therapist-dashboard/group-chat')
                ? 'active'
                : ''
            }`}
          >
            <i className="fas fa-users"></i>
            {isOpen && <span className="link-text">Group Chat</span>}
            {groupUnreadCount > 0 && (
              <span className="badge">{groupUnreadCount}</span>
            )}
          </span>
        </Link>

        {/* ---------- Private Chat ---------- */}
        <Link
          data-tooltip="Private Chat"
          to={
            isAnonymous
              ? '/anonymous-dashboard/private-chat'
              : '/therapist-dashboard/private-chat'
          }
        >
          <span
            role="button"
            aria-label="Private Chat"
            tabIndex="0"
            className={`iconBadge ${
              location.pathname ===
              (isAnonymous
                ? '/anonymous-dashboard/private-chat'
                : '/therapist-dashboard/private-chat')
                ? 'active'
                : ''
            }`}
          >
            <i className="fas fa-comment"></i>
            {isOpen && <span className="link-text">Private Chat</span>}
            {privateUnreadCount > 0 && (
              <span className="badge">{privateUnreadCount}</span>
            )}
          </span>
        </Link>

        {/* ---------- Appointments ---------- */}
        <Link
          data-tooltip="Appointments"
          to={
            isAnonymous
              ? '/anonymous-dashboard/appointments-list'
              : '/therapist-dashboard/appointments'
          }
        >
          <span
            role="button"
            aria-label="Appointments"
            tabIndex="0"
            className={`iconBadge ${
              location.pathname ===
              (isAnonymous
                ? '/anonymous-dashboard/appointments-list'
                : '/therapist-dashboard/appointments')
                ? 'active'
                : ''
            }`}
          >
            <i className="fas fa-calendar"></i>
            {isOpen && <span className="link-text">Appointments</span>}
          </span>
        </Link>

        {/* ---------- Therapist-only items ---------- */}
        {!isAnonymous && (
          <>
            <Link data-tooltip="Notification" to="/therapist-dashboard/notifications">
              <span
                role="button"
                aria-label="Notification"
                tabIndex="0"
                className={`iconBadge ${
                  location.pathname === '/therapist-dashboard/notifications'
                    ? 'active'
                    : ''
                }`}
              >
                <i className="fas fa-bell"></i>
                {isOpen && <span className="link-text">Notification</span>}
                {(privateUnreadCount + groupUnreadCount) > 0 && (
                  <span className="badge">
                    {privateUnreadCount + groupUnreadCount}
                  </span>
                )}
              </span>
            </Link>

            <Link data-tooltip="Profile" to="/therapist-dashboard/profile">
              <span
                role="button"
                aria-label="Profile"
                tabIndex="0"
                className={`iconBadge ${
                  location.pathname === '/therapist-dashboard/profile'
                    ? 'active'
                    : ''
                }`}
              >
                <i className="fas fa-user"></i>
                {isOpen && <span className="link-text">Profile</span>}
              </span>
            </Link>

            <Link data-tooltip="Settings" to="/therapist-dashboard/settings">
              <span
                role="button"
                aria-label="Settings"
                tabIndex="0"
                className={`iconBadge ${
                  location.pathname === '/therapist-dashboard/settings'
                    ? 'active'
                    : ''
                }`}
              >
                <i className="fas fa-cog"></i>
                {isOpen && <span className="link-text">Settings</span>}
              </span>
            </Link>

            <div className="divider"></div>

            <span className="logOut" data-tooltip="Logout">
              <span
                role="button"
                aria-label="Logout"
                tabIndex="0"
                onClick={onLogout}
                className="iconBadge"
              >
                <i className="fas fa-sign-out-alt"></i>
                {isOpen && <span className="link-text">Logout</span>}
              </span>
            </span>
          </>
        )}
      </div>

      <Link className="logo-side" to="/">
        <img
          src="/anonymous-logo.png"
          alt="Anonymous Mental Health Support Logo"
          className="logo-image"
        />
      </Link>
    </div>
  );
};

export default Sidebar;