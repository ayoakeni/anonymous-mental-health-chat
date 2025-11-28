import { useState, useEffect } from "react";
import { signInWithEmailAndPassword, onAuthStateChanged } from "firebase/auth";
import { auth } from "../utils/firebase";
import { useNavigate } from "react-router-dom";
import "../styles/therapistLogin.css";

export default function TherapistLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSignedIn, setIsSignedIn] = useState(false); // false = not signed in yet
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();

  // Listen to Firebase auth state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user && isSignedIn) {
        // Only redirect AFTER we've shown the "Signed In" checkmark
        const timer = setTimeout(() => {
          navigate("/therapist-dashboard", { replace: true }); // ← change to your dashboard route
        }, 1400);

        return () => clearTimeout(timer);
      }
    });

    return () => unsubscribe();
  }, [isSignedIn, navigate]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      await signInWithEmailAndPassword(auth, email, password);
      // Success! → Show "Signed In" immediately
      setIsSignedIn(true);
      setIsLoading(false);
      // onAuthStateChanged will catch the user and redirect after delay
    } catch (err) {
      setError("Invalid email or password. Please try again.");
      setIsLoading(false);
    }
  };

  return (
    <div className="therapist-login-container">
      {/* Back to Home */}
      <button onClick={() => navigate("/")} className="back-to-home-btn">
        <i className="fas fa-arrow-left"></i>
        <span>Back to Home</span>
      </button>

      <div className="login-card">
        {/* Header */}
        <div className="login-header">
          <div className="logo-circle">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
              <circle cx="12" cy="7" r="4"></circle>
            </svg>
          </div>
          <h2 className="login-title">Welcome Back</h2>
          <p className="login-subtitle">Sign in to your therapist dashboard</p>
        </div>

        <form onSubmit={handleLogin} className="login-form" noValidate>
          {/* Email & Password fields */}
          <div className="form-group">
            <label htmlFor="email">Email Address</label>
            <div className="input-wrapper">
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="therapist@gmail.com"
                className="form-input"
                disabled={isLoading || isSignedIn}
              />
              <span className="input-icon"><i className="fas fa-envelope"></i></span>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <div className="input-wrapper">
              <input
                type={showPassword ? "text" : "password"}
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                className="form-input"
                disabled={isLoading || isSignedIn}
              />
              <span className="input-icon"><i className="fas fa-lock"></i></span>
              <button
                type="button"
                className="toggle-password"
                onClick={() => setShowPassword(!showPassword)}
                disabled={isLoading || isSignedIn}
              >
                {showPassword ? <i className="fas fa-eye-slash"></i> : <i className="fas fa-eye"></i>}
              </button>
            </div>
          </div>

          {error && (
            <div className="error-message" role="alert">
              <i className="fas fa-exclamation-circle"></i>
              <span>{error}</span>
            </div>
          )}

          {/* The magic button */}
          <button
            type="submit"
            className={`login-button ${isSignedIn ? "signed-in" : ""}`}
            disabled={isLoading || isSignedIn}
          >
            {isSignedIn ? (
              <>
                <i className="fas fa-check-circle"></i>
                <span>Signed In</span>
              </>
            ) : isLoading ? (
              <>
                <div className="spinner"></div>
                Signing in...
              </>
            ) : (
              <>
                <span>Sign In</span>
                <i className="fas fa-arrow-right"></i>
              </>
            )}
          </button>
        </form>

        <div className="login-footer">
          <p>Need help? <a href="/contact">Contact support</a></p>
        </div>
      </div>
    </div>
  );
}