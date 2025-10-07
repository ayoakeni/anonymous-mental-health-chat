// TherapistLogin.js
import React, { useState, useEffect } from "react";
import { db, auth } from "../utils/firebase";
import { doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";
import { signInWithEmailAndPassword, onAuthStateChanged } from "firebase/auth";
import { useNavigate } from "react-router-dom";

function TherapistLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  // Login handler
  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      await signInWithEmailAndPassword(auth, email, password);
      console.log("Therapist logged in:", email);
    } catch (err) {
      console.error("Login error:", err.message);
      setError("Invalid email or password");
    }
  };

  // Presence + redirect
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) return; // not logged in

      const uid = user.uid;
      const therapistRef = doc(db, "therapistsOnline", uid);

      const updatePresence = async (online) => {
        try {
          const profileSnap = await getDoc(doc(db, "therapists", uid));
          const therapistName = profileSnap.exists()
            ? profileSnap.data().name
            : user.email; // fallback

          await setDoc(therapistRef, {
            name: therapistName,
            online,
            lastSeen: serverTimestamp(),
          });
        } catch (err) {
          console.error("Error setting therapist presence:", err);
        }
      };

      // Mark therapist online
      updatePresence(true);

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
    <div style={{ margin: "20px" }}>
      <h2>Therapist Login</h2>
      <form onSubmit={handleLogin}>
        <input
          type="email"
          placeholder="Enter email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          style={{ display: "block", marginBottom: "10px" }}
        />
        <input
          type="password"
          placeholder="Enter password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          style={{ display: "block", marginBottom: "10px" }}
        />
        <button type="submit">Login</button>
      </form>
      {error && <p style={{ color: "red" }}>{error}</p>}
    </div>
  );
}

export default TherapistLogin;
