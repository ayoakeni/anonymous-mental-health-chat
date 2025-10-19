import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { db, auth } from "../utils/firebase";
import { collection, onSnapshot } from "firebase/firestore";
import "../styles/home.css";

function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState(0);
  const [therapistsOnline, setTherapistsOnline] = useState(0);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [isDarkMode, setIsDarkMode] = useState(
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  const toggleDarkMode = () => {
    setIsDarkMode(!isDarkMode);
    document.documentElement.classList.toggle("dark");
  };

  useEffect(() => {
    const handleScroll = () => {
      document.querySelector(".header").classList.toggle("scrolled", window.scrollY > 50);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Fetch online users count from Firestore
  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "usersOnline"),
      (snapshot) => {
        const count = snapshot.docs.length;
        const therapists = snapshot.docs.filter((doc) =>
          doc.data().role === "therapist").length;
        setOnlineUsers(count);
        setTherapistsOnline(therapists);
        const indicator = document.querySelector(".live-indicator");
        if (indicator) {
          indicator.classList.add("updated");
          setTimeout(() => indicator.classList.remove("updated"), 500);
        }
      },
      (error) => {
        console.error("Error fetching online users:", error);
      }
    );

    return () => unsubscribe();
  }, []);

  // Sync dark mode with system preference changes
  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (e) => {
      setIsDarkMode(e.matches);
      document.documentElement.classList.toggle("dark", e.matches);
    };
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  useEffect(() => {
    const unsubscribeMessages = onSnapshot(
      collection(db, `users/${auth.currentUser?.uid}/messages`),
      (snapshot) => {
        const unread = snapshot.docs.filter(doc => doc.data().unread).length;
        setUnreadMessages(unread);
      }
    );
    return () => unsubscribeMessages();
  }, []);

  return (
    <header className="header">
      <div className="header-container">
        <div className="logo">
          <Link to="/">
            <img
              src="/anonymous-logo.png"
              alt="Anonymous Mental Health Support Logo"
              className="logo-image"
            />
          </Link>
        </div>
        <button
          className="menu-toggle"
          onClick={toggleMenu}
          aria-label="Toggle navigation menu"
          aria-expanded={isMenuOpen}
        >
          <i className={isMenuOpen ? "fas fa-times" : "fas fa-bars"}></i>
        </button>
        <nav className={`nav-menu ${isMenuOpen ? "open" : ""}`}>
          <Link
            to="/"
            className="nav-link"
            onClick={() => setIsMenuOpen(false)}
          >
            Home
          </Link>
          <Link
            to="/anonymous-dashboard/group-chat"
            className="nav-link"
            onClick={() => setIsMenuOpen(false)}
          >
            Chatroom {unreadMessages > 0 && <span className="badge">{unreadMessages}</span>}
          </Link>
          <Link
            to="/about"
            className="nav-link"
            onClick={() => setIsMenuOpen(false)}
          >
            About
          </Link>
          <Link
            to="/allTherapist"
            className="nav-link"
            onClick={() => setIsMenuOpen(false)}
          >
            <i className="fas fa-user" aria-hidden="true"></i>
            <span className="sr-only">All Therapist</span>
          </Link>
          <button
            className="theme-toggle"
            onClick={toggleDarkMode}
            aria-label={`Switch to ${isDarkMode ? "light" : "dark"} mode`}
          >
            <i className={isDarkMode ? "fas fa-sun" : "fas fa-moon"}></i>
          </button>
          <div
            className="live-indicator"
            title={`${onlineUsers} users online (${therapistsOnline} therapists, ${onlineUsers - therapistsOnline} peers)`}
            role="status"
            aria-live="polite"
          >
            <i className="fas fa-circle live-indicator-icon"></i>
            <span>{onlineUsers} users online</span>
          </div>
        </nav>
      </div>
    </header>
  );
}

export default Header;