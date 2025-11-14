import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { db, auth } from "../../utils/firebase";
import {
  doc,
  setDoc,
  serverTimestamp,
  collection,
  query,
  where,
  onSnapshot,
} from "firebase/firestore";
import { format, addDays } from "date-fns";
import "../../styles/anonymousAppointmentBooking.css"

const TIME_SLOTS = ["09:00", "10:00", "11:00", "14:00", "15:00", "16:00"];

function AppointmentBooking({ therapist, onClose }) {
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedTime, setSelectedTime] = useState("");
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [bookedSlots, setBookedSlots] = useState({});
  const navigate = useNavigate();

  const clientUid = auth.currentUser?.uid;
  const therapistUid = therapist?.uid;

  const minDate = format(new Date(), "yyyy-MM-dd");
  const maxDate = format(addDays(new Date(), 30), "yyyy-MM-dd");

  // === Load booked slots for this therapist ===
  useEffect(() => {
    if (!therapistUid) return;

    const q = query(
      collection(db, "appointments"),
      where("therapistUid", "==", therapistUid),
      where("status", "in", ["pending", "confirmed"])
    );

    const unsub = onSnapshot(q, (snap) => {
      const booked = {};
      snap.docs.forEach((d) => {
        const data = d.data();
        const key = `${data.date}_${data.time}`;
        booked[key] = true;
      });
      setBookedSlots(booked);
    });

    return unsub;
  }, [therapistUid]);

  const isSlotBooked = (date, time) => bookedSlots[`${date}_${time}`];

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedDate || !selectedTime || !reason.trim()) {
      setError("Please fill all fields.");
      return;
    }
    if (isSlotBooked(selectedDate, selectedTime)) {
      setError("This time slot is already booked.");
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      const cleanTime = selectedTime.replace(":", "");
      const appointmentId = `${clientUid}_${therapistUid}_${selectedDate}_${cleanTime}`;

      await setDoc(doc(db, "appointments", appointmentId), {
        clientType: "anonymous",
        clientUid,
        therapistUid,
        date: selectedDate,
        time: selectedTime,
        reason: reason.trim(),
        status: "pending",
        createdAt: serverTimestamp(),
      });

      setSuccess(true);
      setTimeout(() => {
        onClose?.();
        navigate("/anonymous-dashboard/appointments-list");
      }, 2000);
    } catch (err) {
      console.error(err);
      setError("Failed to book. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!therapist) return null;

  return (
    <div className="appointment-booking-wrapper">
      <div className="modal-backdrop">
        <div className="appointment-modal">
          <button className="close-btn" onClick={onClose}>×</button>

          <h3>Book with {therapist.name}</h3>

          {success ? (
            <div className="success-message">
              <p>Appointment requested!</p>
              <p>Redirecting...</p>
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
                    const disabled = !selectedDate || isSlotBooked(selectedDate, time);
                    return (
                      <button
                        key={time}
                        type="button"
                        className={`time-slot ${selectedTime === time ? "selected" : ""} ${disabled ? "booked" : ""}`}
                        onClick={() => !disabled && setSelectedTime(time)}
                        disabled={disabled}
                      >
                        {time}
                        {disabled && <span className="booked-tag">Booked</span>}
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
                disabled={isSubmitting || !selectedDate || !selectedTime}
              >
                {isSubmitting ? "Booking..." : "Request Appointment"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export default AppointmentBooking;