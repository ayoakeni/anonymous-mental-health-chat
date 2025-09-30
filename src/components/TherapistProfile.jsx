// TherapistProfile.js
import React from "react";

function TherapistProfile({ therapist, onBack, onStartChat, onBookAppointment, isOnline }) {
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
        {isOnline && <span style={{ color: "green" }}>● Online</span>}
      </p>
      <p><strong>Gender:</strong> {therapist.gender}</p>
      <p><strong>Position:</strong> {therapist.position}</p>
      <p><strong>About:</strong> {therapist.profile}</p>
      <p>
        <strong>Rating:</strong>{" "}
        <span style={{ color: "gold" }}>⭐ {therapist.rating}</span>
      </p>

      {/* Actions */}
      <div style={{ marginTop: "15px" }}>
        <button
          onClick={onStartChat}
          style={{
            background: "#007bff",
            color: "#fff",
            border: "none",
            padding: "8px 15px",
            borderRadius: "5px",
            cursor: "pointer",
            marginRight: "10px",
          }}
        >
          💬 Chat with Therapist
        </button>
        <button
          onClick={onBookAppointment}
          style={{
            background: "#28a745",
            color: "#fff",
            border: "none",
            padding: "8px 15px",
            borderRadius: "5px",
            cursor: "pointer",
          }}
        >
          📅 Book Appointment
        </button>
      </div>
    </div>
  );
}

export default TherapistProfile;
