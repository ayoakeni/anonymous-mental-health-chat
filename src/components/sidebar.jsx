import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import '../styles/sidebar.css';

const Sidebar = ({ groupUnreadCount, privateUnreadCount, onLogout }) => {
  const [isOpen, setIsOpen] = useState(true);
  const location = useLocation();
  const sidebarRef = useRef(null);

  const toggleSidebar = () => {
    setIsOpen(!isOpen);
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (isOpen && sidebarRef.current && !sidebarRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  return (
    <div className={`sidebar ${isOpen ? 'open' : 'closed'}`} ref={sidebarRef}>
      <button className="toggle-btn" onClick={toggleSidebar} aria-label="Toggle Sidebar">
        <i className={`fas ${isOpen ? 'fa-times' : 'fa-bars'}`}></i>
      </button>
      <div className="list">
        <Link to="/therapist-dashboard">
          <span
            role="button"
            aria-label="Dashboard"
            tabIndex="0"
            className={`iconBadge ${location.pathname === '/therapist-dashboard' ? 'active' : ''}`}
            data-tooltip="Dashboard"
          >
            <i className="fas fa-home"></i>
            {isOpen && <span className="link-text">Dashboard</span>}
          </span>
        </Link>
        <Link to="/therapist-dashboard/group-chat">
          <span
            role="button"
            aria-label="Group Chat"
            tabIndex="0"
            className={`iconBadge ${location.pathname === '/therapist-dashboard/group-chat' ? 'active' : ''}`}
            data-tooltip="Group Chat"
          >
            <i className="fas fa-users"></i>
            {isOpen && <span className="link-text">Group Chat</span>}
            {groupUnreadCount > 0 && <span className="badge">{groupUnreadCount}</span>}
          </span>
        </Link>
        <Link to="/therapist-dashboard/private-chat">
          <span
            role="button"
            aria-label="Private Chat"
            tabIndex="0"
            className={`iconBadge ${location.pathname === '/therapist-dashboard/private-chat' ? 'active' : ''}`}
            data-tooltip="Private Chat"
          >
            <i className="fas fa-comment"></i>
            {isOpen && <span className="link-text">Private Chat</span>}
            {privateUnreadCount > 0 && <span className="badge">{privateUnreadCount}</span>}
          </span>
        </Link>
        <Link to="/therapist-dashboard/appointments">
          <span
            role="button"
            aria-label="Appointments"
            tabIndex="0"
            className={`iconBadge ${location.pathname === '/therapist-dashboard/appointments' ? 'active' : ''}`}
            data-tooltip="Appointments"
          >
            <i className="fas fa-calendar"></i>
            {isOpen && <span className="link-text">Appointments</span>}
          </span>
        </Link>
        <Link to="/therapist-dashboard/clients">
          <span
            role="button"
            aria-label="Clients"
            tabIndex="0"
            className={`iconBadge ${location.pathname === '/therapist-dashboard/clients' ? 'active' : ''}`}
            data-tooltip="Clients"
          >
            <i className="fas fa-user-friends"></i>
            {isOpen && <span className="link-text">Clients</span>}
          </span>
        </Link>
        <Link to="/therapist-dashboard/notifications">
          <span
            role="button"
            aria-label="Notification"
            tabIndex="0"
            className={`iconBadge ${location.pathname === '/therapist-dashboard/notifications' ? 'active' : ''}`}
            data-tooltip="Notification"
          >
            <i className="fas fa-bell"></i>
            {isOpen && <span className="link-text">Notification</span>}
            {privateUnreadCount + groupUnreadCount > 0 && (
              <span className="badge">{privateUnreadCount + groupUnreadCount}</span>
            )}
          </span>
        </Link>
        <Link to="/therapist-dashboard/profile">
          <span
            role="button"
            aria-label="Profile"
            tabIndex="0"
            className={`iconBadge ${location.pathname === '/therapist-dashboard/profile' ? 'active' : ''}`}
            data-tooltip="Profile"
          >
            <i className="fas fa-user"></i>
            {isOpen && <span className="link-text">Profile</span>}
          </span>
        </Link>
        <Link to="/therapist-dashboard/settings">
          <span
            role="button"
            aria-label="Settings"
            tabIndex="0"
            className={`iconBadge ${location.pathname === '/therapist-dashboard/settings' ? 'active' : ''}`}
            data-tooltip="Settings"
          >
            <i className="fas fa-cog"></i>
            {isOpen && <span className="link-text">Settings</span>}
          </span>
        </Link>
        <div className="divider"></div>
        <span
          role="button"
          aria-label="Logout"
          tabIndex="0"
          onClick={onLogout}
          className={`iconBadge ${location.pathname === '/therapist-dashboard/logout' ? 'active' : ''}`}
          data-tooltip="Logout"
        >
          <i className="fas fa-sign-out-alt"></i>
          {isOpen && <span className="link-text">Logout</span>}
        </span>
      </div>
    </div>
  );
};

export default Sidebar;