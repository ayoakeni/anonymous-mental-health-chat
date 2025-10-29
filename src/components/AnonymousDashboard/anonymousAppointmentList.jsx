import React, { useEffect, useState, useCallback } from "react";
import { db, auth, messaging } from "../../utils/firebase";
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  getDoc,
  updateDoc,
  setDoc,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay } from "date-fns";
import { requestForToken, onMessageListener } from "../../utils/pushNotifications";

function AppointmentsList() {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("list"); // "list" or "calendar"
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const [showReschedule, setShowReschedule] = useState(null);
  const [showRating, setShowRating] = useState(null); // { appt, rating, comment }
  const [notification, setNotification] = useState(null);
  const clientUid = auth.currentUser?.uid;

  // === 1. Fetch Appointments + Therapist Name ===
  useEffect(() => {
    if (!clientUid) return;

    const q = query(
      collection(db, "appointments"),
      where("clientUid", "==", clientUid),
      where("clientType", "==", "anonymous")
    );

    const unsub = onSnapshot(q, async (snap) => {
      const data = await Promise.all(
        snap.docs.map(async (d) => {
          const appt = { id: d.id, ...d.data() };
          if (appt.therapistUid) {
            const therapistSnap = await getDoc(doc(db, "therapists", appt.therapistUid));
            appt.therapistName = therapistSnap.exists()
              ? therapistSnap.data().name || "Unknown Therapist"
              : "Deleted Therapist";
          }
          return appt;
        })
      );

      const sorted = data.sort((a, b) =>
        new Date(`${a.date} ${a.time}`) - new Date(`${b.date} ${b.time}`)
      );

      setAppointments(sorted);
      setLoading(false);
    });

    return unsub;
  }, [clientUid]);

  // === 2. Push Notifications Setup ===
  useEffect(() => {
    if (!messaging) return;

    requestForToken();

    const unsubscribe = onMessageListener().then((payload) => {
      setNotification({
        title: payload.notification?.title,
        body: payload.notification?.body,
      });
      setTimeout(() => setNotification(null), 5000);
    });

    return unsubscribe;
  }, []);

  // === 3. Cancel Appointment ===
  const handleCancel = async (apptId) => {
    if (!window.confirm("Cancel this appointment?")) return;
    try {
      await updateDoc(doc(db, "appointments", apptId), {
        status: "cancelled",
        cancelledAt: serverTimestamp(),
      });
      alert("Appointment cancelled.");
    } catch (err) {
      alert("Failed to cancel.");
    }
  };

  // === 4. Reschedule Modal ===
  const RescheduleModal = ({ appt, onClose }) => {
    const [date, setDate] = useState("");
    const [time, setTime] = useState("");
    const [reason] = useState(appt.reason);
    const [bookedSlots, setBookedSlots] = useState({});
    const [submitting, setSubmitting] = useState(false);

    const TIME_SLOTS = ["09:00", "10:00", "11:00", "14:00", "15:00", "16:00"];
    const minDate = format(new Date(), "yyyy-MM-dd");
    const maxDate = format(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), "yyyy-MM-dd");

    useEffect(() => {
      const q = query(
        collection(db, "appointments"),
        where("therapistUid", "==", appt.therapistUid),
        where("status", "in", ["pending", "confirmed"])
      );
      const unsub = onSnapshot(q, (snap) => {
        const booked = {};
        snap.docs.forEach((d) => {
          const data = d.data();
          if (data.id !== appt.id) {
            booked[`${data.date}_${data.time}`] = true;
          }
        });
        setBookedSlots(booked);
      });
      return unsub;
    }, [appt]);

    const handleReschedule = async () => {
      if (!date || !time) return alert("Select date and time.");
      const key = `${date}_${time}`;
      if (bookedSlots[key]) return alert("Slot already booked.");

      setSubmitting(true);
      try {
        const newId = `${clientUid}_${appt.therapistUid}_${date}_${time.replace(":", "")}`;
        await setDoc(doc(db, "appointments", newId), {
          clientType: "anonymous",
          clientUid,
          therapistUid: appt.therapistUid,
          date,
          time,
          reason,
          status: "pending",
          rescheduledFrom: appt.id,
          createdAt: serverTimestamp(),
        });
        await deleteDoc(doc(db, "appointments", appt.id));
        alert("Rescheduled!");
        onClose();
      } catch (err) {
        alert("Failed.");
      } finally {
        setSubmitting(false);
      }
    };

    return (
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <h4>Reschedule with {appt.therapistName}</h4>
          <div className="form-group">
            <label>Date</label>
            <input type="date" min={minDate} max={maxDate} value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Time</label>
            <div className="time-slots">
              {TIME_SLOTS.map((t) => {
                const disabled = !date || bookedSlots[`${date}_${t}`];
                return (
                  <button
                    key={t}
                    type="button"
                    className={`time-slot ${time === t ? "selected" : ""} ${disabled ? "booked" : ""}`}
                    onClick={() => !disabled && setTime(t)}
                    disabled={disabled}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="form-actions">
            <button onClick={handleReschedule} disabled={submitting}>
              {submitting ? "Saving..." : "Reschedule"}
            </button>
            <button onClick={onClose} className="cancel-btn">Cancel</button>
          </div>
        </div>
      </div>
    );
  };

  // === 5. Submit Rating ===
  const submitRating = async () => {
    if (!showRating?.appt || showRating.rating < 1) return;

    try {
      const apptRef = doc(db, "appointments", showRating.appt.id);
      await updateDoc(apptRef, {
        clientRating: showRating.rating,
        clientComment: showRating.comment?.trim() || null,
        ratedAt: serverTimestamp(),
      });

      // Update therapist average
      const therapistRef = doc(db, "therapists", showRating.appt.therapistUid);
      const therapistSnap = await getDoc(therapistRef);
      if (therapistSnap.exists()) {
        const data = therapistSnap.data();
        const ratings = (data.ratings || []).concat([{ rating: showRating.rating, comment: showRating.comment }]);
        const avg = ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length;

        await updateDoc(therapistRef, {
          rating: parseFloat(avg.toFixed(2)),
          ratings,
          totalRatings: ratings.length,
        });
      }

      alert("Thank you for your feedback!");
      setShowRating(null);
    } catch (err) {
      alert("Failed to submit rating.");
    }
  };

  // === 6. Calendar View ===
  const CalendarView = () => {
    const start = startOfMonth(selectedMonth);
    const end = endOfMonth(selectedMonth);
    const days = eachDayOfInterval({ start, end });

    const getAppointmentsForDay = (day) => {
      return appointments.filter((appt) => isSameDay(new Date(appt.date), day));
    };

    return (
      <div className="calendar-view">
        <div className="calendar-header">
          <button onClick={() => setSelectedMonth(new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() - 1))}>Prev</button>
          <h4>{format(selectedMonth, "MMMM yyyy")}</h4>
          <button onClick={() => setSelectedMonth(new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1))}>Next</button>
        </div>
        <div className="calendar-grid">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="calendar-day-header">{d}</div>
          ))}
          {days.map((day) => {
            const dayAppts = getAppointmentsForDay(day);
            return (
              <div
                key={day}
                className={`calendar-day ${dayAppts.length > 0 ? "has-appt" : ""} ${
                  format(day, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd") ? "today" : ""
                }`}
              >
                <div className="day-number">{format(day, "d")}</div>
                {dayAppts.map((appt) => (
                  <div key={appt.id} className="calendar-appt">
                    {appt.time} - {appt.therapistName}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // === UI ===
  if (loading) return <div className="appointments-list"><p>Loading...</p></div>;

  if (appointments.length === 0) {
    return (
      <div className="appointments-list">
        <div className="appointments-empty">
          <p>No appointments yet.</p>
        </div>
      </div>
    );
  }

  const getStatusColor = (status) => {
    const map = {
      pending: "status-pending",
      confirmed: "status-confirmed",
      completed: "status-completed",
      cancelled: "status-cancelled",
      rejected: "status-rejected",
    };
    return map[status] || "status-pending";
  };

  return (
    <div className="appointments-list">
      {/* Notification Toast */}
      {notification && (
        <div className="notification-toast">
          <strong>{notification.title}</strong>
          <p>{notification.body}</p>
        </div>
      )}

      {/* View Toggle */}
      <div className="view-toggle">
        <button className={view === "list" ? "active" : ""} onClick={() => setView("list")}>
          List
        </button>
        <button className={view === "calendar" ? "active" : ""} onClick={() => setView("calendar")}>
          Calendar
        </button>
      </div>

      {/* Calendar View */}
      {view === "calendar" && <CalendarView />}

      {/* List View */}
      {view === "list" && (
        <>
          <h3>Your Appointments</h3>
          {appointments.map((appt) => (
            <div key={appt.id} className="appointment-item">
              <div className="appointment-header">
                <div className="appointment-name">{appt.therapistName}</div>
                <div className="appointment-datetime">
                  {format(new Date(appt.date), "MMM d, yyyy")} at {appt.time}
                </div>
              </div>
              <p className="appointment-reason">
                <em>"{appt.reason || "No reason given"}"</em>
              </p>

              <div className="appointment-footer">
                <span className={`appointment-status ${getStatusColor(appt.status)}`}>
                  {appt.status.charAt(0).toUpperCase() + appt.status.slice(1)}
                </span>

                {/* Cancel / Reschedule */}
                {["pending", "confirmed"].includes(appt.status) && (
                  <>
                    <button onClick={() => setShowReschedule(appt)} className="action-btn reschedule-btn">
                      Reschedule
                    </button>
                    <button onClick={() => handleCancel(appt.id)} className="action-btn cancel-btn">
                      Cancel
                    </button>
                  </>
                )}

                {/* Rate Session */}
                {appt.status === "completed" && !appt.clientRating && (
                  <button
                    onClick={() => setShowRating({ appt, rating: 5, comment: "" })}
                    className="action-btn rate-btn"
                  >
                    Rate Session
                  </button>
                )}

                {appt.clientRating && (
                  <div className="client-rating">
                    You rated: {'★'.repeat(appt.clientRating)}{'☆'.repeat(5 - appt.clientRating)}
                  </div>
                )}
              </div>
            </div>
          ))}
        </>
      )}

      {/* Reschedule Modal */}
      {showReschedule && (
        <RescheduleModal appt={showReschedule} onClose={() => setShowReschedule(null)} />
      )}

      {/* Rating Modal */}
      {showRating && (
        <div className="modal-backdrop" onClick={() => setShowRating(null)}>
          <div className="modal rating-modal" onClick={(e) => e.stopPropagation()}>
            <h4>Rate Your Session</h4>
            <p>With <strong>{showRating.appt.therapistName}</strong></p>

            <div className="star-rating">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  className={`star ${star <= showRating.rating ? "filled" : ""}`}
                  onClick={() => setShowRating((prev) => ({ ...prev, rating: star }))}
                >
                  Star
                </button>
              ))}
            </div>

            <textarea
              placeholder="Optional: Share your thoughts..."
              value={showRating.comment}
              onChange={(e) => setShowRating((prev) => ({ ...prev, comment: e.target.value }))}
              rows="3"
              className="input"
            />

            <div className="form-actions">
              <button onClick={submitRating} className="save-btn">
                Submit Rating
              </button>
              <button onClick={() => setShowRating(null)} className="cancel-btn">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AppointmentsList;