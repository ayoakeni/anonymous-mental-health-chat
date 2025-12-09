import { useEffect, useState } from "react";
import {
  Routes,
  Route,
  Navigate,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, setDoc, getDoc, serverTimestamp, onSnapshot } from "firebase/firestore";
import { auth, db } from "./utils/firebase";

import NotificationHandler from "./components/notificationHandler";
import Home from "./page/home";
import About from "./page/about";
import BannedScreen from "./page/bannedScreen";
import FindTherapist from "./page/findTherapist";
import TherapistLogin from "./login/therapist_login";
import AdminPanel from "./admin/adminPanel";
import AdminLogin from "./admin/admin-login";
import TherapistDashboard from "./page/therapistDashboard";
import AnonymousDashboard from "./page/anonymousDashboard";
import RealTimeBanGuard from "./components/realTimeBanGuard";
import "./assets/styles/App.css";

const ADMIN_EMAILS = [
  "admin@yourapp.com",
  "support@yourapp.com",
  "dev@yourapp.com",
  "yourname@gmail.com"
];

function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isTherapist, setIsTherapist] = useState(false);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        setUser(null);
        setIsTherapist(false);
        setLoading(false);
        return;
      }

      setUser(u);

      let banUnsub = () => {};

      if (u.isAnonymous) {
        const anonRef = doc(db, "anonymousUsers", u.uid);

        banUnsub = onSnapshot(anonRef, async (snap) => {
          if (snap.exists() && snap.data().banned === true) {
            const reason = snap.data().banReason || "No reason provided";
            alert(`You have been banned from using this service.\n\nReason: ${reason}`);
            await signOut(auth);
            setUser(null);
            setLoading(false);
            navigate("/", { replace: true });
          }
        });

        await setDoc(doc(db, "usersOnline", u.uid), {
          name: "Anonymous User",
          online: true,
          lastSeen: serverTimestamp(),
        }, { merge: true });
      }

      else if (u.email) {
        const therapistRef = doc(db, "therapists", u.uid);
        const snap = await getDoc(therapistRef);

        if (snap.exists() && snap.data().suspended) {
          alert("Your account has been suspended.");
          await signOut(auth);
          navigate("/therapist-login", { replace: true });
          return;
        }

        setIsTherapist(true);

        if (location.pathname === "/therapist-login") {
          navigate("/therapist-dashboard/", { replace: true });
        }
      }

      setLoading(false);

      return () => {
        if (banUnsub) banUnsub();
      };
    });

    return () => unsub();
  }, [navigate]);

  return children({ user, isTherapist, loading });
}

export default function App() {
  return (
    <>
      <NotificationHandler />
      <AuthProvider>
        {({ user, isTherapist, loading }) => (
          <Routes>
            {/* Public Routes */}
            <Route path="/" element={<Home />} />
            <Route path="/about" element={<About />} />
            <Route path="/banned" element={<BannedScreen />} />
            <Route path="/find-therapist" element={<FindTherapist />} />
            <Route path="/therapist-login" element={<TherapistLogin />} />
            <Route path="/admin-login" element={<AdminLogin />} />

            {/* ADMIN PANEL — Protected */}
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

            {/* Therapist Dashboard */}
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

            {/* Anonymous Dashboard */}
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

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        )}
      </AuthProvider>
    </>
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