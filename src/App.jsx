import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import { auth } from "./utils/firebase";
import Home from "./page/home";
import About from "./page/about";
import ChatRoom from "./page/chats_rooms/chatRoom";
import TherapistLogin from "./login/therapist_login";
import PrivateChatWrapper from "./page/chats_rooms/PrivateChatWrapper";
import TherapistDashboard from "./page/therapistDashboard";

function ProtectedRoute({ children }) {
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      // Check if user is authenticated as therapist (has email)
      setIsAuthenticated(!!user && !!user.email);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/therapist-login" state={{ from: location }} replace />;
  }

  return children;
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/chat-room" element={<ChatRoom />} />
      <Route path="/chat-room/:groupId" element={<ChatRoom />} />
      <Route path="/chat-room/private/:chatId" element={<PrivateChatWrapper />} />
      <Route path="/about" element={<About />} />
      <Route path="/therapist-login" element={<TherapistLogin />} />
      <Route
        path="/therapist-dashboard/*"
        element={
          <ProtectedRoute>
            <TherapistDashboard />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}

export default App;