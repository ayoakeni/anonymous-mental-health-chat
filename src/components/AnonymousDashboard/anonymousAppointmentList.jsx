import { useEffect, useState } from "react";
import { db, auth } from "../../utils/firebase";
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
import NotificationHandler from "../notificationHandler";
import { onMessageListener } from "../../utils/requestForToken";
import "../../assets/styles/anonymousAppointmentList.css"

function AppointmentsList() {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("list");
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const [showReschedule, setShowReschedule] = useState(null);
  const [rescheduleData, setRescheduleData] = useState(null);
  const [submittingReschedule, setSubmittingReschedule] = useState(false);
  const [showRating, setShowRating] = useState(null);
  const [showRatingConfirm, setShowRatingConfirm] = useState(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(null);
  const [toast, setToast] = useState(null);

  const clientUid = auth.currentUser?.uid;

  /* --------------------------------------------------------------
     TOAST HELPER
  -------------------------------------------------------------- */
  const showToast = (type, message) => {
    setToast({ type, message });
    setTimeout(() => {
      const el = document.querySelector(".appointments-list-wrapper__toast");
      if (el) el.classList.add("fade-out");
      setTimeout(() => setToast(null), 400);
    }, 3600);
  };

  /* --------------------------------------------------------------
     FETCH APPOINTMENTS
  -------------------------------------------------------------- */
  useEffect(() => {
    if (!clientUid) return;

    const q = query(
      collection(db, "appointments"),
      where("userId", "==", clientUid)
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

      const sorted = data.sort(
        (a, b) => new Date(`${a.date} ${a.time}`) - new Date(`${b.date} ${b.time}`)
      );

      setAppointments(sorted);
      setLoading(false);
    });

    return unsub;
  }, [clientUid]);

  /* --------------------------------------------------------------
     FOREGROUND PUSH NOTIFICATIONS – **every** message
  -------------------------------------------------------------- */
  useEffect(() => {
    const unsubscribe = onMessageListener((payload) => {
      if (payload?.notification) {
        const { title, body } = payload.notification;
        showToast("info", `${title}: ${body}`);
      }
    });

    // Cleanup when component unmounts
    return unsubscribe;
  }, []);   // <-- runs once, listener stays alive

  /* --------------------------------------------------------------
     CANCEL FLOW
  -------------------------------------------------------------- */
  const initiateCancel = (apptId, therapistName) => {
    setShowCancelConfirm({ id: apptId, therapistName });
  };

  const confirmCancel = async () => {
    const { id } = showCancelConfirm;
    try {
      await updateDoc(doc(db, "appointments", id), {
        status: "cancelled",
        cancelledAt: serverTimestamp(),
      });
      showToast("success", "Appointment cancelled.");
      setShowCancelConfirm(null);
    } catch (err) {
      showToast("error", "Failed to cancel appointment.");
    }
  };

  /* --------------------------------------------------------------
     RESCHEDULE FLOW
  -------------------------------------------------------------- */
  const initiateReschedule = (appt, date, time) => {
    if (!date || !time) return showToast("error", "Please select date and time.");
    setRescheduleData({ appt, date, time });
  };

  const confirmReschedule = async () => {
    if (!rescheduleData) return;
    setSubmittingReschedule(true);
    try {
      const { appt, date, time } = rescheduleData;
      const newId = `${clientUid}_${appt.therapistUid}_${date}_${time.replace(":", "")}`;

      await setDoc(doc(db, "appointments", newId), {
        userId: clientUid,
        userName: appt.userName || "Anonymous User",
        therapistId: appt.therapistId,
        therapistName: appt.therapistName,
        date,
        time,
        reason: appt.reason,
        status: "pending",
        rescheduledFrom: appt.id,
        createdAt: serverTimestamp(),
      });
      await deleteDoc(doc(db, "appointments", appt.id));

      showToast("success", "Appointment rescheduled!");
      setRescheduleData(null);
      setShowReschedule(null);
    } catch (err) {
      console.error(err);
      showToast("error", "Failed to reschedule.");
    } finally {
      setSubmittingReschedule(false);
    }
  };

  /* --------------------------------------------------------------
     RESCHEDULE MODAL
  -------------------------------------------------------------- */
  const RescheduleModal = ({ appt, onClose }) => {
    const [date, setDate] = useState("");
    const [time, setTime] = useState("");
    const [bookedSlots, setBookedSlots] = useState({});

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
          if (d.id !== appt.id) {
            booked[`${data.date}_${data.time}`] = true;
          }
        });
        setBookedSlots(booked);
      });
      return unsub;
    }, [appt]);

    const handleReschedule = () => {
      const key = `${date}_${time}`;
      if (bookedSlots[key]) return showToast("error", "This slot is already booked.");
      initiateReschedule(appt, date, time);
    };

    return (
      <div className="appointments-list-wrapper__modal-backdrop" onClick={onClose}>
        <div className="appointments-list-wrapper__modal" onClick={(e) => e.stopPropagation()}>
          <h4>Reschedule with {appt.therapistName}</h4>
          <div className="appointments-list-wrapper__form-group">
            <label>Date</label>
            <input type="date" min={minDate} max={maxDate} value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="appointments-list-wrapper__form-group">
            <label>Time</label>
            <div className="appointments-list-wrapper__time-slots">
              {TIME_SLOTS.map((t) => {
                const disabled = !date || bookedSlots[`${date}_${t}`];
                return (
                  <button
                    key={t}
                    type="button"
                    className={`appointments-list-wrapper__time-slot ${time === t ? "selected" : ""} ${disabled ? "booked" : ""}`}
                    onClick={() => !disabled && setTime(t)}
                    disabled={disabled}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="appointments-list-wrapper__form-actions">
            <button onClick={handleReschedule} disabled={submittingReschedule}>
              {submittingReschedule ? "Saving..." : "Reschedule"}
            </button>
            <button onClick={onClose} className="appointments-list-wrapper__cancel-btn">Cancel</button>
          </div>
        </div>
      </div>
    );
  };

  /* --------------------------------------------------------------
     RATING FLOW
  -------------------------------------------------------------- */
  const initiateRating = (appt) => {
    setShowRating({ appt, rating: 5, comment: "" });
  };

  const confirmRating = async () => {
    if (!showRatingConfirm) return;

    const { appt, rating, comment } = showRatingConfirm;

    try {
      // 1. Update the appointment with rating
      const apptRef = doc(db, "appointments", appt.id);
      await updateDoc(apptRef, {
        clientRating: rating,
        clientComment: comment?.trim() || null,
        ratedAt: serverTimestamp(),
      });

      // 2. Update therapist's average rating
      const therapistId = appt.therapistId || appt.therapistUid;
      if (!therapistId) {
        console.warn("No therapist ID found, skipping rating update");
      } else {
        const therapistRef = doc(db, "therapists", therapistId);
        const therapistSnap = await getDoc(therapistRef);

        if (therapistSnap.exists()) {
          const data = therapistSnap.data();
          const ratings = [...(data.ratings || []), { rating, comment: comment?.trim() || null }];
          const avg = ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length;

          await updateDoc(therapistRef, {
            rating: parseFloat(avg.toFixed(2)),
            ratings,
            totalRatings: ratings.length,
          });
        }
      }

      showToast("success", "Thank you for your feedback!");
      setShowRatingConfirm(null);
      setShowRating(null);
    } catch (err) {
      console.error("Rating error:", err);
      showToast("error", "Failed to submit rating. Please try again.");
    }
  };

  /* --------------------------------------------------------------
     CALENDAR VIEW
  -------------------------------------------------------------- */
  const CalendarView = () => {
    const start = startOfMonth(selectedMonth);
    const end = endOfMonth(selectedMonth);
    const days = eachDayOfInterval({ start, end });

    const getAppointmentsForDay = (day) => {
      return appointments.filter((appt) => isSameDay(new Date(appt.date), day));
    };

    return (
      <div className="appointments-list-wrapper__calendar-view">
        <div className="appointments-list-wrapper__calendar-header">
          <button onClick={() => setSelectedMonth(new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() - 1))}>Prev</button>
          <h4>{format(selectedMonth, "MMMM yyyy")}</h4>
          <button onClick={() => setSelectedMonth(new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1))}>Next</button>
        </div>
        <div className="appointments-list-wrapper__calendar-grid">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="appointments-list-wrapper__calendar-day-header">{d}</div>
          ))}
          {days.map((day) => {
            const dayAppts = getAppointmentsForDay(day);
            return (
              <div
                key={day}
                className={`appointments-list-wrapper__calendar-day ${dayAppts.length > 0 ? "has-appt" : ""} ${
                  format(day, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd") ? "today" : ""
                }`}
              >
                <div className="appointments-list-wrapper__day-number">{format(day, "d")}</div>
                {dayAppts.map((appt) => (
                  <div key={appt.id} className="appointments-list-wrapper__calendar-appt">
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

  /* --------------------------------------------------------------
     CONFIRMATION MODALS
  -------------------------------------------------------------- */
  const CancelConfirmModal = () => {
    if (!showCancelConfirm) return null;
    return (
      <div className="appointments-list-wrapper__modal-backdrop" onClick={() => setShowCancelConfirm(null)}>
        <div className="appointments-list-wrapper__modal" onClick={(e) => e.stopPropagation()}>
          <h4>Cancel Appointment?</h4>
          <p>Are you sure you want to cancel your session with <strong>{showCancelConfirm.therapistName}</strong>?</p>
          <div className="appointments-list-wrapper__form-actions">
            <button onClick={confirmCancel} className="appointments-list-wrapper__danger-btn">Yes, Cancel</button>
            <button onClick={() => setShowCancelConfirm(null)} className="appointments-list-wrapper__cancel-btn">No, Keep It</button>
          </div>
        </div>
      </div>
    );
  };

  const RescheduleConfirmModal = () => {
    if (!rescheduleData) return null;
    const { appt, date, time } = rescheduleData;
    return (
      <div className="appointments-list-wrapper__modal-backdrop" onClick={() => setRescheduleData(null)}>
        <div className="appointments-list-wrapper__modal" onClick={(e) => e.stopPropagation()}>
          <h4>Confirm Reschedule</h4>
          <p>
            Move your appointment with <strong>{appt.therapistName}</strong> to:
            <br />
            <strong>{format(new Date(date), "MMM d, yyyy")} at {time}</strong>
          </p>
          <div className="appointments-list-wrapper__form-actions">
            <button onClick={confirmReschedule} disabled={submittingReschedule} className="appointments-list-wrapper__save-btn">
              {submittingReschedule ? "Saving..." : "Yes, Reschedule"}
            </button>
            <button onClick={() => setRescheduleData(null)} className="appointments-list-wrapper__cancel-btn">Go Back</button>
          </div>
        </div>
      </div>
    );
  };

  const RatingConfirmModal = () => {
    if (!showRatingConfirm) return null;
    const { appt, rating, comment } = showRatingConfirm;
    return (
      <div className="appointments-list-wrapper__modal-backdrop" onClick={() => setShowRatingConfirm(null)}>
        <div className="appointments-list-wrapper__modal" onClick={(e) => e.stopPropagation()}>
          <h4>Submit Your Rating?</h4>
          <p>
            You rated your session with <strong>{appt.therapistName}</strong>:
            <br />
            <strong>{'★'.repeat(rating)}{'☆'.repeat(5 - rating)}</strong>
            {comment && (
              <>
                <br />
                <em>"{comment}"</em>
              </>
            )}
          </p>
          <div className="appointments-list-wrapper__form-actions">
            <button onClick={confirmRating} className="appointments-list-wrapper__save-btn">Submit Rating</button>
            <button onClick={() => setShowRatingConfirm(null)} className="appointments-list-wrapper__cancel-btn">Edit</button>
          </div>
        </div>
      </div>
    );
  };

  /* --------------------------------------------------------------
     RENDER
  -------------------------------------------------------------- */
  if (loading) {
    return (
      <div className="appointments-list-spinner">
        <div className="spinner-list"></div>
        <p>Loading appointments...</p>
      </div>
    );
  }

  if (appointments.length === 0) {
    return (
      <div className="appointments-list-wrapper">
        <div className="appointments-list-wrapper__empty">
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
    <div className="appointments-list-wrapper">
      {/* Notification Handler */}
      <NotificationHandler />

      {toast && (
        <div className={`appointments-list-wrapper__toast ${toast.type}`}>
          {toast.message}
        </div>
      )}
      {/* View Toggle */}
      <div className="appointments-list-wrapper__view-toggle">
        <button className={view === "list" ? "active" : ""} onClick={() => setView("list")}>List</button>
        <button className={view === "calendar" ? "active" : ""} onClick={() => setView("calendar")}>Calendar</button>
      </div>

      {/* Calendar View */}
      {view === "calendar" && <CalendarView />}

      {/* List View */}
      {view === "list" && (
        <>
          <h3>Your Appointments</h3>
          {appointments.map((appt) => (
            <div key={appt.id} className="appointments-list-wrapper__appointment-item">
              <div className="appointments-list-wrapper__appointment-header">
                <div className="appointments-list-wrapper__appointment-name">{appt.therapistName}</div>
                <div className="appointments-list-wrapper__appointment-datetime">
                  {format(new Date(appt.date), "MMM d, yyyy")} at {appt.time}
                </div>
              </div>
              <p className="appointments-list-wrapper__appointment-reason">
                <em>"{appt.reason || "No reason given"}"</em>
              </p>

              <div className="appointments-list-wrapper__appointment-footer">
                <span className={`appointments-list-wrapper__appointment-status ${getStatusColor(appt.status)}`}>
                  {appt.status.charAt(0).toUpperCase() + appt.status.slice(1)}
                </span>

                {/* Cancel / Reschedule */}
                {["pending", "confirmed"].includes(appt.status) && (
                  <>
                    <button
                      onClick={() => setShowReschedule(appt)}
                      className="appointments-list-wrapper__action-btn appointments-list-wrapper__reschedule-btn"
                    >
                      Reschedule
                    </button>
                    <button
                      onClick={() => initiateCancel(appt.id, appt.therapistName)}
                      className="appointments-list-wrapper__action-btn appointments-list-wrapper__cancel-btn"
                    >
                      Cancel
                    </button>
                  </>
                )}

                {/* Rate Session */}
                {appt.status === "completed" && !appt.clientRating && (
                  <button
                    onClick={() => initiateRating(appt)}
                    className="appointments-list-wrapper__action-btn appointments-list-wrapper__rate-btn"
                  >
                    Rate Session
                  </button>
                )}

                {appt.clientRating && (
                  <div className="appointments-list-wrapper__client-rating">
                    You rated: {'★'.repeat(appt.clientRating)}{'☆'.repeat(5 - appt.clientRating)}
                  </div>
                )}
              </div>
            </div>
          ))}
        </>
      )}

      {/* Modals */}
      {showReschedule && <RescheduleModal appt={showReschedule} onClose={() => setShowReschedule(null)} />}

      {showRating && (
        <div className="appointments-list-wrapper__modal-backdrop" onClick={() => setShowRating(null)}>
          <div className="appointments-list-wrapper__modal appointments-list-wrapper__rating-modal" onClick={(e) => e.stopPropagation()}>
            <h4>Rate Your Session</h4>
            <p>With <strong>{showRating.appt.therapistName}</strong></p>

            <div className="appointments-list-wrapper__star-rating">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  className={`appointments-list-wrapper__star ${star <= showRating.rating ? "filled" : ""}`}
                  onClick={() => setShowRating((prev) => ({ ...prev, rating: star }))}
                >
                  ★
                </button>
              ))}
            </div>
            
            <textarea
              placeholder="Optional: Share your thoughts..."
              value={showRating.comment}
              onChange={(e) => setShowRating((prev) => ({ ...prev, comment: e.target.value }))}
              rows="3"
              className="appointments-list-wrapper__input"
            />

            <div className="appointments-list-wrapper__form-actions">
              <button
                onClick={() => setShowRatingConfirm(...showRating)}
                className="appointments-list-wrapper__save-btn"
              >
                Submit Rating
              </button>
              <button onClick={() => setShowRating(null)} className="appointments-list-wrapper__cancel-btn">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modals */}
      <CancelConfirmModal />
      <RescheduleConfirmModal />
      <RatingConfirmModal />
    </div>
  );
}

export default AppointmentsList;