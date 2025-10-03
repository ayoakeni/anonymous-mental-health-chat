// TherapistLogin.js
import React, { useEffect, useState } from "react";
import { db, auth } from "../utils/firebase";
import { doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";
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

    const uid = auth.currentUser.uid;
    const therapistRef = doc(db, "therapistsOnline", uid);

    const updatePresence = async (online) => {
      try {
        // ✅ fetch display name from therapists/{uid}
        const profileSnap = await getDoc(doc(db, "therapists", uid));
        const therapistName = profileSnap.exists()
          ? profileSnap.data().name
          : auth.currentUser.email; // fallback

        await setDoc(therapistRef, {
          name: therapistName,
          online,
          lastSeen: serverTimestamp(),
        });
      } catch (err) {
        console.error("Error setting therapist presence:", err);
      }
    };

    // Mark online
    updatePresence(true);

    // On window/tab close → mark offline
    const handleBeforeUnload = async () => {
      await updatePresence(false);
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      updatePresence(false);
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
