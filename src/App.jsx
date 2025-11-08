import { useEffect, useState } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./utils/firebase";
import NotificationHandler from "./components/notificationHandler";
import Home from "./page/home";
import About from "./page/about";
import TherapistLogin from "./login/therapist_login";
import TherapistDashboard from "./page/therapistDashboard";
import AnonymousDashboard from "./page/anonymousDashboard";
import Chatroom from "./page/chats_rooms/chatRoom";
import "./styles/App.css";

function ProtectedRoute({ children, requireTherapist = false }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const location = useLocation();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="loaderbox" role="status" aria-label="Loading...">
        <span className="loader">
          <img src="/anonymous-logo.png" alt="Loading" className="loader-logo-image" />
        </span>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/" state={{ from: location }} replace />;
  }

  if (requireTherapist && !user.email) {
    return <Navigate to="/therapist-login" state={{ from: location }} replace />;
  }

  return children;
}

function App() {
  return (
    <>
      <NotificationHandler />
      <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/about" element={<About />} />
          <Route path="/therapist-login" element={<TherapistLogin />} />
        <Route path="/chat-room/:chatId" element={<Chatroom />} />
        <Route path="/chat-room/" element={<Chatroom />} />

        <Route
          path="/therapist-dashboard/*"
          element={
            <ProtectedRoute requireTherapist={true}>
              <TherapistDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/anonymous-dashboard/*"
          element={
            <ProtectedRoute>
              <AnonymousDashboard />
            </ProtectedRoute>
          }
        />
      </Routes>
    </>
  );
}

export default App;