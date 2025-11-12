import { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../utils/firebase";
import "../styles/therapistLogin.css";

export default function TherapistLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      // Redirect handled by App.jsx
    } catch (err) {
      setError("Invalid email or password.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="therapist-login-container">
      <div className="login-card">
        <h2 className="login-title">Therapist Login</h2>
        <form onSubmit={handleLogin} className="login-form" noValidate>
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              type="email"
              id="email"
              placeholder="Enter email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              aria-describedby="email-error"
              className="form-input"
            />
          </div>
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              placeholder="Enter password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              aria-describedby="password-error"
              className="form-input"
            />
          </div>
          {error && (
            <p className="error-message" role="alert" id="login-error">
              {error}
            </p>
          )}
          <button type="submit" className="login-button" disabled={isLoading}>
            {isLoading ? "Logging in…" : "Login"}
          </button>
        </form>
      </div>
    </div>
  );
}