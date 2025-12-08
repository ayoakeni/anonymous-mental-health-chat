import { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../utils/firebase";
import { useNavigate } from "react-router-dom";
import { Loader2, Lock, Mail, AlertCircle, Eye, EyeOff } from "lucide-react";
import "../assets/styles/admin-login.css";

const ADMIN_EMAILS = [
  "admin@yourapp.com",
  "support@yourapp.com",
  "dev@yourapp.com"
];

export default function AdminLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const userEmail = userCredential.user.email?.toLowerCase();

      if (userEmail && ADMIN_EMAILS.includes(userEmail)) {
        navigate("/admin", { replace: true });
      } else {
        setError("Access denied. This area is restricted to administrators only.");
        await auth.signOut();
      }
    } catch (err) {
      const message =
        err.code === "auth/user-not-found" || err.code === "auth/wrong-password"
          ? "Invalid email or password."
          : "Failed to sign in. Please try again later.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-login-container">
      <button onClick={() => navigate("/")} className="back-to-home-btn">
        <i className="fas fa-arrow-left"></i>
        <span>Back to Home</span>
      </button>

      <div className="login-container">
        <div className="login-card">
          {/* Logo Section */}
          <div className="logo-section">
            <div className="logo-icon">
              <Lock size={40} />
            </div>
            <h1 className="logo-title">Admin Portal</h1>
            <p className="logo-subtitle">Secure administrative access</p>
          </div>

          {/* Login Form */}
          <form onSubmit={handleLogin} className="login-form">
            {/* Email Field */}
            <div className="input-group">
              <Mail className="input-icon" size={20} />
              <input
                type="email"
                placeholder="admin@yourapp.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
                className="input-field"
              />
            </div>

            {/* Password Field with Toggle */}
            <div className="input-group">
              <Lock className="input-icon" size={20} />
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
                className="input-field pr-12" // Extra padding for eye icon
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="password-toggle"
                tabIndex="-1" // Remove from tab order (optional)
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>

            {error && (
              <div className="error-banner">
                <AlertCircle size={18} />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="login-button"
            >
              {loading ? (
                <>
                  <Loader2 className="spinner" size={20} />
                  <span>Authenticating...</span>
                </>
              ) : (
                "Login as Admin"
              )}
            </button>
          </form>

          {/* Footer */}
          <div className="footer-info">
            <p className="allowed-text">
              <strong>Authorized accounts:</strong><br />
              {/* {ADMIN_EMAILS.join(" • ")} */}
              Admins only
            </p>
          </div>
        </div>

        <div className="orb top-left"></div>
        <div className="orb bottom-right"></div>
      </div>
    </div>
  );
}