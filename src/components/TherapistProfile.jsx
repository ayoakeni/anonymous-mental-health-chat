import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { db, auth } from "../utils/firebase";
import { doc, onSnapshot, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import AppointmentBooking from "./AnonymousDashboard/anonymousAppointmentBooking";
import "../styles/therapistProfile.css";

function TherapistProfile({ therapist, onBack, isOnline }) {
  const [realTimeOnline, setRealTimeOnline] = useState(isOnline);
  const [allowPrivateChats, setAllowPrivateChats] = useState(true);
  const [showBooking, setShowBooking] = useState(false);
  const navigate = useNavigate();

  // ---------- real-time online / chat-settings ----------
  useEffect(() => {
    if (!therapist?.uid) return;
    const therapistRef = doc(db, "therapists", therapist.uid);
    const unsubscribe = onSnapshot(
      therapistRef,
      (snap) => {
        if (snap.exists()) {
          setRealTimeOnline(snap.data().online ?? false);
          setAllowPrivateChats(snap.data().chatSettings?.allowPrivateChats ?? true);
        }
      },
      (err) => console.error(err)
    );
    return () => unsubscribe();
  }, [therapist?.uid]);

  // ---------- START PRIVATE CHAT ----------
  const startPrivateChat = async () => {
    if (!allowPrivateChats) return;

    const anonUid = auth.currentUser?.uid;
    if (!anonUid) return;

    const uids = [anonUid, therapist.uid].sort();
    const chatId = `${uids[0]}_${uids[1]}`;

    const existing = await getDoc(doc(db, "privateChats", chatId));
    if (existing.exists()) {
      navigate(`/anonymous-dashboard/private-chat/${chatId}`, {
        state: { selectChatId: chatId }
      });
      onBack?.();
      return;
    }

    await setDoc(doc(db, "privateChats", chatId), {
      userId: anonUid,
      participants: [anonUid, therapist.uid],
      createdAt: serverTimestamp(),
      lastMessage: null,
      unreadCountForTherapist: 0,
      unreadCountForAnon: 0,
      aiOffered: false,
      aiEnabled: false,
      needsTherapist: true,
      therapistJoinedOnce: false,
    });

    navigate(`/anonymous-dashboard/private-chat/${chatId}`, {
      state: { selectChatId: chatId }
    });
    onBack?.();
  };

  if (!therapist) return null;

  return (
    <div className="therapist-profile">
      <button className="close-button" onClick={onBack}>
        <i className="fa-solid fa-times"></i>
      </button>

      <div className="avatarWrapper">
        {therapist.profileImage ? (
          <img
            src={therapist.profileImage}
            alt={therapist.name}
            className={`avatar ${realTimeOnline ? "online" : ""}`}
          />
        ) : (
          <div className={`avatarPlaceholder ${realTimeOnline ? "online" : ""}`}>
            {therapist.name?.[0].toUpperCase() ?? "T"}
          </div>
        )}
      </div>

      <h3>
        {therapist.name}{" "}
        <span className={`status ${realTimeOnline ? "online" : "offline"}`}>
          ● {realTimeOnline ? "Online" : "Offline"}
        </span>
        <div className="badges">
          {therapist.rating >= 4 && <span className="badge top-rated">Top Rated</span>}
          {therapist.verified && <span className="badge verified">Verified Therapist</span>}
        </div>
      </h3>

      <p><strong>Gender:</strong> {therapist.gender || "Not specified"}</p>
      <p><strong>Position:</strong> {therapist.position || "Not specified"}</p>
      <p><strong>About:</strong> {therapist.profile || "No description available"}</p>
      <p>
        <strong>Rating:</strong>{" "}
        <span className="rating">
          {therapist.rating > 0 ? (
            <>
              {'★'.repeat(Math.floor(therapist.rating))}
              {therapist.rating % 1 >= 0.5 && '☆'}
              <span className="ratingValue"> {therapist.rating.toFixed(1)}</span>
              {therapist.totalRatings > 0 && ` (${therapist.totalRatings} reviews)`}
            </>
          ) : (
            "No ratings yet"
          )}
        </span>
      </p>

      <div className="specialties">
        {(therapist.specialties || ["Not specified"]).map((s, i) => (
          <span key={i} className="specialty-tag">{s}</span>
        ))}
      </div>

      <div className="profile-completion">
        Profile Completion: {therapist.profile && therapist.gender && therapist.position ? 90 : 60}%
      </div>

      <div className="action-buttons">
        <button
          className="action-button chat-button"
          onClick={startPrivateChat}
          disabled={!allowPrivateChats}
          title={!allowPrivateChats ? "This therapist has disabled private chats" : ""}
        >
          Start Private Chat
        </button>

        <button className="action-button appointment-button" onClick={() => setShowBooking(true)}>
          Book Appointment
        </button>
      </div>
      {showBooking && (
        <AppointmentBooking
          therapist={therapist}
          onClose={() => setShowBooking(false)}
        />
      )}
    </div>
  );
}

export default TherapistProfile;