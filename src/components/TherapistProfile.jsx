import React, { useEffect, useState } from "react";
import { db } from "../utils/firebase";
import { doc, onSnapshot } from "firebase/firestore";
import "../styles/therapistProfile.css";

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
    <div className="therapist-profile">
      <button className="back-button" onClick={onBack}>
        ⬅ Back
      </button>
      <div className="avatar">{therapist.name?.[0] || "T"}</div>
      <h3>{therapist.name}{" "}
        <span className={`status ${realTimeOnline ? "online" : "offline"}`}>
          ● {realTimeOnline ? "Online" : "Offline"}
        </span>
        <div className="badges">
          {therapist.rating >= 4 && (
            <span className="badge top-rated">Top Rated</span>
          )}
          {therapist.verified && (
            <span className="badge verified">Verified Therapist</span>
          )}
        </div>
      </h3>
      <p><strong>Gender:</strong> {therapist.gender || "Not specified"}</p>
      <p><strong>Position:</strong> {therapist.position || "Not specified"}</p>
      <p><strong>About:</strong> {therapist.profile || "No description available"}</p>
      <p>
        <strong>Rating:</strong>{" "}
        <span className="rating"><i class="fa-solid fa-star"></i> {therapist.rating || 0}</span>
      </p>
      <div className="specialties">
        {(therapist.specialties || ["Not specified"]).map((specialty, index) => (
          <span key={index} className="specialty-tag">{specialty}</span>
        ))}
      </div>
      <div className="profile-completion">
        Profile Completion: {therapist.profile && therapist.gender && therapist.position ? 90 : 60}%
      </div>
      <div className="action-buttons">
        <button
          className="action-button chat-button"
          onClick={onStartChat}
          disabled={!realTimeOnline}
        >
          Start Private Chat
        </button>
        <button className="action-button appointment-button" onClick={onBookAppointment}>
          Book Appointment
        </button>
      </div>
    </div>
  );
}

export default TherapistProfile;