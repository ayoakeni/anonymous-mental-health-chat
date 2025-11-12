import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { db, auth } from "../utils/firebase";
import { collection, onSnapshot } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import "../styles/header.css";

function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const [onlineUsers, setOnlineUsers] = useState(0);
  const [therapistsOnline, setTherapistsOnline] = useState(0);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [user, setUser] = useState(null);
  const liveIndicatorRef = useRef(null);
  const [isDarkMode, setIsDarkMode] = useState(
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );

  const toggleMenu = () => setIsMenuOpen(prev => !prev);

  const toggleDarkMode = () => {
    setIsDarkMode(prev => !prev);
    document.documentElement.classList.toggle("dark");
  };

  // Close menu on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (
        isMenuOpen &&
        menuRef.current &&
        !menuRef.current.contains(e.target) &&
        !e.target.closest(".menu-toggle")
      ) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isMenuOpen]);

  // Scroll: hide/show header (ignores Chrome address bar)
  useEffect(() => {
    let lastY = 0;
    let ticking = false;

    const update = () => {
      const vv = window.visualViewport;
      const currentY = vv ? vv.offsetTop : window.scrollY;
      const header = document.querySelector(".header");
      if (!header) return;

      const delta = 5;
      const hideAfter = 20;

      if (Math.abs(currentY - lastY) < delta) {
        ticking = false;
        return;
      }

      if (currentY > lastY && currentY > hideAfter) {
        header.classList.add("hidden");
      } else {
        header.classList.remove("hidden");
      }

      header.classList.toggle("scrolled", currentY > 50);
      lastY = currentY;
      ticking = false;
    };

    const onChange = () => {
      if (!ticking) {
        requestAnimationFrame(update);
        ticking = true;
      }
    };

    const vv = window.visualViewport;
    vv?.addEventListener("scroll", onChange);
    vv?.addEventListener("resize", onChange);
    window.addEventListener("scroll", onChange);

    onChange();

    return () => {
      vv?.removeEventListener("scroll", onChange);
      vv?.removeEventListener("resize", onChange);
      window.removeEventListener("scroll", onChange);
    };
  }, []);

  // Online users
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "usersOnline"),
      (snap) => {
        const count = snap.docs.length;
        const therapists = snap.docs.filter(d => d.data().role === "therapist").length;
        setOnlineUsers(count);
        setTherapistsOnline(therapists);

        liveIndicatorRef.current?.classList.add("updated");
        setTimeout(() => liveIndicatorRef.current?.classList.remove("updated"), 500);
      },
      console.error
    );
    return unsub;
  }, []);

  // Dark mode sync
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e) => {
      setIsDarkMode(e.matches);
      document.documentElement.classList.toggle("dark", e.matches);
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Auth
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, setUser);
    return unsub;
  }, []);

  // Unread messages
  useEffect(() => {
    if (!user) {
      setUnreadMessages(0);
      return;
    }
    const path = user.isAnonymous
      ? `anonymousUsers/${user.uid}/messages`
      : `users/${user.uid}/messages`;

    const unsub = onSnapshot(
      collection(db, path),
      (snap) => {
        const unread = snap.docs.filter(d => d.data().unread).length;
        setUnreadMessages(unread);
      },
      console.error
    );
    return unsub;
  }, [user]);

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

        <nav ref={menuRef} className={`nav-menu ${isMenuOpen ? "open" : ""}`}>
          <Link to="/" className="nav-link" onClick={() => setIsMenuOpen(false)}>
            Home
          </Link>

          {user && (
            <Link
              to={
                user.isAnonymous
                  ? "/anonymous-dashboard/group-chat"
                  : "/therapist-dashboard/group-chat"
              }
              className="nav-link"
              onClick={() => setIsMenuOpen(false)}
            >
              Chatroom {unreadMessages > 0 && <span className="badge">{unreadMessages}</span>}
            </Link>
          )}

          <Link to="/about" className="nav-link" onClick={() => setIsMenuOpen(false)}>
            About
          </Link>

          {!user || user.isAnonymous ? (
            <Link to="/allTherapist" className="nav-link" onClick={() => setIsMenuOpen(false)}>
              <i className="fas fa-user" aria-hidden="true"></i>
              <span className="sr-only">All Therapists</span>
            </Link>
          ) : null}

          <div
            ref={liveIndicatorRef}
            className="live-indicator"
            title={`${onlineUsers} users online (${therapistsOnline} therapists, ${onlineUsers - therapistsOnline} peers)`}
            role="status"
            aria-live="polite"
          >
            <i className="fas fa-circle live-indicator-icon"></i>
            <span>{onlineUsers} users online</span>
          </div>

          {user && !user.isAnonymous && (
            <div className="therapist-badge">
              <Link
                to="/therapist-dashboard"
                className="therapist-badge-link"
                onClick={() => setIsMenuOpen(false)}
              >
                <i className="fas fa-user-md"></i>
                Therapist Mode
              </Link>
            </div>
          )}

          <button
            className="theme-toggle"
            onClick={toggleDarkMode}
            aria-label={`Switch to ${isDarkMode ? "light" : "dark"} mode`}
          >
            <i className={isDarkMode ? "fas fa-sun" : "fas fa-moon"}></i>
          </button>
        </nav>
      </div>
    </header>
  );
}

export default Header;