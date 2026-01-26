import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { db, auth } from "../utils/firebase";
import { collection, onSnapshot } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { useTheme } from "../context/ThemeContext";
import { useOnlineCount } from "../hooks/useOnlineCount";
import "../assets/styles/header.css";

function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const toggleMenu = () => setIsMenuOpen(!isMenuOpen);
  const { isDarkMode, toggleDarkMode } = useTheme();
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [user, setUser] = useState(null);
  const onlineCount = useOnlineCount();

  useEffect(() => {
    const handleClickOutside = (event) => {
      const toggleButton = document.querySelector('.menu-toggle');
      if (toggleButton && toggleButton.contains(event.target)) {
        return;
      }
      
      if (isMenuOpen && menuRef.current && !menuRef.current.contains(event.target)) {
        setIsMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isMenuOpen]);

  // Scroll effect
  useEffect(() => {
    let lastScrollY = window.scrollY;
    let ticking = false;

    const updateScrollDir = () => {
      const scrollY = window.scrollY;
      const header = document.querySelector('.header');
      if (!header) return;

      if (scrollY <= 0) {
        header.classList.remove('hidden', 'scrolled');
      } else if (scrollY > lastScrollY && scrollY > 20) {
        // Scrolling DOWN
        header.classList.add('hidden', 'scrolled');
      } else if (scrollY < lastScrollY) {
        // Scrolling UP
        header.classList.remove('hidden');
        header.classList.toggle('scrolled', scrollY > 10);
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

        <nav ref={menuRef} className={`nav-menu ${isMenuOpen ? "open" : ""}`}>
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
          
          {/* Only show for anonymous */}
          {/* {!user || user.isAnonymous ? (
            <Link to="/find-therapist" 
              className="nav-link" 
              onClick={() => setIsMenuOpen(false)}>
              <span className="nav-link-find-therapist">
                <i className="fas fa-user" aria-hidden="true"></i>
                Find a Therapists
              </span>
            </Link>
          ) : null} */}

          <div
            className="live-indicator"
            title={`${onlineCount} user${onlineCount !== 1 ? 's' : ''} online`}
            role="status"
            aria-live="polite"
          >
            <i className="fas fa-circle live-indicator-icon"></i>
            <span>{onlineCount} user{onlineCount !== 1 ? 's' : ''} online</span>
          </div>

          {/* Therapist Mode Badge — only on public pages */}
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