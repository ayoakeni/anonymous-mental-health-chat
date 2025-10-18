import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import { auth } from "./utils/firebase";
import Home from "./page/home";
import About from "./page/about";
import TherapistLogin from "./login/therapist_login";
import TherapistDashboard from "./page/therapistDashboard";
import AnonymousDashboard from "./page/anonymousDashboard";
import "./styles/App.css";

function ProtectedRoute({ children, requireTherapist = false }) {
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isTherapist, setIsTherapist] = useState(false);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) {
        setIsAuthenticated(true);
        setIsTherapist(!!user.email);
      } else {
        setIsAuthenticated(false);
        setIsTherapist(false);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="loaderbox" role="status" aria-label="Loading application">
        <span className="loader">
          <img
            src="/anonymous-logo.png"
            alt="Loading Anonymous Mental Health Support Application"
            className="loader-logo-image"
          />
        </span>
      </div>
    );
  }

  if (requireTherapist && !isTherapist) {
    return <Navigate to="/therapist-login" state={{ from: location }} replace />;
  }

  if (!isAuthenticated && !requireTherapist) {
    return <Navigate to="/anonymous-dashboard/*" state={{ from: location }} replace />;
  }

  return children;
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/about" element={<About />} />
      <Route path="/therapist-login" element={<TherapistLogin />} />
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
  );
}

export default App;