import { useEffect, useState } from "react";
import { db, auth } from "../utils/firebase";
import { doc, onSnapshot } from "firebase/firestore";
import {
  Verified
} from "lucide-react";
import "../assets/styles/therapistProfile.css";

function TherapistProfile({ therapist, onBack, isOnline }) {
  const [realTimeOnline, setRealTimeOnline] = useState(isOnline);

  // ---------- real-time online / chat-settings ----------
  useEffect(() => {
    if (!therapist?.uid) return;
    const therapistRef = doc(db, "therapists", therapist.uid);
    const unsubscribe = onSnapshot(
      therapistRef,
      (snap) => {
        if (snap.exists()) {
          setRealTimeOnline(snap.data().online ?? false);
        }
      },
      (err) => console.error(err)
    );
    return () => unsubscribe();
  }, [therapist?.uid]);

  if (!therapist) return null;

  return (
    <div className="therapist-profile">
      <div className="detail-close">
        <button className="close-button" onClick={onBack}>
          <i className="fa-solid fa-times"></i>
        </button>
        <span>Contact info</span>
      </div>

      <div className={`avatarWrapper ${realTimeOnline ? "online" : ""}`}>
        {therapist.profileImage ? (
          <img
            src={therapist.profileImage}
            alt={therapist.name}
            className="avatar"
          />
        ) : (
          <div className="avatarPlaceholder">
            {therapist.name?.[0]?.toUpperCase() || 'T'}
          </div>
        )}
      </div>

      <h3>
        <div className="name-badge">
          {therapist.name}
          <div className="badges">
            {!therapist.verified && <Verified size={17} className="verified"/>}
            {therapist.rating >= 4 && <span className="top-rated">Top Rated</span>}
          </div>
        </div>
        <span className={`status ${realTimeOnline ? "online" : "offline"}`}>
          ● {realTimeOnline ? "Online" : "Offline"}
        </span>
      </h3>

      <p><strong>Gender:</strong> {therapist.gender || "Not specified"}</p>
      <p><strong>Position:</strong> {therapist.position || "Not specified"}</p>
      <p><strong>About:</strong> {therapist.profile || "No description available"}</p>
      <div className="specialties">
        <strong>Specialties:</strong>
        {(therapist.specialties || ["Not specified"]).map((s, i) => (
          <span key={i} className="specialty-tag">{s}</span>
        ))}
      </div>
      <p>
        <strong>Rating:</strong>{" "}
        <span className="rating">
          {therapist.rating > 0 ? (
            <>
              {'★'.repeat(Math.floor(therapist.rating))}
              {therapist.rating % 1 >= 0.5 && '☆'}
              <span className="ratingValue"> {therapist.rating.toFixed(1)}</span>
              <span className="review">{therapist.totalRatings > 0 && ` (${therapist.totalRatings} reviews)`}</span>
            </>
          ) : (
            "No ratings yet"
          )}
        </span>
      </p>

    </div>
  );
}

export default TherapistProfile;