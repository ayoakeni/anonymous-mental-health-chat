import { useEffect, useState, useRef, useCallback, createContext } from "react";
import {
  Routes,
  Route,
  Navigate,
  useLocation,
  useNavigate,
  Link,
} from "react-router-dom";
import { onAuthStateChanged, signOut } from "firebase/auth";
import {
  doc,
  getDoc,
  onSnapshot,
} from "firebase/firestore";
import { auth, db } from "./utils/firebase";

import NotificationHandler from "./components/notificationHandler";
import Home from "./page/home";
import About from "./page/about";
import BannedScreen from "./page/bannedScreen";
// import FindTherapist from "./page/findTherapist";
import TherapistLogin from "./login/therapist_login";
import AdminPanel from "./admin/adminPanel";
import AdminLogin from "./admin/admin-login";
import TherapistDashboard from "./page/therapistDashboard";
import AnonymousDashboard from "./page/anonymousDashboard";
import RealTimeBanGuard from "./components/realTimeBanGuard";
import "./assets/styles/App.css";

export const AuthContext = createContext(null);

const ADMIN_EMAILS = ["admin@yourapp.com"];

function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isTherapist, setIsTherapist] = useState(false);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();

  // Global error state
  const [globalError, setGlobalError] = useState(null);
  const [isErrorFading, setIsErrorFading] = useState(false);
  const errorTimeoutRef = useRef(null);

  const showGlobalError = useCallback((msg, autoDismiss = true) => {
    if (errorTimeoutRef.current) clearTimeout(errorTimeoutRef.current);
    setGlobalError(msg);
    setIsErrorFading(false);

    if (autoDismiss) {
      errorTimeoutRef.current = setTimeout(() => {
        setIsErrorFading(true);
        setTimeout(() => {
          setGlobalError(null);
          setIsErrorFading(false);
        }, 300);
      }, 5000);
    }
  }, []);

  const closeGlobalError = useCallback(() => {
    setIsErrorFading(true);
    setTimeout(() => {
      setGlobalError(null);
      setIsErrorFading(false);
      if (errorTimeoutRef.current) {
        clearTimeout(errorTimeoutRef.current);
        errorTimeoutRef.current = null;
      }
    }, 300);
  }, []);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (errorTimeoutRef.current) clearTimeout(errorTimeoutRef.current);
    };
  }, []);

  // Auth state listener
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        setUser(null);
        setIsTherapist(false);
        setLoading(false);
        return;
      }

      setUser(u);
      setLoading(true);

      let banUnsub = () => {};

      try {
        if (u.isAnonymous) {
          const anonRef = doc(db, "anonymousUsers", u.uid);
          banUnsub = onSnapshot(anonRef, async (snap) => {
            if (snap.exists() && snap.data().banned === true) {
              const reason = snap.data().banReason || "No reason provided";
              showGlobalError(`You have been banned from using this service.\n\nReason: ${reason}`);
              await signOut(auth);
              setUser(null);
              setIsTherapist(false);
              setLoading(false);
              navigate("/", { replace: true });
            }
          });
        } else if (u.email) {
          const therapistRef = doc(db, "therapists", u.uid);
          const snap = await getDoc(therapistRef);

          if (snap.exists() && snap.data().suspended) {
            showGlobalError("Your account has been suspended.");
            await signOut(auth);
            navigate("/therapist-login", { replace: true });
            setLoading(false);
            return;
          }

          setIsTherapist(true);

          if (location.pathname === "/therapist-login") {
            navigate("/therapist-dashboard/", { replace: true });
          }
        }
      } catch (err) {
        console.error("Auth check error:", err);
        showGlobalError("Failed to verify account status.");
      } finally {
        setLoading(false);
      }

      return () => {
        if (banUnsub) banUnsub();
      };
    });

    return () => unsubAuth();
  }, [navigate, location.pathname, showGlobalError]);

  const value = {
    user,
    isTherapist,
    loading,
    location,
    globalError,
    isErrorFading,
    showGlobalError,
    closeGlobalError,
  };

  return (
    <AuthContext.Provider value={value}>
      {children(value)}
    </AuthContext.Provider>
  );
}

function Loader() {
  return (
    <div className="loaderbox" role="status" aria-label="Loading...">
      <span className="loader">
        <img src="/anonymous-logo.png" alt="" className="loader-logo-image" />
      </span>
    </div>
  );
}

export default function App() {
  const currentYear = new Date().getFullYear();

  return (
    <>
      <NotificationHandler />
      <AuthProvider>
        {({
          user,
          isTherapist,
          loading,
          location,
          globalError,
          isErrorFading,
          closeGlobalError,
        }) => {
          const showFooter =
            location.pathname === "/" ||
            location.pathname === "/about" ||
            location.pathname === "/find-therapist" ||
            location.pathname === "/banned";

          return (
            <>
              {/* Global Error Toast */}
              {globalError && (
                <div className={`error-toast ${isErrorFading ? "fade-out" : ""}`}>
                  <span>{globalError}</span>
                  <button
                    className="error-close-btn"
                    onClick={closeGlobalError}
                    aria-label="Close error"
                  >
                    <i className="fa-solid fa-times"></i>
                  </button>
                </div>
              )}

              <Routes>
                {/* Public Routes */}
                <Route path="/" element={<Home />} />
                <Route path="/about" element={<About />} />
                <Route path="/banned" element={<BannedScreen />} />
                {/* <Route path="/find-therapist" element={<FindTherapist />} /> */}
                <Route path="/therapist-login" element={<TherapistLogin />} />
                <Route path="/admin-login" element={<AdminLogin />} />

                {/* Protected Routes */}
                <Route
                  path="/admin"
                  element={
                    loading ? (
                      <Loader />
                    ) : user && !user.isAnonymous && user.email && ADMIN_EMAILS.includes(user.email) ? (
                      <AdminPanel />
                    ) : (
                      <Navigate to="/admin-login" replace />
                    )
                  }
                />

                <Route
                  path="/therapist-dashboard/*"
                  element={
                    loading ? (
                      <Loader />
                    ) : user && !user.isAnonymous && isTherapist ? (
                      <TherapistDashboard />
                    ) : (
                      <Navigate to="/therapist-login" replace />
                    )
                  }
                />

                <Route
                  path="/anonymous-dashboard/*"
                  element={
                    loading ? (
                      <Loader />
                    ) : user && user.isAnonymous ? (
                      <RealTimeBanGuard>
                        <AnonymousDashboard />
                      </RealTimeBanGuard>
                    ) : (
                      <Navigate to="/" replace />
                    )
                  }
                />

                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>

              {/* Footer */}
              {showFooter && (
                <footer className="footer">
                  <p>&copy; 2025 - {currentYear} Anonymous Mental Health Support. All rights reserved.</p>
                  <div className="footer-links">
                    <Link to="/privacy">Privacy Policy</Link>
                    <Link to="/terms">Terms of Service</Link>
                    <a href="mailto:ayoakeni64@gmail.com">Contact Us</a>
                  </div>
                </footer>
              )}
            </>
          );
        }}
      </AuthProvider>
    </>
  );
}