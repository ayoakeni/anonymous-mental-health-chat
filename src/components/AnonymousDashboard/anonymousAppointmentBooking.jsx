import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { db, auth } from "../../utils/firebase";
import {
  doc,
  setDoc,
  serverTimestamp,
  collection,
  onSnapshot,
} from "firebase/firestore";
import { format, addDays } from "date-fns";
import "../../assets/styles/anonymousAppointmentBooking.css";

const TIME_SLOTS = ["09:00", "10:00", "11:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00", "20:00"];

function AppointmentBooking() {
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedTime, setSelectedTime] = useState("");
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();

  const currentUser = auth.currentUser;
  const clientUid = currentUser?.uid;
  const [clientDisplayName, setClientDisplayName] = useState("Anonymous User");

  useEffect(() => {
    if (!clientUid) {
      setClientDisplayName("Anonymous User");
      return;
    }

    const unsub = onSnapshot(doc(db, "anonymousUsers", clientUid), (snap) => {
      if (snap.exists()) {
        const name = snap.data().anonymousName?.trim();
        setClientDisplayName(name || `User_${clientUid.slice(-6)}`);
      } else {
        setClientDisplayName(`User_${clientUid.slice(-6)}`);
      }
    });

    return unsub;
  }, [clientUid]);

  const minDate = format(new Date(), "yyyy-MM-dd");
  const maxDate = format(addDays(new Date(), 30), "yyyy-MM-dd");

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!selectedDate || !selectedTime || !reason.trim()) {
      setError("Please fill all fields.");
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      // Create pending appointment - no therapist assigned yet
      await setDoc(doc(collection(db, "appointments")), {
        userId: clientUid,
        userName: clientDisplayName,
        requestedDate: selectedDate,
        requestedTime: selectedTime,
        duration: 60,
        reason: reason.trim(),
        status: "pending",
        claimedBy: null,
        therapistId: null,
        therapistName: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      setSuccess(true);
      setTimeout(() => {
        navigate("/anonymous-dashboard/appointments-list");
      }, 2000);
    } catch (err) {
      console.error("Booking error:", err);
      setError("Failed to book appointment. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="appointment-booking-wrapper">
      <div className="appointment-modal">
        <h3>Request an Appointment</h3>
        <p className="booking-subtitle">
          An available therapist will claim your appointment request
        </p>

        {success ? (
          <div className="success-message">
            <p>Appointment requested successfully!</p>
            <p>A therapist will claim your request soon.</p>
            <p>Redirecting to your appointments...</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Select Date</label>
              <input
                type="date"
                min={minDate}
                max={maxDate}
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label>Select Time</label>
              <div className="time-slots">
                {TIME_SLOTS.map((time) => {
                  const disabled = !selectedDate;
                  return (
                    <button
                      key={time}
                      type="button"
                      className={`time-slot ${selectedTime === time ? "selected" : ""}`}
                      onClick={() => !disabled && setSelectedTime(time)}
                      disabled={disabled}
                    >
                      {time}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="form-group">
              <label>Reason for Appointment</label>
              <textarea
                rows="3"
                placeholder="Briefly describe why you'd like to talk..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
              />
            </div>

            {error && <p className="error-text">{error}</p>}

            <button
              type="submit"
              className="submit-btn"
              disabled={isSubmitting || !selectedDate || !selectedTime || !reason.trim()}
            >
              {isSubmitting ? "Booking..." : "Request Appointment"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default AppointmentBooking;