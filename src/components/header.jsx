import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { db, auth } from "../utils/firebase";
import { collection, onSnapshot } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import "../styles/header.css";

function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState(0);
  const [therapistsOnline, setTherapistsOnline] = useState(0);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [user, setUser] = useState(null); // Add user state
  const liveIndicatorRef = useRef(null);
  const [isDarkMode, setIsDarkMode] = useState(
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );

  const toggleMenu = () => setIsMenuOpen(!isMenuOpen);

  const toggleDarkMode = () => {
    setIsDarkMode(!isDarkMode);
    document.documentElement.classList.toggle("dark");
  };

  // Scroll effect
  useEffect(() => {
    const handleScroll = () => {
      const header = document.querySelector(".header");
      if (header) {
        header.classList.toggle("scrolled", window.scrollY > 50);
      }
    };

    const raf = requestAnimationFrame(() => {
      window.addEventListener("scroll", handleScroll);
      handleScroll();
    });

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  // Online users count
  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "usersOnline"),
      (snapshot) => {
        const count = snapshot.docs.length;
        const therapists = snapshot.docs.filter((doc) =>
          doc.data().role === "therapist"
        ).length;
        setOnlineUsers(count);
        setTherapistsOnline(therapists);

        if (liveIndicatorRef.current) {
          liveIndicatorRef.current.classList.add("updated");
          setTimeout(() => {
            if (liveIndicatorRef.current) {
              liveIndicatorRef.current.classList.remove("updated");
            }
          }, 500);
        }
      },
      (error) => console.error("Error fetching online users:", error)
    );

    return () => unsubscribe();
  }, []);

  // Dark mode sync
  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (e) => {
      setIsDarkMode(e.matches);
      document.documentElement.classList.toggle("dark", e.matches);
    };
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  // Listen to auth state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  // Unread messages (only if user is logged in)
  useEffect(() => {
    if (!user) {
      setUnreadMessages(0);
      return;
    }

    const path = user.isAnonymous
      ? `anonymousUsers/${user.uid}/messages`
      : `users/${user.uid}/messages`;

    const unsubscribe = onSnapshot(
      collection(db, path),
      (snapshot) => {
        const unread = snapshot.docs.filter((doc) => doc.data().unread).length;
        setUnreadMessages(unread);
      },
      (err) => console.error("Unread messages error:", err)
    );

    return () => unsubscribe();
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

        <nav className={`nav-menu ${isMenuOpen ? "open" : ""}`}>
          <Link to="/" className="nav-link" onClick={() => setIsMenuOpen(false)}>
            Home
          </Link>
          
          {user && (
            <Link
              to={user.isAnonymous ? "/anonymous-dashboard/group-chat" : "/therapist-dashboard/group-chat"}
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
            <Link to="/allTherapist" 
              className="nav-link" 
              onClick={() => setIsMenuOpen(false)}>
              <i className="fas fa-user" aria-hidden="true"></i>
              <span className="sr-only">All Therapists</span>
            </Link>
          ) : null}

          {/* Only show for therapists */}
          {user && !user.isAnonymous && (
            <Link to="/therapist-dashboard" className="nav-link" onClick={() => setIsMenuOpen(false)}>
              Go to Dashboard
            </Link>
          )}

          <button
            className="theme-toggle"
            onClick={toggleDarkMode}
            aria-label={`Switch to ${isDarkMode ? "light" : "dark"} mode`}
          >
            <i className={isDarkMode ? "fas fa-sun" : "fas fa-moon"}></i>
          </button>

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
        </nav>
      </div>
    </header>
  );
}

export default Header;