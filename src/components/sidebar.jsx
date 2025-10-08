import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import '../styles/sidebar.css';

const Sidebar = ({ groupUnreadCount, privateUnreadCount, onLogout }) => {
  const [isOpen, setIsOpen] = useState(true); // Default to open
  const location = useLocation();

  const toggleSidebar = () => {
    setIsOpen(!isOpen);
  };

  return (
    <div className={`sidebar ${isOpen ? 'open' : 'closed'}`}>
      <button className="toggle-btn" onClick={toggleSidebar} aria-label="Toggle Sidebar">
        <i className={`fas ${isOpen ? 'fa-times' : 'fa-bars'}`}></i>
      </button>
      <div className="list">
        <Link to="/therapist-dashboard">
          <span
            role="button"
            aria-label="Dashboard"
            tabIndex="0"
            className={location.pathname === '/therapist-dashboard' ? 'active' : ''}
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
            className={location.pathname === '/therapist-dashboard/group-chat' ? 'active' : ''}
          >
            <i className="fas fa-users"></i>
            {isOpen && (
              <>
                <span className="link-text">Group Chat</span>
                {groupUnreadCount > 0 && <span className="badge">{groupUnreadCount}</span>}
              </>
            )}
          </span>
        </Link>
        <Link to="/therapist-dashboard/private-chat">
          <span
            role="button"
            aria-label="Private Chat"
            tabIndex="0"
            className={location.pathname === '/therapist-dashboard/private-chat' ? 'active' : ''}
          >
            <i className="fas fa-comment"></i>
            {isOpen && (
              <>
                <span className="link-text">Private Chat</span>
                {privateUnreadCount > 0 && <span className="badge">{privateUnreadCount}</span>}
              </>
            )}
          </span>
        </Link>
        <Link to="/therapist-dashboard/appointments">
          <span
            role="button"
            aria-label="Appointments"
            tabIndex="0"
            className={location.pathname === '/therapist-dashboard/appointments' ? 'active' : ''}
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
            className={location.pathname === '/therapist-dashboard/clients' ? 'active' : ''}
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
            className={location.pathname === '/therapist-dashboard/notifications' ? 'active' : ''}
          >
            <i className="fas fa-bell"></i>
            {isOpen && (
              <>
                <span className="link-text">Notification</span>
                {privateUnreadCount + groupUnreadCount > 0 && (
                  <span className="badge">{privateUnreadCount + groupUnreadCount}</span>
                )}
              </>
            )}
          </span>
        </Link>
        <Link to="/therapist-dashboard/profile">
          <span
            role="button"
            aria-label="Profile"
            tabIndex="0"
            className={location.pathname === '/therapist-dashboard/profile' ? 'active' : ''}
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
            className={location.pathname === '/therapist-dashboard/settings' ? 'active' : ''}
          >
            <i className="fas fa-cog"></i>
            {isOpen && <span className="link-text">Settings</span>}
          </span>
        </Link>
        <span
          role="button"
          aria-label="Logout"
          tabIndex="0"
          onClick={onLogout}
          className="logout-button"
        >
          <i className="fas fa-sign-out-alt"></i>
          {isOpen && <span className="link-text">Logout</span>}
        </span>
      </div>
    </div>
  );
};

export default Sidebar;