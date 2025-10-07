import React, { useEffect, useState } from "react";
import { db } from "../utils/firebase";
import { doc, onSnapshot } from "firebase/firestore";

function TherapistProfile({ therapist, onBack, onStartChat, onBookAppointment, isOnline }) {
  const [realTimeOnline, setRealTimeOnline] = useState(isOnline);

  useEffect(() => {
    if (!therapist?.uid) return;
    const therapistRef = doc(db, "therapistsOnline", therapist.uid);
    const unsubscribe = onSnapshot(therapistRef, (snap) => {
      if (snap.exists()) {
        setRealTimeOnline(snap.data().online || false);
      }
    }, (err) => {
      console.error("Error fetching therapist online status:", err);
      if (err.code === "resource-exhausted") {
        alert("Firestore quota exceeded. Please try again later.");
      }
    });
    return () => unsubscribe();
  }, [therapist?.uid]);

  if (!therapist) return null;

  return (
    <div
      style={{
        border: "1px solid #ccc",
        padding: "15px",
        borderRadius: "8px",
        background: "#f9f9f9",
      }}
    >
      <button onClick={onBack} style={{ marginBottom: "10px" }}>
        ⬅ Back
      </button>
      <h3>Therapist Profile</h3>
      <p>
        <strong>Name:</strong> {therapist.name}{" "}
        {realTimeOnline ? (
          <span style={{ color: "green" }}>● Online</span>
        ) : (
          <span style={{ color: "red" }}>● Offline</span>
        )}
      </p>
      <p><strong>Gender:</strong> {therapist.gender || "Not specified"}</p>
      <p><strong>Position:</strong> {therapist.position || "Not specified"}</p>
      <p><strong>About:</strong> {therapist.profile || "No description available"}</p>
      <p><strong>Rating:</strong> <span style={{ color: "#FFD700" }}>⭐ {therapist.rating || 0}</span></p>
      <button onClick={onStartChat} disabled={!realTimeOnline}>
        Start Private Chat
      </button>
      <button onClick={onBookAppointment}>Book Appointment</button>
    </div>
  );
}

export default TherapistProfile;