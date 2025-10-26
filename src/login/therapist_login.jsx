import React, { useState, useEffect } from "react";
import { db, auth } from "../utils/firebase";
import { doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";
import { signInWithEmailAndPassword, onAuthStateChanged } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import "../styles/therapistLogin.css";

function TherapistLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      console.log("Therapist logged in:", email);
    } catch (err) {
      console.error("Login error:", err.message);
      setError("Invalid email or password. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  // Presence + redirect
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) return; // Not logged in

      const uid = user.uid;
      const therapistRef = doc(db, "therapists", uid);

      const updatePresence = async (online) => {
        try {
          const profileSnap = await getDoc(therapistRef);
          const therapistName = profileSnap.exists()
            ? profileSnap.data().name
            : user.email; // Fallback

          await setDoc(
            therapistRef,
            {
              name: therapistName,
              online,
              lastSeen: serverTimestamp(),
            },
            { merge: true } // Use merge to avoid overwriting other fields
          );
        } catch (err) {
          console.error("Error setting therapist presence:", err);
        }
      };

      // Mark therapist online
      await updatePresence(true);

      // Redirect therapist after successful login
      navigate("/therapist-dashboard/");

      // Mark offline when tab is closed
      const handleBeforeUnload = () => updatePresence(false);
      window.addEventListener("beforeunload", handleBeforeUnload);

      // Cleanup
      return () => {
        window.removeEventListener("beforeunload", handleBeforeUnload);
        updatePresence(false);
      };
    });

    return () => unsubscribe();
  }, [navigate]);

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
            {isLoading ? "Logging in..." : "Login"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default TherapistLogin;