import React, { useEffect, useState } from "react";
import { db, auth } from "../utils/firebase";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { signInWithEmailAndPassword } from "firebase/auth";
import { useNavigate } from "react-router-dom";

function TherapistLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const navigate = useNavigate();

  // Handle login
  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      await signInWithEmailAndPassword(auth, email, password);
      console.log("Therapist logged in:", email);
      setIsLoggedIn(true);
    } catch (err) {
      console.error("Login error:", err.message);
      setError("Invalid email or password");
    }
  };

  // Presence effect: only runs once logged in
  useEffect(() => {
    if (!isLoggedIn || !auth.currentUser) return;

    const therapistRef = doc(db, "therapistsOnline", auth.currentUser.uid);

    // Mark online
    setDoc(therapistRef, {
      name: auth.currentUser.email,
      online: true,
      lastSeen: serverTimestamp(),
    });

    // On window/tab close → mark offline
    const handleBeforeUnload = async () => {
      await setDoc(therapistRef, {
        name: auth.currentUser.email,
        online: false,
        lastSeen: serverTimestamp(),
      });
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      setDoc(therapistRef, {
        name: auth.currentUser.email,
        online: false,
        lastSeen: serverTimestamp(),
      });
    };
  }, [isLoggedIn]);

  if (isLoggedIn) {
    navigate("/dashboard_therapist");
    return null; // prevent double render
  }

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
